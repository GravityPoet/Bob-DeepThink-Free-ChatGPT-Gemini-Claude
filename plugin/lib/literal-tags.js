// Keep source markup out of upstream thinking-tag filters, then restore it locally.
var TAGS = /<\s*\/?\s*(?:think|reasoning)(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;

function protect(text) {
    TAGS.lastIndex = 0;
    if (!TAGS.test(text)) return { text: text, meta: null };
    var salt = Math.random().toString(36).slice(2).toUpperCase() || '0';
    var prefix = 'XLT_LITERAL_' + salt + '_';
    while (text.indexOf(prefix) >= 0) { salt += 'X'; prefix = 'XLT_LITERAL_' + salt + '_'; }
    var values = [];
    TAGS.lastIndex = 0;
    var protectedText = text.replace(TAGS, function (tag) {
        values.push(tag);
        return prefix + (values.length - 1) + '__';
    });
    return { text: protectedText, meta: { prefix: prefix, values: values, pattern: new RegExp(prefix + '(\\d+)__', 'g') } };
}

function restore(text, meta, partial) {
    if (!meta) return text;
    var restored = text.replace(meta.pattern, function (marker, index) {
        return meta.values[Number(index)] === undefined ? marker : meta.values[Number(index)];
    });
    if (!partial) return restored;
    var start = restored.lastIndexOf(meta.prefix);
    if (start >= 0 && /^\d*_*$/.test(restored.slice(start + meta.prefix.length))) restored = restored.slice(0, start);
    for (var n = Math.min(meta.prefix.length - 1, restored.length); n > 0; n -= 1) {
        if (meta.prefix.slice(0, n) === restored.slice(-n)) return restored.slice(0, -n);
    }
    return restored;
}

function complete(text, meta) {
    if (!meta) return true;
    var seen = {};
    var unknown = false;
    text.replace(meta.pattern, function (marker, index) {
        if (meta.values[Number(index)] === undefined) unknown = true;
        else seen[Number(index)] = true;
        return marker;
    });
    return !unknown && meta.values.every(function (_value, index) { return seen[index] === true; }) && restore(text, meta, false).indexOf(meta.prefix) < 0;
}

module.exports = { protect: protect, restore: restore, complete: complete };
