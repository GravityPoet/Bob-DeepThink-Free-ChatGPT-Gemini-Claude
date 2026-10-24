function parseHttpUrl(url) {
    var value = String(url || '');
    if (/[\s\\#]/.test(value) || /%(?![0-9a-f]{2})/i.test(value)) return { ok: false };
    var match = /^(https?):\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?$/i.exec(value);
    if (!match || !/^(?:\[[0-9a-f:.]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[0-9]{1,5})?$/i.test(match[2])) return { ok: false };
    var port = /\]?:([0-9]+)$/.exec(match[2]);
    if (port && (Number(port[1]) < 1 || Number(port[1]) > 65535)) return { ok: false };
    return { ok: true, scheme: match[1].toLowerCase(), host: match[2].toLowerCase(), path: match[3] || '/', query: match[4] || '' };
}

function compose(parsed, path) {
    return parsed.scheme + '://' + parsed.host + path + (parsed.query ? '?' + parsed.query : '');
}

function endpointMode(url) {
    var parsed = parseHttpUrl(url);
    if (!parsed.ok) return '';
    if (/\/chat\/completions\/?$/i.test(parsed.path)) return 'chat_completions';
    if (/\/responses\/?$/i.test(parsed.path)) return 'responses';
    if (/\/messages\/?$/i.test(parsed.path)) return 'anthropic_messages';
    if (/\/interactions\/?$/i.test(parsed.path)) return 'gemini_interactions';
    if (/\/models\/[^/?#]+:(?:generatecontent|streamgeneratecontent)\/?$/i.test(parsed.path)) return 'gemini_generate_content';
    if (/\/model\/[^/?#]+\/converse(?:-stream)?\/?$/i.test(parsed.path)) return 'aws_converse';
    return '';
}

function isCompleteEndpoint(url) { return !!endpointMode(url); }
function isCerebrasBaseUrl(url) { var p = parseHttpUrl(url); return p.ok && /^api\.cerebras\.ai(?::\d+)?$/.test(p.host); }

function normalizeBaseUrl(raw, apiMode) {
    if (typeof raw !== 'string') return '';
    var parsed = parseHttpUrl(raw.trim());
    if (!parsed.ok) return '';
    var path = parsed.path.replace(/\/+$/, '');
    if (isCompleteEndpoint(raw.trim())) return compose(parsed, path);
    if (apiMode === 'aws_converse') path = path.replace(/\/openai\/v1$/i, '').replace(/\/v1$/i, '');
    else if (apiMode === 'gemini_generate_content') {
        if (!/\/v1(?:beta)?$/i.test(path)) path += '/v1beta';
    } else if (!/\/v\d+(?:beta\d*)?$/i.test(path) && !/\/v1beta\/openai$/i.test(path)) path += '/v1';
    return compose(parsed, path);
}

function buildApiEndpoint(baseUrl, apiMode, modelName) {
    var parsed = parseHttpUrl(baseUrl);
    if (!parsed.ok) throw new Error('接口地址无效');
    var path = parsed.path.replace(/\/+$/, '');
    if (isCompleteEndpoint(baseUrl)) {
        if (apiMode === 'aws_converse') path = path.replace(/\/converse-stream$/i, '/converse');
        if (apiMode === 'gemini_generate_content') {
            path = path.replace(/:streamGenerateContent$/i, ':generateContent');
            parsed.query = parsed.query.split('&').filter(function (p) { return !/^alt=sse$/i.test(p); }).join('&');
        }
        return compose(parsed, path);
    }
    if (apiMode === 'gemini_interactions') path += '/interactions';
    else if (apiMode === 'aws_converse') path += '/model/' + encodeURIComponent(modelName) + '/converse';
    else if (apiMode === 'gemini_generate_content') path += '/models/' + encodeURIComponent(normalizeGeminiNativeModelName(modelName)) + ':generateContent';
    else path += apiMode === 'anthropic_messages' ? '/messages' : apiMode === 'chat_completions' ? '/chat/completions' : '/responses';
    return compose(parsed, path);
}

function normalizeGeminiNativeModelName(name) { return String(name || '').trim().replace(/^models\//, ''); }
function normalizeRegion(raw) { var r = String(raw || '').trim().toLowerCase(); return /^[a-z0-9-]+$/.test(r) ? r : 'us-east-1'; }
function buildBedrockMantleBaseUrl(region) { return 'https://bedrock-mantle.' + region + '.api.aws/v1'; }
function buildBedrockMantleAnthropicBaseUrl(region) { return 'https://bedrock-mantle.' + region + '.api.aws/anthropic/v1'; }
function buildBedrockRuntimeOpenAiBaseUrl(region) { return 'https://bedrock-runtime.' + region + '.amazonaws.com/openai/v1'; }
function buildBedrockRuntimeBaseUrl(region) { return 'https://bedrock-runtime.' + region + '.amazonaws.com'; }
function isDefaultSub2ApiUrl(raw) { return !String(raw || '').trim() || /^http:\/\/127\.0\.0\.1:18080(?:\/v1)?\/?$/i.test(raw); }

module.exports = {
    parseHttpUrl: parseHttpUrl, normalizeBaseUrl: normalizeBaseUrl, buildApiEndpoint: buildApiEndpoint,
    endpointMode: endpointMode, isCompleteEndpoint: isCompleteEndpoint, isCerebrasBaseUrl: isCerebrasBaseUrl,
    normalizeGeminiNativeModelName: normalizeGeminiNativeModelName, normalizeRegion: normalizeRegion,
    buildBedrockMantleBaseUrl: buildBedrockMantleBaseUrl, buildBedrockRuntimeOpenAiBaseUrl: buildBedrockRuntimeOpenAiBaseUrl,
    buildBedrockMantleAnthropicBaseUrl: buildBedrockMantleAnthropicBaseUrl,
    buildBedrockRuntimeBaseUrl: buildBedrockRuntimeBaseUrl, isDefaultSub2ApiUrl: isDefaultSub2ApiUrl,
};
