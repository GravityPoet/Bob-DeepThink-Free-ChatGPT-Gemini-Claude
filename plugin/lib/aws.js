var urls = require('./urls.js');
var parseHttpUrl = urls.parseHttpUrl;

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

function canonicalAwsPath(path) {
    var value = path || '/';
    if (value.charAt(0) !== '/') {
        value = '/' + value;
    }
    return value
        .split('/')
        .map(function (part) {
            return awsPercentEncode(part);
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

module.exports = {
    buildAwsSigV4Headers: buildAwsSigV4Headers,
    canonicalAwsPath: canonicalAwsPath,
    canonicalAwsQuery: canonicalAwsQuery,
    decodeURIComponentSafe: decodeURIComponentSafe,
    awsPercentEncode: awsPercentEncode,
    normalizeAwsHeaderValue: normalizeAwsHeaderValue,
    toAwsAmzDate: toAwsAmzDate,
    awsSigV4SigningKey: awsSigV4SigningKey,
    hmacSha256Bytes: hmacSha256Bytes,
    sha256Hex: sha256Hex,
    sha256Bytes: sha256Bytes,
    rotr: rotr,
    utf8Bytes: utf8Bytes,
    bytesToHex: bytesToHex,
};
