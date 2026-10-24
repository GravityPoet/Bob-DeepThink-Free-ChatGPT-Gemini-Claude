const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin, query, ok, chat, sse, text } = require('./helpers');

function tokens(request) { return [...new Set(JSON.stringify(request.body).match(/XLT_LITERAL_[A-Z0-9]+_\d+__/g) || [])]; }

test('literal source tags bypass upstream tag filtering and are restored locally', () => {
    const q=query();q.value.text='```html\n<think>Keep literal markup.</think>\n```';
    loadPlugin({streamOutput:'false'}, {request(r){
        assert.ok(!JSON.stringify(r.body).includes('<think>'));
        const ids=tokens(r);assert.equal(ids.length,2);
        r.handler(ok(chat('```html\n'+ids[0]+'Keep literal markup.'+ids[1]+'\n```')));
    }}).translate(q.value);
    assert.equal(text(q.completions[0].result),q.value.text);
});

test('all two-chunk splits of protected tokens avoid placeholder flashes', () => {
    for(let split=1;split<60;split++){
        const q=query();q.value.text='<think>hello</think>';
        loadPlugin({}, {streamRequest(r){
            const ids=tokens(r);const reply=ids[0]+'你好'+ids[1];
            const i=Math.min(split,reply.length);
            for(const content of [reply.slice(0,i),reply.slice(i)])r.streamHandler({text:sse({choices:[{delta:{content}}]})});
            r.handler(ok());
        }}).translate(q.value);
        assert.equal(text(q.completions[0].result),'<think>你好</think>');
        assert.ok(q.streams.every(frame=>!/[A-Z_]/.test(text(frame)||'')), 'split '+split);
        assert.ok(q.streams.every(frame=>(text(frame)||'').length>0 || !!frame.thinkInfo?.content), 'empty frame at split '+split);
    }
});

test('missing protected source tags fail instead of silently losing markup', () => {
    const q=query();q.value.text='<reasoning>hello</reasoning>';
    loadPlugin({streamOutput:'false'}, {request(r){r.handler(ok(chat('你好')));}}).translate(q.value);
    assert.equal(q.completions[0].result,undefined);
    assert.match(q.completions[0].error.message,/原文标记/);
});

test('missing source tags in an otherwise completed stream report an error', () => {
    const q=query();q.value.text='<think>hello</think>';
    loadPlugin({}, {streamRequest(r){r.streamHandler({text:sse({choices:[{delta:{content:'你好'}}]})});r.handler(ok());}}).translate(q.value);
    assert.ok(q.completions[0].error);assert.equal(q.completions[0].result,undefined);
});

test('genuine leading model reasoning stays separate from literal source markup', () => {
    const q=query();q.value.text='<think>hello</think>';
    loadPlugin({streamOutput:'false'}, {request(r){const ids=tokens(r);r.handler(ok(chat('<think>Plan.</think>'+ids[0]+'你好'+ids[1])));}}).translate(q.value);
    assert.equal(text(q.completions[0].result),'<think>你好</think>');
    assert.equal(q.completions[0].result.thinkInfo.content,'Plan.');
});

test('quoted attributes and tag case survive the round trip', () => {
    const q=query();q.value.text='<THINK title="a>b">hello</THINK>';
    loadPlugin({streamOutput:'false'}, {request(r){const ids=tokens(r);r.handler(ok(chat(ids[0]+'你好'+ids[1])));}}).translate(q.value);
    assert.equal(text(q.completions[0].result),'<THINK title="a>b">你好</THINK>');
});

test('unrelated HTML and similarly named custom elements remain ordinary text', () => {
    const q=query();q.value.text='<think-widget>hello</think-widget>';
    loadPlugin({streamOutput:'false'}, {request(r){assert.equal(tokens(r).length,0);r.handler(ok(chat('<think-widget>你好</think-widget>')));}}).translate(q.value);
    assert.equal(text(q.completions[0].result),'<think-widget>你好</think-widget>');
});
