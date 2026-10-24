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
if(successes!==11)throw new Error('missing results '+successes);
"""#)
if failed { exit(1) }
print("JavaScriptCore 检查通过：6 种缓冲协议、真实回调结构、行内代码、纯插件目录、目录后翻译与 CRC，共 11 条路径。")
