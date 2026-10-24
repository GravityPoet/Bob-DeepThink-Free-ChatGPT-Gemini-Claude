const { test } = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../plugin/lib/catalog');
const base = { baseUrl: 'https://example.com/proxy/v1/chat/completions?route=one', apiMode: 'chat_completions', apiKey: 'fake-key' };
test('model discovery preserves the configured gateway and query without sending a translation', () => {
    const p = catalog.requestPlan(base);
    assert.equal(p.url, 'https://example.com/proxy/v1/models?route=one'); assert.equal(p.method, 'GET');
    assert.equal(p.headers.Authorization, 'Bearer fake-key');
    assert.deepEqual(catalog.parsePage(p, { data: [{id:'gpt-5.5'}, {id:'gpt-5.5'}, {id:'bad\nmodel'}, {id:'__proto__'}] }).models.map(m=>m.id), ['gpt-5.5','__proto__']);
});
test('Claude model discovery uses safe cursor pagination and the current version', () => {
    const p = catalog.requestPlan({...base, apiMode:'anthropic_messages',baseUrl:'https://api.anthropic.com/v1/messages'}, {token:'a&b'});
    assert.equal(p.url, 'https://api.anthropic.com/v1/models?limit=100&after_id=a%26b');
    assert.equal(p.headers['anthropic-version'], '2026-10-21');
    const page = catalog.parsePage(p,{data:[{id:'claude-opus-5-5',display_name:'Opus',capabilities:{effort:{supported:true,high:{supported:true}}}},{id:'retired',lifecycle:'retired'}],has_more:true,last_id:'next'});
    assert.equal(page.models.length,1); assert.equal(page.next.token,'next');
    assert.deepEqual(catalog.modelChoices(page.models[0],{...base,apiMode:'anthropic_messages'}),['none','high']);
});
test('Gemini catalog selects native auth and filters embedding-only models', () => {
    const p = catalog.requestPlan({...base,baseUrl:'https://generativelanguage.googleapis.com/v1/interactions',apiMode:'gemini_interactions'});
    assert.equal(p.url,'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'); assert.equal(p.headers['x-goog-api-key'],'fake-key');
    const page=catalog.parsePage(p,{models:[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']},{name:'models/embed',supportedGenerationMethods:['embedContent']}],nextPageToken:'two'});
    assert.equal(page.models[0].id,'gemini-3.8-flash'); assert.equal(page.models.length,1); assert.equal(page.next.token,'two');
});
test('AWS Mantle catalog uses its documented OpenAI model endpoint and bearer auth', () => {
    const p=catalog.requestPlan({...base,baseUrl:'https://bedrock-mantle.us-east-1.api.aws/anthropic/v1',apiMode:'anthropic_messages'});
    assert.equal(p.url,'https://bedrock-mantle.us-east-1.api.aws/v1/models?route=one'.replace('?route=one',''));
    assert.equal(p.headers.Authorization,'Bearer fake-key'); assert.equal(p.headers['x-api-key'],undefined);
});
test('AWS Runtime API keys cannot be misrouted to a nonexistent OpenAI list API', () => {
    assert.throws(()=>catalog.requestPlan({...base,baseUrl:'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1'}),/IAM/);
});
test('invalid catalogs and pagination tokens fail without guessing alternate hosts', () => {
    assert.throws(()=>catalog.parsePage({kind:'openai'},{models:[]}),/格式/);
    assert.throws(()=>catalog.parsePage({kind:'anthropic'},{data:[],has_more:true}),/游标/);
    assert.throws(()=>catalog.parsePage({kind:'gemini'},{models:[],nextPageToken:123}),/游标/);
});
test('AWS IAM discovers foundation models and inference profiles without losing legacy IDs', () => {
    const config={...base,baseUrl:'https://bedrock-runtime.us-east-1.amazonaws.com/model/model/converse',apiMode:'aws_converse',authMode:'aws_sigv4',bedrockRegion:'us-east-1',awsAccessKeyId:'fixture',awsSecretAccessKey:'fixture'};
    const p=catalog.requestPlan(config);
    assert.equal(p.url,'https://bedrock.us-east-1.amazonaws.com/foundation-models?byOutputModality=TEXT');
    assert.match(p.headers.Authorization,/us-east-1\/bedrock\/aws4_request/);
    const page=catalog.parsePage(p,{modelSummaries:[{modelId:'old-valid',modelLifecycle:{status:'LEGACY'},outputModalities:['TEXT']},{modelId:'image',outputModalities:['IMAGE']}]});
    assert.equal(page.models.length,1); assert.equal(page.models[0].id,'old-valid');
    const next=catalog.requestPlan(config,page.next);assert.equal(next.url,'https://bedrock.us-east-1.amazonaws.com/inference-profiles?maxResults=100');
    const profiles=catalog.parsePage(next,{inferenceProfileSummaries:[{inferenceProfileId:'us.model',inferenceProfileName:'Regional model'}],nextToken:'more'});
    assert.equal(profiles.models[0].id,'us.model');assert.equal(profiles.next.stage,'profiles');
});
test('SiliconFlow requests its documented chat-model filter instead of unrelated media models', () => {
    const plan=catalog.requestPlan({...base,baseUrl:'https://api.siliconflow.cn/v1/chat/completions?route=one'});
    assert.equal(plan.url,'https://api.siliconflow.cn/v1/models?route=one&sub_type=chat');
});
test('native Converse never offers unmapped effort fields for non-Claude models', () => {
    assert.deepEqual(catalog.modelChoices({id:'openai.gpt-oss-120b'}, {...base,apiMode:'aws_converse'}),['none']);
});
test('capability metadata can disable native effort without hiding supported legacy budgets', () => {
    const metadata={effort:{supported:false}};
    assert.deepEqual(catalog.modelChoices({id:'claude-opus-5-5',capabilities:metadata},{...base,apiMode:'anthropic_messages'}),['none']);
    assert.deepEqual(catalog.modelChoices({id:'claude-3-7-sonnet',capabilities:metadata},{...base,apiMode:'anthropic_messages'}),['none','off','low','medium','high']);
});
