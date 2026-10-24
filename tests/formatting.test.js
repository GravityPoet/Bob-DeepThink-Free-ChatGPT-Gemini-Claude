const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin, query, chat, ok, sse, text } = require('./helpers');

function buffered(answer, source = 'Translate this technical documentation.') {
    const q = query(); q.value.text = source;
    loadPlugin({ streamOutput: 'false' }, { request(r) { r.handler(ok(chat(answer))); } }).translate(q.value);
    return q.completions[0];
}

test('Markdown translation uses originalText before Bob strips emphasis and indentation', () => {
    for (const original of ['# Heading\n\nNormal **important words**.', '*emphasis*', '- Parent\n    - Nested']) {
        const q = query();
        q.value.text = 'Bob processed text';
        q.value.originalText = original;
        loadPlugin({ streamOutput: 'false' }, { request(r) {
            assert.ok(r.body.messages[1].content.endsWith(original));
            r.handler(ok(chat('译文')));
        } }).translate(q.value);
        assert.ok(q.completions[0].result);
        assert.equal(q.value.text, 'Bob processed text');
    }
});

test('plain text still uses Bob preprocessing and older Bob queries remain supported', () => {
    for (const originalText of ['A hyphen-\nated word.', '', undefined]) {
        const q = query();
        q.value.text = 'A hyphenated word.';
        q.value.originalText = originalText;
        loadPlugin({ streamOutput: 'false' }, { request(r) {
            assert.ok(r.body.messages[1].content.endsWith(q.value.text));
            r.handler(ok(chat('译文')));
        } }).translate(q.value);
        assert.ok(q.completions[0].result);
    }
});

test('Markdown headings, lists, tables, paragraphs and fenced code preserve their source formatting', () => {
    const answer = '# 标题\n\n正文 **加粗** 和 `inline code`。\n\n- 第一项\n  - 子项\n\n| 参数 | 数值 |\n| --- | ---: |\n| XY-Z100 | 1000 |\n\n```js\n  const total = 1000;\n```';
    const p = buffered(answer);
    assert.equal(text(p.result), answer);
    assert.equal(p.result.toParagraphs[0], answer);
});

test('literal think tags inside fenced code are not removed as model reasoning', () => {
    const answer = '```html\n<think>保留这段文本</think>\n```\n\n这是 HTML 示例。';
    assert.equal(text(buffered(answer).result), answer);
});

test('inline reasoning tags and non-leading tags remain visible', () => {
    const answer = '保留 `<reasoning>value</reasoning>`，以及文档中的 <think> 标签。';
    assert.equal(text(buffered(answer).result), answer);
});

test('a literal source document beginning with think tags keeps its markup', () => {
    const answer = '<think>这是需要翻译的字面标签。</think>';
    const q = query(); q.value.text = '<think>This is literal source markup.</think>';
    loadPlugin({ streamOutput: 'false' }, { request(r) {
        const tokens = JSON.stringify(r.body).match(/XLT_LITERAL_[A-Z0-9]+_\d+__/g);
        r.handler(ok(chat(tokens[0] + '这是需要翻译的字面标签。' + tokens[1])));
    } }).translate(q.value);
    assert.equal(text(q.completions[0].result), answer);
});

test('actual leading model reasoning is separated from the translated answer', () => {
    const p = buffered('<think>Plan the translation.</think>\n\n# 译文\n\n正文。');
    assert.equal(text(p.result), '# 译文\n\n正文。');
    assert.equal(p.result.thinkInfo.content, 'Plan the translation.');
});

test('partial leading thought tags do not flash in the translated answer', () => {
    const q = query();
    loadPlugin({}, { streamRequest(r) {
        for (const content of ['<thi', 'nk>', 'Plan', '</think>', '译文']) r.streamHandler({ text: sse({ choices: [{ delta: { content } }] }) });
        r.handler(ok());
    } }).translate(q.value);
    assert.ok(q.streams.every(frame => !/[<>]/.test(text(frame.result) || '')));
    assert.equal(text(q.completions[0].result), '译文');
});
