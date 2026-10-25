const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPlugin(options = {}, http = {}, globals = {}) {
    const root = path.resolve(__dirname, '../plugin');
    const context = vm.createContext({
        $option: { apiKey: 'test-key', baseUrl: 'https://example.com/v1', apiMode: 'chat_completions', maxOutputTokens: '4096', ...options },
        $http: http,
        $env: { appVersion: '1.21.2' },
        $data: { fromUTF8: text => ({ toUTF8: () => text }) },
        ...globals,
    });
    const cache = new Map();
    function load(file) {
        if (cache.has(file)) return cache.get(file).exports;
        if (typeof globals.__onModuleLoad === 'function') globals.__onModuleLoad(file);
        const module = { exports: {} };
        cache.set(file, module);
        const source = fs.readFileSync(file, 'utf8');
        const localRequire = name => {
            if (!name.startsWith('.')) throw new Error('Bob has no Node built-ins: ' + name);
            const target = path.resolve(path.dirname(file), name.endsWith('.js') ? name : name + '.js');
            if (!target.startsWith(root + path.sep)) throw new Error('Module outside plugin');
            return load(target);
        };
        vm.runInContext('(function(require,module,exports){\n' + source + '\n})', context, { filename: file })(localRequire, module, module.exports);
        return module.exports;
    }
    context.require = name => load(path.resolve(root, name));
    vm.runInContext(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), context);
    return context;
}

function signal() {
    const listeners = new Set();
    return {
        subscribe(fn) { listeners.add(fn); return { dispose: () => listeners.delete(fn) }; },
        send() { for (const fn of [...listeners]) fn(); },
        get size() { return listeners.size; },
    };
}

function query() {
    const completions = [], streams = [];
    return {
        completions, streams,
        value: { text: 'Hello', from: 'en', to: 'zh-Hans', detectFrom: 'en', detectTo: 'zh-Hans',
            cancelSignal: signal(), onCompletion: v => completions.push(v), onStream: v => streams.push(v) },
    };
}

function sse(data) { return 'data: ' + JSON.stringify(data) + '\n\n'; }
function chat(content, finish_reason = 'stop') { return { choices: [{ message: { content }, finish_reason }] }; }
function ok(data) { return { response: { statusCode: 200 }, data }; }
function text(result) { return result?.content?.text ?? result?.toParagraphs?.join('\n\n'); }

module.exports = { loadPlugin, query, signal, sse, chat, ok, text };
