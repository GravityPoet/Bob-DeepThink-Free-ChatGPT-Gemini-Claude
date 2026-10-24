var util = require('./util.js');
var getStatusCode = util.getStatusCode;
var isPlainObject = util.isPlainObject;
var makeServiceError = util.makeServiceError;
var urls = require('./urls.js');
var isCerebrasBaseUrl = urls.isCerebrasBaseUrl;
var result = require('./result.js');
var cleanInlineText = result.cleanInlineText;
var mergeThinkText = result.mergeThinkText;
var splitThoughtAndAnswer = result.splitThoughtAndAnswer;
var reasoning = require('./reasoning.js');
var temperature = require('./temperature.js');
var interactions = require('./interactions.js');

function applyReasoningParam(body, params) {
    var plan = params.reasoningPlan || reasoning.prepare(params);
    if (!plan.ok) {
        var error = new Error(plan.error.message); error.serviceError = plan.error; throw error;
    }
    return reasoning.apply(body, plan);
}

function buildTranslateRequestBody(params) {
    var version = params.apiMode === 'anthropic_messages' ? anthropicVersion(params, params.baseUrl) : '';
    var plan = temperature.prepare(params, version);
    if (!plan.ok) {
        var error = new Error(plan.error.message); error.serviceError = plan.error; throw error;
    }
    return temperature.apply(buildBaseTranslateRequestBody(params), plan, params.apiMode);
}

function buildBaseTranslateRequestBody(params) {
    if (params.apiMode === 'gemini_interactions') {
        return applyReasoningParam({ model: urls.normalizeGeminiNativeModelName(params.modelName),
            input: params.userPrompt, system_instruction: params.systemPrompt, store: false,
            generation_config: { max_output_tokens: params.maxOutputTokens } }, params);
    }
    if (params.apiMode === 'anthropic_messages') {
        return applyReasoningParam({ model: params.modelName, system: params.systemPrompt,
            messages: [{ role: 'user', content: params.userPrompt }], max_tokens: params.maxOutputTokens }, params);
    }
    if (params.apiMode === 'aws_converse') {
        var converseBody = {
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            text: params.userPrompt,
                        },
                    ],
                },
            ],
            system: [
                {
                    text: params.systemPrompt,
                },
            ],
            inferenceConfig: {
                maxTokens: params.maxOutputTokens,
            },
        };

        return applyReasoningParam(converseBody, params);
    }

    if (params.apiMode === 'gemini_generate_content') {
        var geminiBody = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: params.userPrompt,
                        },
                    ],
                },
            ],
            systemInstruction: {
                parts: [
                    {
                        text: params.systemPrompt,
                    },
                ],
            },
            generationConfig: {
                maxOutputTokens: params.maxOutputTokens,
            },
        };

        return applyReasoningParam(geminiBody, params);
    }

    if (params.apiMode === 'chat_completions') {
        var chatBody = {
            model: params.modelName,
            messages: [
                {
                    role: 'system',
                    content: params.systemPrompt,
                },
                {
                    role: 'user',
                    content: params.userPrompt,
                },
            ],
            max_tokens: params.maxOutputTokens,
        };

        if (/^(?:gpt-[5-9](?:[.\-]|$)|o[1-9](?:-|$))/.test(params.modelName)) {
            chatBody.max_completion_tokens = chatBody.max_tokens;
            delete chatBody.max_tokens;
        }
        applyReasoningParam(chatBody, params);
        return chatBody;
    }

    var body = {
        model: params.modelName,
        input: [
            {
                role: 'system',
                content: [
                    {
                        type: 'input_text',
                        text: params.systemPrompt,
                    },
                ],
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'input_text',
                        text: params.userPrompt,
                    },
                ],
            },
        ],
        max_output_tokens: params.maxOutputTokens,
        store: false,
    };

    applyReasoningParam(body, params);

    return body;
}

function buildHttpBody(config, requestBody) {
    if (config.authMode === 'aws_sigv4') {
        var payload = JSON.stringify(requestBody || {});
        return {
            body: $data.fromUTF8(payload),
            signingPayload: payload,
        };
    }

    return {
        body: requestBody,
        signingPayload: '',
    };
}

function buildRequestHeaders(config, method, url, payload, hasJsonBody) {
    if (config.authMode === 'aws_sigv4') {
        var signed = require('./aws.js').buildAwsSigV4Headers(config, method, url, payload || '', hasJsonBody);
        if (config.apiMode === 'anthropic_messages') signed['anthropic-version'] = anthropicVersion(config, url);
        return signed;
    }

    var headers = {};
    if (hasJsonBody) {
        headers['Content-Type'] = 'application/json';
    }
    var parsed = urls.parseHttpUrl(url);
    if (config.apiMode === 'anthropic_messages') {
        headers['x-api-key'] = config.apiKey;
        headers['anthropic-version'] = anthropicVersion(config, url);
    } else if ((config.apiMode === 'gemini_generate_content' || config.apiMode === 'gemini_interactions') && parsed.ok && parsed.host === 'generativelanguage.googleapis.com') {
        headers['x-goog-api-key'] = config.apiKey;
    } else {
        headers.Authorization = 'Bearer ' + config.apiKey;
    }
    return headers;
}

function anthropicVersion(config, url) {
    var parsed = urls.parseHttpUrl(url);
    // AWS supports the new API version only for Claude 4.7 and later.
    var aws = config.provider === 'bedrock' || parsed.ok && /^bedrock-(?:runtime|mantle)\./.test(parsed.host);
    var legacy = /claude-(?:opus|sonnet|haiku)-4[-.][0-6](?:-|$)|claude-(?:opus|sonnet|haiku)-4(?:-|$)|claude-[123]/i.test(config.modelName || '');
    return aws && legacy || parsed.ok && /^bedrock-runtime\.[a-z0-9-]+\.amazonaws\.com(?::\d+)?$/.test(parsed.host) ? '2023-06-01' : '2026-10-21';
}

function responseFailure(data, context) {
    if (!isPlainObject(data)) return null;
    var response = isPlainObject(data.interaction) ? data.interaction : isPlainObject(data.response) ? data.response : data;
    if (data.error || response.error || data.type === 'error' || response.status === 'failed' || data.type === 'response.failed') {
        return parseApiError(response.error ? response : data, 200, context);
    }
    if (response.status === 'incomplete' || data.type === 'response.incomplete') {
        return makeServiceError('api', '译文未完成或被截断，请提高最大输出 Token、降低思考强度或缩短原文。');
    }
    if (response.status === 'cancelled' || response.status === 'requires_action') return makeServiceError('api', '上游交互未完成：已取消或需要额外输入。');
    if (data.type === 'interaction.completed' && response.status !== 'completed') return makeServiceError('api', '上游交互没有确认完成，请重试。');
    var choice = Array.isArray(data.choices) && data.choices[0];
    var candidate = Array.isArray(data.candidates) && data.candidates[0];
    var reason = choice && choice.finish_reason || candidate && candidate.finishReason || data.stopReason || data.stop_reason || data.delta && data.delta.stop_reason;
    if (reason === 'length' || reason === 'MAX_TOKENS' || reason === 'max_tokens' || reason === 'model_context_window_exceeded') {
        return makeServiceError('api', '译文被截断，请提高最大输出 Token 或缩短原文后重试。');
    }
    if ((choice && choice.message && choice.message.refusal) || data.type === 'response.refusal.delta' || data.type === 'response.refusal.done' ||
        data.promptFeedback && data.promptFeedback.blockReason || /^(content_filter|SAFETY|RECITATION|BLOCKLIST|PROHIBITED_CONTENT|guardrail_intervened|content_filtered)$/.test(reason || '')) {
        return makeServiceError('api', '上游模型未返回翻译：请求被拒绝或被内容过滤。请调整原文或更换服务。');
    }
    if (reason === 'refusal') return makeServiceError('api', '上游模型拒绝了本次翻译，请调整原文或更换服务。');
    return null;
}

function parseTranslateResponse(resp, context) {
    if (!isPlainObject(resp)) {
        return {
            ok: false,
            error: makeServiceError('network', '网络层响应异常。', resp),
        };
    }

    if (resp.error) {
        return {
            ok: false,
            error: makeServiceError('network', '请求上游服务失败。', {
                error: resp.error,
                response: resp.response,
            }),
        };
    }

    var statusCode = getStatusCode(resp);
    if (statusCode < 200 || statusCode >= 300) {
        return {
            ok: false,
            error: parseApiError(resp.data, statusCode, context),
        };
    }

    var failure = responseFailure(resp.data, context);
    if (failure) return { ok: false, error: failure };
    if (resp.data && resp.data.object === 'interaction' && resp.data.status !== 'completed') {
        return { ok: false, error: makeServiceError('api', '上游交互尚未完成，请重试。') };
    }

    var text = extractTranslatedText(resp.data);
    if (!text) {
        return {
            ok: false,
            error: makeServiceError('api', '响应里没有可用翻译结果。', resp.data),
        };
    }

    var parsed = splitThoughtAndAnswer(text, context && context.sourceText);
    var structuredThinkText = extractStructuredThinkText(resp.data);
    var mergedThinkText = mergeThinkText(structuredThinkText, parsed.thinkText);
    if (!parsed.answerText) {
        return {
            ok: false,
            error: makeServiceError('api', '响应里只有思考过程，没有可用翻译结果。', resp.data),
        };
    }

    return {
        ok: true,
        text: parsed.answerText,
        thinkText: mergedThinkText,
    };
}

function extractTranslatedText(data) {
    if (!isPlainObject(data)) {
        return '';
    }
    if (Array.isArray(data.steps)) return interactions.text(data);

    if (Array.isArray(data.content)) return normalizeMessageContent(data.content);
    if (typeof data.output_text === 'string' && data.output_text.trim()) {
        return data.output_text.trim();
    }

    if (Array.isArray(data.output)) {
        var outputText = extractFromOutputArray(data.output);
        if (outputText) {
            return outputText;
        }
    }

    if (isPlainObject(data.output) && isPlainObject(data.output.message)) {
        var converseText = normalizeMessageContent(data.output.message.content);
        if (converseText) {
            return converseText;
        }
    }

    if (Array.isArray(data.choices) && data.choices.length > 0) {
        var choice = data.choices[0];
        if (choice && isPlainObject(choice.message)) {
            var choiceText = normalizeMessageContent(choice.message.content);
            if (choiceText) {
                return choiceText;
            }
        }
    }

    if (Array.isArray(data.candidates) && data.candidates.length > 0) {
        return extractGeminiCandidateAnswerText(data.candidates[0]).trim();
    }

    return '';
}

function extractStructuredThinkText(data) {
    if (!isPlainObject(data)) {
        return '';
    }

    var chunks = [];
    pushUniqueChunk(chunks, interactions.thinking(data));
    pushUniqueChunk(chunks, extractThinkingFromMessageContent(data.content));
    if (data.output && data.output.message) pushUniqueChunk(chunks, extractThinkingFromMessageContent(data.output.message.content));
    pushUniqueChunk(chunks, extractAnyText(data.reasoning_content));
    pushUniqueChunk(chunks, extractAnyText(data.reasoning));
    pushUniqueChunk(chunks, extractAnyText(data.thinking));
    pushUniqueChunk(chunks, extractAnyText(data.thoughts));
    pushUniqueChunk(chunks, extractAnyText(data.think));

    if (Array.isArray(data.output)) {
        var outputThink = extractThinkFromOutputArray(data.output);
        pushUniqueChunk(chunks, outputThink);
    }

    if (Array.isArray(data.choices) && data.choices.length > 0) {
        var choice = data.choices[0];
        if (isPlainObject(choice)) {
            if (isPlainObject(choice.message)) {
                pushUniqueChunk(chunks, extractAnyText(choice.message.reasoning_content));
                pushUniqueChunk(chunks, extractAnyText(choice.message.reasoning));
                pushUniqueChunk(chunks, extractAnyText(choice.message.thinking));
                pushUniqueChunk(chunks, extractThinkingFromMessageContent(choice.message.content));
            }
            if (isPlainObject(choice.delta)) {
                pushUniqueChunk(chunks, extractAnyText(choice.delta.reasoning_content));
                pushUniqueChunk(chunks, extractAnyText(choice.delta.reasoning));
                pushUniqueChunk(chunks, extractAnyText(choice.delta.thinking));
                pushUniqueChunk(chunks, extractThinkingFromMessageContent(choice.delta.content));
            }
        }
    }

    if (Array.isArray(data.candidates) && data.candidates.length > 0) {
        pushUniqueChunk(chunks, extractGeminiCandidateThinkText(data.candidates[0]));
    }

    if (isPlainObject(data.response)) {
        pushUniqueChunk(chunks, extractStructuredThinkText(data.response));
    }

    return cleanInlineText(chunks.join('\n\n'));
}

function extractFromOutputArray(output) {
    var chunks = [];
    var i;
    for (i = 0; i < output.length; i += 1) {
        var item = output[i];
        if (!isPlainObject(item)) {
            continue;
        }

        if (item.type !== 'message' || !Array.isArray(item.content)) {
            continue;
        }

        var j;
        for (j = 0; j < item.content.length; j += 1) {
            var content = item.content[j];
            if (isPlainObject(content) && content.type === 'output_text' && typeof content.text === 'string') {
                chunks.push(content.text);
            }
        }
    }

    var merged = chunks.join('').trim();
    return merged;
}

function extractThinkFromOutputArray(output) {
    var chunks = [];
    var i;
    for (i = 0; i < output.length; i += 1) {
        var item = output[i];
        if (!isPlainObject(item)) {
            continue;
        }

        if (isReasoningEventType(item.type)) {
            pushUniqueChunk(chunks, extractAnyText(item.summary));
            pushUniqueChunk(chunks, extractAnyText(item.reasoning));
            pushUniqueChunk(chunks, extractAnyText(item.reasoning_content));
            pushUniqueChunk(chunks, extractAnyText(item.content));
            pushUniqueChunk(chunks, extractAnyText(item.text));
            continue;
        }

        if (item.type === 'message' && Array.isArray(item.content)) {
            pushUniqueChunk(chunks, extractThinkingFromMessageContent(item.content));
        }
    }
    return cleanInlineText(chunks.join('\n\n'));
}

function normalizeMessageContent(content) {
    if (typeof content === 'string') {
        return content.trim();
    }

    if (!Array.isArray(content)) {
        return '';
    }

    var chunks = [];
    var i;
    for (i = 0; i < content.length; i += 1) {
        var item = content[i];
        if (typeof item === 'string' && item) {
            chunks.push(item);
            continue;
        }
        if (isPlainObject(item) && !isThinkingPart(item) && typeof item.text === 'string' && item.text) {
            chunks.push(item.text);
        }
    }

    return chunks.join('').trim();
}

function extractThinkingFromMessageContent(content) {
    if (typeof content === 'string' || !Array.isArray(content)) {
        return '';
    }

    var chunks = [];
    var i;
    for (i = 0; i < content.length; i += 1) {
        var item = content[i];
        if (isPlainObject(item) && isThinkingPart(item)) {
            var think = item.text || item.thinking || item.reasoningContent && item.reasoningContent.reasoningText && item.reasoningContent.reasoningText.text;
            if (typeof think === 'string') chunks.push(think);
        }
    }

    return cleanInlineText(chunks.join(''));
}

function isThinkingPart(part) {
    if (!isPlainObject(part)) {
        return false;
    }

    if (part.thought === true || part.thinking === true || part.reasoningContent) {
        return true;
    }

    return isReasoningEventType(part.type);
}

function isReasoningEventType(typeValue) {
    if (typeof typeValue !== 'string') {
        return false;
    }

    var lower = typeValue.toLowerCase();
    if (!lower) {
        return false;
    }

    return (
        lower.indexOf('reasoning') >= 0 ||
        lower.indexOf('thinking') >= 0 ||
        lower.indexOf('thought') >= 0 ||
        lower === 'summary_text'
    );
}

function extractAnyText(value) {
    if (typeof value === 'string') {
        return cleanInlineText(value);
    }

    if (Array.isArray(value)) {
        var arrayChunks = [];
        var i;
        for (i = 0; i < value.length; i += 1) {
            pushUniqueChunk(arrayChunks, extractAnyText(value[i]));
        }
        return cleanInlineText(arrayChunks.join('\n\n'));
    }

    if (!isPlainObject(value)) {
        return '';
    }

    var chunks = [];
    if (typeof value.text === 'string') {
        pushUniqueChunk(chunks, value.text);
    }
    if (typeof value.output_text === 'string') {
        pushUniqueChunk(chunks, value.output_text);
    }
    if (typeof value.reasoning_content === 'string') {
        pushUniqueChunk(chunks, value.reasoning_content);
    }
    if (typeof value.content === 'string') {
        pushUniqueChunk(chunks, value.content);
    }
    if (typeof value.summary_text === 'string') {
        pushUniqueChunk(chunks, value.summary_text);
    }
    if (Array.isArray(value.content)) {
        pushUniqueChunk(chunks, extractThinkingFromMessageContent(value.content));
    }
    if (Array.isArray(value.parts)) {
        var j;
        for (j = 0; j < value.parts.length; j += 1) {
            var part = value.parts[j];
            if (isPlainObject(part) && typeof part.text === 'string' && part.text) {
                pushUniqueChunk(chunks, part.text);
            }
        }
    }
    if (Array.isArray(value.summary)) {
        pushUniqueChunk(chunks, extractAnyText(value.summary));
    } else if (isPlainObject(value.summary)) {
        pushUniqueChunk(chunks, extractAnyText(value.summary));
    }
    if (isPlainObject(value.reasoning)) {
        pushUniqueChunk(chunks, extractAnyText(value.reasoning));
    }
    if (isPlainObject(value.thinking)) {
        pushUniqueChunk(chunks, extractAnyText(value.thinking));
    }
    if (isPlainObject(value.delta)) {
        pushUniqueChunk(chunks, extractAnyText(value.delta));
    }

    return cleanInlineText(chunks.join('\n\n'));
}

function pushUniqueChunk(chunks, value) {
    var cleanValue = cleanInlineText(value);
    if (!cleanValue) {
        return;
    }
    if (chunks.indexOf(cleanValue) < 0) {
        chunks.push(cleanValue);
    }
}

function parseApiError(data, statusCode, context) {
    var type = statusCode === 401 ? 'secretKey' : 'api';
    var message = '上游请求失败 (HTTP ' + statusCode + ')';
    if (typeof data === 'string' && data.trim()) {
        message = data.trim();
    } else if (isPlainObject(data)) {
        if (isPlainObject(data.error)) {
            if (typeof data.error.message === 'string' && data.error.message) {
                message = data.error.message;
            } else if (typeof data.error.code === 'string') {
                message = 'API error: ' + data.error.code;
            }
        } else if (typeof data.error === 'string' && data.error) {
            message = data.error;
        } else if (typeof data.message === 'string' && data.message) {
            message = data.message;
        } else if (typeof data.detail === 'string' && data.detail) {
            message = data.detail;
        }
    }

    if (
        statusCode === 404 &&
        context &&
        isCerebrasBaseUrl(context.baseUrl) &&
        (message.indexOf('Not Found') >= 0 || message.indexOf('上游请求失败') >= 0)
    ) {
        message =
            'Cerebras 返回 404：通常是模型名不可用或当前 Key 无权限访问该模型。请先请求 /v1/models 确认可用模型，再重试。';
    }

    return makeServiceError(type, message, {
        detail: data,
        endpoint: context && context.apiEndpoint ? context.apiEndpoint : '',
        model: context && context.modelName ? context.modelName : '',
    });
}

function extractGeminiCandidateAnswerText(candidate) {
    if (
        !isPlainObject(candidate) ||
        !isPlainObject(candidate.content) ||
        !Array.isArray(candidate.content.parts)
    ) {
        return '';
    }

    var chunks = [];
    var i;
    for (i = 0; i < candidate.content.parts.length; i += 1) {
        var part = candidate.content.parts[i];
        if (isPlainObject(part) && !isThinkingPart(part) && typeof part.text === 'string' && part.text) {
            chunks.push(part.text);
        }
    }
    return chunks.join('');
}

function extractGeminiCandidateThinkText(candidate) {
    if (
        !isPlainObject(candidate) ||
        !isPlainObject(candidate.content) ||
        !Array.isArray(candidate.content.parts)
    ) {
        return '';
    }

    var chunks = [];
    var i;
    for (i = 0; i < candidate.content.parts.length; i += 1) {
        var part = candidate.content.parts[i];
        if (isPlainObject(part) && isThinkingPart(part) && typeof part.text === 'string' && part.text) {
            chunks.push(part.text);
        }
    }
    return cleanInlineText(chunks.join(''));
}

module.exports = {
    applyReasoningParam: applyReasoningParam,
    buildTranslateRequestBody: buildTranslateRequestBody,
    buildHttpBody: buildHttpBody,
    buildRequestHeaders: buildRequestHeaders,
    parseTranslateResponse: parseTranslateResponse,
    responseFailure: responseFailure,
    extractTranslatedText: extractTranslatedText,
    extractStructuredThinkText: extractStructuredThinkText,
    extractFromOutputArray: extractFromOutputArray,
    extractThinkFromOutputArray: extractThinkFromOutputArray,
    normalizeMessageContent: normalizeMessageContent,
    extractThinkingFromMessageContent: extractThinkingFromMessageContent,
    isThinkingPart: isThinkingPart,
    isReasoningEventType: isReasoningEventType,
    extractAnyText: extractAnyText,
    pushUniqueChunk: pushUniqueChunk,
    parseApiError: parseApiError,
    extractGeminiCandidateAnswerText: extractGeminiCandidateAnswerText,
    extractGeminiCandidateThinkText: extractGeminiCandidateThinkText,
};
