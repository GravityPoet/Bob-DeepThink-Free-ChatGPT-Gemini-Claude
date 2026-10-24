

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

function supportLanguages() {
    return SUPPORTED_LANGUAGES.slice();
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

module.exports = {
    supportLanguages: supportLanguages,
    languageName: languageName,
    normalizeLanguageCode: normalizeLanguageCode,
    SUPPORTED_LANGUAGES: SUPPORTED_LANGUAGES,
    LANGUAGE_NAMES: LANGUAGE_NAMES,
};
