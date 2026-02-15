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
};

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

    $http.request({
        method: 'GET',
        url: config.baseUrl + '/models',
        header: {
            Authorization: 'Bearer ' + config.apiKey,
        },
        timeout: clamp(config.timeoutSec, 10, 30),
        handler: function (resp) {
            var parsed = parseValidateResponse(resp, config);
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

    var apiEndpoint = buildApiEndpoint(config.baseUrl, config.apiMode);
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
        });
        return;
    }

    $http.request({
        method: 'POST',
        url: apiEndpoint,
        header: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + config.apiKey,
        },
        cancelSignal: normalizedQuery.cancelSignal,
        timeout: config.timeoutSec,
        body: requestBody,
        handler: function (resp) {
            var parsed = parseTranslateResponse(resp);
            if (!parsed.ok) {
                done({ error: parsed.error });
                return;
            }

            var translatedText = parsed.text;
            var paragraphs = splitToParagraphs(translatedText);
            var result = {
                from: sourceLang,
                to: targetLang,
                toParagraphs: paragraphs,
            };
            done({ result: result });
        },
    });
}

function buildApiEndpoint(baseUrl, apiMode) {
    if (apiMode === 'chat_completions') {
        return baseUrl + '/chat/completions';
    }
    return baseUrl + '/responses';
}

function buildTranslateRequestBody(params) {
    if (params.apiMode === 'chat_completions') {
        return {
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

    if (params.provider === 'openai' && params.reasoningEffort !== 'none') {
        body.reasoning = {
            effort: params.reasoningEffort,
        };
    }

    return body;
}

function requestWithStream(params) {
    var state = {
        text: '',
        sseBuffer: '',
        finalSnapshot: '',
        streamApiError: null,
    };

    $http.streamRequest({
        method: 'POST',
        url: params.apiEndpoint,
        header: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + params.config.apiKey,
        },
        cancelSignal: params.normalizedQuery.cancelSignal,
        timeout: params.config.timeoutSec,
        body: params.requestBody,
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
                params.done({ error: parseApiError(resp && resp.data, statusCode) });
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
            if (!translatedText || !translatedText.trim()) {
                params.done({
                    error: makeServiceError('api', '流式响应里没有可用翻译结果。'),
                });
                return;
            }

            params.done({
                result: {
                    from: params.sourceLang,
                    to: params.targetLang,
                    toParagraphs: splitToParagraphs(translatedText),
                },
            });
        },
    });
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

        var snapshot = extractStreamSnapshotText(eventData);
        if (snapshot) {
            state.finalSnapshot = snapshot;
            if (mergeStreamText(state, snapshot)) {
                changed = true;
            }
        }

        if (changed) {
            emitStreamResult(query, sourceLang, targetLang, state.text);
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

function emitStreamResult(query, sourceLang, targetLang, text) {
    if (!isPlainObject(query) || typeof query.onStream !== 'function') {
        return;
    }

    if (typeof text !== 'string' || !text.trim()) {
        return;
    }

    query.onStream({
        from: sourceLang,
        to: targetLang,
        toParagraphs: splitToParagraphs(text),
    });
}

function extractStreamDeltaText(eventData) {
    if (!isPlainObject(eventData)) {
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
        }
    }

    if (Array.isArray(eventData.candidates) && eventData.candidates.length > 0) {
        var candidate = eventData.candidates[0];
        var candidateText = extractGeminiCandidateText(candidate);
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

    return '';
}

function extractGeminiCandidateText(candidate) {
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
        if (isPlainObject(part) && typeof part.text === 'string' && part.text) {
            chunks.push(part.text);
        }
    }
    return chunks.join('');
}

function parseValidateResponse(resp, config) {
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
                        '当前 Bedrock Runtime OpenAI 端点在该配置下返回 404。请将“接口协议”改为 Chat Completions，或改用 bedrock-mantle.<region>.api.aws/v1。',
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
        return { ok: true };
    }

    return {
        ok: false,
        error: makeServiceError('api', '插件校验失败：HTTP ' + statusCode, resp.data),
    };
}

function parseTranslateResponse(resp) {
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
            error: parseApiError(resp.data, statusCode),
        };
    }

    var text = extractTranslatedText(resp.data);
    if (!text) {
        return {
            ok: false,
            error: makeServiceError('api', '响应里没有可用翻译结果。', resp.data),
        };
    }

    return {
        ok: true,
        text: text,
    };
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
            return candidate.content.parts[0].text.trim();
        }
    }

    return '';
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
        if (isPlainObject(item) && typeof item.text === 'string' && item.text) {
            chunks.push(item.text);
        }
    }

    return chunks.join('').trim();
}

function parseApiError(data, statusCode) {
    var type = statusCode === 401 ? 'secretKey' : 'api';
    var message = '上游请求失败 (HTTP ' + statusCode + ')';
    if (isPlainObject(data)) {
        if (isPlainObject(data.error)) {
            if (typeof data.error.message === 'string' && data.error.message) {
                message = data.error.message;
            } else if (typeof data.error.code === 'string') {
                message = 'API error: ' + data.error.code;
            }
        } else if (typeof data.message === 'string' && data.message) {
            message = data.message;
        }
    }

    return makeServiceError(type, message, data);
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
    if (!apiKey) {
        return {
            ok: false,
            error: makeServiceError('secretKey', '请先填写 API Key。'),
        };
    }

    var provider = getOptionString('provider', 'openai');
    if (provider !== 'openai' && provider !== 'gemini' && provider !== 'bedrock' && provider !== 'custom') {
        provider = 'custom';
    }
    var apiMode = parseMenuChoice('apiMode', DEFAULT_API_MODE, API_MODE_VALUES);
    var bedrockRegion = normalizeRegion(getOptionString('bedrockRegion', DEFAULT_BEDROCK_REGION));

    var baseUrlRaw = getOptionString('baseUrl', DEFAULT_BASE_URL);
    if (provider === 'bedrock' && isDefaultSub2ApiUrl(baseUrlRaw)) {
        baseUrlRaw = buildBedrockMantleBaseUrl(bedrockRegion);
    }
    var baseUrl = normalizeBaseUrl(baseUrlRaw);
    if (!baseUrl) {
        return {
            ok: false,
            error: makeServiceError('param', 'Base URL 格式错误，请填写 http:// 或 https:// 地址。', {
                baseUrl: baseUrlRaw,
            }),
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

function normalizeBaseUrl(raw) {
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

    if (/\/v1$/.test(value)) {
        return value;
    }

    if (/\/v1beta$/.test(value)) {
        return value.replace(/\/v1beta$/, '/v1');
    }

    return value + '/v1';
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
