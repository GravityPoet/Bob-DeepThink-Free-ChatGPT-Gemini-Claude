

function parseIntegerInRange(raw, defaultValue, minValue, maxValue) {
    var parsed = parseInt(raw, 10);
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
        message: redact(message || '未知错误'),
        addition: redact(toReadableAddition(addition)).slice(0, 1600),
    };
}

function redact(text) {
    var value = String(text || '');
    if (typeof $option === 'object' && $option) {
        ['apiKey', 'awsAccessKeyId', 'awsSecretAccessKey', 'awsSessionToken'].forEach(function (key) {
            var secret = $option[key];
            if (typeof secret === 'string' && secret) value = value.split(secret).join('[已隐藏]');
        });
        var base = String($option.baseUrl || '');
        base.replace(/[?&][^=&#]+=([^&#]+)/g, function (_all, encoded) {
            var secret = encoded;
            try { secret = decodeURIComponent(encoded); } catch (_error) {}
            if (secret) value = value.split(secret).join('[已隐藏]');
            if (encoded) value = value.split(encoded).join('[已隐藏]');
            return '';
        });
    }
    return value.replace(/([?&][^=&#\s]+)=([^&#\s"\\]*)/g, '$1=[已隐藏]')
        .replace(/Bearer\s+[^\s"\\]+/gi, 'Bearer [已隐藏]');
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

function onceCompletion(completion) {
    var callback = typeof completion === 'function' ? completion : function () {};
    var finish = function (payload) {
        if (finish.completed) return;
        finish.completed = true;
        callback(payload);
    };
    finish.completed = false;
    return finish;
}

module.exports = {
    parseIntegerInRange: parseIntegerInRange,
    parseMenuChoice: parseMenuChoice,
    parseMenuBoolean: parseMenuBoolean,
    clamp: clamp,
    getStatusCode: getStatusCode,
    getOptionString: getOptionString,
    makeServiceError: makeServiceError,
    normalizeErrorType: normalizeErrorType,
    toReadableAddition: toReadableAddition,
    safeJsonParse: safeJsonParse,
    isPlainObject: isPlainObject,
    onceCompletion: onceCompletion,
};
