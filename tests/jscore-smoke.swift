import Foundation
import JavaScriptCore

let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "plugin").standardizedFileURL
let files = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)!
var sources: [String: String] = [:]
for case let file as URL in files where file.pathExtension == "js" {
    sources[String(file.path.dropFirst(root.path.count + 1))] = try String(contentsOf: file, encoding: .utf8)
}
let context = JSContext()!
var failed = false
context.exceptionHandler = { _, error in failed = true; print("JavaScriptCore 自检失败：\(error?.toString() ?? "unknown")") }
context.setObject(sources, forKeyedSubscript: "sources" as NSString)
context.evaluateScript(#"""
var $option={apiKey:'fixture-key',baseUrl:'https://example.com/v1',apiMode:'chat_completions'};
var $env={appVersion:'1.21.2'}, $http={};
var $data={fromUTF8:function(text){return {toUTF8:function(){return text;}};}};
var cache={};
function load(name){
    if(cache[name])return cache[name].exports;
    var m={exports:{}};cache[name]=m;
    var parent=name.indexOf('/')<0?'':name.slice(0,name.lastIndexOf('/')+1);
    new Function('require','module','exports',sources[name])(function(relative){return load(parent+relative.replace(/^\.\//,''));},m,m.exports);
    return m.exports;
}
var service=load('lib/service.js'), successes=0;
function run(text,check){service.translate({text:text,from:'en',to:'zh-Hans',onCompletion:function(p){check(p);successes++;}});}
['chat_completions','responses','gemini_generate_content','gemini_interactions','anthropic_messages','aws_converse'].forEach(function(mode){
    $option.apiMode=mode;$option.streamOutput='false';
    $http.request=function(r){r.handler({response:{statusCode:200},data:{output_text:'你好 🌎'}});};
    run('Hello',function(p){if(!p.result||p.result.content.text!=='你好 🌎')throw new Error('buffered '+mode);});
});
$option.apiMode='chat_completions';$option.streamOutput='true';
var frames=0;
$http.streamRequest=function(r){['10','0','0'].forEach(function(content){r.streamHandler({text:'data: '+JSON.stringify({choices:[{delta:{content:content}}]})+'\n\n'});});r.handler({response:{statusCode:200}});};
service.translate({text:'Hello',from:'en',to:'zh-Hans',onStream:function(p){if(!p.result||!p.result.content.text)throw new Error('stream envelope');frames++;},onCompletion:function(p){if(!p.result||p.result.content.text!=='1000'||frames!==3)throw new Error('stream');successes++;}});
$option.streamOutput='false';
$http.request=function(r){var marker=r.body.messages[1].content.match(/XLT_LITERAL_[A-Z0-9]+_\d+__/)[0];r.handler({response:{statusCode:200},data:{choices:[{message:{content:'译文 '+marker}}]}});};
run('Use `inline_code`.',function(p){if(!p.result||p.result.content.text!=='译文 `inline_code`')throw new Error('inline code');});
$http.request=function(r){if(r.method!=='GET'||r.url!=='https://example.com/v1/models')throw new Error('directory route');r.handler({response:{statusCode:200},data:{data:[{id:'gpt-6.1-sol'},{id:'gemini-3.8-flash'}]}});};
run('/models gpt',function(p){if(!p.result||p.result.content.text.indexOf('gpt-6.1-sol')<0||p.result.content.text.indexOf('gemini-3.8-flash')>=0)throw new Error('directory');});
$http.request=function(r){if(r.method!=='POST'||r.body.model!=='gpt-5.2')throw new Error('state after directory');r.handler({response:{statusCode:200},data:{output_text:'恢复翻译'}});};
run('Hello again',function(p){if(!p.result||p.result.content.text!=='恢复翻译')throw new Error('translation after directory');});
var bytes='123456789'.split('').map(function(c){return c.charCodeAt(0);});
if(load('lib/eventstream.js').crc32(bytes)!==0xcbf43926)throw new Error('CRC32');successes++;
$option.model='custom';$option.customModel='gpt-4.1';$option.translationTemperature='0';
$http.request=function(r){if(r.body.temperature!==0)throw new Error('zero temperature');r.handler({response:{statusCode:200},data:{output_text:'零温度'}});};
run('Hello',function(p){if(!p.result)throw new Error('temperature chat');});
$option.customModel='gemini-2.5-flash';$option.apiMode='gemini_generate_content';$option.reasoningEffort='low';$option.translationTemperature='.3';
$http.request=function(r){var c=r.body.generationConfig;if(c.temperature!==.3||c.maxOutputTokens!==undefined||c.thinkingConfig.thinkingBudget!==1024)throw new Error('temperature Gemini config');r.handler({response:{statusCode:200},data:{output_text:'原生温度'}});};
run('Hello',function(p){if(!p.result)throw new Error('temperature Gemini');});
$option.apiMode='gemini_interactions';
$http.request=function(r){var c=r.body.generation_config;if(c.temperature!==.3||c.thinking_level!=='low')throw new Error('temperature interactions config');r.handler({response:{statusCode:200},data:{output_text:'原生温度'}});};
run('Hello',function(p){if(!p.result)throw new Error('temperature interactions');});
$option.apiMode='chat_completions';$option.customModel='gpt-6-astra';
$http.request=function(){throw new Error('unsupported temperature sent');};
run('Hello',function(p){if(!p.error||p.error.type!=='param')throw new Error('temperature GPT restriction');});
$option.apiMode='anthropic_messages';$option.customModel='claude-sonnet-4-6';$option.reasoningEffort='none';
run('Hello',function(p){if(!p.error||p.error.type!=='param')throw new Error('temperature API version restriction');});
$option.apiMode='aws_converse';$option.customModel='amazon.nova-pro-v1:0';$option.translationTemperature='.5';
$http.request=function(r){if(r.body.inferenceConfig.temperature!==.5)throw new Error('temperature Converse config');r.handler({response:{statusCode:200},data:{output_text:'原生温度'}});};
run('Hello',function(p){if(!p.result)throw new Error('temperature Converse');});
if(successes!==17)throw new Error('missing results '+successes);
"""#)
if failed { exit(1) }
print("JavaScriptCore 检查通过：6 种缓冲协议、回调、格式、目录、CRC，以及温度参数与兼容性，共 17 条路径。")
