export type SupportedTranslationLanguage = 'en' | 'hi' | 'mr';

export interface TranslationResult {
  sourceText: string;
  sourceLang: SupportedTranslationLanguage | 'auto';
  targetLang: SupportedTranslationLanguage;
  translatedText: string;
  romanized?: string;
  method: 'offline-dictionary' | 'word-by-word-fallback';
  exactPhraseMatch: boolean;
  explanation: string;
}

interface PhraseEntry {
  en: string;
  hi: string;
  hiRoman: string;
  mr: string;
  mrRoman: string;
}

const PHRASE_BOOK: PhraseEntry[] = [
  {
    en: 'hello',
    hi: 'नमस्ते',
    hiRoman: 'Namaste',
    mr: 'नमस्कार',
    mrRoman: 'Namaskar',
  },
  {
    en: 'hi',
    hi: 'नमस्ते',
    hiRoman: 'Namaste',
    mr: 'नमस्कार',
    mrRoman: 'Namaskar',
  },
  {
    en: 'good morning',
    hi: 'सुप्रभात',
    hiRoman: 'Suprabhat',
    mr: 'शुभ सकाळ',
    mrRoman: 'Shubh Sakal',
  },
  {
    en: 'good afternoon',
    hi: 'शुभ दोपहर',
    hiRoman: 'Shubh Dopahar',
    mr: 'शुभ दुपार',
    mrRoman: 'Shubh Dupar',
  },
  {
    en: 'good evening',
    hi: 'शुभ संध्या',
    hiRoman: 'Shubh Sandhya',
    mr: 'शुभ संध्याकाळ',
    mrRoman: 'Shubh Sandhyakal',
  },
  {
    en: 'good night',
    hi: 'शुभ रात्रि',
    hiRoman: 'Shubh Ratri',
    mr: 'शुभ रात्री',
    mrRoman: 'Shubh Ratri',
  },
  {
    en: 'how are you',
    hi: 'आप कैसे हैं?',
    hiRoman: 'Aap kaise hain?',
    mr: 'तुम्ही कसे आहात?',
    mrRoman: 'Tumhi kase aahat?',
  },
  {
    en: 'i am fine',
    hi: 'मैं ठीक हूँ',
    hiRoman: 'Main theek hoon',
    mr: 'मी ठीक आहे',
    mrRoman: 'Mi theek aahe',
  },
  {
    en: 'thank you',
    hi: 'धन्यवाद',
    hiRoman: 'Dhanyavaad',
    mr: 'धन्यवाद',
    mrRoman: 'Dhanyavaad',
  },
  {
    en: 'thanks',
    hi: 'धन्यवाद',
    hiRoman: 'Dhanyavaad',
    mr: 'आभार',
    mrRoman: 'Aabhar',
  },
  {
    en: 'please',
    hi: 'कृपया',
    hiRoman: 'Kripaya',
    mr: 'कृपया',
    mrRoman: 'Krupaya',
  },
  {
    en: 'sorry',
    hi: 'माफ़ कीजिए',
    hiRoman: 'Maaf kijiye',
    mr: 'माफ करा',
    mrRoman: 'Maaf kara',
  },
  {
    en: 'yes',
    hi: 'हाँ',
    hiRoman: 'Haan',
    mr: 'हो',
    mrRoman: 'Ho',
  },
  {
    en: 'no',
    hi: 'नहीं',
    hiRoman: 'Nahin',
    mr: 'नाही',
    mrRoman: 'Nahi',
  },
  {
    en: 'what is your name',
    hi: 'आपका नाम क्या है?',
    hiRoman: 'Aapka naam kya hai?',
    mr: 'तुमचे नाव काय आहे?',
    mrRoman: 'Tumche naav kaay aahe?',
  },
  {
    en: 'my name is',
    hi: 'मेरा नाम है',
    hiRoman: 'Mera naam hai',
    mr: 'माझे नाव आहे',
    mrRoman: 'Majhe naav aahe',
  },
  {
    en: 'help me',
    hi: 'मेरी मदद कीजिए',
    hiRoman: 'Meri madad kijiye',
    mr: 'मला मदत करा',
    mrRoman: 'Mala madat kara',
  },
  {
    en: 'what time is it',
    hi: 'अभी क्या समय हुआ है?',
    hiRoman: 'Abhi kya samay hua hai?',
    mr: 'आता किती वाजले आहेत?',
    mrRoman: 'Aata kiti vajle aahet?',
  },
  {
    en: 'today',
    hi: 'आज',
    hiRoman: 'Aaj',
    mr: 'आज',
    mrRoman: 'Aaj',
  },
  {
    en: 'tomorrow',
    hi: 'कल',
    hiRoman: 'Kal',
    mr: 'उद्या',
    mrRoman: 'Udya',
  },
  {
    en: 'yesterday',
    hi: 'कल (बीता हुआ)',
    hiRoman: 'Kal',
    mr: 'काल',
    mrRoman: 'Kaal',
  },
  {
    en: 'open',
    hi: 'खोलें',
    hiRoman: 'Kholen',
    mr: 'उघडा',
    mrRoman: 'Ughda',
  },
  {
    en: 'close',
    hi: 'बंद करें',
    hiRoman: 'Band karen',
    mr: 'बंद करा',
    mrRoman: 'Band kara',
  },
  {
    en: 'battery',
    hi: 'बैटरी',
    hiRoman: 'Battery',
    mr: 'बॅटरी',
    mrRoman: 'Battery',
  },
  {
    en: 'water',
    hi: 'पानी',
    hiRoman: 'Paani',
    mr: 'पाणी',
    mrRoman: 'Paani',
  },
  {
    en: 'food',
    hi: 'खाना',
    hiRoman: 'Khaana',
    mr: 'जेवण',
    mrRoman: 'Jevan',
  },
  {
    en: 'study',
    hi: 'पढ़ाई',
    hiRoman: 'Padhai',
    mr: 'अभ्यास',
    mrRoman: 'Abhyas',
  },
  {
    en: 'work',
    hi: 'काम',
    hiRoman: 'Kaam',
    mr: 'काम',
    mrRoman: 'Kaam',
  },
  {
    en: 'friend',
    hi: 'दोस्त',
    hiRoman: 'Dost',
    mr: 'मित्र',
    mrRoman: 'Mitra',
  },
  {
    en: 'home',
    hi: 'घर',
    hiRoman: 'Ghar',
    mr: 'घर',
    mrRoman: 'Ghar',
  },
  {
    en: 'welcome',
    hi: 'स्वागत है',
    hiRoman: 'Swagat hai',
    mr: 'स्वागत आहे',
    mrRoman: 'Swagat aahe',
  },
  {
    en: 'i love you',
    hi: 'मैं तुमसे प्यार करता हूँ',
    hiRoman: 'Main tumse pyaar karta hoon',
    mr: 'माझे तुझ्यावर प्रेम आहे',
    mrRoman: 'Majhe tujhyavar prem aahe',
  },
  {
    en: 'everything is fine',
    hi: 'सब कुछ ठीक है',
    hiRoman: 'Sab kuch theek hai',
    mr: 'सर्व काही ठीक आहे',
    mrRoman: 'Sarva kahi theek aahe',
  },
];

const WORD_DICTIONARY: Record<string, { hi: string; mr: string }> = {
  i: { hi: 'मैं', mr: 'मी' },
  you: { hi: 'आप', mr: 'तुम्ही' },
  we: { hi: 'हम', mr: 'आम्ही' },
  my: { hi: 'मेरा', mr: 'माझे' },
  your: { hi: 'आपका', mr: 'तुमचे' },
  is: { hi: 'है', mr: 'आहे' },
  are: { hi: 'हैं', mr: 'आहेत' },
  good: { hi: 'अच्छा', mr: 'चांगले' },
  bad: { hi: 'बुरा', mr: 'वाईट' },
  day: { hi: 'दिन', mr: 'दिवस' },
  night: { hi: 'रात', mr: 'रात्र' },
  morning: { hi: 'सुबह', mr: 'सकाळ' },
  evening: { hi: 'शाम', mr: 'संध्याकाळ' },
  name: { hi: 'नाम', mr: 'नाव' },
  time: { hi: 'समय', mr: 'वेळ' },
  help: { hi: 'मदद', mr: 'मदत' },
  book: { hi: 'किताब', mr: 'पुस्तक' },
  phone: { hi: 'फ़ोन', mr: 'फोन' },
  computer: { hi: 'कंप्यूटर', mr: 'संगणक' },
  assistant: { hi: 'सहायक', mr: 'सहाय्यक' },
  reminder: { hi: 'रिमाइंडर', mr: 'आठवण' },
  note: { hi: 'नोट', mr: 'नोंद' },
  music: { hi: 'संगीत', mr: 'संगीत' },
  weather: { hi: 'मौसम', mr: 'हवामान' },
  hot: { hi: 'गर्म', mr: 'गरम' },
  cold: { hi: 'ठंडा', mr: 'थंड' },
  fast: { hi: 'तेज़', mr: 'वेगवान' },
  now: { hi: 'अभी', mr: 'आता' },
  here: { hi: 'यहाँ', mr: 'येथे' },
  there: { hi: 'वहाँ', mr: 'तेथे' },
  all: { hi: 'सभी', mr: 'सर्व' },
  ready: { hi: 'तैयार', mr: 'तयार' },
};

function parseLanguageToken(token: string): SupportedTranslationLanguage | null {
  const lower = token.trim().toLowerCase();
  if (lower === 'english' || lower === 'en') return 'en';
  if (lower === 'hindi' || lower === 'hi') return 'hi';
  if (lower === 'marathi' || lower === 'mr') return 'mr';
  return null;
}

function getLangDisplayName(lang: SupportedTranslationLanguage): string {
  if (lang === 'mr') return 'Marathi';
  if (lang === 'hi') return 'Hindi';
  return 'English';
}

export function tryTranslateCommand(rawCommand: string): TranslationResult | null {
  const cleaned = rawCommand
    .trim()
    .replace(/^(?:hey\s+friday[,\s]+|friday[,\s]+)?(?:please\s+)?/i, '')
    .trim();

  const match = cleaned.match(
    /^(?:translate|say|how\s+do\s+you\s+say|convert)\s+["'“]?(.+?)["'”]?\s+(?:to|into|in)\s+(english|hindi|marathi|en|hi|mr)[?.!]*$/i
  );
  if (!match) return null;

  const sourceText = match[1].trim();
  const targetLang = parseLanguageToken(match[2]);
  if (!sourceText || !targetLang) return null;

  return translateText(sourceText, targetLang);
}

export function translateText(
  sourceText: string,
  targetLang: SupportedTranslationLanguage
): TranslationResult {
  const normalized = sourceText.trim().toLowerCase().replace(/[?.!,]+$/g, '');

  // Check exact match from English, Hindi, or Marathi phrasebook
  for (const entry of PHRASE_BOOK) {
    const matchesEn = entry.en === normalized;
    const matchesHi = entry.hi === sourceText.trim() || entry.hiRoman.toLowerCase() === normalized;
    const matchesMr = entry.mr === sourceText.trim() || entry.mrRoman.toLowerCase() === normalized;

    if (matchesEn || matchesHi || matchesMr) {
      const translatedText =
        targetLang === 'en' ? entry.en : targetLang === 'hi' ? entry.hi : entry.mr;
      const romanized =
        targetLang === 'en' ? undefined : targetLang === 'hi' ? entry.hiRoman : entry.mrRoman;
      const sourceLang: SupportedTranslationLanguage = matchesEn ? 'en' : matchesHi ? 'hi' : 'mr';
      const label = getLangDisplayName(targetLang);

      return {
        sourceText,
        sourceLang,
        targetLang,
        translatedText,
        romanized,
        method: 'offline-dictionary',
        exactPhraseMatch: true,
        explanation: `"${sourceText}" in ${label}: ${translatedText}${romanized ? ` (${romanized})` : ''}.`,
      };
    }
  }

  // Word-by-word offline dictionary fallback for English -> Hindi/Marathi
  if (targetLang === 'hi' || targetLang === 'mr') {
    const tokens = normalized.split(/\s+/).filter(Boolean);
    let hits = 0;
    const mapped = tokens.map((tok) => {
      const found = WORD_DICTIONARY[tok];
      if (found) {
        hits += 1;
        return targetLang === 'hi' ? found.hi : found.mr;
      }
      return tok;
    });

    if (hits > 0) {
      const translatedText = mapped.join(' ');
      const label = getLangDisplayName(targetLang);
      return {
        sourceText,
        sourceLang: 'en',
        targetLang,
        translatedText,
        method: 'word-by-word-fallback',
        exactPhraseMatch: false,
        explanation:
          hits === tokens.length
            ? `"${sourceText}" in ${label}: ${translatedText}.`
            : `Offline ${label} partial translation of "${sourceText}": ${translatedText}. (For full conversational sentences, connect to the internet for external lookup.)`,
      };
    }
  }

  const label = getLangDisplayName(targetLang);
  return {
    sourceText,
    sourceLang: 'auto',
    targetLang,
    translatedText: sourceText,
    method: 'word-by-word-fallback',
    exactPhraseMatch: false,
    explanation: `I do not have an exact offline ${label} phrase entry for "${sourceText}". Common phrases like greetings, thank you, help, time, and daily vocabulary translate offline; connect to the internet for open-domain sentences.`,
  };
}
