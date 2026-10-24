const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin, query, chat, ok } = require('./helpers');

function requestFor(model, effort, apiMode = 'chat_completions', extra = {}) {
    const q = query(); const requests = [];
    loadPlugin({ model: 'custom', customModel: model, reasoningEffort: effort, apiMode,
        streamOutput: 'false', ...extra }, { request(r) { requests.push(r); r.handler(ok(chat('译文'))); } }).translate(q.value);
    return { ...q, request: requests[0], requests };
}

test('GPT-6 max uses the native Responses effort field', () => {
    const q = requestFor('gpt-6.1-sol', 'max', 'responses');
    assert.equal(q.request.body.reasoning?.effort, 'max');
    assert.equal(q.request.body.reasoning_effort, undefined);
});
test('GPT-6 xhigh works in Chat Completions', () => {
    assert.equal(requestFor('gpt-6-astra', 'xhigh').request.body.reasoning_effort, 'xhigh');
});
test('GPT-5 minimal and GPT-5.2 xhigh remain distinct supported levels', () => {
    assert.equal(requestFor('gpt-5-mini', 'minimal').request.body.reasoning_effort, 'minimal');
    assert.equal(requestFor('gpt-5.2', 'xhigh').request.body.reasoning_effort, 'xhigh');
});
test('known unsupported GPT levels fail before sending a request', () => {
    for (const [model, effort] of [['gpt-6.1-sol', 'minimal'], ['gpt-6-astra', 'off'], ['gpt-5.2', 'max']]) {
        const q = requestFor(model, effort);
        assert.equal(q.requests.length, 0);
        assert.equal(q.completions[0].error?.type, 'param');
    }
});
test('legacy none means omit settings; explicit off sends native none', () => {
    assert.equal(requestFor('gpt-5.2', 'none').request.body.reasoning_effort, undefined);
    assert.equal(requestFor('gpt-5.2', 'off').request.body.reasoning_effort, 'none');
});
test('Claude max uses output_config with adaptive thinking', () => {
    const q = requestFor('claude-opus-5-5', 'max', 'anthropic_messages');
    assert.equal(q.request.body.output_config?.effort, 'max');
    assert.equal(q.request.body.thinking?.type, 'adaptive');
    assert.equal(q.request.body.reasoning_effort, undefined);
});
test('Claude 4.6 accepts max but rejects xhigh', () => {
    assert.equal(requestFor('claude-opus-4-6', 'max', 'anthropic_messages').request.body.output_config?.effort, 'max');
    const q = requestFor('claude-opus-4-6', 'xhigh', 'anthropic_messages');
    assert.equal(q.requests.length, 0);
    assert.equal(q.completions[0].error?.type, 'param');
});
test('Claude thinking-off rules differ between current models', () => {
    const opus = requestFor('claude-opus-5-5', 'off', 'anthropic_messages');
    assert.equal(opus.requests.length, 0);
    assert.equal(requestFor('claude-sonnet-5-5', 'off', 'anthropic_messages').request.body.thinking?.type, 'between_tools');
    assert.equal(requestFor('claude-haiku-5-5', 'off', 'anthropic_messages').request.body.thinking?.type, 'disabled');
});
test('Gemini 3 thinkingLevel does not use the OpenAI effort field', () => {
    const q = requestFor('gemini-3.6-flash', 'minimal', 'gemini_generate_content');
    assert.equal(q.request.body.generationConfig.thinkingConfig?.thinkingLevel, 'minimal');
    assert.equal(q.request.body.generationConfig.maxOutputTokens, 4096);
    assert.equal(q.request.body.reasoning_effort, undefined);
});
test('Gemini 3.8 and Gemini 4 reject minimal, max and xhigh', () => {
    for (const model of ['gemini-3.8-flash', 'gemini-4-argon']) for (const effort of ['minimal', 'max', 'xhigh']) {
        const q = requestFor(model, effort, 'gemini_generate_content');
        assert.equal(q.requests.length, 0);
        assert.equal(q.completions[0].error?.type, 'param');
    }
});
test('Gemini 2.5 uses a token budget and respects its thinking-off restriction', () => {
    const q = requestFor('gemini-2.5-pro', 'high', 'gemini_generate_content', { maxOutputTokens: '65536' });
    assert.equal(q.request.body.generationConfig.thinkingConfig?.thinkingBudget, 24576);
    assert.equal(q.request.body.generationConfig.thinkingConfig?.thinkingLevel, undefined);
    assert.equal(requestFor('gemini-2.5-flash', 'off', 'gemini_generate_content').request.body.generationConfig.thinkingConfig?.thinkingBudget, 0);
    assert.equal(requestFor('gemini-2.5-pro', 'off', 'gemini_generate_content').requests.length, 0);
});
test('Bedrock Claude effort belongs inside additionalModelRequestFields', () => {
    const q = requestFor('us.anthropic.claude-opus-4-6-v1', 'max', 'aws_converse');
    assert.equal(q.request.body.additionalModelRequestFields?.output_config?.effort, 'max');
    assert.equal(q.request.body.additionalModelRequestFields?.thinking?.type, 'adaptive');
});
test('unknown compatible model names can pass an explicitly selected effort to their gateway', () => {
    assert.equal(requestFor('private-model-alias', 'max').request.body.reasoning_effort, 'max');
});

test('Gemini 4 follow-model mode supplies its required default thinking level', () => {
    const q = requestFor('gemini-4-argon', 'none', 'gemini_generate_content');
    assert.equal(q.request.body.generationConfig.thinkingConfig?.thinkingLevel, 'medium');
});
test('SiliconFlow DeepSeek V3.2 uses its thinking switch and separate budget', () => {
    const extra = { baseUrl: 'https://api.siliconflow.cn/v1/chat/completions' };
    const off = requestFor('deepseek-ai/DeepSeek-V3.2', 'off', 'chat_completions', extra);
    assert.equal(off.request.body.enable_thinking, false);
    assert.equal(off.request.body.reasoning_effort, undefined);
    const high = requestFor('deepseek-ai/DeepSeek-V3.2', 'high', 'chat_completions', extra);
    assert.equal(high.request.body.enable_thinking, true);
    assert.equal(high.request.body.thinking_budget, 32768);
    assert.equal(high.request.body.max_tokens, 4096);
});
test('SiliconFlow V4 uses high/max and documented compatibility aliases', () => {
    const extra = { baseUrl: 'https://api.siliconflow.cn/v1' };
    assert.equal(requestFor('deepseek-ai/DeepSeek-V4-Flash', 'max', 'chat_completions', extra).request.body.reasoning_effort, 'max');
    assert.equal(requestFor('deepseek-ai/DeepSeek-V4-Flash', 'xhigh', 'chat_completions', extra).request.body.reasoning_effort, 'max');
    assert.equal(requestFor('Pro/zai-org/GLM-5.2', 'medium', 'chat_completions', extra).request.body.reasoning_effort, 'high');
});
test('Bedrock Mantle native Claude uses the documented endpoint and signing service', () => {
    const q = requestFor('anthropic.claude-opus-5-5', 'max', 'anthropic_messages', {
        provider: 'bedrock', baseUrl: '', awsAccessKeyId: 'fixture-id', awsSecretAccessKey: 'fixture-secret',
    });
    assert.equal(q.request.url, 'https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages');
    assert.match(q.request.header.Authorization, /\/bedrock-mantle\/aws4_request/);
    assert.equal(q.request.header['anthropic-version'], '2026-10-21');
});
