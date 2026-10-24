const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin, query, ok, text } = require('./helpers');
const fs = require('node:fs');
const path = require('node:path');
const info = { identifier: JSON.parse(fs.readFileSync(path.resolve(__dirname, '../profiles/aws-iam.json'))).identifier };

test('AWS IAM profile uses SigV4 and its regional endpoint without hidden supplier settings', () => {
    const q = query(); let request;
    const options = { apiKey: undefined, baseUrl: '', apiMode: undefined, bedrockRegion: 'eu-west-1', awsAccessKeyId: 'fixture-id', awsSecretAccessKey: 'fixture-secret', customModel: 'fixture.claude', streamOutput: 'false' };
    const plugin = loadPlugin(options, { request(r) { request = r; r.handler(ok({ output: { message: { content: [{ text: '译文' }] } }, stopReason: 'end_turn' })); } }, { $info: info });
    plugin.translate(q.value);
    assert.equal(request.url, 'https://bedrock-runtime.eu-west-1.amazonaws.com/model/fixture.claude/converse');
    assert.match(request.header.Authorization, /^AWS4-HMAC-SHA256 /);
    assert.ok(request.header.Authorization.includes('/eu-west-1/bedrock/aws4_request'));
    assert.equal(text(q.completions[0].result), '译文');
});

test('AWS IAM profile requires IAM credentials even when a stale API key exists', () => {
    let sent = false; const q = query();
    loadPlugin({ streamOutput: 'false' }, { request() { sent = true; } }, { $info: info }).translate(q.value);
    assert.equal(sent, false);
    assert.equal(q.completions[0].error.type, 'secretKey');
    assert.match(q.completions[0].error.message, /Access Key ID/);
});

test('the regular plugin still accepts an AWS API key without IAM-only fields', () => {
    const q = query(); let request;
    loadPlugin({ provider: 'bedrock', baseUrl: 'https://bedrock-runtime.eu-west-1.amazonaws.com/openai/v1', streamOutput: 'false' }, { request(r) { request = r; r.handler(ok({ choices: [{ message: { content: '译文' }, finish_reason: 'stop' }] })); } }).translate(q.value);
    assert.equal(request.header.Authorization, 'Bearer test-key');
    assert.equal(text(q.completions[0].result), '译文');
});

test('normal translation does not load the AWS signing module', () => {
    let awsLoads = 0; const q = query();
    const plugin = loadPlugin({ streamOutput: 'false' }, { request(r) { r.handler(ok({ output_text: '译文' })); } }, { __onModuleLoad: name => { if (name.endsWith('/aws.js')) awsLoads++; } });
    plugin.translate(q.value);
    assert.equal(awsLoads, 0); assert.equal(text(q.completions[0].result), '译文');
});
