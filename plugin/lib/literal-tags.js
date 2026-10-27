// Keep verbatim code and reserved source markup out of upstream rewriting.
var TAGS = /<\s*\/?\s*(?:think|reasoning)(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;

function protect(text) {
    var salt = Math.random().toString(36).slice(2).toUpperCase() || '0';
    var prefix = 'XLT_LITERAL_' + salt + '_';
    while (text.indexOf(prefix) >= 0) { salt += 'X'; prefix = 'XLT_LITERAL_' + salt + '_'; }
    var values = [];
    function save(value) {
        values.push(value);
        return prefix + (values.length - 1) + '__';
    }
    // Bob can deliver a single-line text fence such as
    // ```text natural language ``` (the visual line may wrap in the UI).
    // Preserve only its wrapper; the body is prose and must be translated.
    var protectedText = protectInlineTextFences(text, save);
    protectedText = protectCodeBlocks(protectedText, save);
    protectedText = protectCodeSpans(protectedText, save);
    TAGS.lastIndex = 0;
    protectedText = protectedText.replace(TAGS, save);
    if (!values.length) return { text: text, meta: null };
    return { text: protectedText, meta: { prefix: prefix, values: values, pattern: new RegExp(prefix + '(\\d+)__', 'g') } };
}

function protectInlineTextFences(text, save) {
    var pattern = /(`{3,}|~{3,})(text|txt|plain|plaintext|prose|quote)([ \t]+)([^\r\n]*?)([ \t]*)\1/gi;
    return text.replace(pattern, function (_all, fence, language, spacing, body, trailing) {
        return save(fence + language + spacing) + body + save(trailing + fence);
    });
}

function protectCodeSpans(text, save) {
    var runs = [], pattern = /`+/g, match;
    while ((match = pattern.exec(text))) runs.push({ start: match.index, width: match[0].length });
    var next = Object.create(null), i;
    for (i = runs.length - 1; i >= 0; i -= 1) {
        runs[i].closing = next[runs[i].width]; next[runs[i].width] = i;
    }
    var output = [], cursor = 0;
    for (i = 0; i < runs.length; i += 1) {
        var opening = runs[i], slashes = 0, at = opening.start - 1;
        while (at >= 0 && text.charAt(at--) === '\\') slashes += 1;
        if (slashes % 2 || opening.closing === undefined) continue;
        var closing = runs[opening.closing], end = closing.start + closing.width;
        var span = text.slice(opening.start, end);
        if (/\r?\n[ \t]*\r?\n/.test(span)) continue;
        output.push(text.slice(cursor, opening.start), save(span));
        cursor = end; i = opening.closing;
    }
    output.push(text.slice(cursor));
    return output.join('');
}

function protectCodeBlocks(text, save) {
    var lines = text.split('\n'), output = [], pending = [], fence = '';
    var translatableFence = false;
    lines.forEach(function (line) {
        if (!fence) {
            var opening = /^[ \t]*(`{3,}|~{3,})([^\r\n]*)\r?$/.exec(line);
            if (opening && (opening[1].charAt(0) !== '`' || opening[2].indexOf('`') < 0)) {
                fence = opening[1]; pending = [line];
                translatableFence = isTranslatableFence(opening[2]);
                if (translatableFence) {
                    // A text/markdown fence is a presentation wrapper, not
                    // executable code. Keep only its delimiters verbatim so
                    // the natural-language body can still be translated.
                    output.push(save(line));
                    pending = [];
                }
            } else output.push(line);
            return;
        }
        if (translatableFence) {
            var translatableClosing = /^[ \t]*(`+|~+)[ \t]*\r?$/.exec(line);
            if (translatableClosing && translatableClosing[1].charAt(0) === fence.charAt(0) && translatableClosing[1].length >= fence.length) {
                output.push(save(line));
                fence = ''; pending = []; translatableFence = false;
            } else {
                output.push(line);
            }
            return;
        }
        pending.push(line);
        var closing = /^[ \t]*(`+|~+)[ \t]*\r?$/.exec(line);
        if (closing && closing[1].charAt(0) === fence.charAt(0) && closing[1].length >= fence.length) {
            output.push(save(pending.join('\n'))); fence = ''; pending = [];
        }
    });
    if (fence && !translatableFence) output.push(save(pending.join('\n')));
    return output.join('\n');
}

function isTranslatableFence(info) {
    // `markdown`/`md` fences may contain nested code fences. Treat them as
    // literal unless the caller explicitly marks the block as plain text.
    return /^(?:text|txt|plain|plaintext|prose|quote)(?:[ \t]|$)/i.test(String(info || '').trim());
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
