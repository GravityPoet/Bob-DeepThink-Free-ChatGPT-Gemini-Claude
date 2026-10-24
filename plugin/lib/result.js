

var THINK_BLOCK_REGEXP = /<\s*(reasoning|think)\b[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi;
var THINK_OPEN_REGEXP = /<\s*(reasoning|think)\b[^>]*>/gi;
var THINK_CLOSE_REGEXP = /<\s*\/\s*(reasoning|think)\s*>/gi;

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
