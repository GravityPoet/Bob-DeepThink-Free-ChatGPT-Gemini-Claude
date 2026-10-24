var urls = require('./urls.js');
var protocol = require('./protocol.js');
var reasoning = require('./reasoning.js');

function queryString(query, values) {
    var keys = Object.keys(values);
    var parts = String(query || '').split('&').filter(function (part) {
        if (!part) return false;
        var key;
        try { key = decodeURIComponent(part.split('=')[0]); } catch (_) { return false; }
        return keys.indexOf(key) < 0 && key !== 'alt';
    });
    keys.forEach(function (key) { if (values[key] !== null && values[key] !== undefined && values[key] !== '') parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(values[key])); });
    return parts.length ? '?' + parts.join('&') : '';
}

function requestPlan(config, cursor) {
    var parsed = urls.parseHttpUrl(config.baseUrl);
    if (!parsed.ok) throw new Error('接口地址无效。');
    var path = parsed.path.replace(/\/+$/, '').replace(/\/(?:chat\/completions|responses|messages|interactions)$/i, '')
        .replace(/\/models\/[^/]+:(?:generateContent|streamGenerateContent)$/i, '')
        .replace(/\/model\/[^/]+\/converse(?:-stream)?$/i, '');
    var kind = 'openai', query = {}, headerConfig = config;
    var root = parsed.scheme + '://' + parsed.host;
    if (/^bedrock-runtime\.[a-z0-9-]+\.amazonaws\.com(?::\d+)?$/.test(parsed.host)) {
        if (config.authMode !== 'aws_sigv4') throw new Error('AWS Runtime 没有 API Key 模型列表接口。请使用 AWS IAM 服务获取模型，或将服务改为支持 /models 的 Mantle 端点。');
        root = 'https://bedrock.' + config.bedrockRegion + '.amazonaws.com';
        parsed.query = '';
        kind = cursor && cursor.stage === 'profiles' ? 'aws_profiles' : 'aws_models';
        path = kind === 'aws_profiles' ? '/inference-profiles' : '/foundation-models';
        query = kind === 'aws_profiles' ? { maxResults: 100, nextToken: cursor && cursor.token } : { byOutputModality: 'TEXT' };
    } else if (/^bedrock-mantle\.[a-z0-9-]+\.api\.aws(?::\d+)?$/.test(parsed.host)) {
        path = '/v1/models'; headerConfig = Object.assign({}, config, { apiMode: 'chat_completions' });
    } else if (/^gemini_/.test(config.apiMode)) {
        kind = 'gemini';
        if (parsed.host === 'generativelanguage.googleapis.com') path = '/v1beta';
        path += '/models'; query = { pageSize: 1000, pageToken: cursor && cursor.token };
    } else if (config.apiMode === 'anthropic_messages') {
        kind = 'anthropic'; path += '/models'; query = { limit: 100, after_id: cursor && cursor.token };
    } else path += '/models';
    // SiliconFlow's catalog includes speech, embedding and image models too.
    // Its documented chat filter includes text-capable vision/chat models.
    if (/^api\.siliconflow\.cn(?::\d+)?$/.test(parsed.host)) query.sub_type = 'chat';
    var url = root + path + queryString(parsed.query, query);
    return { kind: kind, url: url, method: 'GET', headers: protocol.buildRequestHeaders(headerConfig, 'GET', url, '', false) };
}

function modelId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 2048 && !/[\x00-\x1f\x7f]/.test(value) ? value : '';
}
function parsePage(plan, data) {
    if (!data || typeof data !== 'object' || data.error) throw new Error('供应商没有返回有效的模型列表。');
    var list = plan.kind === 'gemini' ? data.models : plan.kind === 'aws_models' ? data.modelSummaries : plan.kind === 'aws_profiles' ? data.inferenceProfileSummaries : data.data;
    if (!Array.isArray(list)) throw new Error('模型列表格式与所选协议不一致。');
    var seen = Object.create(null), models = [];
    list.forEach(function (entry) {
        if (!entry || typeof entry !== 'object' || entry.lifecycle === 'retired') return;
        if (plan.kind === 'gemini' && Array.isArray(entry.supportedGenerationMethods) && entry.supportedGenerationMethods.indexOf('generateContent') < 0 && entry.supportedGenerationMethods.indexOf('interact') < 0) return;
        if (plan.kind === 'aws_models' && Array.isArray(entry.outputModalities) && entry.outputModalities.indexOf('TEXT') < 0) return;
        var id = modelId(entry.id || entry.name || entry.modelId || entry.inferenceProfileId);
        if (plan.kind === 'gemini') id = id.replace(/^models\//, '');
        if (!id || seen[id]) return;
        seen[id] = true;
        var title = modelId(entry.display_name || entry.displayName || entry.modelName || entry.inferenceProfileName) || id;
        if (entry.modelLifecycle && entry.modelLifecycle.status === 'LEGACY') title += ' · 旧版';
        var item = { id: id, title: title };
        if (entry.capabilities && typeof entry.capabilities === 'object') item.capabilities = entry.capabilities;
        var limit = entry.max_tokens || entry.outputTokenLimit;
        if (Number.isInteger(limit) && limit > 0) item.outputLimit = limit;
        models.push(item);
    });
    var next = null;
    if (plan.kind === 'anthropic' && data.has_more) {
        if (!modelId(data.last_id)) throw new Error('模型列表缺少下一页游标。');
        next = { token: data.last_id };
    } else if (plan.kind === 'gemini' && data.nextPageToken) next = { token: modelId(data.nextPageToken) };
    else if (plan.kind === 'aws_models') next = { stage: 'profiles' };
    else if (plan.kind === 'aws_profiles' && data.nextToken) next = { stage: 'profiles', token: modelId(data.nextToken) };
    if (next && Object.prototype.hasOwnProperty.call(next, 'token') && !next.token) throw new Error('模型列表分页游标无效。');
    return { models: models, next: next };
}

function modelChoices(model, config) {
    var cap = reasoning.capabilities(model.id, config.apiMode, config.baseUrl);
    var available = reasoning.choices(model.id, config.apiMode, config.baseUrl);
    var metadata = model.capabilities;
    if (metadata && metadata.effort && metadata.effort.supported === false && cap.kind !== 'budget') {
        available = available.filter(function (level) { return level === 'none' || level === 'off'; });
    }
    if (metadata && metadata.effort && metadata.effort.supported === true) {
        available = available.filter(function (level) {
            return level === 'none' || level === 'off' || metadata.effort[level] && metadata.effort[level].supported === true;
        });
    }
    if (metadata && metadata.thinking && metadata.thinking.types && metadata.thinking.types.disabled && metadata.thinking.types.disabled.supported === false) available = available.filter(function (level) { return level !== 'off'; });
    return available;
}
module.exports = { requestPlan: requestPlan, parsePage: parsePage, modelChoices: modelChoices };
