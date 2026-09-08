const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../plugin/main.js'), 'utf8');

function delta(text) {
    return { type: 'response.output_text.delta', delta: text };
}

function snapshot(text, type = 'response.completed') {
    return {
        type,
        response: {
            output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
        },
    };
}

function translateStream(events, { apiMode = 'responses', fragmentSize, fallbackText } = {}) {
    const completions = [];
    const progress = [];
    let fallbackRequests = 0;
    const context = {
        $option: {
            apiKey: 'synthetic-test-key',
            baseUrl: 'https://example.invalid/v1',
            provider: 'openai',
            apiMode,
            streamOutput: 'true',
        },
        $http: {
            streamRequest(request) {
                const wire = events.map(event => 'data: ' + JSON.stringify(event) + '\r\n\r\n').join('') +
                    'data: [DONE]\r\n\r\n';
                const size = fragmentSize || wire.length;
                for (let offset = 0; offset < wire.length; offset += size) {
                    request.streamHandler({ text: wire.slice(offset, offset + size) });
                }
                // Bob's stream completion response does not contain data.
                request.handler({ response: { statusCode: 200 } });
            },
            request(request) {
                assert.notEqual(fallbackText, undefined, 'Unexpected non-streaming fallback');
                fallbackRequests += 1;
                request.handler({ response: { statusCode: 200 }, data: snapshot(fallbackText).response });
            },
        },
    };
    vm.runInNewContext(source, context, { filename: 'plugin/main.js' });
    context.translate({
        text: 'Translate the description of XY-Z100.',
        from: 'en',
        to: 'zh-Hans',
        onStream(result) {
            progress.push(result.toParagraphs.join('\n'));
        },
        onCompletion(payload) {
            assert.equal(payload.error, undefined);
            completions.push(payload.result.toParagraphs.join('\n'));
        },
    });
    return { completions, progress, fallbackRequests };
}

const prefix = '这是 XY-Z';
const suffix = ' 的说明。';
const answer = prefix + '100' + suffix;
const repeatedDigitEvents = [delta(prefix), delta('10'), delta('0'), delta(suffix), snapshot(answer)];

test('Responses preserves the repeated zero and does not append the complete answer', () => {
    const result = translateStream(repeatedDigitEvents);
    assert.deepEqual(result.completions, [answer]);
    assert.ok(result.progress.includes(prefix + '100'), 'The streamed model number must retain both zeros');
    assert.equal(result.progress.at(-1), answer);
});

test('Chat Completions preserves repeated text, digits, and internal whitespace without a snapshot', () => {
    const events = ['ha', 'ha', ' ', ' ', '0', '0'].map(content => ({ choices: [{ delta: { content } }] }));
    const result = translateStream(events, { apiMode: 'chat_completions' });
    assert.deepEqual(result.completions, ['haha  00']);
});

test('A differing complete snapshot replaces a longer streamed draft', () => {
    const result = translateStream([delta('draft wording with an extra tail'), snapshot('final wording')]);
    assert.deepEqual(result.completions, ['final wording']);
    assert.equal(result.progress.at(-1), 'final wording');
});

test('A snapshot-only stream supplies the translated answer', () => {
    const result = translateStream([snapshot(answer)]);
    assert.deepEqual(result.completions, [answer]);
    assert.equal(result.progress.at(-1), answer);
});

test('Repeated complete snapshots do not duplicate the answer', () => {
    const result = translateStream([delta(answer), snapshot(answer), snapshot(answer)]);
    assert.deepEqual(result.completions, [answer]);
    assert.equal(result.progress.at(-1), answer);
});

test('Fragmented SSE data prefixes, JSON, and CRLF boundaries preserve the answer', () => {
    const result = translateStream(repeatedDigitEvents, { fragmentSize: 7 });
    assert.deepEqual(result.completions, [answer]);
    assert.equal(result.progress.at(-1), answer);
});

test('Deltas following an interim snapshot remain in the completed answer', () => {
    const result = translateStream([
        delta('partial'),
        snapshot('partial', 'response.in_progress'),
        delta(' continuation'),
    ]);
    assert.deepEqual(result.completions, ['partial continuation']);
    assert.equal(result.progress.at(-1), 'partial continuation');
});

test('An empty stream falls back once and returns one answer', () => {
    const result = translateStream([], { fallbackText: answer });
    assert.deepEqual(result.completions, [answer]);
    assert.equal(result.fallbackRequests, 1);
});
