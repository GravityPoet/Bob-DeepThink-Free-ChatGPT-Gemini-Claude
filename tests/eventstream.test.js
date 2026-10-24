const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
// Python's native zlib is an independent reference, including on Node 20,
// which does not yet expose zlib.crc32.
function crc32(bytes) {
    const result = spawnSync('python3', ['-c', 'import sys,zlib; print(zlib.crc32(sys.stdin.buffer.read()))'], {input:bytes,encoding:'utf8'});
    assert.equal(result.status,0); return Number(result.stdout.trim());
}
const codec = require('../plugin/lib/eventstream');
const { loadPlugin, query, ok, text } = require('./helpers');
function frame(event, payload, messageType='event') {
    const headers = Object.entries({':message-type':messageType,[messageType==='exception'?':exception-type':':event-type']:event}).map(([key,value])=>{
        const k=Buffer.from(key),v=Buffer.from(value),n=Buffer.alloc(2);n.writeUInt16BE(v.length);return Buffer.concat([Buffer.from([k.length]),k,Buffer.from([7]),n,v]);
    });
    const h=Buffer.concat(headers),body=Buffer.from(JSON.stringify(payload)),prelude=Buffer.alloc(12);
    prelude.writeUInt32BE(16+h.length+body.length);prelude.writeUInt32BE(h.length,4);prelude.writeUInt32BE(crc32(prelude.subarray(0,8)),8);
    const content=Buffer.concat([prelude,h,body]),tail=Buffer.alloc(4);tail.writeUInt32BE(crc32(content)); return Buffer.concat([content,tail]);
}
const options={apiMode:'aws_converse',provider:'bedrock',model:'custom',customModel:'us.anthropic.claude-sonnet-4-6',baseUrl:'https://bedrock-runtime.us-east-1.amazonaws.com',awsAccessKeyId:'fixture',awsSecretAccessKey:'fixture'};
function raw(bytes){return {rawData:{toByteArray:()=>Array.from(bytes)}};}
test('EventStream CRC matches an independent native CRC and standard check vector',()=>{
    assert.equal(codec.crc32(Buffer.from('123456789')),0xcbf43926);
    const bytes=Buffer.from('arbitrary UTF8 中文');assert.equal(codec.crc32(bytes),crc32(bytes));
});
test('ConverseStream signs the stream URL, omits stream:true, and emits partial results',()=>{
    const q=query();let request;
    loadPlugin(options,{streamRequest(r){request=r;}}).translate(q.value);
    assert.match(request.url,/\/converse-stream$/);assert.equal(JSON.parse(request.body.toUTF8()).stream,undefined);
    assert.match(request.header.Authorization,/bedrock\/aws4_request/);assert.equal(request.header.Accept,'application/vnd.amazon.eventstream');
    const bytes=Buffer.concat([frame('messageStart',{role:'assistant'}),frame('contentBlockDelta',{contentBlockIndex:0,delta:{text:'译文 10'}}),frame('contentBlockDelta',{contentBlockIndex:0,delta:{text:'00'}}),frame('messageStop',{stopReason:'end_turn'})]);
    for(let i=0;i<bytes.length;i++)request.streamHandler(raw(bytes.subarray(i,i+1)));
    assert.equal(q.completions.length,0);assert.equal(text(q.streams.at(-1).result),'译文 1000');request.handler(ok());
    assert.equal(text(q.completions[0].result),'译文 1000');
});
test('ConverseStream keeps reasoning text separate and ignores signatures',()=>{
    const q=query();loadPlugin(options,{streamRequest(r){
        for(const delta of [{reasoningContent:{text:'summary'}},{reasoningContent:{signature:'opaque'}},{text:'译文'}])r.streamHandler(raw(frame('contentBlockDelta',{contentBlockIndex:0,delta})));
        r.streamHandler(raw(frame('messageStop',{stopReason:'end_turn'})));r.handler(ok());
    }}).translate(q.value);
    assert.equal(q.completions[0].result.thinkInfo.content,'summary');assert.equal(text(q.completions[0].result),'译文');assert.doesNotMatch(JSON.stringify(q.completions),/opaque/);
});
test('ConverseStream rejects corrupt frames, truncation, API exceptions and missing terminal events',()=>{
    const good=frame('contentBlockDelta',{delta:{text:'partial'}}),bad=Buffer.from(good);bad[bad.length-1]^=1;
    for(const bytes of [bad,good.subarray(0,-1),good,frame('throttlingException',{message:'busy'},'exception'),Buffer.concat([good,frame('messageStop',{stopReason:'max_tokens'})])]){
        const q=query();loadPlugin(options,{streamRequest(r){r.streamHandler(raw(bytes));r.handler(ok());}}).translate(q.value);assert.ok(q.completions[0].error);
    }
});
test('ConverseStream reports plain JSON HTTP errors without a second paid request',()=>{
    const q=query();let sent=0;loadPlugin(options,{streamRequest(r){sent++;r.streamHandler(raw(Buffer.from('{"message":"denied"}')));r.handler({response:{statusCode:403}});}}).translate(q.value);
    assert.equal(sent,1);assert.match(q.completions[0].error.message,/denied/);
});
