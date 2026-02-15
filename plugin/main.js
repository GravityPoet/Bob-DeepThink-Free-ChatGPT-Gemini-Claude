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
var DEFAULT_TEMPERATURE = 0.2;
var DEFAULT_MAX_OUTPUT_TOKENS = 1024;

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
            var parsed = parseValidateResponse(resp);
            if (!parsed.ok) {
                done({ result: false, error: parsed.error });
                return;
            }
            done({ result: true });
        },
    });
}

function translate(query, completion) {
    var done = onceCompletion(completion);

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

    var model = resolveModel(config.provider);
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

    var requestBody = {
        model: model.name,
        input: [
            {
                role: 'system',
                content: [
                    {
                        type: 'input_text',
                        text: systemPrompt,
                    },
                ],
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'input_text',
                        text: userPrompt,
                    },
                ],
            },
        ],
        temperature: config.temperature,
        max_output_tokens: config.maxOutputTokens,
    };

    $http.request({
        method: 'POST',
        url: config.baseUrl + '/responses',
        header: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + config.apiKey,
        },
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

function parseValidateResponse(resp) {
    if (!isPlainObject(resp)) {
        return {
            ok: false,
            error: makeServiceError('network', '网络层响应异常。', resp),
        };
    }

    if (resp.error) {
        return {
            ok: false,
            error: makeServiceError('network', '无法连接到 Sub2API。', {
                error: resp.error,
                response: resp.response,
            }),
        };
    }

    var statusCode = getStatusCode(resp);
    if (statusCode !== 200) {
        var errorType = statusCode === 401 ? 'secretKey' : 'api';
        return {
            ok: false,
            error: makeServiceError(errorType, '插件校验失败：HTTP ' + statusCode, resp.data),
        };
    }

    return { ok: true };
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
            error: makeServiceError('network', '请求 Sub2API 失败。', {
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
        if (choice && isPlainObject(choice.message) && typeof choice.message.content === 'string') {
            return choice.message.content.trim();
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
    var baseUrlRaw = getOptionString('baseUrl', DEFAULT_BASE_URL);
    var baseUrl = normalizeBaseUrl(baseUrlRaw);
    if (!baseUrl) {
        return {
            ok: false,
            error: makeServiceError('param', 'Base URL 格式错误，请填写 http:// 或 https:// 地址。', {
                baseUrl: baseUrlRaw,
            }),
        };
    }

    var apiKey = getOptionString('apiKey', '');
    if (!apiKey) {
        return {
            ok: false,
            error: makeServiceError('secretKey', '请先填写 Sub2API Key。'),
        };
    }

    var provider = getOptionString('provider', 'openai');
    if (provider !== 'openai' && provider !== 'gemini') {
        provider = 'openai';
    }

    var timeoutSec = parseIntegerInRange(
        getOptionString('requestTimeoutSec', String(DEFAULT_TIMEOUT_SEC)),
        DEFAULT_TIMEOUT_SEC,
        10,
        300
    );

    var temperature = parseFloatInRange(
        getOptionString('temperature', String(DEFAULT_TEMPERATURE)),
        DEFAULT_TEMPERATURE,
        0,
        1
    );

    var maxOutputTokens = parseIntegerInRange(
        getOptionString('maxOutputTokens', String(DEFAULT_MAX_OUTPUT_TOKENS)),
        DEFAULT_MAX_OUTPUT_TOKENS,
        64,
        8192
    );

    return {
        ok: true,
        baseUrl: baseUrl,
        apiKey: apiKey,
        provider: provider,
        timeoutSec: timeoutSec,
        temperature: temperature,
        maxOutputTokens: maxOutputTokens,
    };
}

function resolveModel(provider) {
    var selectedModel = getOptionString('model', provider === 'gemini' ? 'gemini-3-flash-preview' : 'gpt-5.2');

    if (selectedModel === 'custom') {
        var customModel = getOptionString('customModel', '');
        if (!customModel) {
            return {
                ok: false,
                error: makeServiceError('param', '已选择自定义模型，但“自定义模型名”为空。'),
            };
        }
        if (!isModelCompatibleWithProvider(customModel, provider)) {
            return {
                ok: false,
                error: makeServiceError(
                    'param',
                    '通道与模型不匹配：当前通道=' + provider + '，模型=' + customModel
                ),
            };
        }
        return {
            ok: true,
            name: customModel,
        };
    }

    if (!isModelCompatibleWithProvider(selectedModel, provider)) {
        return {
            ok: false,
            error: makeServiceError(
                'param',
                '通道与模型不匹配：当前通道=' + provider + '，模型=' + selectedModel
            ),
        };
    }

    return {
        ok: true,
        name: selectedModel,
    };
}

function isModelCompatibleWithProvider(modelName, provider) {
    var model = String(modelName || '').toLowerCase();
    if (!model) {
        return false;
    }

    if (provider === 'openai') {
        if (model.indexOf('gemini') === 0 || model.indexOf('claude') === 0) {
            return false;
        }
        return true;
    }

    if (provider === 'gemini') {
        return model.indexOf('gemini') === 0;
    }

    return true;
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

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function onceCompletion(completion) {
    var done = false;
    return function (payload) {
        if (done) {
            return;
        }
        done = true;
        completion(payload);
    };
}
