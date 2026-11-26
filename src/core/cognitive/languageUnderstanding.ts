import type {
  CognitiveTurnType,
  ExtractedEntities,
  LanguageUnderstandingResult,
  LexiconEntry,
} from './types';
import { DEFAULT_HINGLISH_LEXICON } from './vocabularyData';
import {
  applyLexiconCanonicalization,
  detectCognitiveLanguage,
  isHinglishInterruptionPhrase,
  normalizeUnicodeAndDevanagari,
} from './hinglishNlp';

export function levenshteinDistance(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const prev = new Array<number>(bl + 1);
  const curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j += 1) prev[j] = j;

  for (let i = 1; i <= al; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= bl; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bl; j += 1) prev[j] = curr[j];
  }
  return prev[bl];
}

export function stringSimilarity(a: string, b: string): number {
  const s1 = a.trim().toLowerCase();
  const s2 = b.trim().toLowerCase();
  if (!s1 && !s2) return 1;
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const maxLen = Math.max(s1.length, s2.length);
  const levScore = 1 - levenshteinDistance(s1, s2) / maxLen;

  const bigrams = (str: string) => {
    const out = new Set<string>();
    for (let i = 0; i < str.length - 1; i += 1) {
      out.add(str.slice(i, i + 2));
    }
    return out;
  };
  const b1 = bigrams(s1);
  const b2 = bigrams(s2);
  let overlap = 0;
  for (const bg of b1) {
    if (b2.has(bg)) overlap += 1;
  }
  const diceScore = b1.size + b2.size > 0 ? (2 * overlap) / (b1.size + b2.size) : levScore;
  return Number((levScore * 0.55 + diceScore * 0.45).toFixed(4));
}

export function phraseTokenOverlap(a: string, b: string): number {
  const t1 = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const t2 = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (t1.size === 0 || t2.size === 0) return 0;
  let shared = 0;
  for (const tok of t1) {
    if (t2.has(tok)) shared += 1;
    else {
      for (const other of t2) {
        if (tok.length >= 4 && other.length >= 4 && levenshteinDistance(tok, other) <= 1) {
          shared += 0.8;
          break;
        }
      }
    }
  }
  return shared / Math.max(t1.size, t2.size);
}

const KNOWN_COMMAND_VOCAB = [
  'chrome',
  'vscode',
  'terminal',
  'explorer',
  'notepad',
  'calculator',
  'spotify',
  'whatsapp',
  'weather',
  'forecast',
  'reminder',
  'calendar',
  'meeting',
  'folder',
  'downloads',
  'documents',
  'desktop',
  'project',
  'performance',
  'battery',
  'memory',
  'storage',
  'repeat',
  'continue',
  'explain',
  'hindi',
  'english',
  'hinglish',
  'volume',
  'music',
  'search',
  'friday',
  'organize',
  'delete',
  'schedule',
  'kholo',
  'batao',
  'dikhao',
  'samjhao',
  'mausam',
];

const APP_ALIAS_MAP: Array<[RegExp, string]> = [
  [/\b(?:google\s+chrome|chrome|crom|crome|chorme)\b/i, 'chrome'],
  [/\b(?:vs\s*code|vscode|visual\s+studio(?:\s+code)?)\b/i, 'vscode'],
  [/\b(?:microsoft\s+edge|msedge|edge)\b/i, 'msedge'],
  [/\b(?:windows\s+terminal|terminal|wt)\b/i, 'wt'],
  [/\b(?:powershell)\b/i, 'powershell'],
  [/\b(?:command\s+prompt|cmd)\b/i, 'cmd'],
  [/\b(?:file\s+explorer|explorer)\b/i, 'explorer'],
  [/\b(?:notepad|notes\s+app)\b/i, 'notepad'],
  [/\b(?:calculator|calc)\b/i, 'calc'],
  [/\b(?:spotify|music\s+player)\b/i, 'spotify'],
  [/\b(?:whatsapp)\b/i, 'whatsapp'],
  [/\b(?:android\s+studio|studio64)\b/i, 'studio64'],
  [/\b(?:task\s+manager|taskmgr)\b/i, 'taskmgr'],
  [/\b(?:windows\s+settings|settings)\b/i, 'windows settings'],
  [/\b(?:paint|mspaint)\b/i, 'mspaint'],
  [/\b(?:vlc)\b/i, 'vlc'],
];

const FOLDER_ALIAS_MAP: Array<[RegExp, string]> = [
  [/\b(?:downloads?)\b/i, 'downloads'],
  [/\b(?:documents?)\b/i, 'documents'],
  [/\b(?:desktop)\b/i, 'desktop'],
  [/\b(?:pictures?|photos?)\b/i, 'pictures'],
  [/\b(?:videos?)\b/i, 'videos'],
  [/\b(?:music)\b/i, 'music'],
  [/\b(?:my\s+project\s+folder|project\s+folder|project)\b/i, 'project'],
];

export function correctSpellingAndAsrTypos(
  text: string,
  lexicon: LexiconEntry[] = DEFAULT_HINGLISH_LEXICON
): {
  corrected: string;
  corrections: Array<{ from: string; to: string }>;
} {
  const corrections: Array<{ from: string; to: string }> = [];
  const words = text.split(/\s+/).filter(Boolean);

  // Build explicit typo map from lexicon
  const explicitTypos = new Map<string, string>();
  for (const entry of lexicon) {
    if (entry.kind === 'typo') {
      explicitTypos.set(entry.phrase.toLowerCase(), entry.canonical.toLowerCase());
      for (const syn of entry.synonyms) {
        explicitTypos.set(syn.toLowerCase(), entry.canonical.toLowerCase());
      }
    }
  }

  const fixedWords = words.map((rawWord) => {
    const match = rawWord.match(/^([^a-zA-Z0-9]*)([a-zA-Z0-9._:-]+)([^a-zA-Z0-9]*)$/);
    if (!match) return rawWord;
    const [, prefix, core, suffix] = match;
    const lower = core.toLowerCase();

    if (explicitTypos.has(lower)) {
      const to = explicitTypos.get(lower)!;
      if (to !== lower) corrections.push({ from: core, to });
      return `${prefix}${to}${suffix}`;
    }

    // Do not touch URLs, numbers, or short words
    if (lower.length < 5 || /\d/.test(lower) || lower.includes('.')) {
      return rawWord;
    }

    if (KNOWN_COMMAND_VOCAB.includes(lower)) return rawWord;

    let bestTarget = '';
    let bestDist = Infinity;
    for (const candidate of KNOWN_COMMAND_VOCAB) {
      if (Math.abs(candidate.length - lower.length) > 2) continue;
      const dist = levenshteinDistance(lower, candidate);
      const maxAllowed = lower.length >= 7 ? 2 : 1;
      if (dist <= maxAllowed && dist < bestDist) {
        bestDist = dist;
        bestTarget = candidate;
      }
    }

    if (bestTarget && bestTarget !== lower) {
      corrections.push({ from: core, to: bestTarget });
      return `${prefix}${bestTarget}${suffix}`;
    }
    return rawWord;
  });

  return {
    corrected: fixedWords.join(' ').trim(),
    corrections,
  };
}

export function extractCognitiveEntities(text: string): ExtractedEntities {
  const entities: ExtractedEntities = { numbers: [] };
  const numberMatches = text.match(/\b\d+(?:\.\d+)?\b/g);
  if (numberMatches) {
    entities.numbers = numberMatches.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  }

  const urlMatch = text.match(/https?:\/\/\S+/i);
  if (urlMatch) {
    entities.url = urlMatch[0].replace(/[.,!?]+$/, '');
  }

  for (const [rx, appId] of APP_ALIAS_MAP) {
    if (rx.test(text)) {
      entities.app = appId;
      break;
    }
  }

  for (const [rx, folderName] of FOLDER_ALIAS_MAP) {
    if (rx.test(text)) {
      entities.folder = folderName;
      break;
    }
  }

  // Date hints (English + Hinglish)
  if (/\b(?:tomorrow|aane\s+wale\s+kal)\b/i.test(text)) {
    entities.dateHint = 'tomorrow';
  } else if (/\b(?:yesterday|beete\s+kal|discussed\s+yesterday|discuss\s+kiya\s+tha)\b/i.test(text)) {
    entities.dateHint = 'yesterday';
  } else if (/\bkal\b/i.test(text)) {
    // Disambiguate "kal": past action vs upcoming weather/meeting
    if (/\b(tha|thi|the|kiya|downloaded|discussed|bola)\b/i.test(text)) {
      entities.dateHint = 'yesterday';
    } else {
      entities.dateHint = 'tomorrow';
    }
  } else if (/\b(?:today|aaj|abhi)\b/i.test(text)) {
    entities.dateHint = 'today';
  }

  const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|(?:subah|shaam|raat|dopahar)\s*\d{1,2}(?::\d{2})?)\b/i);
  if (timeMatch) {
    entities.timeHint = timeMatch[1].trim();
  }

  // Location extraction for weather
  const locMatch =
    text.match(/\b(?:weather|mausam|temperature|forecast)\s+(?:in|at|for|of|ka|ki|mein)\s+([a-zA-Z\s,]{2,45})/i) ||
    text.match(/\b([a-zA-Z]{3,25})\s+(?:ka|ki)\s+(?:weather|mausam)\b/i);
  if (locMatch && locMatch[1]) {
    const candidate = locMatch[1].replace(/\b(check|kar|karo|bata|batao|kaisa|hai|today|aaj|kal)\b/gi, '').trim();
    if (candidate.length >= 2) entities.location = candidate;
  }

  // Ordinal choice ("doosra wala", "second one", "first one")
  if (/\b(?:pehla|pahla|first)\s*(?:wala|one|option)?\b/i.test(text)) {
    entities.ordinalChoice = 1;
  } else if (/\b(?:doosra|dusra|second|next)\s*(?:wala|one|option)?\b/i.test(text)) {
    entities.ordinalChoice = 2;
  } else if (/\b(?:teesra|tisra|third)\s*(?:wala|one|option)?\b/i.test(text)) {
    entities.ordinalChoice = 3;
  }

  // Teachable custom intent: "when I say X, do Y" or "jab main X bolu, toh Y kar"
  const teachEn = text.match(
    /(?:when\s+i\s+say|whenever\s+i\s+say|if\s+i\s+say)\s+["']?([^"',]+?)["']?(?:,|\s+then\s+|\s+do\s+|\s+please\s+)(.+)$/i
  );
  const teachHi = text.match(
    /(?:jab\s+main|agar\s+main)\s+["']?([^"',]+?)["']?\s+(?:bolu|bolun|kahun|kahu)(?:,|\s+toh?|\s+tab)?\s+(.+)$/i
  );
  const teachMatch = teachEn || teachHi;
  if (teachMatch) {
    entities.customPhrase = teachMatch[1].trim();
    entities.customActionsText = teachMatch[2].trim();
  }

  // Topic hint (e.g., "kal jo project discuss kiya tha")
  const topicMatch = text.match(/\b(?:about|on|regarding|project|topic)\s+([a-zA-Z0-9_-]{2,30})/i);
  if (topicMatch) {
    entities.topic = topicMatch[1].trim();
  }

  return entities;
}

export function understandUserInput(
  rawInput: string,
  lexicon: LexiconEntry[] = DEFAULT_HINGLISH_LEXICON
): LanguageUnderstandingResult {
  const normalizedInput = normalizeUnicodeAndDevanagari(rawInput)
    .replace(/^(?:(?:hey|ok|oy|sun|suno)[,\s]+)?(?:friday[,\s]*)/i, '')
    .trim() || normalizeUnicodeAndDevanagari(rawInput);

  const langMeta = detectCognitiveLanguage(rawInput);
  const { corrected, corrections } = correctSpellingAndAsrTypos(normalizedInput, lexicon);
  const { canonicalTokens } = applyLexiconCanonicalization(corrected, lexicon);
  const entities = extractCognitiveEntities(corrected);
  const lower = corrected.toLowerCase();

  const isInterruption = isHinglishInterruptionPhrase(rawInput);
  const isRepeatRequest =
    /\b(?:repeat|say\s+that\s+again|dobara\s+bol|phir\s+se\s+bol|fir\s+se\s+bol|last\s+mein\s+bola|wo\s+repeat)\b/i.test(
      lower
    );
  const isHindiSimplifyRequest =
    /\b(?:hindi\s+mein|in\s+hindi|simple\s+hindi|thoda\s+hindi)\b.*\b(?:samjha|samjhao|explain|bata|batao|bol|bolo)\b|\b(?:samjha|explain)\b.*\b(?:hindi\s+mein|in\s+hindi)\b/i.test(
      lower
    );
  const isCorrection =
    /\b(?:arey\s+nahi|arre\s+nahi|maine\s+ye\s+nahi\s+bola|galat\s+samjhi|not\s+that|no,\s*open|i\s+meant|ye\s+nahi)\b/i.test(
      lower
    );
  const isContinueRequest =
    /\b(?:continue|continue\s+kar|continue\s+karo|resume|aage\s+badh|aage\s+badho|usko\s+continue)\b/i.test(lower);
  const isSaveReferenceRequest =
    /\b(?:isko\s+save|save\s+this|save\s+it|save\s+kar|yaad\s+rakh)\b/i.test(lower);
  const isOrdinalSelectRequest =
    typeof entities.ordinalChoice === 'number' &&
    /\b(?:wala|option|one|doosra|dusra|pehla|teesra|second|first|third)\b/i.test(lower);

  const isTeachIntent = Boolean(entities.customPhrase && entities.customActionsText);
  const isGreeting =
    /^(?:h+i+|h+e+l+o+|h+e+y+|hlo+|namaste|namaskar|good\s+(?:morning|afternoon|evening)|kya\s+kar\s+r(?:aha|ahi)\s+hai|kya\s+haal\s+hai|how\s+are\s+you|kaise\s+ho)\b/i.test(
      lower
    );
  const isQuestion =
    rawInput.trim().endsWith('?') ||
    /^(?:what|who|where|when|why|how|explain|define|kya|kaun|kahan|kab|kyun|kyon|kaise|kitna)\b/i.test(lower) ||
    /\b(?:kya\s+hai|kya\s+hota\s+hai|kya\s+kar\s+rahi|kaisa\s+hai|andar\s+kya\s+hai|samjhao|samjha\s+do)\b/i.test(lower);
  const isCommand =
    canonicalTokens.some((t) => ['open', 'close', 'set', 'save', 'find', 'show', 'repeat', 'continue'].includes(t)) ||
    /\b(?:open|close|launch|start|create|organize|delete|schedule|remind|laga|kholo|bata|dikha|samjha)\b/i.test(lower);

  const isFollowUp =
    isRepeatRequest ||
    isHindiSimplifyRequest ||
    isContinueRequest ||
    isSaveReferenceRequest ||
    isOrdinalSelectRequest ||
    /\b(?:isko|usko|ise|use|this\s+folder|is\s+folder|wo|that)\b/i.test(lower);

  let turnTypeHint: CognitiveTurnType = 'question';
  if (isInterruption) turnTypeHint = 'interruption';
  else if (isTeachIntent) turnTypeHint = 'teach_intent';
  else if (isCorrection) turnTypeHint = 'correction';
  else if (isGreeting) turnTypeHint = 'greeting';
  else if (isFollowUp) turnTypeHint = 'continuation';
  else if (isCommand) turnTypeHint = 'command';

  const confidence = Math.min(
    0.98,
    Math.max(0.45, 0.72 + (entities.app ? 0.12 : 0) + (entities.folder ? 0.08 : 0) - corrections.length * 0.04)
  );

  return {
    rawInput,
    normalizedInput,
    correctedInput: corrected,
    spellingCorrections: corrections,
    detectedLanguage: langMeta.language,
    confidence: Number(confidence.toFixed(2)),
    tokens: corrected.toLowerCase().split(/\s+/).filter(Boolean),
    canonicalTokens,
    entities,
    turnTypeHint,
    isQuestion,
    isCommand,
    isFollowUp,
    isRepeatRequest,
    isHindiSimplifyRequest,
    isCorrection,
    isContinueRequest,
    isSaveReferenceRequest,
    isOrdinalSelectRequest,
  };
}
