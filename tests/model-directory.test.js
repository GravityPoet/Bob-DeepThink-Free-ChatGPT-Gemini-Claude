const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin, query, ok, text } = require('./helpers');

test('model directory runs entirely inside Bob with only a native GET request', () => {
    const q=query();q.value.text='/models';q.value.to='auto';q.value.detectTo='auto';let request;
    loadPlugin({model:'custom',customModel:''},{request(r){request=r;r.handler(ok({data:[{id:'gpt-6.1-sol'},{id:'gpt-5.5'}]}));}}).translate(q.value);
    assert.equal(request.method,'GET');assert.equal(request.url,'https://example.com/v1/models');assert.equal(request.body,undefined);
    assert.match(text(q.completions[0].result),/2 \/ 2/);assert.match(text(q.completions[0].result),/gpt-6.1-sol/);
    assert.match(text(q.completions[0].result),/自定义模型/);assert.equal(q.value.cancelSignal.size,0);
});
test('directory searches original input and follows native Gemini pagination', () => {
    const q=query();q.value.text='models';q.value.originalText='/models flash';let sent=0;
    loadPlugin({apiMode:'gemini_generate_content',baseUrl:'https://generativelanguage.googleapis.com/v1beta'},{request(r){
        sent++;assert.equal(r.header['x-goog-api-key'],'test-key');
        if(sent===1)r.handler(ok({models:[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']}],nextPageToken:'next&safe'}));
        else{assert.match(r.url,/pageToken=next%26safe/);r.handler(ok({models:[{name:'models/gemini-3.1-pro',supportedGenerationMethods:['generateContent']}]}));}
    }}).translate(q.value);
    assert.equal(sent,2);assert.match(text(q.completions[0].result),/1 \/ 2/);assert.match(text(q.completions[0].result),/gemini-3.8-flash/);assert.doesNotMatch(text(q.completions[0].result),/gemini-3.1-pro/);
});
test('cancellation stops pagination and ignores late directory responses', () => {
    const q=query();q.value.text='/models';let request,sent=0;
    loadPlugin({}, {request(r){sent++;request=r;}}).translate(q.value);
    q.value.cancelSignal.send();request.handler(ok({data:[{id:'gpt-5.5'}],has_more:true,last_id:'more'}));
    assert.equal(sent,1);assert.equal(q.completions.length,1);assert.match(q.completions[0].error.message,/取消/);assert.equal(q.value.cancelSignal.size,0);
});
test('directory HTTP errors never echo upstream credentials or change saved options', () => {
    const q=query();q.value.text='/models';const plugin=loadPlugin({}, {request(r){r.handler({response:{statusCode:502},data:{message:'test-key'}});}});
    plugin.translate(q.value);assert.match(q.completions[0].error.message,/HTTP 502/);assert.doesNotMatch(JSON.stringify(q.completions),/test-key/);assert.equal(plugin.$option.model,undefined);
});
test('invalid endpoint errors do not echo credentials embedded in a URL', () => {
    const q=query();q.value.text='/models';let sent=false;
    loadPlugin({baseUrl:'https://user:xxx@example.com/v1'},{request(){sent=true;}}).translate(q.value);
    assert.equal(sent,false);assert.ok(q.completions[0].error);assert.doesNotMatch(JSON.stringify(q.completions),/xxx/);
});
test('repeated cursors are rejected rather than looping', () => {
    const q=query();q.value.text='/models';let sent=0;
    loadPlugin({apiMode:'anthropic_messages'}, {request(r){sent++;r.handler(ok({data:[{id:'claude-opus-5-5'}],has_more:true,last_id:'repeat'}));}}).translate(q.value);
    assert.equal(sent,2);assert.match(q.completions[0].error.message,/重复/);
});
test('secrets echoed as model IDs are hidden and names cannot inject Markdown links', () => {
    const q=query();q.value.text='/models';
    loadPlugin({}, {request(r){r.handler(ok({data:[{id:'test-key'},{id:'model`[open](https://example.com)'}]}));}}).translate(q.value);
    const value=text(q.completions[0].result);assert.doesNotMatch(value,/test-key/);assert.match(value,/`` model`\[open\]/);
});
test('large directories show a bounded page and a visible filter instruction', () => {
    const q=query();q.value.text='/models';
    loadPlugin({}, {request(r){r.handler(ok({data:Array.from({length:250},(_,i)=>({id:'model-'+String(i).padStart(3,'0')}))}));}}).translate(q.value);
    assert.match(text(q.completions[0].result),/250 \/ 250/);assert.match(text(q.completions[0].result),/前 200/);assert.doesNotMatch(text(q.completions[0].result),/model-249/);
});
test('new vendor minor versions are not presented with unverified reasoning tiers', () => {
    const q=query();q.value.text='/models';
    loadPlugin({baseUrl:'https://api.siliconflow.cn/v1'}, {request(r){r.handler(ok({data:[{id:'deepseek-ai/DeepSeek-V4.1-Flash'}]}));}}).translate(q.value);
    assert.match(text(q.completions[0].result),/以服务商文档为准/);assert.doesNotMatch(text(q.completions[0].result),/high \/ max/);
});
test('validation still makes a real translation and ordinary prose does not load the directory module', () => {
    let sent=0,loaded=false;
    const p=loadPlugin({}, {request(r){sent++;assert.equal(r.method,'POST');r.handler(ok({choices:[{message:{content:'你好'}}]}));}}, {__onModuleLoad(file){if(file.endsWith('/model-directory.js'))loaded=true;}});
    let validation;p.pluginValidate(v=>{validation=v});assert.equal(validation.result,true);assert.equal(sent,1);assert.equal(loaded,false);
});
test('normal translation after a directory query retains its saved model and credentials', () => {
    const list=query();list.value.text='/models';const translation=query();const requests=[];
    const plugin=loadPlugin({model:'custom',customModel:'saved-model'}, {request(r){
        requests.push(r);
        r.handler(ok(r.method==='GET'?{data:[{id:'another-model'}]}:{choices:[{message:{content:'你好'}}]}));
    }});
    plugin.translate(list.value);plugin.translate(translation.value);
    assert.deepEqual(requests.map(r=>r.method),['GET','POST']);assert.equal(requests[1].body.model,'saved-model');
    assert.equal(requests[1].header.Authorization,'Bearer test-key');assert.equal(text(translation.completions[0].result),'你好');
    assert.equal(plugin.$option.customModel,'saved-model');assert.equal(list.value.cancelSignal.size,0);
});
