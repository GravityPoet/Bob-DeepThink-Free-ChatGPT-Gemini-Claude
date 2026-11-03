const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin, query, chat, ok, sse, text } = require('./helpers');

function translate(source, answer, options = {}) {
    const q = query();
    q.value.text = source;
    loadPlugin({ streamOutput: 'false', ...options }, { request(r) { r.handler(ok(chat(answer))); } }).translate(q.value);
    return q.completions[0].result;
}

test('plain long and multi-paragraph source stays plain when the model adds bold markers', () => {
    for (const source of [
        '普通文字。'.repeat(200),
        '第一段普通文字。\n\n第二段普通文字。\n\n第三段普通文字。\n\n第四段普通文字。',
    ]) {
        const result = translate(source, '**模型自行加粗**');
        assert.equal(result.content.format, 'plain');
        assert.equal(text(result), '模型自行加粗');
    }
});

test('symbols, identifiers and arithmetic do not enable Markdown rendering', () => {
    for (const source of ['file_name_value', '__init__', 'Use __init__ method', 'snake_case + 2 * 3 * 4', '路径：a_b/c_d，版本 v1_2']) {
        const result = translate(source, '**不应显示为加粗**');
        assert.equal(result.content.format, 'plain');
        assert.equal(text(result), '不应显示为加粗');
    }
});

test('Unicode punctuation, dashes, emoji and CJK text survive unchanged', () => {
    const source = '符号：- – — _ / \\ · …；中文，English，O0 Il1，🌎';
    const result = translate(source, source);
    assert.equal(text(result), source);
    assert.equal(result.content.format, 'plain');
});

test('real source Markdown still renders Markdown', () => {
    for (const source of ['**原文加粗**', '**原文加粗**，后面的中文', '这是**行内加粗**内容', '__原文加粗__', '*强调*。', '# 标题\n\n正文', '| A | B |\n| --- | --- |\n| 1 | 2 |']) {
        const result = translate(source, '译文 **重点**');
        assert.equal(result.content.format, 'markdown');
    }
});

test('streaming plain source does not render model-added bold as Bob Markdown', () => {
    const q = query();
    q.value.text = '普通长文本。'.repeat(120);
    loadPlugin({}, { streamRequest(r) {
        r.streamHandler({ text: 'data: {"choices":[{"delta":{"content":"**模型加粗**"}}]}\n\n' });
        r.handler(ok());
    } }).translate(q.value);
    assert.equal(q.completions[0].result.content.format, 'plain');
        assert.equal(text(q.completions[0].result), '模型加粗');
    assert.ok(q.streams.every(frame => frame.result.content.format === 'plain'));
});

test('plain source also removes an unsolicited underscore-bold wrapper', () => {
    const result = translate('普通文本', '__模型自行加粗__');
    assert.equal(result.content.format, 'plain');
    assert.equal(text(result), '模型自行加粗');
});

test('plain source removes generated HTML controls but keeps their text', () => {
    const result = translate('普通文本', '<button>上一页</button> <button>下一页</button>');
    assert.equal(text(result), '上一页 下一页');
    assert.equal(result.content.format, 'plain');
});

test('streaming plain source removes generated HTML controls before display', () => {
    const q = query();
    loadPlugin({}, { streamRequest(r) {
        r.streamHandler({ text: sse({ choices: [{ delta: { content: '<button>上一页</button>' } }] }) });
        r.handler(ok());
    } }).translate(q.value);
    assert.equal(text(q.streams[0].result), '上一页');
    assert.equal(text(q.completions[0].result), '上一页');
});

test('literal HTML examples remain unchanged when source contains markup', () => {
    const q = query();
    q.value.text = '保留 `<button>上一页</button>` 原样';
    loadPlugin({ streamOutput: 'false' }, { request(r) {
        const marker = JSON.stringify(r.body).match(/XLT_LITERAL_[A-Z0-9]+_\d+__/g)[0];
        r.handler(ok(chat('保留 ' + marker + ' 原样')));
    } }).translate(q.value);
    assert.equal(text(q.completions[0].result), '保留 `<button>上一页</button>` 原样');
});

test('identifier __init__ is not stripped as an emphasis wrapper', () => {
    const result = translate('Use __init__ method', 'Use __init__ method');
    assert.equal(text(result), 'Use __init__ method');
    assert.equal(result.content.format, 'plain');
});
