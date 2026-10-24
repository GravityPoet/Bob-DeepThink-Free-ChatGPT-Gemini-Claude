const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin, query, sse, chat, ok, text } = require('./helpers');

function streamed(events, options = {}, end = ok()) {
    const q = query();
    const requests = [];
    const plugin = loadPlugin(options, {
        streamRequest(r) { requests.push(r); for (const e of events) r.streamHandler({ text: e }); r.handler(end); },
        request(r) { requests.push(r); r.handler(ok(chat('fallback'))); },
    });
    plugin.translate(q.value);
    return { ...q, requests };
}

test('stream deltas preserve repeated characters (PR #1 reproduction)', () => {
    const r = streamed(['XY-Z', '10', '0'].map(content => sse({ choices: [{ delta: { content } }] })));
    assert.equal(text(r.completions[0].result), 'XY-Z100');
});
test('complete snapshots replace rather than append text', () => {
    const r = streamed([sse({ delta: 'bad' }), sse({ response: { output_text: 'correct' } })]);
    assert.equal(text(r.completions[0].result), 'correct');
});
test('structured deltas preserve token spaces', () => {
    const r = streamed(['hello', ' ', 'world'].map(t => sse({ choices: [{ delta: { content: [{ type: 'text', text: t }] } }] })));
    assert.equal(text(r.completions[0].result), 'hello world');
});
test('an unterminated final SSE line is consumed', () => {
    const r = streamed(['data: ' + JSON.stringify({ choices: [{ delta: { content: '你好' } }] })]);
    assert.equal(text(r.completions[0].result), '你好');
    assert.equal(r.requests.length, 1);
});
test('raw JSON returned to a streaming request is parsed without a second charge', () => {
    const r = streamed([JSON.stringify(chat('你好'))]);
    assert.equal(text(r.completions[0].result), '你好');
    assert.equal(r.requests.length, 1);
});
test('Responses failures after a text delta are not success', () => {
    const r = streamed([sse({ type: 'response.output_text.delta', delta: 'partial' }), sse({ type: 'response.failed', response: { status: 'failed', error: { message: 'upstream failed' } } })]);
    assert.ok(r.completions[0].error);
});
test('token-limited translations are reported as truncated', () => {
    const q = query();
    loadPlugin({ streamOutput: 'false' }, { request(r) { r.handler(ok(chat('partial', 'length'))); } }).translate(q.value);
    assert.match(q.completions[0].error?.message || '', /截断|Token|token/);
});
test('modern completion is preferred over legacy completion', () => {
    const q = query(); let legacy = 0;
    loadPlugin({ streamOutput: 'false' }, { request(r) { r.handler(ok(chat('你好'))); } }).translate(q.value, () => legacy++);
    assert.equal(q.completions.length, 1); assert.equal(legacy, 0);
});
test('cancelled streams do not restart as non-streaming requests', () => {
    const q = query(); let retried = 0;
    const p = loadPlugin({}, { streamRequest(r) { q.value.cancelSignal.send(); r.handler(ok()); }, request() { retried++; } });
    p.translate(q.value); assert.equal(retried, 0); assert.ok(q.completions[0]?.error);
});
test('synchronous transport exceptions finish once', () => {
    const q = query();
    const p = loadPlugin({ streamOutput: 'false' }, { request() { throw new Error('transport unavailable'); } });
    assert.doesNotThrow(() => p.translate(q.value)); assert.equal(q.completions.length, 1); assert.ok(q.completions[0].error);
});
test('whole endpoint determines the body protocol without rewriting preferences', () => {
    const q = query(); let request;
    const p = loadPlugin({ baseUrl: 'https://example.com/v1/responses?api-version=2026-01-01', streamOutput: 'false' }, { request(r) { request = r; r.handler(ok({ output_text: '你好' })); } });
    p.translate(q.value);
    assert.equal(request.url, 'https://example.com/v1/responses?api-version=2026-01-01');
    assert.ok(request.body.input); assert.equal(request.body.messages, undefined); assert.equal(p.$option.apiMode, 'chat_completions');
});
test('Gemini native uses Google API key header for the official host', () => {
    const q = query(); let request;
    loadPlugin({ provider: 'gemini', apiMode: 'gemini_generate_content', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', streamOutput: 'false' }, { request(r) { request=r; r.handler(ok({ candidates: [{ content: { parts: [{ text: '你好' }] } }] })); } }).translate(q.value);
    assert.equal(request.header['x-goog-api-key'], 'test-key'); assert.equal(request.header.Authorization, undefined);
});
test('formatting is preserved in Bob results', () => {
    const q = query(); const expected = '# 标题\n\n- 第一项\n  - 子项\n\n```js\n  let n = 1;\n```';
    loadPlugin({ streamOutput: 'false' }, { request(r) { r.handler(ok(chat(expected))); } }).translate(q.value);
    assert.equal(text(q.completions[0].result), expected);
});
test('validation exercises the configured translation endpoint and model', () => {
    let request, completion;
    loadPlugin({}, { request(r) { request = r; r.handler({ response: { statusCode: 404 }, data: { error: { message: 'not found' } } }); } }).pluginValidate(v => completion = v);
    assert.equal(request.method, 'POST'); assert.match(request.url, /chat\/completions$/); assert.equal(completion.result, false);
});
test('an empty or malformed host fails before sending credentials', () => {
    const q = query(); let sent = false;
    loadPlugin({ baseUrl: 'https:///' }, { request() { sent=true; }, streamRequest() { sent=true; } }).translate(q.value);
    assert.equal(sent, false); assert.ok(q.completions[0]?.error);
});
test('error diagnostics redact configured secrets and query values', () => {
    const q = query();
    loadPlugin({ apiKey: 'private-fixture-key', streamOutput: 'false', baseUrl: 'https://example.com/v1/chat/completions?key=private-query' }, { request(r) { r.handler({ response: { statusCode: 401 }, data: { error: { message: 'invalid private-fixture-key' }, echoed: 'private-query' } }); } }).translate(q.value);
    assert.doesNotMatch(JSON.stringify(q.completions), /private-fixture-key|private-query/);
});
