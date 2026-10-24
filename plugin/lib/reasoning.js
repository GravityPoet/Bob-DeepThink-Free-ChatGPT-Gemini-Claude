var util = require('./util.js');
var urls = require('./urls.js');

// Model capability facts verified against vendor documentation on 2026-10-24.
// `none` retains the old option's meaning: omit the parameter, not disable thinking.
var VALUES = ['none', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

function normalizeEffort(value) {
    var name = String(value || 'none').toLowerCase().replace(/[\s_-]/g, '');
    if (name === 'auto' || name === 'default') name = 'none';
    if (name === 'disabled' || name === 'disable') name = 'off';
    if (name === 'mini' || name === 'min') name = 'minimal';
    if (name === 'extremehigh' || name === 'extrahigh') name = 'xhigh';
    return VALUES.indexOf(name) >= 0 ? name : '';
}

function capabilities(modelName, apiMode, baseUrl) {
    var name = String(modelName || '').toLowerCase();
    var cap = { family: 'compatible', kind: 'compatible', levels: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'], canDisable: true, known: false };
    var endpoint = urls.parseHttpUrl(baseUrl);
    if (endpoint.ok && /^api\.siliconflow\.(?:cn|com)(?::\d+)?$/.test(endpoint.host) && apiMode === 'chat_completions') {
        if (/deepseek-v4(?:-|$)|glm-5\.2(?:-|$)/.test(name)) return { family: 'siliconflow', kind: 'siliconEffort', levels: ['high', 'max'],
            aliases: { low: 'high', medium: 'high', xhigh: 'max' }, canDisable: false, known: true };
        if (/deepseek-v3\.2|qwen3|deepseek-r1/.test(name)) return { family: 'siliconflow', kind: 'siliconBudget',
            levels: ['minimal', 'low', 'medium', 'high'], canDisable: !/deepseek-r1/.test(name), known: true };
    }
    if (/gemini/.test(name) || /^gemini_/.test(apiMode || '')) {
        cap = { family: 'gemini', kind: 'geminiLevel', levels: ['low', 'medium', 'high'], canDisable: false, known: false };
        if (/gemini-2\.5/.test(name)) {
            cap.known = true;
            if (apiMode === 'gemini_generate_content') {
                cap.kind = 'geminiBudget'; cap.canDisable = !/gemini-2\.5-pro/.test(name);
            }
        } else if (/gemini-4-argon|gemini-3\.8-flash|gemini-3\.1-pro/.test(name)) cap.known = true;
        else if (/gemini-3\.1-flash-lite-image/.test(name)) { cap.known = true; cap.levels = ['minimal', 'high']; }
        else if (/gemini-3-pro/.test(name)) { cap.known = true; cap.levels = ['low', 'high']; }
        else if (/gemini-3\.6-flash|gemini-3\.[15]-flash-lite|gemini-3-flash|gemini-robotics-er-2/.test(name)) {
            cap.known = true; cap.levels = ['minimal', 'low', 'medium', 'high'];
        }
        return cap;
    }
    if (/claude/.test(name) || apiMode === 'anthropic_messages') {
        cap = { family: 'claude', kind: 'adaptive', levels: ['low', 'medium', 'high', 'xhigh', 'max'], canDisable: true, known: false, offMode: 'disabled' };
        if (/claude-(?:opus|sonnet|haiku)-5|claude-(?:fable|mythos)-5|claude-opus-4[-.][78]/.test(name)) {
            cap.known = true;
            if (/claude-opus-5[-.]5|claude-(?:fable|mythos)-5/.test(name)) cap.canDisable = false;
            if (/claude-sonnet-5[-.]5/.test(name)) cap.offMode = 'between_tools';
        } else if (/claude-(?:opus|sonnet)-4[-.]6/.test(name)) {
            cap.known = true; cap.levels = ['low', 'medium', 'high', 'max'];
        } else if (/claude-opus-4[-.]5/.test(name)) {
            cap.known = true; cap.kind = 'budgetAndEffort'; cap.levels = ['low', 'medium', 'high'];
        } else if (/claude-(?:sonnet|haiku)-4[-.]5|claude-(?:opus|sonnet)-4(?:-|$)|claude-3[-.]7/.test(name)) {
            cap.known = true; cap.kind = 'budget'; cap.levels = ['low', 'medium', 'high'];
        } else if (/claude-3[-.][05]|claude-(?:haiku|sonnet)-3/.test(name)) {
            cap.known = true; cap.levels = []; cap.canDisable = false;
        }
        return cap;
    }
    if (/^(?:gpt-6\.1-sol|gpt-6-astra)(?:-|$)/.test(name)) {
        cap.known = true; cap.canDisable = false; cap.levels = ['low', 'medium', 'high', 'xhigh', 'max'];
    } else if (/^gpt-5\.[245](?:-|$)/.test(name)) {
        cap.known = true; cap.levels = ['low', 'medium', 'high', 'xhigh'];
    } else if (/^gpt-5\.1(?:-|$)/.test(name)) {
        cap.known = true; cap.levels = ['low', 'medium', 'high'];
    } else if (/^gpt-5(?:-(?:mini|nano)|-20|$)/.test(name)) {
        cap.known = true; cap.canDisable = false; cap.levels = ['minimal', 'low', 'medium', 'high'];
    } else if (/^(?:o[134](?:-|$)|gpt-oss)/.test(name)) {
        cap.known = true; cap.canDisable = false; cap.levels = ['low', 'medium', 'high'];
    } else if (/^gpt-4|^gpt-3\.5/.test(name)) {
        cap.known = true; cap.canDisable = false; cap.levels = [];
    }
    return cap;
}

function choices(modelName, apiMode, baseUrl) {
    var cap = capabilities(modelName, apiMode, baseUrl);
    if (apiMode === 'aws_converse' && cap.family !== 'claude') return ['none'];
    return ['none'].concat(cap.canDisable ? ['off'] : [], cap.levels);
}

function prepare(params) {
    var effort = normalizeEffort(params.reasoningEffort);
    var cap = capabilities(params.modelName, params.apiMode, params.baseUrl);
    var plan = { ok: true, fields: {}, capabilities: cap };
    if (!effort) return failure('思考强度无效，请重新选择。');
    if (effort === 'none') {
        if (params.apiMode === 'gemini_generate_content' && /gemini-4-argon/i.test(params.modelName)) {
            plan.fields.generationConfig = { thinkingConfig: { thinkingLevel: 'medium' } };
        }
        return plan;
    }
    if (cap.aliases && cap.aliases[effort]) effort = cap.aliases[effort];
    if (effort === 'off' ? !cap.canDisable : cap.levels.indexOf(effort) < 0) {
        return failure('模型 ' + params.modelName + ' 不支持所选思考档位 ' + effort + '。可选：' + choices(params.modelName, params.apiMode, params.baseUrl).join('、') + '。');
    }
    if (cap.kind === 'siliconBudget') {
        plan.fields.enable_thinking = effort !== 'off';
        if (effort !== 'off') plan.fields.thinking_budget = { minimal: 128, low: 1024, medium: 8192, high: 32768 }[effort];
        return plan;
    }
    if (cap.kind === 'siliconEffort') { plan.fields.reasoning_effort = effort; return plan; }
    if (params.apiMode === 'chat_completions' || params.apiMode === 'responses') {
        var nativeEffort = effort === 'off' ? 'none' : effort;
        plan.fields = params.apiMode === 'responses' ? { reasoning: { effort: nativeEffort } } : { reasoning_effort: nativeEffort };
        return plan;
    }
    if (params.apiMode === 'gemini_interactions') {
        plan.fields.generation_config = { thinking_level: effort, thinking_summaries: 'auto' };
        return plan;
    }
    if (params.apiMode === 'gemini_generate_content') {
        var thinking = {};
        if (cap.kind === 'geminiBudget') {
            var budget = effort === 'off' ? 0 : { low: 1024, medium: 8192, high: 24576 }[effort];
            if (budget && budget >= params.maxOutputTokens) return failure('该思考档位需要超过 ' + budget + ' 的输出上限，请提高输出上限或降低思考档位。');
            thinking.thinkingBudget = budget;
        } else thinking.thinkingLevel = effort;
        if (effort !== 'off') thinking.includeThoughts = true;
        plan.fields.generationConfig = { thinkingConfig: thinking };
        return plan;
    }
    if (cap.family === 'claude' && (params.apiMode === 'anthropic_messages' || params.apiMode === 'aws_converse')) {
        var fields = {};
        if (effort === 'off') fields.thinking = { type: cap.offMode };
        else if (cap.kind === 'budget' || cap.kind === 'budgetAndEffort') {
            var tokens = { low: 1024, medium: 4096, high: 8192 }[effort];
            if (tokens >= params.maxOutputTokens) return failure('此 Claude 模型的思考预算需要输出上限大于 ' + tokens + '，请调整输出上限或降低档位。');
            fields.thinking = { type: 'enabled', budget_tokens: tokens };
            if (cap.kind === 'budgetAndEffort') fields.output_config = { effort: effort };
        } else {
            fields.thinking = { type: 'adaptive' };
            fields.output_config = { effort: effort };
        }
        plan.fields = params.apiMode === 'aws_converse' ? { additionalModelRequestFields: fields } : fields;
        return plan;
    }
    return failure('当前模型与原生接口没有已核实的思考参数映射，请使用“跟随模型”。');
}

function apply(body, plan) {
    Object.keys(plan.fields).forEach(function (key) {
        var value = plan.fields[key];
        body[key] = (key === 'generationConfig' || key === 'generation_config')
            ? Object.assign({}, body[key] || {}, value) : value;
    });
    return body;
}

function failure(message) { return { ok: false, error: util.makeServiceError('param', message) }; }

module.exports = { VALUES: VALUES, normalizeEffort: normalizeEffort, capabilities: capabilities, choices: choices, prepare: prepare, apply: apply };
