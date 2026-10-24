var util = require('./util.js');
var catalog = require('./catalog.js');
var reasoning = require('./reasoning.js');

function run(params) {
    var subscription = null;
    var done = util.onceCompletion(function (payload) {
        if (subscription && typeof subscription.dispose === 'function') subscription.dispose();
        params.done(payload);
    });
    var signal = params.query.cancelSignal;
    if (signal && typeof signal.subscribe === 'function') {
        subscription = signal.subscribe(function () { done({ error: util.makeServiceError('network', '已取消模型目录查询。') }); });
        if (done.completed) { if (subscription && typeof subscription.dispose === 'function') subscription.dispose(); return; }
    }
    var config = params.config, deadline = Date.now() + Math.min(config.timeoutSec, 60) * 1000;
    var models = [], ids = Object.create(null), cursors = Object.create(null), pages = 0;
    var secrets = ['apiKey', 'awsAccessKeyId', 'awsSecretAccessKey', 'awsSessionToken'].map(function (key) { return config[key]; })
        .filter(function (value) { return typeof value === 'string' && value.length >= 8; });
    function fail(message, type) { done({ error: util.makeServiceError(type || 'api', message) }); }
    function fetchPage(cursor) {
        if (done.completed) return;
        var remaining = (deadline - Date.now()) / 1000;
        if (remaining <= 0) { fail('模型目录查询超时，请稍后重试。', 'network'); return; }
        if (++pages > 30) { fail('模型目录超过 30 页，已停止查询，请使用供应商控制台查看。'); return; }
        var plan;
        try { plan = catalog.requestPlan(config, cursor); }
        catch (error) { fail(error.message); return; }
        try {
            $http.request({ method: 'GET', url: plan.url, header: plan.headers, timeout: remaining, cancelSignal: signal,
                handler: function (response) {
                    if (done.completed) return;
                    var status = util.getStatusCode(response);
                    if (status && (status < 200 || status >= 300)) {
                        var hint = status === 401 ? '请检查此服务的 API Key。' : status === 403 ? '当前凭据没有查询模型目录的权限。'
                            : status === 404 ? '当前接口未开放模型目录，请查阅供应商的模型名称。' : '供应商目录暂不可用，请稍后重试。';
                        fail('获取模型目录失败（HTTP ' + status + '）。' + hint, status === 401 ? 'secretKey' : 'api'); return;
                    }
                    if (!response || response.error || !status) { fail('无法连接模型目录，请检查网络和接口地址。', 'network'); return; }
                    if (Date.now() > deadline) { fail('模型目录查询超时，请稍后重试。', 'network'); return; }
                    try {
                        var data = typeof response.data === 'string' ? util.safeJsonParse(response.data) : response.data;
                        var page = catalog.parsePage(plan, data);
                        page.models.forEach(function (model) {
                            if (ids[model.id] || secrets.some(function (secret) { return model.id.indexOf(secret) >= 0; })) return;
                            secrets.forEach(function (secret) { model.title = model.title.split(secret).join('[已隐藏]'); });
                            ids[model.id] = true; models.push(model);
                        });
                        if (models.length > 10000) { fail('模型目录超过 10,000 个模型，已停止查询。'); return; }
                        if (page.next) {
                            var key = JSON.stringify(page.next);
                            if (cursors[key]) { fail('供应商重复返回同一分页游标，已停止查询。'); return; }
                            cursors[key] = true;
                            fetchPage(page.next);
                        } else done({ result: render(models, params.filter, config) });
                    } catch (error) { fail('无法解析模型目录，请检查接口协议。'); }
                },
            });
        } catch (error) { fail('无法请求模型目录，请检查接口配置。', 'network'); }
    }
    fetchPage(null);
}

function code(text) {
    var runs = String(text).match(/`+/g) || [], width = 1;
    runs.forEach(function (run) { width = Math.max(width, run.length + 1); });
    var ticks = new Array(width + 1).join('`');
    return ticks + ' ' + text + ' ' + ticks;
}

function render(models, filter, config) {
    var terms = String(filter || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    var matches = models.filter(function (model) {
        var searchable = (model.id + ' ' + model.title).toLowerCase();
        return terms.every(function (term) { return searchable.indexOf(term) >= 0; });
    }).sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var visible = matches.slice(0, 200);
    var header = '可用模型目录：匹配 ' + matches.length + ' / ' + models.length + ' 个';
    var instruction = '复制需要的模型 ID，到本服务的“模型”选择“自定义模型”，粘贴到“自定义模型”并保存。';
    var markdown = ['## ' + header, '', instruction, '', '输入 `/models 关键词` 可筛选。目录可见不等于账号已有调用权限。', ''];
    var plain = [header, '', instruction, '', '输入 /models 关键词 可筛选。目录可见不等于账号已有调用权限。', ''];
    if (!visible.length) { markdown.push('没有匹配模型，请换一个关键词或检查服务商配置。'); plain.push('没有匹配模型，请换一个关键词或检查服务商配置。'); }
    visible.forEach(function (model) {
        var cap = reasoning.capabilities(model.id, config.apiMode, config.baseUrl);
        var effort = cap.known ? catalog.modelChoices(model, config).map(function (level) { return level === 'none' ? '跟随模型' : level === 'off' ? '关闭' : level; }).join(' / ') : '以服务商文档为准';
        markdown.push('- ' + code(model.id) + '\n  思考档位：' + effort);
        plain.push(model.id + '\n  思考档位：' + effort);
    });
    if (matches.length > visible.length) {
        var note = '为保持窗口流畅，本次显示前 200 个；请添加关键词查找其他模型。';
        markdown.push('', note); plain.push('', note);
    }
    return { from: 'auto', to: 'zh-Hans', content: { format: 'markdown', text: markdown.join('\n') }, toParagraphs: [plain.join('\n')] };
}

module.exports = { run: run, render: render };
