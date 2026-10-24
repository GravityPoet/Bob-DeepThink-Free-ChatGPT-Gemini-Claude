var util = require('./util.js');
var protocol = require('./protocol.js');
var result = require('./result.js');
var literalTags = require('./literal-tags.js');

function requestWithStream(params) {
    var state = { text: '', thinkText: '', buffer: '', dataLines: [], eventName: '', raw: '', events: 0, error: null, pendingBytes: [], ended: false, terminalRequired: false, terminal: false };
    var requestBody = protocol.buildHttpBody(params.config, params.requestBody);
    var endpoint = params.apiEndpoint;
    var body = requestBody.body;
    if (params.config.apiMode === 'gemini_generate_content') {
        endpoint = endpoint.replace(/:generateContent(?=\?|$)/i, ':streamGenerateContent');
        if (!/[?&]alt=sse(?:&|$)/.test(endpoint)) endpoint += (endpoint.indexOf('?') < 0 ? '?' : '&') + 'alt=sse';
        var geminiBody = Object.assign({}, params.requestBody);
        delete geminiBody.stream;
        body = geminiBody;
    }
    var headers = protocol.buildRequestHeaders(params.config, 'POST', endpoint, requestBody.signingPayload, true);
    headers.Accept = 'text/event-stream';
    $http.streamRequest({
        method: 'POST', url: endpoint, header: headers, body: body,
        cancelSignal: params.normalizedQuery.cancelSignal,
        timeout: Math.max(0.001, (params.deadline - Date.now()) / 1000),
        streamHandler: function (chunk) {
            if (params.done.completed || state.error || state.ended) return;
            try {
                var text = decodeChunk(chunk, state, false);
                if (!state.events && state.raw.length < 2097152) state.raw += text;
                feed(text, state, params, false);
            } catch (error) {
                state.error = util.makeServiceError('api', '无法解析流式翻译结果。', error.message);
            }
        },
        handler: function (resp) {
            if (params.done.completed) return;
            try {
                feed(decodeChunk(null, state, true), state, params, true);
                var status = util.getStatusCode(resp);
                var data = !state.events ? util.safeJsonParse(state.raw) : null;
                var context = { apiEndpoint: endpoint, modelName: params.modelName, baseUrl: params.config.baseUrl, sourceText: params.parserSourceText };
                if (state.error) { params.done({ error: state.error }); return; }
                if (status && (status < 200 || status >= 300)) {
                    params.done({ error: protocol.parseApiError(data || (resp && resp.data) || state.raw, status, context) }); return;
                }
                if (!resp || resp.error || !status) {
                    params.done({ error: util.makeServiceError('network', '流式请求失败或连接中断，请检查网络后重试。', resp && resp.error) }); return;
                }
                if (state.terminalRequired && !state.terminal) {
                    params.done({ error: util.makeServiceError('network', '流式响应提前结束，译文可能不完整，请重试。') }); return;
                }
                if (data) {
                    var parsed = protocol.parseTranslateResponse({ response: { statusCode: status }, data: data }, context);
                    if (!parsed.ok) { params.done({ error: parsed.error }); return; }
                    state.text = parsed.text; state.thinkText = parsed.thinkText;
                }
                var parsedFinal = result.splitThoughtAndAnswer(state.text, params.parserSourceText);
                if (!parsedFinal.answerText) {
                    // Empty streams get at most one retry, within the original deadline.
                    var fallbackBody = Object.assign({}, params.requestBody);
                    delete fallbackBody.stream;
                    params.requestBody = fallbackBody;
                    params.fallback(params);
                    return;
                }
                if (!literalTags.complete(parsedFinal.answerText, params.literalTags)) {
                    params.done({ error: util.makeServiceError('api', '上游没有完整保留原文标记，请重试或更换服务。') }); return;
                }
                params.done({ result: result.buildTranslateResult(params.sourceLang, params.targetLang, parsedFinal.answerText,
                    result.mergeThinkText(state.thinkText, parsedFinal.thinkText), false, params.literalTags) });
            } catch (error) {
                params.done({ error: util.makeServiceError('api', '无法处理流式翻译结果。', error.message) });
            }
        },
    });
}

// An SSE event may span several network chunks or several data lines.
function feed(text, state, params, final) {
    state.buffer += text;
    if (state.buffer.length > 2097152) throw new Error('单个流式事件超过 2 MiB');
    var match;
    while ((match = /\r\n|\r|\n/.exec(state.buffer))) {
        if (!final && match.index === state.buffer.length - 1 && match[0] === '\r') break;
        var line = state.buffer.slice(0, match.index);
        state.buffer = state.buffer.slice(match.index + match[0].length);
        processLine(line, state, params);
    }
    if (final) {
        if (state.buffer) processLine(state.buffer, state, params);
        state.buffer = '';
        dispatch(state, params);
    }
}

function processLine(line, state, params) {
    if (!line) { dispatch(state, params); return; }
    if (line.charAt(0) === ':') return;
    var colon = line.indexOf(':');
    var field = colon < 0 ? line : line.slice(0, colon);
    var value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'data') state.dataLines.push(value);
    if (field === 'event') state.eventName = value;
}

function dispatch(state, params) {
    if (!state.dataLines.length || state.ended || state.error || params.done.completed) return;
    var payload = state.dataLines.join('\n');
    state.dataLines = [];
    var eventName = state.eventName;
    state.eventName = '';
    if (payload === '[DONE]') { state.ended = true; return; }
    var event = util.safeJsonParse(payload);
    if (!util.isPlainObject(event)) {
        state.error = util.makeServiceError('api', '上游返回了无法解析的流式事件，请检查接口协议。');
        return;
    }
    state.events += 1;
    state.raw = '';
    if (!event.type && eventName) event.type = eventName;
    if (/^response\./.test(event.type || '') || event.type === 'message_start' || event.type === 'content_block_delta') state.terminalRequired = true;
    if (event.type === 'response.completed' || event.type === 'message_stop') state.terminal = true;
    state.error = protocol.responseFailure(event);
    if (state.error) return;
    var changed = false;
    var delta = extractStreamDeltaText(event);
    if (delta) { state.text += delta; changed = true; }
    var thinkDelta = extractStreamDeltaThink(event);
    if (thinkDelta) { state.thinkText += thinkDelta; changed = true; }
    var snapshot = extractStreamSnapshotText(event);
    if (snapshot !== null && snapshot !== state.text) { state.text = snapshot; changed = true; }
    if (/\.done$|\.completed$/.test(event.type || '')) {
        var think = protocol.extractStructuredThinkText(event.response || event);
        if (think && think !== state.thinkText) { state.thinkText = think; changed = true; }
    }
    if (changed) emitStreamResult(params, state);
}

function emitStreamResult(params, state) {
    if (params.done.completed || typeof params.normalizedQuery.onStream !== 'function') return;
    var parsed = result.splitThoughtAndAnswer(state.text, params.parserSourceText);
    var think = result.mergeThinkText(state.thinkText, parsed.thinkText);
    if (parsed.answerText || think) {
        var frame = result.buildTranslateResult(params.sourceLang, params.targetLang, parsed.answerText, think, true, params.literalTags);
        if (frame.content.text || frame.thinkInfo && frame.thinkInfo.content) params.normalizedQuery.onStream(frame);
    }
}

function extractStreamDeltaText(event) {
    if (protocol.isReasoningEventType(event.type)) return '';
    if (event.type === 'content_block_delta' && event.delta && event.delta.type === 'text_delta') return event.delta.text || '';
    if (event.type === 'content_block_start' && event.content_block && event.content_block.type === 'text') return event.content_block.text || '';
    if (typeof event.delta === 'string' && (!event.type || event.type === 'response.output_text.delta')) return event.delta;
    var choice = Array.isArray(event.choices) && event.choices[0];
    if (choice && choice.delta) {
        var content = choice.delta.content;
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) return content.map(function (part) {
            return typeof part === 'string' ? part : part && !protocol.isThinkingPart(part) && typeof part.text === 'string' ? part.text : '';
        }).join('');
        if (typeof choice.delta.text === 'string') return choice.delta.text;
    }
    if (Array.isArray(event.candidates)) return protocol.extractGeminiCandidateAnswerText(event.candidates[0]);
    return '';
}

function extractStreamDeltaThink(event) {
    if (event.type === 'content_block_delta' && event.delta && event.delta.type === 'thinking_delta') return event.delta.thinking || '';
    if (event.type === 'content_block_start' && event.content_block && event.content_block.type === 'thinking') return event.content_block.thinking || '';
    if (protocol.isReasoningEventType(event.type) && typeof event.delta === 'string') return event.delta;
    var choice = Array.isArray(event.choices) && event.choices[0];
    var source = choice && choice.delta ? choice.delta : event;
    var keys = ['reasoning_content', 'reasoning', 'thinking', 'thinking_delta', 'thoughts'];
    for (var i = 0; i < keys.length; i += 1) if (typeof source[keys[i]] === 'string') return source[keys[i]];
    if (Array.isArray(source.content)) return source.content.filter(protocol.isThinkingPart).map(function (part) { return part.text || ''; }).join('');
    if (Array.isArray(event.candidates)) return protocol.extractGeminiCandidateThinkText(event.candidates[0]);
    return '';
}

function extractStreamSnapshotText(event) {
    if (protocol.isReasoningEventType(event.type)) return null;
    if (event.type === 'response.output_text.done' && typeof event.text === 'string') return event.text;
    if (typeof event.output_text === 'string') return event.output_text;
    if (event.response) {
        var text = protocol.extractTranslatedText(event.response);
        return text || null;
    }
    if (Array.isArray(event.output)) return protocol.extractFromOutputArray(event.output) || null;
    var choice = Array.isArray(event.choices) && event.choices[0];
    if (choice && choice.message) return protocol.normalizeMessageContent(choice.message.content);
    return null;
}

// JavaScriptCore has no TextDecoder. Decode raw bytes across callback boundaries.
function decodeChunk(chunk, state, final) {
    if (chunk && (!chunk.rawData || typeof chunk.rawData.toByteArray !== 'function')) return typeof chunk.text === 'string' ? chunk.text : '';
    var bytes = state.pendingBytes.concat(chunk ? Array.prototype.slice.call(chunk.rawData.toByteArray()) : []);
    var text = '', i = 0;
    while (i < bytes.length) {
        var first = bytes[i], count = first < 0x80 ? 1 : first >= 0xc2 && first < 0xe0 ? 2 : first >= 0xe0 && first < 0xf0 ? 3 : first >= 0xf0 && first < 0xf5 ? 4 : 0;
        if (!count) { text += '\ufffd'; i += 1; continue; }
        if (i + count > bytes.length && !final) break;
        var code = first & (count === 1 ? 127 : count === 2 ? 31 : count === 3 ? 15 : 7), valid = i + count <= bytes.length;
        for (var j = 1; valid && j < count; j += 1) {
            if ((bytes[i+j] & 0xc0) !== 0x80) valid = false;
            else code = (code << 6) | (bytes[i+j] & 63);
        }
        if (!valid || (count === 2 && code < 0x80) || (count === 3 && code < 0x800) || (count === 4 && code < 0x10000) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
            text += '\ufffd'; i += 1; continue;
        }
        if (code < 0x10000) text += String.fromCharCode(code);
        else { code -= 0x10000; text += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 1023)); }
        i += count;
    }
    state.pendingBytes = bytes.slice(i);
    return text;
}

module.exports = { requestWithStream: requestWithStream };
