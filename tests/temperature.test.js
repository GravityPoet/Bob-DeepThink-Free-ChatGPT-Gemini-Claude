const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin, query, chat, ok, sse, text } = require('./helpers');

function translate(options = {}) {
    const q = query(), requests = [];
    loadPlugin({ model: 'custom', customModel: 'gpt-4.1', streamOutput: 'false', ...options }, {
        request(r) { requests.push(r); r.handler(ok(chat('译文'))); },
    }).translate(q.value);
    return { ...q, requests, body: requests[0]?.body };
}

test('temperature reaches Chat and Responses as a number, including zero', () => {
    for (const apiMode of ['chat_completions', 'responses']) for (const value of ['0', '0.2', '2']) {
        const q = translate({ apiMode, translationTemperature: value });
        assert.equal(q.body.temperature, Number(value));
        assert.equal(text(q.completions[0].result), '译文');
    }
});

test('leaving temperature blank preserves upstream defaults on all protocols', () => {
    for (const apiMode of ['chat_completions', 'responses', 'gemini_generate_content', 'gemini_interactions', 'anthropic_messages', 'aws_converse']) {
        const q = translate({ apiMode, translationTemperature: '  ' });
        assert.equal(q.requests.length, 1, apiMode);
        assert.doesNotMatch(JSON.stringify(q.body), /temperature/i);
    }
});

test('invalid or out-of-range temperatures fail before any inference request', () => {
    for (const value of ['-0.1', '2.01', 'NaN', 'Infinity', '0x1', '0.2junk', '0,2', '1e-1']) {
        const q = translate({ translationTemperature: value });
        assert.equal(q.requests.length, 0, value);
        assert.equal(q.completions[0].error?.type, 'param');
        assert.match(q.completions[0].error.message, /翻译温度/);
    }
});

test('Gemini native protocols put temperature beside the token limit without losing thinking', () => {
    for (const apiMode of ['gemini_generate_content', 'gemini_interactions']) {
        const q = translate({ customModel: 'gemini-2.5-flash', apiMode, translationTemperature: ' .35 ', reasoningEffort: 'low' });
        const config = q.body[apiMode === 'gemini_interactions' ? 'generation_config' : 'generationConfig'];
        assert.equal(config.temperature, 0.35);
        assert.equal(config[apiMode === 'gemini_interactions' ? 'max_output_tokens' : 'maxOutputTokens'], 4096);
        assert.ok(config.thinking_level || config.thinkingConfig);
        assert.equal(q.body.temperature, undefined);
    }
});

test('Gemini models that ignore or reject sampling settings report that limitation', () => {
    for (const customModel of ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-4-argon']) {
        for (const apiMode of ['chat_completions', 'responses', 'gemini_generate_content', 'gemini_interactions']) {
            const q = translate({ customModel, apiMode, translationTemperature: '0.2' });
            assert.equal(q.requests.length, 0, customModel + ' ' + apiMode);
            assert.equal(q.completions[0].error?.type, 'param');
            assert.match(q.completions[0].error.message, /留空/);
        }
    }
});

test('older Gemini models still allow temperature in native and compatible protocols', () => {
    for (const customModel of ['gemini-2.5-flash', 'gemini-3-pro-preview', 'gemini-3.1-pro-preview']) {
        assert.equal(translate({ customModel, translationTemperature: '1' }).body.temperature, 1);
    }
});

test('known OpenAI reasoning-only models reject custom temperature, including routed IDs', () => {
    for (const customModel of ['gpt-6.1-sol', 'openai/gpt-6-astra', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-pro', 'gpt-5.2-pro', 'gpt-5.3-codex', 'o1', 'o3-mini', 'o4-mini']) {
        const q = translate({ customModel, translationTemperature: '0.2' });
        assert.equal(q.requests.length, 0, customModel);
        assert.equal(q.completions[0].error?.type, 'param');
    }
});

test('switchable OpenAI reasoning requires explicit off before accepting temperature', () => {
    for (const apiMode of ['chat_completions', 'responses']) {
        for (const customModel of ['gpt-5.1', 'gpt-5.2', 'gpt-5.4', 'gpt-5.5', 'gpt-5.6-sol', 'gpt-6-sol', 'gpt-6-luna']) {
            const q = translate({ customModel, apiMode, translationTemperature: '0.2', reasoningEffort: 'off' });
            assert.equal(q.body?.temperature, 0.2, customModel);
            assert.equal(apiMode === 'responses' ? q.body.reasoning.effort : q.body.reasoning_effort, 'none');
            for (const reasoningEffort of ['none', 'low']) {
                const invalid = translate({ customModel, apiMode, translationTemperature: '0.2', reasoningEffort });
                assert.equal(invalid.requests.length, 0, customModel + ' ' + reasoningEffort);
                assert.match(invalid.completions[0].error.message, /关闭/);
            }
        }
    }
});

test('open-weight reasoning models and private aliases retain gateway temperature support', () => {
    for (const customModel of ['gpt-oss-120b', 'private-model-alias', 'deepseek-ai/DeepSeek-R1']) {
        assert.equal(translate({ customModel, reasoningEffort: 'low', translationTemperature: '0.6' }).body.temperature, 0.6);
    }
});

test('new Claude Messages API rejects temperature even for an older model or private alias', () => {
    for (const customModel of ['claude-sonnet-4-6', 'claude-3-5-haiku-latest', 'private-claude-alias']) {
        const q = translate({ apiMode: 'anthropic_messages', customModel, translationTemperature: '0.2' });
        assert.equal(q.requests.length, 0);
        assert.equal(q.completions[0].error?.type, 'param');
        assert.match(q.completions[0].error.message, /2026-10-21/);
    }
});

test('Claude 4.7 and newer reject temperature through gateways and Bedrock too', () => {
    for (const customModel of ['claude-opus-4-7', 'anthropic/claude-opus-4.8', 'claude-sonnet-5-5', 'us.anthropic.claude-opus-5-5-v1:0']) {
        for (const apiMode of ['chat_completions', 'responses', 'aws_converse']) {
            const q = translate({ customModel, apiMode, translationTemperature: '0.2' });
            assert.equal(q.requests.length, 0, customModel + ' ' + apiMode);
            assert.equal(q.completions[0].error?.type, 'param');
        }
    }
});

test('legacy Bedrock Claude Messages uses temperature only with compatible thinking', () => {
    const options = { provider: 'bedrock', apiMode: 'anthropic_messages',
        baseUrl: 'https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages',
        customModel: 'anthropic.claude-sonnet-4-5', translationTemperature: '0.2' };
    const q = translate(options);
    assert.equal(q.body.temperature, 0.2);
    assert.equal(q.requests[0].header['anthropic-version'], '2023-06-01');
    const thinking = translate({ ...options, reasoningEffort: 'low' });
    assert.equal(thinking.requests.length, 0);
    assert.match(thinking.completions[0].error.message, /思考/);
});

test('Claude and Converse enforce their narrower 0–1 range without clamping', () => {
    for (const options of [
        { customModel: 'claude-sonnet-4-6' },
        { apiMode: 'aws_converse', customModel: 'amazon.nova-pro-v1:0' },
    ]) {
        for (const value of ['0', '1']) assert.equal(translate({ ...options, translationTemperature: value }).requests.length, 1);
        const q = translate({ ...options, translationTemperature: '1.01' });
        assert.equal(q.requests.length, 0);
        assert.match(q.completions[0].error.message, /0–1/);
    }
});

test('dated older Claude IDs are not mistaken for Claude 4.7 or newer', () => {
    for (const customModel of ['claude-sonnet-4-20250514', 'claude-opus-4-1-20250805', 'claude-3-5-haiku-20241022']) {
        assert.equal(translate({ customModel, translationTemperature: '0.2' }).body.temperature, 0.2);
    }
});

test('Cerebras and SiliconFlow retain their documented 0–2 temperature range', () => {
    for (const [baseUrl, customModel] of [
        ['https://api.cerebras.ai/v1', 'gpt-oss-120b'],
        ['https://api.siliconflow.cn/v1', 'deepseek-ai/DeepSeek-V3.2'],
    ]) {
        assert.equal(translate({ baseUrl, customModel, translationTemperature: '2' }).body.temperature, 2);
    }
});

test('AWS IAM signs the exact Converse payload containing temperature', () => {
    const q = translate({ provider: 'bedrock', apiMode: 'aws_converse', baseUrl: '',
        customModel: 'amazon.nova-pro-v1:0', translationTemperature: '0',
        awsAccessKeyId: 'fixture-id', awsSecretAccessKey: 'fixture-secret' });
    assert.equal(JSON.parse(q.body.toUTF8()).inferenceConfig.temperature, 0);
    assert.match(q.requests[0].header.Authorization, /^AWS4-HMAC-SHA256 /);
});

test('full native endpoints determine temperature placement instead of the saved protocol menu', () => {
    const q = translate({ customModel: 'gemini-2.5-flash', apiMode: 'chat_completions',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', translationTemperature: '0.2' });
    assert.equal(q.body.generationConfig.temperature, 0.2);
    assert.equal(q.body.temperature, undefined);
});

test('streaming and one empty-stream fallback both retain the selected temperature', () => {
    for (const fallback of [false, true]) {
        const q = query(), bodies = [];
        loadPlugin({ model: 'custom', customModel: 'gpt-4.1', translationTemperature: '0.2' }, {
            streamRequest(r) {
                bodies.push(r.body);
                if (!fallback) r.streamHandler({ text: sse({ choices: [{ delta: { content: '译文' }, finish_reason: 'stop' }] }) });
                r.handler({ response: { statusCode: 200 } });
            },
            request(r) { bodies.push(r.body); r.handler(ok(chat('译文'))); },
        }).translate(q.value);
        assert.equal(bodies.length, fallback ? 2 : 1);
        for (const body of bodies) assert.equal(body.temperature, 0.2);
        assert.equal(text(q.completions[0].result), '译文');
    }
});

test('plugin validation checks the same temperature restrictions as translation', () => {
    let requested = false, result;
    loadPlugin({ model: 'custom', customModel: 'gpt-6-astra', translationTemperature: '0.2' }, {
        request() { requested = true; },
    }).pluginValidate(value => { result = value; });
    assert.equal(requested, false);
    assert.equal(result.result, false);
    assert.equal(result.error.type, 'param');
});

test('model discovery stays usable when a saved translation temperature needs correction', () => {
    const q = query(); q.value.text = '/models';
    loadPlugin({ translationTemperature: 'invalid' }, {
        request(r) { assert.equal(r.method, 'GET'); r.handler(ok({ data: [{ id: 'gpt-4.1' }] })); },
    }).translate(q.value);
    assert.match(text(q.completions[0].result), /gpt-4.1/);
});
