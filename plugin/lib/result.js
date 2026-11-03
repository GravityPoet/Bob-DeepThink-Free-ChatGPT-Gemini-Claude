var literalTags = require('./literal-tags.js');

// Legacy thinking wrappers are metadata only at the beginning of a response.
// Tags in source documents, inline text or fenced code remain literal content.
function splitThoughtAndAnswer(rawText, sourceText) {
    var remaining = cleanInlineText(rawText);
    if (!remaining) return { answerText: '', thinkText: '' };
    if (typeof sourceText === 'string' && /^\s*<\s*(think|reasoning)(?=[\s/>])/i.test(sourceText)) {
        return { answerText: remaining, thinkText: '' };
    }
    var thoughts = [];
    while (remaining) {
        var opening = /^<\s*(think|reasoning)(?=[\s/>])[^>]*>/i.exec(remaining);
        if (!opening) {
            if (remaining.charAt(0) === '<') {
                var compact = remaining.toLowerCase().replace(/\s/g, '');
                if ('<think'.indexOf(compact) === 0 || '<reasoning'.indexOf(compact) === 0 || /^<\s*(think|reasoning)(?=[\s/>])[^>]*$/i.test(remaining)) {
                    return { answerText: '', thinkText: cleanInlineText(thoughts.join('\n\n')) };
                }
            }
            break;
        }
        var tail = remaining.slice(opening[0].length);
        var closing = new RegExp('<\\s*\\/\\s*' + opening[1] + '\\s*>', 'i').exec(tail);
        if (!closing) {
            if (cleanInlineText(tail)) thoughts.push(cleanInlineText(tail));
            return { answerText: '', thinkText: cleanInlineText(thoughts.join('\n\n')) };
        }
        var thought = cleanInlineText(tail.slice(0, closing.index));
        if (thought) thoughts.push(thought);
        remaining = cleanInlineText(tail.slice(closing.index + closing[0].length));
    }
    return { answerText: remaining, thinkText: cleanInlineText(thoughts.join('\n\n')) };
}

function buildTranslateResult(sourceLang, targetLang, answerText, thinkText, allowEmptyParagraphs, literalMeta, format) {
    var result = {
        from: sourceLang,
        to: targetLang,
        toParagraphs: [],
    };

    var cleanAnswer = literalTags.restore(cleanInlineText(answerText), literalMeta, allowEmptyParagraphs);
    if (cleanAnswer) {
        result.toParagraphs = [cleanAnswer];
    } else if (!allowEmptyParagraphs) {
        result.toParagraphs = [''];
    }

    result.content = { format: format === 'markdown' ? 'markdown' : 'plain', text: cleanAnswer };
    var cleanThink = cleanInlineText(thinkText);
    if (cleanThink) {
        result.thinkInfo = {
            content: cleanThink,
        };
    }

    return result;
}

function stripUnrequestedBold(text, sourceHasBold) {
    if (sourceHasBold || typeof text !== 'string') return text;
    // The source had no bold marker. Remove a model-added paired `**...**`
    // wrapper before Bob sees the result, so it cannot become unexpected bold
    // in Markdown mode or visible asterisks in plain mode. Code is protected
    // by literal-tags before this function runs.
    return text
        .replace(/(^|[^\w])\*\*(?=\S)([^\n]*?\S)\*\*/g, '$1$2')
        .replace(/(^|[^\w])__(?=\S)(?=[^_\n]*(?:\s|[^\x00-\x7F]))([^\n]*?\S)__(?=$|[^\w])/g, '$1$2');
}

function stripUnrequestedMarkup(text, sourceHasMarkup) {
    if (sourceHasMarkup || typeof text !== 'string') return text;
    // Models sometimes wrap ordinary OCR-like text in HTML controls (for
    // example <button>上一页</button>). When the source had no markup, these
    // tags are generated presentation noise. Keep literal source HTML
    // protected by literal-tags.js and preserve the text between the tags.
    var lines = text.split('\n');
    var fence = '';
    var output = [];
    lines.forEach(function (line) {
        if (!fence) {
            var opening = /^[ \t]*(`{3,}|~{3,})[^\r\n]*$/.exec(line);
            if (opening) {
                fence = opening[1];
                output.push(line);
                return;
            }
            output.push(stripMarkupLine(line));
            return;
        }
        output.push(line);
        var closing = /^[ \t]*(`+|~+)[ \t]*$/.exec(line);
        if (closing && closing[1].charAt(0) === fence.charAt(0) && closing[1].length >= fence.length) fence = '';
    });
    return output.join('\n').replace(/\n{3,}/g, '\n\n');
}

function stripMarkupLine(line) {
    var literals = [];
    var safe = String(line || '').replace(/(`+)([^`\r\n]*?)\1/g, function (whole) {
        literals.push(whole);
        return 'XLT_INLINE_LITERAL_' + (literals.length - 1) + '_';
    });
    safe = safe
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\s*\/?\s*(?:br|hr)\s*\/?>/gi, '\n')
        .replace(/<\s*\/?\s*(?:p|div|section|article|header|footer|main|aside|nav|ul|ol|li|table|thead|tbody|tfoot|tr|h[1-6])\b[^>]*>/gi, '\n')
        .replace(/<\s*\/?\s*(?!think(?:[\s/>])|reasoning(?:[\s/>])|XLT_LITERAL_)[a-z][^>]*>/gi, '');
    return safe.replace(/XLT_INLINE_LITERAL_(\d+)_/g, function (whole, index) {
        return literals[Number(index)] === undefined ? whole : literals[Number(index)];
    });
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


module.exports = {
    splitThoughtAndAnswer: splitThoughtAndAnswer,
    buildTranslateResult: buildTranslateResult,
    stripUnrequestedBold: stripUnrequestedBold,
    stripUnrequestedMarkup: stripUnrequestedMarkup,
    mergeThinkText: mergeThinkText,
    cleanInlineText: cleanInlineText,
};
