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

function buildTranslateResult(sourceLang, targetLang, answerText, thinkText, allowEmptyParagraphs, literalMeta) {
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

    result.content = { format: 'markdown', text: cleanAnswer };
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


module.exports = {
    splitThoughtAndAnswer: splitThoughtAndAnswer,
    buildTranslateResult: buildTranslateResult,
    mergeThinkText: mergeThinkText,
    cleanInlineText: cleanInlineText,
};
