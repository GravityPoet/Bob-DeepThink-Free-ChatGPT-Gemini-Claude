const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash, createHmac } = require('node:crypto');
const { loadPlugin, query, sse, chat, ok, text } = require('./helpers');

function translate(options, handler) {
    const q=query();
    loadPlugin(options, { request: r => handler(r,q), streamRequest: r => handler(r,q) }).translate(q.value);
    return q;
}

test('all possible two-chunk splits preserve an SSE translation', () => {
    const source=sse({choices:[{delta:{content:'你好 🌎 100'}}]})+'data: [DONE]\r\n\r\n';
    for(let i=0;i<=source.length;i++) {
        const q=translate({}, r => { r.streamHandler({text:source.slice(0,i)}); r.streamHandler({text:source.slice(i)}); r.handler(ok()); });
        assert.equal(text(q.completions[0].result),'你好 🌎 100', 'split '+i);
    }
});
test('UTF-8 byte boundaries do not lose Chinese or emoji', () => {
    const bytes=Buffer.from(sse({choices:[{delta:{content:'你好 👋 café'}}]}));
    for(let i=1;i<bytes.length;i++) {
        const q=translate({}, r => {
            for(const part of [bytes.subarray(0,i),bytes.subarray(i)]) r.streamHandler({text:part.toString(),rawData:{toByteArray:()=>[...part]}});
            r.handler(ok());
        });
        assert.equal(text(q.completions[0].result),'你好 👋 café', 'byte '+i);
    }
});
test('SSE comments, event fields, multiline data and CRLF are handled', () => {
    const q=translate({}, r => {
        for(const text of [': ping\r','\nevent: response.output_text.delta\r\ndata: {"delta":\r\ndata: "译文"}\r','\n\r\n']) r.streamHandler({text});
        r.streamHandler({text:sse({type:'response.completed',response:{status:'completed'}})});
        r.handler(ok());
    });
    assert.equal(text(q.completions[0].result),'译文');
});
test('reasoning deltas preserve spaces and repeated tokens without leaking into the answer', () => {
    const q=translate({},r=> {
        for(const reasoning_content of ['one',' ','one']) r.streamHandler({text:sse({choices:[{delta:{reasoning_content}}]})});
        r.streamHandler({text:sse({choices:[{delta:{content:'译文'}}]})});r.handler(ok());
    });
    assert.equal(q.completions[0].result.thinkInfo.content,'one one');
    assert.equal(text(q.completions[0].result),'译文');
});
test('stream length limit is an error even after partial output', () => {
    const q=translate({},r=>{r.streamHandler({text:sse({choices:[{delta:{content:'partial'},finish_reason:'length'}]})});r.handler(ok());});
    assert.ok(q.completions[0].error);assert.equal(q.completions[0].result,undefined);
});
test('Responses incomplete is an error even when output exists', () => {
    const q=translate({apiMode:'responses'},r=>{r.streamHandler({text:sse({type:'response.incomplete',response:{status:'incomplete',output_text:'partial',incomplete_details:{reason:'max_output_tokens'}}})});r.handler(ok());});
    assert.match(q.completions[0].error.message,/截断/);
});
test('structured and string API errors are surfaced inside HTTP 200', () => {
    for(const error of [{message:'invalid model'},'invalid model']) {
        const q=translate({streamOutput:'false'},r=>r.handler(ok({error})));
        assert.equal(q.completions[0].error.message,'invalid model');
    }
});
test('HTTP errors use the actual stream JSON body',()=>{
    const q=translate({},r=>{r.streamHandler({text:'{"error":{"message":"quota exceeded"}}'});r.handler({response:{statusCode:429}});});
    assert.match(q.completions[0].error.message,/quota/);
});
test('transport failures keep their network classification',()=>{
    const q=translate({},r=>r.handler({error:{message:'connection reset'}}));
    assert.equal(q.completions[0].error.type,'network');
});
test('stream errors never fall back or overwrite completion',()=>{
    let requests=0;const q=query();
    loadPlugin({}, {streamRequest(r){r.streamHandler({text:sse({type:'error',message:'server failed'})});r.handler(ok());r.handler(ok());},request(){requests++;}}).translate(q.value);
    assert.equal(requests,0);assert.equal(q.completions.length,1);assert.ok(q.completions[0].error);
});
test('late frames after cancellation are ignored and subscription is disposed',()=>{
    const q=query();let saved;
    loadPlugin({}, {streamRequest(r){saved=r;}}).translate(q.value);
    assert.ok(q.value.cancelSignal.size);q.value.cancelSignal.send();saved.streamHandler({text:sse({delta:'late'})});saved.handler(ok());
    assert.equal(q.value.cancelSignal.size,0);assert.equal(q.completions.length,1);assert.equal(q.streams.length,0);
});
test('successful completion also disposes the cancellation subscription',()=>{
    const q=translate({streamOutput:'false'},r=>{r.handler(ok(chat('译文')));r.handler(ok(chat('duplicate')));});
    assert.equal(q.value.cancelSignal.size,0);assert.equal(q.completions.length,1);
});
test('empty streams fall back once using only the remaining timeout budget',()=>{
    const q=query();let started, fallback;
    loadPlugin({requestTimeoutSec:'20'}, {streamRequest(r){started=r;r.handler(ok());}, request(r){fallback=r;r.handler(ok(chat('译文')));}}).translate(q.value);
    assert.ok(fallback.timeout<=started.timeout);assert.ok(fallback.timeout>0);assert.equal(fallback.body.stream,undefined);assert.equal(text(q.completions[0].result),'译文');
});
test('concurrent translations do not share buffers or completion guards',()=>{
    const requests=[];const p=loadPlugin({}, {streamRequest(r){requests.push(r);}});const a=query(),b=query();
    p.translate(a.value);p.translate(b.value);
    requests[1].streamHandler({text:sse({delta:'second'})});requests[0].streamHandler({text:sse({delta:'first'})});
    requests[0].handler(ok());requests[1].handler(ok());
    assert.equal(text(a.completions[0].result),'first');assert.equal(text(b.completions[0].result),'second');
});
test('Gemini native streams through the native endpoint and omits the OpenAI stream flag',()=>{
    let request;
    const q=translate({apiMode:'gemini_generate_content',baseUrl:'https://generativelanguage.googleapis.com/v1beta?key=fixture'},r=>{
        request=r;r.streamHandler({text:sse({candidates:[{content:{parts:[{thought:true,text:'thinking'},{text:'译文'}]},finishReason:'STOP'}]})});r.handler(ok());
    });
    assert.match(request.url,/:streamGenerateContent\?key=fixture&alt=sse$/);
    assert.equal(request.body.stream,undefined);assert.equal(text(q.completions[0].result),'译文');
});
test('Gemini ignores a leading thought signature and reads subsequent answer parts',()=>{
    const q=translate({apiMode:'gemini_generate_content',streamOutput:'false'},r=>r.handler(ok({candidates:[{content:{parts:[{thoughtSignature:'opaque'},{text:'译文'}]}}]})));
    assert.equal(text(q.completions[0].result),'译文');
});
test('legacy callback remains usable without onCompletion',()=>{
    let completion;const p=loadPlugin({streamOutput:'false'},{request(r){r.handler(ok(chat('译文')));}});
    p.translate({text:'Hello',from:'en',to:'zh-Hans'},v=>completion=v);assert.equal(text(completion.result),'译文');
});
test('input validation does not mutate caller data or send requests',()=>{
    for(const value of ['',null,{}, {text:123,to:'en'}, {text:'x',to:'invalid'}, {text:'x',to:'auto'}]) {
        let sent=0;let completion;const before=JSON.stringify(value);
        loadPlugin({}, {request(){sent++;},streamRequest(){sent++;}}).translate(value,v=>completion=v);
        assert.equal(sent,0);assert.ok(completion.error);assert.equal(JSON.stringify(value),before);
    }
});
test('URL normalization preserves proxy paths, versions and query strings',()=>{
    const urls=loadPlugin().require('./lib/urls.js');
    for(const [base,mode,expected] of [
        ['https://example.com/cliproxy','chat_completions','https://example.com/cliproxy/v1/chat/completions'],
        ['https://example.com/v2?api-version=x','chat_completions','https://example.com/v2/chat/completions?api-version=x'],
        ['https://generativelanguage.googleapis.com/v1beta/openai','chat_completions','https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'],
        ['http://[::1]:8080','chat_completions','http://[::1]:8080/v1/chat/completions'],
    ]) assert.equal(urls.buildApiEndpoint(urls.normalizeBaseUrl(base,mode),mode,'m'),expected);
    for(const bad of ['https:///','ftp://example.com','https://fixture-user@example.com','https://example.com/#fragment','https://example.com:99999','https://example.com/%zz','https://example.com/with space']) assert.equal(urls.normalizeBaseUrl(bad,'responses'),'');
});
test('menu and runtime protocol defaults agree',()=>{
    const fs=require('node:fs');const info=JSON.parse(fs.readFileSync(require('node:path').resolve(__dirname,'../plugin/info.json')));
    const config=loadPlugin().require('./lib/config.js');const p=loadPlugin();delete p.$option.apiMode;
    assert.equal(p.require('./lib/config.js').buildRuntimeConfig().apiMode,info.options.find(o=>o.identifier==='apiMode').defaultValue);
    assert.ok(config.resolveModel().ok);
});
test('AWS signing payload is sent as raw UTF-8 data, never JSON-quoted twice',()=>{
    const q=translate({provider:'bedrock',apiMode:'aws_converse',baseUrl:'https://bedrock-runtime.us-east-1.amazonaws.com',awsAccessKeyId:'fixture-id',awsSecretAccessKey:'fixture-secret',streamOutput:'false'},r=>{
        assert.equal(typeof r.body.toUTF8,'function');
        const raw=r.body.toUTF8();assert.ok(JSON.parse(raw).messages);assert.equal(r.header['X-Amz-Content-Sha256'],createHash('sha256').update(raw).digest('hex'));
        r.handler(ok({output:{message:{content:[{text:'译文'}]}},stopReason:'end_turn'}));
    });assert.equal(text(q.completions[0].result),'译文');
});
test('SHA-256 and HMAC match Node crypto for Unicode and long keys',()=>{
    const aws=loadPlugin().require('./lib/aws.js');
    for(const value of ['','abc','中文 👋','x'.repeat(200)]) {
        assert.equal(aws.sha256Hex(aws.utf8Bytes(value)),createHash('sha256').update(value).digest('hex'));
        assert.equal(aws.bytesToHex(aws.hmacSha256Bytes(aws.utf8Bytes('key'.repeat(80)),aws.utf8Bytes(value))),createHmac('sha256','key'.repeat(80)).update(value).digest('hex'));
    }
});
test('Bob before 1.21 still receives the full text via toParagraphs',()=>{
    const q=query();loadPlugin({streamOutput:'false'},{request(r){r.handler(ok(chat('line 1\n\n  line 2')));}},{ $env:{appVersion:'1.15.0'} }).translate(q.value);
    assert.deepEqual(Array.from(q.completions[0].result.toParagraphs),['line 1\n\n  line 2']);
});

test('an early EOF in Responses is not reported as a complete translation',()=>{
 const q=translate({apiMode:'responses'},r=>{r.streamHandler({text:sse({type:'response.output_text.delta',delta:'partial'})});r.handler(ok());});
 assert.match(q.completions[0].error.message,/提前结束/);
});
test('a completed Responses stream still succeeds',()=>{
 const q=translate({apiMode:'responses'},r=>{for(const e of [{type:'response.output_text.delta',delta:'译文'},{type:'response.completed',response:{status:'completed',output_text:'译文'}}])r.streamHandler({text:sse(e)});r.handler(ok());});
 assert.equal(text(q.completions[0].result),'译文');
});
test('plain text HTTP errors retain the response body in streaming mode',()=>{
 const q=translate({},r=>{r.streamHandler({text:'gateway unavailable'});r.handler({response:{statusCode:502}});});
 assert.match(q.completions[0].error.message,/gateway unavailable/);
});
