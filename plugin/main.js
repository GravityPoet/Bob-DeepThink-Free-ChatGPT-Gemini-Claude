var SUPPORTED_LANGUAGES = [
    'auto',
    'zh-Hans',
    'zh-Hant',
    'en',
    'ja',
    'ko',
    'fr',
    'de',
    'es',
    'it',
    'pt',
    'ru',
    'ar',
    'hi',
    'th',
    'vi',
    'id',
    'ms',
    'tr',
    'nl',
    'pl',
    'uk',
    'cs',
    'da',
    'fi',
    'sv',
    'no',
    'el',
    'he',
    'hu',
    'ro',
    'sk',
    'sl',
    'bg',
    'hr',
    'sr-Cyrl',
    'sr-Latn',
    'ca',
    'fa',
    'bn',
    'ta',
    'te',
    'ml',
    'mr',
    'ur',
    'sw',
    'af',
    'is',
    'lv',
    'lt',
    'et',
    'mt',
    'cy',
    'ga',
    'yue',
    'wyw',
];

var LANGUAGE_NAMES = {
    auto: '自动检测',
    'zh-Hans': '简体中文',
    'zh-Hant': '繁体中文',
    en: 'English',
    ja: 'Japanese',
    ko: 'Korean',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    it: 'Italian',
    pt: 'Portuguese',
    ru: 'Russian',
    ar: 'Arabic',
    hi: 'Hindi',
    th: 'Thai',
    vi: 'Vietnamese',
    id: 'Indonesian',
    ms: 'Malay',
    tr: 'Turkish',
    nl: 'Dutch',
    pl: 'Polish',
    uk: 'Ukrainian',
    cs: 'Czech',
    da: 'Danish',
    fi: 'Finnish',
    sv: 'Swedish',
    no: 'Norwegian',
    el: 'Greek',
    he: 'Hebrew',
    hu: 'Hungarian',
    ro: 'Romanian',
    sk: 'Slovak',
    sl: 'Slovenian',
    bg: 'Bulgarian',
    hr: 'Croatian',
    'sr-Cyrl': 'Serbian (Cyrillic)',
    'sr-Latn': 'Serbian (Latin)',
    ca: 'Catalan',
    fa: 'Persian',
    bn: 'Bengali',
    ta: 'Tamil',
    te: 'Telugu',
    ml: 'Malayalam',
    mr: 'Marathi',
    ur: 'Urdu',
    sw: 'Swahili',
    af: 'Afrikaans',
    is: 'Icelandic',
    lv: 'Latvian',
    lt: 'Lithuanian',
    et: 'Estonian',
    mt: 'Maltese',
    cy: 'Welsh',
    ga: 'Irish',
    yue: '粤语',
    wyw: '文言文',
};

var DEFAULT_BASE_URL = 'http://127.0.0.1:18080/v1';
var DEFAULT_TIMEOUT_SEC = 90;
var DEFAULT_MAX_OUTPUT_TOKENS = 1024;
var DEFAULT_REASONING_EFFORT = 'none';
var DEFAULT_STREAM_OUTPUT = true;
var DEFAULT_API_MODE = 'responses';
var DEFAULT_BEDROCK_REGION = 'us-east-1';

var REASONING_EFFORT_VALUES = {
    none: true,
    low: true,
    medium: true,
    high: true,
};

var API_MODE_VALUES = {
    responses: true,
    chat_completions: true,
    gemini_generate_content: true,
};

var THINK_BLOCK_REGEXP = /<\s*(reasoning|think)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi;
var THINK_OPEN_REGEXP = /<\s*(reasoning|think)\b[^>]*>/gi;
var THINK_CLOSE_REGEXP = /<\s*\/\s*(reasoning|think)\s*>/gi;

function supportLanguages() {
    return SUPPORTED_LANGUAGES.slice();
}

function pluginTimeoutInterval() {
    var timeoutSec = parseIntegerInRange(
        getOptionString('requestTimeoutSec', String(DEFAULT_TIMEOUT_SEC)),
        DEFAULT_TIMEOUT_SEC,
        10,
        300
    );

    return clamp(timeoutSec + 15, 30, 300);
}

function pluginValidate(completion) {
    var done = onceCompletion(completion);
    var config = buildRuntimeConfig();
    if (!config.ok) {
        done({ result: false, error: config.error });
        return;
    }

    var modelsEndpoint = buildModelsEndpoint(config.baseUrl);

    $http.request({
        method: 'GET',
        url: modelsEndpoint,
        header: buildRequestHeaders(config, 'GET', modelsEndpoint, '', false),
        timeout: clamp(config.timeoutSec, 10, 30),
        handler: function (resp) {
            var parsed = parseValidateResponse(resp, config, modelsEndpoint);
            if (!parsed.ok) {
                done({ result: false, error: parsed.error });
                return;
            }
            done({ result: true });
        },
    });
}

function translate(query, completion) {
    var done = createCompletionBridge(query, completion);

    var queryResult = normalizeTranslateQuery(query);
    if (!queryResult.ok) {
        done({ error: queryResult.error });
        return;
    }

    var normalizedQuery = queryResult.query;

    var queryError = validateTranslateQuery(normalizedQuery);
    if (queryError) {
        done({ error: queryError });
        return;
    }

    var config = buildRuntimeConfig();
    if (!config.ok) {
        done({ error: config.error });
        return;
    }

    var model = resolveModel();
    if (!model.ok) {
        done({ error: model.error });
        return;
    }

    var sourceLang = normalizeLanguageCode(normalizedQuery.detectFrom || normalizedQuery.from || 'auto');
    var targetLang = normalizeLanguageCode(normalizedQuery.detectTo || normalizedQuery.to || 'en');
    if (targetLang === 'auto') {
        targetLang = 'en';
    }

    var sourceLangName = languageName(sourceLang);
    var targetLangName = languageName(targetLang);

    var systemPrompt =
        'You are a professional translation engine. ' +
        'Translate the input text accurately and naturally. ' +
        'Do not explain, do not add notes, and do not wrap the answer in quotes.';

    var userPrompt =
        'Translate from ' +
        sourceLangName +
        ' to ' +
        targetLangName +
        ':\n\n' +
        String(normalizedQuery.text);

    var apiEndpoint = buildApiEndpoint(config.baseUrl, config.apiMode, model.name);
    var requestBody = buildTranslateRequestBody({
        apiMode: config.apiMode,
        modelName: model.name,
        systemPrompt: systemPrompt,
        userPrompt: userPrompt,
        maxOutputTokens: config.maxOutputTokens,
        provider: config.provider,
        reasoningEffort: config.reasoningEffort,
    });

    var useStream =
        !!config.streamOutput &&
        config.apiMode !== 'gemini_generate_content' &&
        typeof $http === 'object' &&
        $http !== null &&
        typeof $http.streamRequest === 'function';

    if (useStream) {
        requestBody.stream = true;
        requestWithStream({
            done: done,
            normalizedQuery: normalizedQuery,
            sourceLang: sourceLang,
            targetLang: targetLang,
            config: config,
            apiEndpoint: apiEndpoint,
            requestBody: requestBody,
            modelName: model.name,
        });
        return;
    }

    requestWithoutStream({
        done: done,
        normalizedQuery: normalizedQuery,
        sourceLang: sourceLang,
        targetLang: targetLang,
        config: config,
        apiEndpoint: apiEndpoint,
        requestBody: requestBody,
        modelName: model.name,
    });
}

function requestWithoutStream(params) {
    var requestBody = buildHttpBody(params.config, params.requestBody);
    $http.request({
        method: 'POST',
        url: params.apiEndpoint,
        header: buildRequestHeaders(params.config, 'POST', params.apiEndpoint, requestBody.signingPayload, true),
        cancelSignal: params.normalizedQuery.cancelSignal,
        timeout: params.config.timeoutSec,
        body: requestBody.body,
        handler: function (resp) {
            var parsed = parseTranslateResponse(resp, {
                provider: params.config.provider,
                baseUrl: params.config.baseUrl,
                apiEndpoint: params.apiEndpoint,
                modelName: params.modelName,
            });
            if (!parsed.ok) {
                params.done({ error: parsed.error });
                return;
            }

            var result = buildTranslateResult(
                params.sourceLang,
                params.targetLang,
                parsed.text,
                parsed.thinkText,
                false
            );
            params.done({ result: result });
        },
    });
}

function buildApiEndpoint(baseUrl, apiMode, modelName) {
    if (isCompleteEndpoint(baseUrl)) {
        return baseUrl;
    }

    if (apiMode === 'gemini_generate_content') {
        return baseUrl + '/models/' + encodeURIComponent(normalizeGeminiNativeModelName(modelName)) + ':generateContent';
    }

    if (apiMode === 'chat_completions') {
        return baseUrl + '/chat/completions';
    }
    return baseUrl + '/responses';
}

function buildModelsEndpoint(baseUrl) {
    if (isGeminiNativeEndpoint(baseUrl)) {
        return baseUrl.replace(
            /\/models\/[^/?#]+:(?:generatecontent|streamgeneratecontent)(?:\?.*)?$/i,
            '/models'
        );
    }

    if (isCompleteEndpoint(baseUrl)) {
        return baseUrl.replace(/\/(chat\/completions|responses)$/, '') + '/models';
    }
    return baseUrl + '/models';
}

function applyReasoningParam(body, params) {
    if (params.reasoningEffort === 'none') {
        return;
    }

    if (params.apiMode === 'gemini_generate_content') {
        return;
    }

    if (params.apiMode === 'responses') {
        if (params.provider === 'openai' || params.provider === 'custom') {
            body.reasoning = {
                effort: params.reasoningEffort,
            };
        }
        return;
    }

    if (
        params.provider === 'openai' ||
        params.provider === 'gemini' ||
        params.provider === 'bedrock' ||
        params.provider === 'custom'
    ) {
        body.reasoning_effort = params.reasoningEffort;
    }
}

function buildTranslateRequestBody(params) {
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

        return geminiBody;
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
    };

    applyReasoningParam(body, params);

    return body;
}

function buildHttpBody(config, requestBody) {
    if (config.authMode === 'aws_sigv4') {
        var payload = JSON.stringify(requestBody || {});
        return {
            body: payload,
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
        return buildAwsSigV4Headers(config, method, url, payload || '', hasJsonBody);
    }

    var headers = {};
    if (hasJsonBody) {
        headers['Content-Type'] = 'application/json';
    }
    headers.Authorization = 'Bearer ' + config.apiKey;
    return headers;
}

function requestWithStream(params) {
    var requestBody = buildHttpBody(params.config, params.requestBody);
    var state = {
        text: '',
        thinkText: '',
        sseBuffer: '',
        finalSnapshot: '',
        finalThinkSnapshot: '',
        streamApiError: null,
    };

    $http.streamRequest({
        method: 'POST',
        url: params.apiEndpoint,
        header: buildRequestHeaders(params.config, 'POST', params.apiEndpoint, requestBody.signingPayload, true),
        cancelSignal: params.normalizedQuery.cancelSignal,
        timeout: params.config.timeoutSec,
        body: requestBody.body,
        streamHandler: function (stream) {
            handleStreamChunk(stream, state, params.normalizedQuery, params.sourceLang, params.targetLang);
        },
        handler: function (resp) {
            if (state.streamApiError) {
                params.done({ error: state.streamApiError });
                return;
            }

            var statusCode = getStatusCode(resp);
            if (statusCode !== 200) {
                params.done({
                    error: parseApiError(resp && resp.data, statusCode, {
                        provider: params.config.provider,
                        baseUrl: params.config.baseUrl,
                        apiEndpoint: params.apiEndpoint,
                        modelName: params.modelName,
                    }),
                });
                return;
            }

            if (resp && resp.error) {
                params.done({
                    error: makeServiceError('network', '流式请求上游服务失败。', {
                        error: resp.error,
                        response: resp.response,
                    }),
                });
                return;
            }

            var translatedText = state.text || state.finalSnapshot;
            var streamResponseThink = '';
            if (isPlainObject(resp) && isPlainObject(resp.data)) {
                if (!translatedText) {
                    translatedText = extractTranslatedText(resp.data);
                }
                streamResponseThink = extractStructuredThinkText(resp.data);
            }

            var parsedFinal = splitThoughtAndAnswer(translatedText);
            if (!parsedFinal.answerText) {
                var fallbackBody = cloneRequestBody(params.requestBody);
                if (isPlainObject(fallbackBody) && Object.prototype.hasOwnProperty.call(fallbackBody, 'stream')) {
                    delete fallbackBody.stream;
                }

                requestWithoutStream({
                    done: params.done,
                    normalizedQuery: params.normalizedQuery,
                    sourceLang: params.sourceLang,
                    targetLang: params.targetLang,
                    config: params.config,
                    apiEndpoint: params.apiEndpoint,
                    requestBody: fallbackBody,
                    modelName: params.modelName,
                });
                return;
            }

            var finalThinkText = mergeThinkText(
                mergeThinkText(mergeThinkText(state.thinkText, state.finalThinkSnapshot), streamResponseThink),
                parsedFinal.thinkText
            );

            params.done({
                result: buildTranslateResult(
                    params.sourceLang,
                    params.targetLang,
                    parsedFinal.answerText,
                    finalThinkText,
                    false
                ),
            });
        },
    });
}

function cloneRequestBody(rawBody) {
    var stringBody = '';
    try {
        stringBody = JSON.stringify(rawBody);
    } catch (_error) {
        return rawBody;
    }

    if (typeof stringBody !== 'string') {
        return rawBody;
    }

    var parsed = safeJsonParse(stringBody);
    if (!parsed) {
        return rawBody;
    }
    return parsed;
}

function handleStreamChunk(stream, state, query, sourceLang, targetLang) {
    if (!stream || typeof stream.text !== 'string') {
        return;
    }

    state.sseBuffer += stream.text;
    var lines = state.sseBuffer.split(/\r?\n/);
    state.sseBuffer = lines.pop();

    var i;
    for (i = 0; i < lines.length; i += 1) {
        var line = String(lines[i] || '').trim();
        if (!line || line.indexOf('data:') !== 0) {
            continue;
        }

        var payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') {
            continue;
        }

        var eventData = safeJsonParse(payload);
        if (!eventData) {
            continue;
        }

        if (isPlainObject(eventData.error)) {
            state.streamApiError = parseApiError(eventData, 500);
            continue;
        }

        var delta = extractStreamDeltaText(eventData);
        var changed = mergeStreamText(state, delta);

        var thinkDelta = extractStreamDeltaThink(eventData);
        if (mergeStreamThink(state, thinkDelta)) {
            changed = true;
        }

        var snapshot = extractStreamSnapshotText(eventData);
        if (snapshot) {
            state.finalSnapshot = snapshot;
            if (mergeStreamText(state, snapshot)) {
                changed = true;
            }
        }

        var thinkSnapshot = extractStreamSnapshotThink(eventData);
        if (thinkSnapshot) {
            state.finalThinkSnapshot = thinkSnapshot;
            if (mergeStreamThink(state, thinkSnapshot)) {
                changed = true;
            }
        }

        if (changed) {
            emitStreamResult(query, sourceLang, targetLang, state.text, state.thinkText);
        }
    }
}

function mergeStreamText(state, incomingText) {
    if (typeof incomingText !== 'string' || incomingText.length === 0) {
        return false;
    }

    if (!state.text) {
        state.text = incomingText;
        return true;
    }

    if (incomingText === state.text) {
        return false;
    }

    if (incomingText.indexOf(state.text) === 0) {
        state.text = incomingText;
        return true;
    }

    if (state.text.indexOf(incomingText) === 0 || state.text.slice(-incomingText.length) === incomingText) {
        return false;
    }

    state.text += incomingText;
    return true;
}

function mergeStreamThink(state, incomingText) {
    var merged = mergeThinkText(state.thinkText, incomingText);
    if (merged === state.thinkText) {
        return false;
    }
    state.thinkText = merged;
    return true;
}

function emitStreamResult(query, sourceLang, targetLang, text, thinkText) {
    if (!isPlainObject(query) || typeof query.onStream !== 'function') {
        return;
    }

    var parsed = splitThoughtAndAnswer(text);
    var mergedThink = mergeThinkText(thinkText, parsed.thinkText);
    if (!parsed.answerText && !mergedThink) {
        return;
    }

    query.onStream(buildTranslateResult(sourceLang, targetLang, parsed.answerText, mergedThink, true));
}

function extractStreamDeltaText(eventData) {
    if (!isPlainObject(eventData)) {
        return '';
    }

    if (isReasoningEventType(eventData.type)) {
        return '';
    }

    if (typeof eventData.delta === 'string' && eventData.delta) {
        return eventData.delta;
    }

    if (Array.isArray(eventData.choices) && eventData.choices.length > 0) {
        var choice = eventData.choices[0];
        if (isPlainObject(choice) && isPlainObject(choice.delta)) {
            if (typeof choice.delta.content === 'string' && choice.delta.content) {
                return choice.delta.content;
            }
            var deltaContent = normalizeMessageContent(choice.delta.content);
            if (deltaContent) {
                return deltaContent;
            }
            if (typeof choice.delta.text === 'string' && choice.delta.text) {
                return choice.delta.text;
            }
        }
    }

    if (Array.isArray(eventData.candidates) && eventData.candidates.length > 0) {
        var candidate = eventData.candidates[0];
        var candidateText = extractGeminiCandidateAnswerText(candidate);
        if (candidateText) {
            return candidateText;
        }
    }

    return '';
}

function extractStreamSnapshotText(eventData) {
    if (!isPlainObject(eventData)) {
        return '';
    }

    if (typeof eventData.output_text === 'string' && eventData.output_text.trim()) {
        return eventData.output_text.trim();
    }

    if (isPlainObject(eventData.response) && typeof eventData.response.output_text === 'string') {
        return eventData.response.output_text.trim();
    }

    if (Array.isArray(eventData.output)) {
        return extractFromOutputArray(eventData.output);
    }

    if (isPlainObject(eventData.response)) {
        return extractTranslatedText(eventData.response);
    }

    return '';
}

function extractStreamDeltaThink(eventData) {
    if (!isPlainObject(eventData)) {
        return '';
    }

    var chunks = [];
    if (isReasoningEventType(eventData.type)) {
        pushUniqueChunk(chunks, extractAnyText(eventData.delta));
        pushUniqueChunk(chunks, extractAnyText(eventData.text));
        pushUniqueChunk(chunks, extractAnyText(eventData.reasoning));
        pushUniqueChunk(chunks, extractAnyText(eventData.reasoning_content));
        pushUniqueChunk(chunks, extractAnyText(eventData.summary));
    }

    pushUniqueChunk(chunks, extractAnyText(eventData.reasoning_content));
    pushUniqueChunk(chunks, extractAnyText(eventData.reasoning));
    pushUniqueChunk(chunks, extractAnyText(eventData.thinking));
    pushUniqueChunk(chunks, extractAnyText(eventData.thoughts));

    if (Array.isArray(eventData.choices) && eventData.choices.length > 0) {
        var choice = eventData.choices[0];
        if (isPlainObject(choice) && isPlainObject(choice.delta)) {
            pushUniqueChunk(chunks, extractAnyText(choice.delta.reasoning_content));
            pushUniqueChunk(chunks, extractAnyText(choice.delta.reasoning));
            pushUniqueChunk(chunks, extractAnyText(choice.delta.thinking));
            pushUniqueChunk(chunks, extractAnyText(choice.delta.thinking_delta));
            pushUniqueChunk(chunks, extractThinkingFromMessageContent(choice.delta.content));
        }
    }

    if (Array.isArray(eventData.candidates) && eventData.candidates.length > 0) {
        var candidate = eventData.candidates[0];
        pushUniqueChunk(chunks, extractGeminiCandidateThinkText(candidate));
    }

    return cleanInlineText(chunks.join('\n\n'));
}

function extractStreamSnapshotThink(eventData) {
    if (!isPlainObject(eventData)) {
        return '';
    }

    var chunks = [];
    pushUniqueChunk(chunks, extractStructuredThinkText(eventData));
    if (isPlainObject(eventData.response)) {
        pushUniqueChunk(chunks, extractStructuredThinkText(eventData.response));
    }
    return cleanInlineText(chunks.join('\n\n'));
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

function parseValidateResponse(resp, config, modelsEndpoint) {
    if (!isPlainObject(resp)) {
        return {
            ok: false,
            error: makeServiceError('network', '网络层响应异常。', resp),
        };
    }

    if (resp.error) {
        return {
            ok: false,
            error: makeServiceError('network', '无法连接到上游服务。', {
                error: resp.error,
                response: resp.response,
            }),
        };
    }

    var statusCode = getStatusCode(resp);
    if (statusCode >= 200 && statusCode < 300) {
        return { ok: true };
    }

    if (statusCode === 401) {
        return {
            ok: false,
            error: makeServiceError('secretKey', '插件校验失败：HTTP 401，请检查 Key。', resp.data),
        };
    }

    if (config && config.provider === 'bedrock') {
        if (statusCode === 404) {
            if (isBedrockRuntimeOpenAiBaseUrl(config.baseUrl) && config.apiMode === 'responses') {
                return {
                    ok: false,
                    error: makeServiceError(
                        'param',
                        '当前 Bedrock 端点返回 404。AWS 官方 Bedrock 请确认 Region、模型权限和接口协议；Bearer/Mantle 路线请确认 Base URL。通常应将“接口协议”设为 Chat Completions。',
                        {
                            baseUrl: config.baseUrl,
                            apiMode: config.apiMode,
                        }
                    ),
                };
            }
            return { ok: true };
        }
        if (statusCode === 405 || statusCode === 501) {
            return { ok: true };
        }
    }

    if (
        config &&
        config.provider === 'custom' &&
        (statusCode === 404 || statusCode === 405 || statusCode === 501)
    ) {
        if (statusCode === 404 && isCerebrasBaseUrl(config.baseUrl)) {
            return {
                ok: false,
                error: makeServiceError(
                    'param',
                    'Cerebras 校验失败：/models 返回 404。请确认 Base URL 为 https://api.cerebras.ai/v1（或保持完整端点），并确认 API Key 可访问模型列表。',
                    {
                        modelsEndpoint: modelsEndpoint,
                    }
                ),
            };
        }
        return { ok: true };
    }

    if (config && config.apiMode === 'gemini_generate_content' && (statusCode === 404 || statusCode === 405 || statusCode === 501)) {
        return { ok: true };
    }

    if (config && statusCode === 404 && isCompleteEndpoint(config.baseUrl)) {
        return { ok: true };
    }

    return {
        ok: false,
        error: makeServiceError('api', '插件校验失败：HTTP ' + statusCode, resp.data),
    };
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
    if (statusCode !== 200) {
        return {
            ok: false,
            error: parseApiError(resp.data, statusCode, context),
        };
    }

    var text = extractTranslatedText(resp.data);
    if (!text) {
        return {
            ok: false,
            error: makeServiceError('api', '响应里没有可用翻译结果。', resp.data),
        };
    }

    var parsed = splitThoughtAndAnswer(text);
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

function splitThoughtAndAnswer(rawText) {
    if (typeof rawText !== 'string' || !rawText.trim()) {
        return {
            answerText: '',
            thinkText: '',
        };
    }

    THINK_BLOCK_REGEXP.lastIndex = 0;
    THINK_OPEN_REGEXP.lastIndex = 0;
    THINK_CLOSE_REGEXP.lastIndex = 0;

    var thinkChunks = [];
    var answerText = rawText.replace(THINK_BLOCK_REGEXP, function (_full, _tag, content) {
        var cleanContent = cleanInlineText(content);
        if (cleanContent) {
            thinkChunks.push(cleanContent);
        }
        return '';
    });

    var lastOpen = null;
    var openMatch = THINK_OPEN_REGEXP.exec(answerText);
    while (openMatch) {
        lastOpen = {
            index: openMatch.index,
            end: THINK_OPEN_REGEXP.lastIndex,
        };
        openMatch = THINK_OPEN_REGEXP.exec(answerText);
    }
    if (lastOpen) {
        var tailThink = cleanInlineText(answerText.slice(lastOpen.end));
        if (tailThink) {
            thinkChunks.push(tailThink);
        }
        answerText = answerText.slice(0, lastOpen.index);
    }

    THINK_CLOSE_REGEXP.lastIndex = 0;
    answerText = answerText.replace(THINK_CLOSE_REGEXP, '');

    return {
        answerText: cleanInlineText(answerText),
        thinkText: cleanInlineText(thinkChunks.join('\n\n')),
    };
}

function buildTranslateResult(sourceLang, targetLang, answerText, thinkText, allowEmptyParagraphs) {
    var result = {
        from: sourceLang,
        to: targetLang,
        toParagraphs: [],
    };

    var cleanAnswer = cleanInlineText(answerText);
    if (cleanAnswer) {
        result.toParagraphs = splitToParagraphs(cleanAnswer);
    } else if (!allowEmptyParagraphs) {
        result.toParagraphs = [''];
    }

    var cleanThink = cleanInlineText(thinkText);
    if (cleanThink) {
        result.thinkInfo = {
            content: cleanThink,
        };
    }

    return result;
}

function mergeThinkText(baseText, incomingText) {
    var base = cleanInlineText(baseText);
    var incoming = cleanInlineText(incomingText);

    if (!base) {
        return incoming;
    }
    if (!incoming) {
        return base;
    }
    if (base === incoming) {
        return base;
    }
    if (base.indexOf(incoming) >= 0) {
        return base;
    }
    if (incoming.indexOf(base) >= 0) {
        return incoming;
    }

    return base + '\n\n' + incoming;
}

function cleanInlineText(text) {
    if (typeof text !== 'string') {
        return '';
    }
    return text
        .replace(/\r/g, '')
        .trim();
}

function extractTranslatedText(data) {
    if (!isPlainObject(data)) {
        return '';
    }

    if (typeof data.output_text === 'string' && data.output_text.trim()) {
        return data.output_text.trim();
    }

    if (Array.isArray(data.output)) {
        var outputText = extractFromOutputArray(data.output);
        if (outputText) {
            return outputText;
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
        var candidate = data.candidates[0];
        if (
            candidate &&
            isPlainObject(candidate.content) &&
            Array.isArray(candidate.content.parts) &&
            candidate.content.parts.length > 0 &&
            isPlainObject(candidate.content.parts[0]) &&
            typeof candidate.content.parts[0].text === 'string'
        ) {
            return extractGeminiCandidateAnswerText(candidate).trim();
        }
    }

    return '';
}

function extractStructuredThinkText(data) {
    if (!isPlainObject(data)) {
        return '';
    }

    var chunks = [];
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
        if (isPlainObject(item) && isThinkingPart(item) && typeof item.text === 'string' && item.text) {
            chunks.push(item.text);
        }
    }

    return cleanInlineText(chunks.join(''));
}

function isThinkingPart(part) {
    if (!isPlainObject(part)) {
        return false;
    }

    if (part.thought === true || part.thinking === true) {
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

function validateTranslateQuery(query) {
    if (typeof query.text !== 'string' || !query.text.trim()) {
        return makeServiceError('param', '待翻译文本不能为空。');
    }

    var targetLang = normalizeLanguageCode(query.detectTo || query.to || '');
    if (!targetLang || targetLang === 'auto') {
        return makeServiceError('unsupportedLanguage', '目标语言不能为空或 auto。');
    }

    return null;
}

function normalizeTranslateQuery(query) {
    if (typeof query === 'string') {
        return {
            ok: true,
            query: {
                text: query,
                from: 'auto',
                to: 'en',
            },
        };
    }

    if (!isPlainObject(query)) {
        return {
            ok: false,
            error: makeServiceError('param', 'query 参数必须是对象或字符串。'),
        };
    }

    if (typeof query.text !== 'string' && query.text !== undefined && query.text !== null) {
        query.text = String(query.text);
    }

    return {
        ok: true,
        query: query,
    };
}

function buildRuntimeConfig() {
    var apiKey = getOptionString('apiKey', '');
    var provider = getOptionString('provider', 'openai');
    if (provider !== 'openai' && provider !== 'gemini' && provider !== 'bedrock' && provider !== 'custom') {
        provider = 'custom';
    }
    var apiMode = parseMenuChoice('apiMode', DEFAULT_API_MODE, API_MODE_VALUES);
    var bedrockRegion = normalizeRegion(getOptionString('bedrockRegion', DEFAULT_BEDROCK_REGION));
    var awsAccessKeyId = getOptionString('awsAccessKeyId', '');
    var awsSecretAccessKey = getOptionString('awsSecretAccessKey', '');
    var awsSessionToken = getOptionString('awsSessionToken', '');
    var hasAnyAwsCredential = !!(awsAccessKeyId || awsSecretAccessKey || awsSessionToken);
    var authMode = 'bearer';

    if (provider === 'bedrock' && hasAnyAwsCredential) {
        if (!awsAccessKeyId || !awsSecretAccessKey) {
            return {
                ok: false,
                error: makeServiceError(
                    'secretKey',
                    'AWS Bedrock 官方链路请同时填写 AWS Access Key ID 和 AWS Secret Access Key。'
                ),
            };
        }
        authMode = 'aws_sigv4';
    } else if (!apiKey) {
        return {
            ok: false,
            error: makeServiceError('secretKey', '请先填写 API Key；若直连 AWS Bedrock 官方链路，请填写 AWS Access Key ID 和 AWS Secret Access Key。'),
        };
    }

    var baseUrlRaw = getOptionString('baseUrl', DEFAULT_BASE_URL);
    if (provider === 'bedrock' && authMode === 'aws_sigv4' && isDefaultSub2ApiUrl(baseUrlRaw)) {
        baseUrlRaw = buildBedrockRuntimeOpenAiBaseUrl(bedrockRegion);
    } else if (provider === 'bedrock' && isDefaultSub2ApiUrl(baseUrlRaw)) {
        baseUrlRaw = buildBedrockMantleBaseUrl(bedrockRegion);
    }

    var routeProfile = inferRouteProfile(baseUrlRaw);
    if (routeProfile.openAiCompatible && apiMode === 'gemini_generate_content') {
        apiMode = 'chat_completions';
    }
    if (routeProfile.openAiCompatible && provider === 'gemini') {
        provider = 'openai';
    }

    var baseUrl = normalizeBaseUrl(baseUrlRaw, apiMode);
    if (!baseUrl) {
        return {
            ok: false,
            error: makeServiceError('param', 'Base URL 格式错误，请填写 http:// 或 https:// 地址。', {
                baseUrl: baseUrlRaw,
            }),
        };
    }

    if (isCerebrasBaseUrl(baseUrl) && apiMode === 'responses' && !isCompleteEndpoint(baseUrl)) {
        return {
            ok: false,
            error: makeServiceError(
                'param',
                'Cerebras 不支持 /responses。请将“接口协议”切到 Chat Completions，或把 Base URL 直接填为 https://api.cerebras.ai/v1/chat/completions。'
            ),
        };
    }

    var timeoutSec = parseIntegerInRange(
        getOptionString('requestTimeoutSec', String(DEFAULT_TIMEOUT_SEC)),
        DEFAULT_TIMEOUT_SEC,
        10,
        300
    );

    var maxOutputTokens = parseIntegerInRange(
        getOptionString('maxOutputTokens', String(DEFAULT_MAX_OUTPUT_TOKENS)),
        DEFAULT_MAX_OUTPUT_TOKENS,
        64,
        8192
    );

    var reasoningEffort = parseMenuChoice(
        'reasoningEffort',
        DEFAULT_REASONING_EFFORT,
        REASONING_EFFORT_VALUES
    );
    var streamOutput = parseMenuBoolean('streamOutput', DEFAULT_STREAM_OUTPUT);

    return {
        ok: true,
        baseUrl: baseUrl,
        apiKey: apiKey,
        awsAccessKeyId: awsAccessKeyId,
        awsSecretAccessKey: awsSecretAccessKey,
        awsSessionToken: awsSessionToken,
        authMode: authMode,
        provider: provider,
        apiMode: apiMode,
        bedrockRegion: bedrockRegion,
        timeoutSec: timeoutSec,
        maxOutputTokens: maxOutputTokens,
        reasoningEffort: reasoningEffort,
        streamOutput: streamOutput,
    };
}

function resolveModel() {
    var selectedModel = getOptionString('model', 'gpt-5.2');

    if (selectedModel === 'custom') {
        var customModel = getOptionString('customModel', '');
        if (!customModel) {
            return {
                ok: false,
                error: makeServiceError('param', '已选择自定义模型，但“自定义模型名”为空。'),
            };
        }
        return {
            ok: true,
            name: customModel,
        };
    }

    return {
        ok: true,
        name: selectedModel,
    };
}

function languageName(code) {
    if (!code) {
        return 'auto';
    }
    return LANGUAGE_NAMES[code] || code;
}

function normalizeLanguageCode(code) {
    if (!code) {
        return '';
    }
    if (SUPPORTED_LANGUAGES.indexOf(code) >= 0) {
        return code;
    }
    if (code === 'zh') {
        return 'zh-Hans';
    }

    var lower = String(code).toLowerCase();
    if (lower === 'zh-cn' || lower === 'zh-sg') {
        return 'zh-Hans';
    }
    if (lower === 'zh-hk' || lower === 'zh-tw' || lower === 'zh-mo') {
        return 'zh-Hant';
    }

    var i;
    for (i = 0; i < SUPPORTED_LANGUAGES.length; i += 1) {
        var supported = SUPPORTED_LANGUAGES[i];
        if (String(supported).toLowerCase() === lower) {
            return supported;
        }
    }

    return '';
}

function splitToParagraphs(text) {
    if (typeof text !== 'string') {
        return [''];
    }

    var chunks = text
        .replace(/\r/g, '')
        .split('\n')
        .map(function (line) {
            return line.trim();
        })
        .filter(function (line) {
            return line.length > 0;
        });

    if (chunks.length === 0) {
        return [text.trim()];
    }
    return chunks;
}

function inferRouteProfile(raw) {
    var value = normalizeUrlForRouteProfile(raw);
    var openAiCompatible =
        /\/cliproxy\/v1(?:\/(?:chat\/completions|responses))?$/.test(value) ||
        /\/sub2api\/v1(?:\/(?:chat\/completions|responses))?$/.test(value) ||
        /\/openai\/v1(?:\/(?:chat\/completions|responses))?$/.test(value) ||
        /\/v1\/(?:chat\/completions|responses)$/.test(value) ||
        /\/v1$/.test(value);

    var geminiNative =
        /\/v1beta(?:\/models\/[^/?#]+:(?:generatecontent|streamgeneratecontent))?$/.test(value) ||
        /generativelanguage\.googleapis\.com\/v1beta/.test(value);

    return {
        openAiCompatible: openAiCompatible && !geminiNative,
        geminiNative: geminiNative,
    };
}

function normalizeUrlForRouteProfile(raw) {
    if (typeof raw !== 'string') {
        return '';
    }
    return raw.trim().replace(/\/+$/, '').toLowerCase();
}

function normalizeBaseUrl(raw, apiMode) {
    if (typeof raw !== 'string') {
        return '';
    }

    var value = raw.trim();
    if (!value) {
        return '';
    }
    value = value.replace(/\/+$/, '');

    if (!/^https?:\/\//.test(value)) {
        return '';
    }

    if (isCompleteEndpoint(value)) {
        return value;
    }

    if (apiMode === 'gemini_generate_content') {
        if (/\/v1beta$/.test(value)) {
            return value;
        }
        if (/\/v1$/.test(value)) {
            return value.replace(/\/v1$/, '/v1beta');
        }
        return value + '/v1beta';
    }

    if (/\/v1$/.test(value)) {
        return value;
    }

    if (/\/v1beta$/.test(value)) {
        return value.replace(/\/v1beta$/, '/v1');
    }

    return value + '/v1';
}

function isCerebrasBaseUrl(urlValue) {
    if (typeof urlValue !== 'string') {
        return false;
    }
    return /^https?:\/\/api\.cerebras\.ai(?:\/|$)/.test(urlValue);
}

function isCompleteEndpoint(urlValue) {
    if (typeof urlValue !== 'string') {
        return false;
    }
    return /\/(chat\/completions|responses)$/.test(urlValue) || isGeminiNativeEndpoint(urlValue);
}

function isGeminiNativeEndpoint(urlValue) {
    if (typeof urlValue !== 'string') {
        return false;
    }
    return /\/models\/[^/?#]+:(?:generatecontent|streamgeneratecontent)(?:\?.*)?$/i.test(urlValue);
}

function normalizeGeminiNativeModelName(modelName) {
    var name = String(modelName || '').trim();
    if (!name) {
        return '';
    }
    if (name.indexOf('models/') === 0) {
        return name.slice(7);
    }
    return name;
}

function isBedrockRuntimeOpenAiBaseUrl(baseUrl) {
    if (typeof baseUrl !== 'string') {
        return false;
    }
    return /^https?:\/\/bedrock-runtime\.[a-z0-9-]+\.amazonaws\.com\/openai\/v1$/.test(baseUrl);
}

function normalizeRegion(raw) {
    var region = String(raw || '').trim().toLowerCase();
    if (!region) {
        return DEFAULT_BEDROCK_REGION;
    }
    if (!/^[a-z0-9-]+$/.test(region)) {
        return DEFAULT_BEDROCK_REGION;
    }
    return region;
}

function buildBedrockMantleBaseUrl(region) {
    return 'https://bedrock-mantle.' + region + '.api.aws/v1';
}

function buildBedrockRuntimeOpenAiBaseUrl(region) {
    return 'https://bedrock-runtime.' + region + '.amazonaws.com/openai/v1';
}

function isDefaultSub2ApiUrl(raw) {
    if (typeof raw !== 'string') {
        return true;
    }

    var normalized = normalizeBaseUrl(raw);
    var defaultNormalized = normalizeBaseUrl(DEFAULT_BASE_URL);
    if (!normalized || !defaultNormalized) {
        return true;
    }
    return normalized === defaultNormalized;
}

function parseIntegerInRange(raw, defaultValue, minValue, maxValue) {
    var parsed = parseInt(raw, 10);
    if (isNaN(parsed)) {
        return defaultValue;
    }
    return clamp(parsed, minValue, maxValue);
}

function parseFloatInRange(raw, defaultValue, minValue, maxValue) {
    var parsed = parseFloat(raw);
    if (isNaN(parsed)) {
        return defaultValue;
    }
    return clamp(parsed, minValue, maxValue);
}

function parseMenuChoice(key, defaultValue, allowedValues) {
    var value = getOptionString(key, defaultValue);
    if (allowedValues && allowedValues[value]) {
        return value;
    }
    return defaultValue;
}

function parseMenuBoolean(key, defaultValue) {
    var fallback = defaultValue ? 'true' : 'false';
    var value = getOptionString(key, fallback).toLowerCase();
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    return !!defaultValue;
}

function clamp(value, minValue, maxValue) {
    return Math.max(minValue, Math.min(maxValue, value));
}

function getStatusCode(resp) {
    if (!resp || !resp.response) {
        return 0;
    }
    return Number(resp.response.statusCode) || 0;
}

function getOptionString(key, fallback) {
    if (typeof $option === 'object' && $option !== null) {
        if ($option[key] !== undefined && $option[key] !== null) {
            return String($option[key]).trim();
        }
    }
    return fallback;
}

function buildAwsSigV4Headers(config, method, url, payload, hasJsonBody) {
    var parsed = parseHttpUrl(url);
    if (!parsed.ok) {
        return {};
    }

    var now = new Date();
    var amzDate = toAwsAmzDate(now);
    var dateStamp = amzDate.slice(0, 8);
    var payloadHash = sha256Hex(utf8Bytes(payload || ''));
    var headers = {
        host: parsed.host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
    };

    if (hasJsonBody) {
        headers['content-type'] = 'application/json';
    }
    if (config.awsSessionToken) {
        headers['x-amz-security-token'] = config.awsSessionToken;
    }

    var signedHeaderNames = Object.keys(headers).sort();
    var canonicalHeaders = '';
    for (var i = 0; i < signedHeaderNames.length; i++) {
        var headerName = signedHeaderNames[i];
        canonicalHeaders += headerName + ':' + normalizeAwsHeaderValue(headers[headerName]) + '\n';
    }

    var signedHeaders = signedHeaderNames.join(';');
    var canonicalRequest =
        String(method || 'GET').toUpperCase() +
        '\n' +
        canonicalAwsPath(parsed.path) +
        '\n' +
        canonicalAwsQuery(parsed.query) +
        '\n' +
        canonicalHeaders +
        '\n' +
        signedHeaders +
        '\n' +
        payloadHash;
    var credentialScope = dateStamp + '/' + config.bedrockRegion + '/bedrock/aws4_request';
    var stringToSign =
        'AWS4-HMAC-SHA256\n' +
        amzDate +
        '\n' +
        credentialScope +
        '\n' +
        sha256Hex(utf8Bytes(canonicalRequest));
    var signingKey = awsSigV4SigningKey(config.awsSecretAccessKey, dateStamp, config.bedrockRegion, 'bedrock');
    var signature = bytesToHex(hmacSha256Bytes(signingKey, utf8Bytes(stringToSign)));
    var authorization =
        'AWS4-HMAC-SHA256 Credential=' +
        config.awsAccessKeyId +
        '/' +
        credentialScope +
        ', SignedHeaders=' +
        signedHeaders +
        ', Signature=' +
        signature;

    var output = {
        Host: parsed.host,
        'X-Amz-Content-Sha256': payloadHash,
        'X-Amz-Date': amzDate,
        Authorization: authorization,
    };
    if (hasJsonBody) {
        output['Content-Type'] = 'application/json';
    }
    if (config.awsSessionToken) {
        output['X-Amz-Security-Token'] = config.awsSessionToken;
    }
    return output;
}

function parseHttpUrl(url) {
    var match = String(url || '').match(/^(https?):\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i);
    if (!match) {
        return { ok: false };
    }
    return {
        ok: true,
        scheme: match[1].toLowerCase(),
        host: match[2].toLowerCase(),
        path: match[3] || '/',
        query: match[4] || '',
    };
}

function canonicalAwsPath(path) {
    var value = path || '/';
    if (value.charAt(0) !== '/') {
        value = '/' + value;
    }
    return value
        .split('/')
        .map(function (part) {
            return awsPercentEncode(decodeURIComponentSafe(part));
        })
        .join('/');
}

function canonicalAwsQuery(query) {
    if (!query) {
        return '';
    }
    var pairs = query.split('&');
    var encoded = [];
    for (var i = 0; i < pairs.length; i++) {
        if (!pairs[i]) {
            continue;
        }
        var eqIndex = pairs[i].indexOf('=');
        var key = eqIndex >= 0 ? pairs[i].slice(0, eqIndex) : pairs[i];
        var value = eqIndex >= 0 ? pairs[i].slice(eqIndex + 1) : '';
        encoded.push([awsPercentEncode(decodeURIComponentSafe(key)), awsPercentEncode(decodeURIComponentSafe(value))]);
    }
    encoded.sort(function (a, b) {
        if (a[0] === b[0]) {
            return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
        }
        return a[0] < b[0] ? -1 : 1;
    });
    return encoded
        .map(function (pair) {
            return pair[0] + '=' + pair[1];
        })
        .join('&');
}

function decodeURIComponentSafe(value) {
    try {
        return decodeURIComponent(String(value || '').replace(/\+/g, '%20'));
    } catch (err) {
        return String(value || '');
    }
}

function awsPercentEncode(value) {
    return encodeURIComponent(String(value || '')).replace(/[!'()*]/g, function (ch) {
        return '%' + ch.charCodeAt(0).toString(16).toUpperCase();
    });
}

function normalizeAwsHeaderValue(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function toAwsAmzDate(date) {
    function pad(value) {
        return value < 10 ? '0' + value : String(value);
    }
    return (
        date.getUTCFullYear() +
        pad(date.getUTCMonth() + 1) +
        pad(date.getUTCDate()) +
        'T' +
        pad(date.getUTCHours()) +
        pad(date.getUTCMinutes()) +
        pad(date.getUTCSeconds()) +
        'Z'
    );
}

function awsSigV4SigningKey(secretAccessKey, dateStamp, region, service) {
    var kDate = hmacSha256Bytes(utf8Bytes('AWS4' + secretAccessKey), utf8Bytes(dateStamp));
    var kRegion = hmacSha256Bytes(kDate, utf8Bytes(region));
    var kService = hmacSha256Bytes(kRegion, utf8Bytes(service));
    return hmacSha256Bytes(kService, utf8Bytes('aws4_request'));
}

function hmacSha256Bytes(keyBytes, messageBytes) {
    var blockSize = 64;
    var key = keyBytes.slice();
    if (key.length > blockSize) {
        key = sha256Bytes(key);
    }
    while (key.length < blockSize) {
        key.push(0);
    }

    var outerKey = [];
    var innerKey = [];
    for (var i = 0; i < blockSize; i++) {
        outerKey.push(key[i] ^ 0x5c);
        innerKey.push(key[i] ^ 0x36);
    }
    return sha256Bytes(outerKey.concat(sha256Bytes(innerKey.concat(messageBytes))));
}

function sha256Hex(bytes) {
    return bytesToHex(sha256Bytes(bytes));
}

function sha256Bytes(bytes) {
    var K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    var H = [
        0x6a09e667,
        0xbb67ae85,
        0x3c6ef372,
        0xa54ff53a,
        0x510e527f,
        0x9b05688c,
        0x1f83d9ab,
        0x5be0cd19,
    ];
    var message = bytes.slice();
    var bitLength = message.length * 8;
    message.push(0x80);
    while (message.length % 64 !== 56) {
        message.push(0);
    }
    var high = Math.floor(bitLength / 0x100000000);
    var low = bitLength >>> 0;
    message.push((high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff);
    message.push((low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff);

    for (var offset = 0; offset < message.length; offset += 64) {
        var w = [];
        for (var i = 0; i < 16; i++) {
            var j = offset + i * 4;
            w[i] =
                ((message[j] << 24) | (message[j + 1] << 16) | (message[j + 2] << 8) | message[j + 3]) >>> 0;
        }
        for (i = 16; i < 64; i++) {
            var s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
            var s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }

        var a = H[0];
        var b = H[1];
        var c = H[2];
        var d = H[3];
        var e = H[4];
        var f = H[5];
        var g = H[6];
        var h = H[7];

        for (i = 0; i < 64; i++) {
            var S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
            var ch = ((e & f) ^ (~e & g)) >>> 0;
            var temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
            var S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
            var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
            var temp2 = (S0 + maj) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }

        H[0] = (H[0] + a) >>> 0;
        H[1] = (H[1] + b) >>> 0;
        H[2] = (H[2] + c) >>> 0;
        H[3] = (H[3] + d) >>> 0;
        H[4] = (H[4] + e) >>> 0;
        H[5] = (H[5] + f) >>> 0;
        H[6] = (H[6] + g) >>> 0;
        H[7] = (H[7] + h) >>> 0;
    }

    var out = [];
    for (i = 0; i < H.length; i++) {
        out.push((H[i] >>> 24) & 0xff, (H[i] >>> 16) & 0xff, (H[i] >>> 8) & 0xff, H[i] & 0xff);
    }
    return out;
}

function rotr(value, bits) {
    return (value >>> bits) | (value << (32 - bits));
}

function utf8Bytes(value) {
    var text = String(value || '');
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
        var code = text.charCodeAt(i);
        if (code < 0x80) {
            bytes.push(code);
        } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
            var next = text.charCodeAt(++i);
            var point = 0x10000 + (((code & 0x3ff) << 10) | (next & 0x3ff));
            bytes.push(
                0xf0 | (point >> 18),
                0x80 | ((point >> 12) & 0x3f),
                0x80 | ((point >> 6) & 0x3f),
                0x80 | (point & 0x3f)
            );
        } else {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
    }
    return bytes;
}

function bytesToHex(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
        out += (bytes[i] >>> 4).toString(16);
        out += (bytes[i] & 0x0f).toString(16);
    }
    return out;
}

function makeServiceError(type, message, addition) {
    return {
        type: normalizeErrorType(type),
        message: message || 'Unknown error',
        addition: toReadableAddition(addition),
    };
}

function normalizeErrorType(type) {
    var allowed = {
        unknown: true,
        param: true,
        unsupportedLanguage: true,
        secretKey: true,
        network: true,
        api: true,
    };
    if (allowed[type]) {
        return type;
    }
    return 'unknown';
}

function toReadableAddition(value) {
    if (value === undefined || value === null) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    try {
        return JSON.stringify(value);
    } catch (err) {
        return String(value);
    }
}

function safeJsonParse(text) {
    if (typeof text !== 'string' || !text.trim()) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch (err) {
        return null;
    }
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createCompletionBridge(query, completion) {
    var legacyDone = onceCompletion(completion);
    var modernCompletion =
        isPlainObject(query) && typeof query.onCompletion === 'function' ? query.onCompletion : null;
    var modernDone = onceCompletion(modernCompletion);

    return function (payload) {
        modernDone(payload);
        legacyDone(payload);
    };
}

function onceCompletion(completion) {
    var done = false;
    var callback = typeof completion === 'function' ? completion : function () {};
    return function (payload) {
        if (done) {
            return;
        }
        done = true;
        callback(payload);
    };
}
