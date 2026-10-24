var util = require('./util.js');
var reasoning = require('./reasoning.js');

// Sampling restrictions verified against provider documentation on 2026-10-25.
// Blank means omit the parameter; never silently clamp or disable reasoning.
function prepare(params, anthropicApiVersion) {
    var raw = params.translationTemperature;
    var value = raw === undefined || raw === null ? '' : String(raw).trim();
    if (!value) return { ok: true, value: null };
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !isFinite(Number(value)) || Number(value) > 2) {
        return failure('翻译温度需填写 0–2 之间的数字，或留空跟随模型。');
    }
    var name = String(params.modelName || '').toLowerCase();
    var openaiName = name.slice(name.lastIndexOf('/') + 1);
    var effort = reasoning.normalizeEffort(params.reasoningEffort);
    var isClaude = /claude/.test(name);
    var number = Number(value);

    if (params.apiMode === 'anthropic_messages' && anthropicApiVersion >= '2026-10-21') {
        return failure('Claude Messages API 2026-10-21 已移除翻译温度参数，请将“翻译温度”留空跟随模型。');
    }
    var claude = /claude-(?:opus|sonnet|haiku)-(\d+)(?:[-.](\d{1,2})(?=[-.]|$))?/.exec(name);
    if ((claude && (Number(claude[1]) > 4 || Number(claude[1]) === 4 && Number(claude[2] || 0) >= 7)) || /claude-(?:fable|mythos)-/.test(name)) {
        return unsupported(params.modelName);
    }
    var gemini = /gemini-(\d+)(?:\.(\d+))?/.exec(name);
    if (gemini && (Number(gemini[1]) >= 4 || Number(gemini[1]) === 3 &&
        (Number(gemini[2] || 0) >= 6 || Number(gemini[2]) === 5 && /flash-lite/.test(name)))) {
        return failure('模型 ' + params.modelName + ' 已弃用自定义翻译温度，参数可能被忽略或拒绝，请将“翻译温度”留空。');
    }
    if (/^gpt-6(?:\.1-sol|-astra)(?:-|$)/.test(openaiName) ||
        /^gpt-5(?:$|-(?:mini|nano|pro|20\d\d)(?:-|$))/.test(openaiName) ||
        /^gpt-[56](?:\.\d+)?-pro(?:-|$)/.test(openaiName) ||
        /^gpt-[56].*-codex(?:-|$)/.test(openaiName) || /^o[1-9](?:-|$)/.test(openaiName)) {
        return unsupported(params.modelName);
    }
    if ((/^gpt-5\.[1-9](?:-|$)/.test(openaiName) || /^gpt-6-(?:sol|luna)(?:-|$)/.test(openaiName)) &&
        !/-chat(?:-|$)/.test(openaiName) && effort !== 'off') {
        return failure('模型 ' + params.modelName + ' 仅在关闭思考时支持翻译温度。请将“思考强度”设为“关闭”，或将“翻译温度”留空。');
    }
    if (isClaude && effort !== 'none' && effort !== 'off') {
        return failure('Claude 开启思考时不能设置自定义翻译温度，请关闭思考或将“翻译温度”留空。');
    }
    var maximum = isClaude || params.apiMode === 'anthropic_messages' || params.apiMode === 'aws_converse' ? 1 : 2;
    if (number > maximum) return failure('当前模型或接口的翻译温度范围为 0–' + maximum + '，请调整数值或留空跟随模型。');
    return { ok: true, value: number };
}

function apply(body, plan, apiMode) {
    if (plan.value === null) return body;
    var config = apiMode === 'gemini_generate_content' ? body.generationConfig :
        apiMode === 'gemini_interactions' ? body.generation_config : apiMode === 'aws_converse' ? body.inferenceConfig : body;
    config.temperature = plan.value;
    return body;
}

function unsupported(modelName) {
    return failure('模型 ' + modelName + ' 不支持自定义翻译温度，请将“翻译温度”留空跟随模型。');
}
function failure(message) { return { ok: false, error: util.makeServiceError('param', message) }; }

module.exports = { prepare: prepare, apply: apply };
