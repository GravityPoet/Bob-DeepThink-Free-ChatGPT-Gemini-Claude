var util = require('./util.js');
var getOptionString = util.getOptionString;
var makeServiceError = util.makeServiceError;
var parseIntegerInRange = util.parseIntegerInRange;
var parseMenuBoolean = util.parseMenuBoolean;
var parseMenuChoice = util.parseMenuChoice;
var urls = require('./urls.js');
var buildBedrockMantleBaseUrl = urls.buildBedrockMantleBaseUrl;
var buildBedrockRuntimeBaseUrl = urls.buildBedrockRuntimeBaseUrl;
var buildBedrockRuntimeOpenAiBaseUrl = urls.buildBedrockRuntimeOpenAiBaseUrl;
var isCerebrasBaseUrl = urls.isCerebrasBaseUrl;
var isCompleteEndpoint = urls.isCompleteEndpoint;
var isDefaultSub2ApiUrl = urls.isDefaultSub2ApiUrl;
var normalizeBaseUrl = urls.normalizeBaseUrl;
var normalizeRegion = urls.normalizeRegion;

var DEFAULT_BASE_URL = 'http://127.0.0.1:18080/v1';
var DEFAULT_TIMEOUT_SEC = 90;
var DEFAULT_MAX_OUTPUT_TOKENS = 4096;
var DEFAULT_REASONING_EFFORT = 'none';
var DEFAULT_STREAM_OUTPUT = true;
var DEFAULT_API_MODE = 'chat_completions';
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
    aws_converse: true,
    anthropic_messages: true,
};

function buildRuntimeConfig() {
    var awsIamProfile = isAwsIamProfile();
    var apiKey = getOptionString('apiKey', '');
    var provider = awsIamProfile ? 'bedrock' : getOptionString('provider', 'openai');
    if (provider !== 'openai' && provider !== 'gemini' && provider !== 'bedrock' && provider !== 'custom') {
        provider = 'custom';
    }
    var apiMode = parseMenuChoice('apiMode', awsIamProfile ? 'aws_converse' : DEFAULT_API_MODE, API_MODE_VALUES);
    var bedrockRegion = normalizeRegion(getOptionString('bedrockRegion', DEFAULT_BEDROCK_REGION));
    var awsAccessKeyId = getOptionString('awsAccessKeyId', '');
    var awsSecretAccessKey = getOptionString('awsSecretAccessKey', '');
    var awsSessionToken = getOptionString('awsSessionToken', '');
    var hasAnyAwsCredential = !!(awsAccessKeyId || awsSecretAccessKey || awsSessionToken);
    var authMode = 'bearer';

    if (awsIamProfile && !hasAnyAwsCredential) {
        return { ok: false, error: makeServiceError('secretKey', '请填写 AWS Access Key ID 和 Secret Access Key。') };
    }

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
    if (provider === 'bedrock' && authMode === 'aws_sigv4' && apiMode === 'aws_converse' && isDefaultSub2ApiUrl(baseUrlRaw)) {
        baseUrlRaw = buildBedrockRuntimeBaseUrl(bedrockRegion);
    } else if (provider === 'bedrock' && authMode === 'aws_sigv4' && isDefaultSub2ApiUrl(baseUrlRaw)) {
        baseUrlRaw = buildBedrockRuntimeOpenAiBaseUrl(bedrockRegion);
    } else if (provider === 'bedrock' && isDefaultSub2ApiUrl(baseUrlRaw)) {
        baseUrlRaw = buildBedrockMantleBaseUrl(bedrockRegion);
    }

    // A complete endpoint is authoritative; keep the saved selectors unchanged.
    apiMode = urls.endpointMode(baseUrlRaw) || apiMode;

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
        65536
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
    var selectedModel = getOptionString('model', isAwsIamProfile() ? 'custom' : 'gpt-5.2');

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

function isAwsIamProfile() {
    return typeof $info === 'object' && $info !== null && $info.identifier === 'io.github.gravitypoet.bobdeepthink.awsiam';
}

module.exports = {
    buildRuntimeConfig: buildRuntimeConfig,
    resolveModel: resolveModel,
    DEFAULT_TIMEOUT_SEC: DEFAULT_TIMEOUT_SEC,
};
