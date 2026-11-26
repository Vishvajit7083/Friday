import type { CognitiveLanguage, LexiconEntry } from './types';
import { DEFAULT_HINGLISH_LEXICON, ROMANIZED_HINDI_MARKERS } from './vocabularyData';

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

// Lightweight Devanagari word transliteration for common commands when Windows Hindi STT emits script.
const DEVANAGARI_PHRASE_MAP: Array<[RegExp, string]> = [
  [/फ्राइडे|फ्राईडे|फ्रायडे/g, 'friday'],
  [/क्या कर रही है/g, 'kya kar rahi hai'],
  [/क्या कर रहा है/g, 'kya kar raha hai'],
  [/खोलो|खोल दो|खोल/g, 'kholo'],
  [/मौसम/g, 'mausam'],
  [/कल का/g, 'kal ka'],
  [/कल/g, 'kal'],
  [/आज/g, 'aaj'],
  [/थोड़ा हिंदी में समझाओ|थोड़ा हिंदी में समझा/g, 'thoda hindi mein samjha'],
  [/हिंदी में/g, 'hindi mein'],
  [/समझाओ|समझा/g, 'samjha'],
  [/रुक जा|रुको/g, 'ruk ja'],
  [/चुप कर|चुप/g, 'chup'],
  [/बस कर|बस/g, 'bas kar'],
  [/रिपीट कर|दोबारा बोल/g, 'repeat kar'],
  [/कंटिन्यू कर|आगे बढ़ो/g, 'continue kar'],
  [/सेव कर/g, 'save kar'],
  [/याद रख/g, 'yaad rakh'],
  [/रिमाइंडर लगा दे|रिमाइंडर लगा/g, 'reminder laga de'],
  [/रिमाइंडर/g, 'reminder'],
  [/फोल्डर/g, 'folder'],
  [/अंदर क्या है/g, 'andar kya hai'],
  [/क्रॉम|क्रोम/g, 'chrome'],
  [/दूसरा वाला/g, 'doosra wala'],
  [/पहला वाला/g, 'pehla wala'],
  [/अरे नहीं/g, 'arey nahi'],
  [/मैंने ये नहीं बोला/g, 'maine ye nahi bola'],
  [/बताओ|बता/g, 'bata'],
  [/दिखाओ|दिखा/g, 'dikha'],
  [/चेक कर/g, 'check kar'],
  [/कैसा है/g, 'kaisa hai'],
  [/नमस्ते/g, 'namaste'],
  [/शुक्रिया|धन्यवाद/g, 'dhanyavad'],
];

export function normalizeUnicodeAndDevanagari(raw: string): string {
  let text = raw.normalize('NFKC').trim();
  if (DEVANAGARI_REGEX.test(text)) {
    for (const [pattern, replacement] of DEVANAGARI_PHRASE_MAP) {
      text = text.replace(pattern, ` ${replacement} `);
    }
  }
  return text.replace(/\s+/g, ' ').trim();
}

export function detectCognitiveLanguage(raw: string): {
  language: CognitiveLanguage;
  hindiScore: number;
  englishScore: number;
  hasDevanagari: boolean;
} {
  const hasDevanagari = DEVANAGARI_REGEX.test(raw);
  const normalized = normalizeUnicodeAndDevanagari(raw).toLowerCase();
  const tokens = normalized
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return {
      language: hasDevanagari ? 'hindi' : 'english',
      hindiScore: hasDevanagari ? 1 : 0,
      englishScore: 0,
      hasDevanagari,
    };
  }

  let hindiMarkers = 0;
  let englishMarkers = 0;

  for (const tok of tokens) {
    if (ROMANIZED_HINDI_MARKERS.has(tok)) {
      hindiMarkers += 1;
    } else if (/^[a-z]{2,}$/.test(tok)) {
      englishMarkers += 1;
    }
  }

  const hindiRatio = hindiMarkers / tokens.length;
  const englishRatio = englishMarkers / tokens.length;

  if (hasDevanagari && (englishMarkers === 0 || !/[a-zA-Z]/.test(raw))) {
    return { language: 'hindi', hindiScore: Math.max(hindiRatio, 0.8), englishScore: 0, hasDevanagari };
  }
  if (hasDevanagari && englishMarkers > 0) {
    return { language: 'mixed', hindiScore: hindiRatio, englishScore: englishRatio, hasDevanagari };
  }
  if (hindiMarkers >= 2 && englishMarkers >= 1) {
    return { language: 'hinglish', hindiScore: hindiRatio, englishScore: englishRatio, hasDevanagari };
  }
  if (hindiMarkers >= 1 && englishMarkers >= 1 && hindiRatio >= 0.2) {
    return { language: 'hinglish', hindiScore: hindiRatio, englishScore: englishRatio, hasDevanagari };
  }
  if (hindiMarkers >= 2 && englishMarkers === 0) {
    return { language: 'hinglish', hindiScore: hindiRatio, englishScore: 0, hasDevanagari };
  }
  if (hindiMarkers === 1 && tokens.length <= 3) {
    return { language: 'hinglish', hindiScore: hindiRatio, englishScore: englishRatio, hasDevanagari };
  }
  return { language: 'english', hindiScore: hindiRatio, englishScore: englishRatio, hasDevanagari };
}

export function applyLexiconCanonicalization(
  text: string,
  lexicon: LexiconEntry[] = DEFAULT_HINGLISH_LEXICON
): {
  canonicalTokens: string[];
  matchedPhrases: string[];
} {
  const lower = text.toLowerCase();
  const matchedPhrases: string[] = [];
  let working = ` ${lower} `;

  for (const entry of lexicon) {
    const candidates = [entry.phrase, ...entry.synonyms].sort((a, b) => b.length - a.length);
    for (const phrase of candidates) {
      const escaped = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(`(^|\\s)${escaped}(?=\\s|$|[?.!,])`, 'gi');
      if (rx.test(working)) {
        matchedPhrases.push(phrase);
        if (entry.kind === 'verb' || entry.kind === 'entity' || entry.kind === 'typo') {
          working = working.replace(rx, `$1${entry.canonical}`);
        }
      }
    }
  }

  const canonicalTokens = working
    .replace(/[^a-z0-9:./_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return { canonicalTokens, matchedPhrases };
}

export function isHinglishInterruptionPhrase(rawTranscript: string): boolean {
  const clean = normalizeUnicodeAndDevanagari(rawTranscript)
    .toLowerCase()
    .replace(/[.,!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return false;

  const withoutWake = clean
    .replace(/^(?:(?:hey|ok|oy|aye|sun|suno|listen)\s+)?(?:friday[,\s]+)?/, '')
    .replace(/(?:[,\s]+(?:please|plz|yaar|bhai|friday))?$/, '')
    .trim();

  const exactStopPhrases = new Set([
    'stop',
    'stop it',
    'stop now',
    'stop speaking',
    'stop talking',
    'stop reading',
    'stop voice',
    'stop audio',
    'stop playback',
    'quiet',
    'be quiet',
    'shut up',
    'hush',
    'mute',
    'mute yourself',
    'mute voice',
    'mute audio',
    'silence',
    'cancel',
    'cancel that',
    'cancel it',
    'cancel speech',
    'cancel voice',
    'abort',
    'enough',
    'never mind',
    'nevermind',
    'pause voice',
    // Hinglish & Hindi
    'ruk',
    'ruk ja',
    'ruk jao',
    'ruko',
    'chup',
    'chup kar',
    'chup karo',
    'chup ho ja',
    'chup raho',
    'bas',
    'bas kar',
    'bas karo',
    'ab bas',
    'ab bas kar',
    'shant',
    'shant ho ja',
    'band kar',
    'band karo',
    'bolna band kar',
    'bolna band karo',
    'rehnedo',
    'rehne do',
    'chhod de',
    'chhodo',
  ]);

  return exactStopPhrases.has(withoutWake);
}
