const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadPlugin,query,sse,ok,text}=require('./helpers');
const options={apiMode:'anthropic_messages',baseUrl:'https://api.anthropic.com/v1',model:'custom',customModel:'claude-sonnet-4-6'};
test('Claude native builds Messages with the documented version and API-key headers',()=>{
 const q=query();let r;
 loadPlugin({...options,streamOutput:'false'},{request(request){r=request;r.handler(ok({content:[{type:'text',text:'译文'}],stop_reason:'end_turn'}));}}).translate(q.value);
 assert.equal(r.url,'https://api.anthropic.com/v1/messages');assert.equal(r.header['x-api-key'],'test-key');assert.equal(r.header['anthropic-version'],'2023-06-01');
 assert.equal(r.body.model,'claude-sonnet-4-6');assert.ok(r.body.system);assert.equal(r.body.messages[0].role,'user');assert.ok(r.body.max_tokens);assert.equal(r.body.reasoning_effort,undefined);
 assert.equal(text(q.completions[0].result),'译文');
});
test('Claude native separates thinking, ignores signatures and keeps repeated deltas',()=>{
 const q=query();loadPlugin(options,{streamRequest(r){
  for(const e of [
   {type:'message_start',message:{content:[]}},
   {type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'think '}},
   {type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'opaque'}},
   {type:'content_block_delta',index:1,delta:{type:'text_delta',text:'100'}},
   {type:'content_block_delta',index:1,delta:{type:'text_delta',text:'0'}},
   {type:'message_delta',delta:{stop_reason:'end_turn'}},{type:'message_stop'},
  ])r.streamHandler({text:sse(e)});r.handler(ok());
 }}).translate(q.value);
 assert.equal(text(q.completions[0].result),'1000');assert.equal(q.completions[0].result.thinkInfo.content,'think');
});
test('Claude non-stream thinking blocks stay out of the answer',()=>{
 const q=query();loadPlugin({...options,streamOutput:'false'},{request(r){r.handler(ok({content:[{type:'thinking',thinking:'reasoning'},{type:'text',text:'译文'}],stop_reason:'end_turn'}));}}).translate(q.value);
 assert.equal(text(q.completions[0].result),'译文');assert.equal(q.completions[0].result.thinkInfo.content,'reasoning');
});
test('Claude stop reasons report truncation and refusal instead of success',()=>{
 for(const stop_reason of ['max_tokens','refusal']){const q=query();loadPlugin(options,{streamRequest(r){r.streamHandler({text:sse({type:'message_delta',delta:{stop_reason}})});r.handler(ok());}}).translate(q.value);assert.ok(q.completions[0].error);}
});
test('unknown typed string deltas are not mistaken for translated text',()=>{
 const q=query();loadPlugin({}, {streamRequest(r){r.streamHandler({text:sse({type:'response.function_call_arguments.delta',delta:'PRIVATE-TOOL-ARGS'})});r.streamHandler({text:sse({type:'response.output_text.delta',delta:'译文'})});r.streamHandler({text:sse({type:'response.completed',response:{status:'completed'}})});r.handler(ok());}}).translate(q.value);
 assert.equal(text(q.completions[0].result),'译文');
});
