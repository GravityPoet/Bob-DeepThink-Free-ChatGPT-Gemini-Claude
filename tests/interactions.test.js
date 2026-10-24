const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin, query, sse, ok, text } = require('./helpers');

const options = { provider: 'gemini', apiMode: 'gemini_interactions', model: 'custom',
    customModel: 'gemini-3.8-flash', baseUrl: 'https://generativelanguage.googleapis.com', reasoningEffort: 'low' };
const response = { object: 'interaction', status: 'completed', steps: [
    { type: 'thought', signature: 'opaque-signature', summary: [{ type: 'text', text: '简短摘要' }] },
    { type: 'model_output', content: [{ type: 'text', text: '你好 1000' }] },
] };

test('Gemini Interactions uses the stable endpoint and stateless request shape', () => {
    const q = query(); let request;
    loadPlugin({ ...options, streamOutput: 'false' }, { request(r) { request = r; r.handler(ok(response)); } }).translate(q.value);
    assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1/interactions');
    assert.equal(request.header['x-goog-api-key'], 'test-key');
    assert.equal(request.body.model, 'gemini-3.8-flash');
    assert.equal(request.body.store, false);
    assert.equal(request.body.generation_config.thinking_level, 'low');
    assert.equal(request.body.generation_config.max_output_tokens, 4096);
    assert.equal(text(q.completions[0].result), '你好 1000');
    assert.equal(q.completions[0].result.thinkInfo.content, '简短摘要');
    assert.doesNotMatch(JSON.stringify(q.completions), /opaque-signature/);
});

const events = [
    { event_type: 'interaction.created', interaction: { status: 'in_progress' } },
    { event_type: 'step.start', index: 0, step: { type: 'thought', signature: 'opaque-signature' } },
    { event_type: 'step.delta', index: 0, delta: { type: 'thought_summary', content: { type: 'text', text: '简短摘要' } } },
    { event_type: 'step.start', index: 1, step: { type: 'model_output', content: [] } },
    { event_type: 'step.delta', index: 1, delta: { type: 'text', text: '你好 10' } },
    { event_type: 'step.delta', index: 1, delta: { type: 'text', text: '00' } },
    { event_type: 'interaction.completed', interaction: { status: 'completed' } },
];
test('Interactions streams visible text and summaries before HTTP completion', () => {
    const q = query(); let request;
    loadPlugin(options, { streamRequest(r) { request = r; } }).translate(q.value);
    assert.equal(request.body.stream, true);
    for (const event of events) request.streamHandler({ text: sse(event) });
    assert.equal(q.completions.length, 0);
    assert.equal(text(q.streams.at(-1).result), '你好 1000');
    assert.equal(q.streams.at(-1).result.thinkInfo.content, '简短摘要');
    request.handler(ok());
    assert.equal(text(q.completions[0].result), '你好 1000');
});
test('Interactions requires its terminal event and never treats partial output as complete', () => {
    const q = query();
    loadPlugin(options, { streamRequest(r) { for (const event of events.slice(0, -1)) r.streamHandler({ text: sse(event) }); r.handler(ok()); } }).translate(q.value);
    assert.ok(q.completions[0].error);
    assert.equal(q.completions[0].result, undefined);
});
test('Interactions incomplete status fails even after text arrived', () => {
    const q = query();
    loadPlugin(options, { streamRequest(r) {
        for (const event of events.slice(0, -1)) r.streamHandler({ text: sse(event) });
        r.streamHandler({ text: sse({ event_type: 'interaction.completed', interaction: { status: 'incomplete' } }) }); r.handler(ok());
    } }).translate(q.value);
    assert.match(q.completions[0].error?.message || '', /未完成|截断/);
});
test('a complete JSON Interaction returned to a stream request does not cause a second request', () => {
    const q = query(); let sent = 0;
    loadPlugin(options, { streamRequest(r) { sent++; r.streamHandler({ text: JSON.stringify(response) }); r.handler(ok()); } }).translate(q.value);
    assert.equal(sent, 1);
    assert.equal(text(q.completions[0].result), '你好 1000');
});
test('full Interactions endpoints infer the protocol and preserve the proxy query', () => {
    const q = query(); let request;
    loadPlugin({ ...options, apiMode: 'responses', streamOutput: 'false', baseUrl: 'https://example.com/proxy/v1beta/interactions?route=fixture' },
        { request(r) { request = r; r.handler(ok(response)); } }).translate(q.value);
    assert.equal(request.url, 'https://example.com/proxy/v1beta/interactions?route=fixture');
    assert.ok(request.body.generation_config);
    assert.equal(request.body.store, false);
});
test('Interactions rejects a contradictory or missing completion status', () => {
    for (const status of ['in_progress', undefined]) {
        const q = query();
        loadPlugin(options, { streamRequest(r) {
            for (const event of events.slice(0, -1)) r.streamHandler({ text: sse(event) });
            r.streamHandler({ text: sse({ event_type: 'interaction.completed', interaction: { status } }) }); r.handler(ok());
        } }).translate(q.value);
        assert.ok(q.completions[0].error);
    }
});
