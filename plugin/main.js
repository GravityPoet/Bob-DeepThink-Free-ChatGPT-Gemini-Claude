// Bob's JavaScriptCore entry points. Runtime modules use Bob's native CommonJS loader.
var service = require('./lib/service.js');
var languages = require('./lib/languages.js');

function supportLanguages() { return languages.supportLanguages(); }
function pluginTimeoutInterval() { return service.pluginTimeoutInterval(); }
function pluginValidate(completion) { return service.pluginValidate(completion); }
function translate(query, completion) { return service.translate(query, completion); }
