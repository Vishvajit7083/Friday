var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/core/fileIndex.ts
function categorizeExtension(ext) {
  const clean = ext.replace(/^\./, "").toLowerCase();
  return EXTENSION_CATEGORY_MAP[clean] ?? "other";
}
function formatBytes(bytes) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}
function parseFileSearchIntent(rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  let categoryHint = "all";
  if (/\b(photo|photos|picture|pictures|image|images|wallpaper|screenshot|png|jpg|jpeg)\b/.test(q)) {
    categoryHint = "image";
  } else if (/\b(video|videos|clip|clips|movie|movies|mp4|mkv|webm|recording)\b/.test(q)) {
    categoryHint = "video";
  } else if (/\b(music|song|songs|audio|track|tracks|mp3|wav|m4a|playlist)\b/.test(q)) {
    categoryHint = "audio";
  } else if (/\b(presentation|slides|deck|ppt|pptx)\b/.test(q)) {
    categoryHint = "presentation";
  } else if (/\b(excel|spreadsheet|expenses|csv|xlsx|xls)\b/.test(q)) {
    categoryHint = "spreadsheet";
  } else if (/\b(pdf|resume|cv|invoice|document|docx|doc|report|notes|txt)\b/.test(q)) {
    categoryHint = "document";
  } else if (/\b(code|script|source|typescript|python|json)\b/.test(q)) {
    categoryHint = "code";
  }
  let folderHint = null;
  for (const folder of ["downloads", "desktop", "documents", "pictures", "videos", "music"]) {
    if (new RegExp(`\\b${folder}\\b`).test(q)) {
      folderHint = folder;
      break;
    }
  }
  let dateFilter = null;
  if (/\byesterday\b/.test(q)) dateFilter = "yesterday";
  else if (/\btoday\b/.test(q)) dateFilter = "today";
  else if (/\blast\s+week\b/.test(q)) dateFilter = "last_week";
  else if (/\b(recent|recently|latest|newest)\b/.test(q)) dateFilter = "recent";
  const sortByRecent = Boolean(dateFilter || /\b(latest|newest|recent|recently|yesterday|today)\b/.test(q));
  let requestedAction = "find";
  if (/\b(play|listen|watch)\b/.test(q)) requestedAction = "play";
  else if (/\bopen\b/.test(q)) requestedAction = "open";
  else if (/\b(show|preview|read)\b/.test(q)) requestedAction = "preview";
  const keywords = q.replace(/[^a-z0-9._\s-]/g, " ").split(/\s+/).filter((tok) => tok.length > 1 && !STOPWORDS.has(tok));
  return {
    keywords,
    categoryHint,
    folderHint,
    dateFilter,
    sortByRecent,
    requestedAction
  };
}
function matchesDateFilter(isoDate, filter, nowMs) {
  if (!filter) return true;
  const ts = Date.parse(isoDate);
  if (!Number.isFinite(ts)) return false;
  const ageMs = Math.max(0, nowMs - ts);
  const oneDay = 24 * 60 * 60 * 1e3;
  if (filter === "today") return ageMs <= oneDay;
  if (filter === "yesterday") return ageMs <= 2 * oneDay;
  if (filter === "last_week") return ageMs <= 8 * oneDay;
  if (filter === "recent") return ageMs <= 14 * oneDay;
  return true;
}
function evaluateFileMatch(file, query, nowMs = Date.now()) {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 1, reason: "Listed in permitted workspace" };
  const intent = parseFileSearchIntent(q);
  const nameLower = file.name.toLowerCase();
  const pathLower = `${file.path} ${file.relativePath}`.toLowerCase();
  const previewLower = (file.previewText ?? "").toLowerCase();
  let score = 0;
  const reasons = [];
  if (nameLower === q) {
    score += 130;
    reasons.push("exact filename match");
  } else if (nameLower.includes(q)) {
    score += 75;
    reasons.push("filename match");
  }
  if (intent.categoryHint !== "all") {
    if (file.category === intent.categoryHint) {
      score += 40;
      reasons.push(`file type (${file.category})`);
    } else if (intent.keywords.length === 0) {
      return { score: 0, reason: "" };
    }
  }
  if (intent.folderHint && pathLower.includes(intent.folderHint)) {
    score += 32;
    reasons.push(`in ${intent.folderHint} folder`);
  }
  if (intent.dateFilter && matchesDateFilter(file.modifiedAt, intent.dateFilter, nowMs)) {
    score += 28;
    reasons.push(
      intent.dateFilter === "yesterday" ? "modified recently/yesterday" : intent.dateFilter === "today" ? "modified today" : "recent modification date"
    );
  }
  const tokens = intent.keywords.length > 0 ? intent.keywords : q.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (nameLower.includes(token)) {
      score += 28;
      reasons.push(`name matches "${token}"`);
    } else if (pathLower.includes(token)) {
      score += 14;
      reasons.push(`path matches "${token}"`);
    }
    if (previewLower.includes(token)) {
      score += 16;
      reasons.push(`content matches "${token}"`);
    }
    if ((token === "presentation" || token === "slides" || token === "deck") && file.category === "presentation") {
      score += 30;
    }
    if ((token === "excel" || token === "spreadsheet" || token === "expenses" || token === "csv") && file.category === "spreadsheet") {
      score += 30;
    }
    if ((token === "image" || token === "picture" || token === "photo") && file.category === "image") {
      score += 25;
    }
    if ((token === "video" || token === "clip" || token === "recording") && file.category === "video") {
      score += 25;
    }
    if ((token === "audio" || token === "song" || token === "voice" || token === "music") && file.category === "audio") {
      score += 25;
    }
    if ((token === "document" || token === "pdf" || token === "resume" || token === "report" || token === "invoice") && file.category === "document") {
      score += 25;
    }
    if ((token === "code" || token === "script" || token === "source") && file.category === "code") {
      score += 20;
    }
  }
  if (intent.sortByRecent && score > 0) {
    const ageDays = Math.max(0, (nowMs - Date.parse(file.modifiedAt || "")) / (24 * 60 * 60 * 1e3));
    if (Number.isFinite(ageDays)) {
      score += Math.max(0, Math.round(15 - Math.min(15, ageDays)));
    }
  }
  const uniqueReasons = Array.from(new Set(reasons)).slice(0, 3);
  return {
    score,
    reason: uniqueReasons.length > 0 ? uniqueReasons.join(" + ") : "indexed workspace file"
  };
}
function searchIndexedFiles(files, query, categoryFilter = "all", nowMs = Date.now()) {
  const intent = parseFileSearchIntent(query);
  const effectiveCategory = categoryFilter !== "all" ? categoryFilter : intent.categoryHint !== "all" ? intent.categoryHint : "all";
  const filtered = effectiveCategory === "all" ? files : files.filter((f) => f.category === effectiveCategory);
  if (!query.trim()) {
    return [...filtered].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }
  return filtered.map((file) => {
    const evaluated = evaluateFileMatch(file, query, nowMs);
    return {
      file: { ...file, matchReason: evaluated.reason },
      score: evaluated.score
    };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || b.file.modifiedAt.localeCompare(a.file.modifiedAt)).map((item) => item.file);
}
function findDuplicateGroups(files) {
  const groups = /* @__PURE__ */ new Map();
  for (const file of files) {
    const normalizedName = file.name.replace(/\s*\(\d+\)(?=\.[^.]+$)/, "").toLowerCase();
    const key = `${normalizedName}::${file.sizeBytes}`;
    const existing = groups.get(key) ?? [];
    existing.push(file);
    groups.set(key, existing);
  }
  return Array.from(groups.values()).filter((g) => g.length > 1);
}
var EXTENSION_CATEGORY_MAP, STOPWORDS;
var init_fileIndex = __esm({
  "src/core/fileIndex.ts"() {
    EXTENSION_CATEGORY_MAP = {
      pdf: "document",
      doc: "document",
      docx: "document",
      txt: "document",
      md: "document",
      rtf: "document",
      xls: "spreadsheet",
      xlsx: "spreadsheet",
      csv: "spreadsheet",
      ppt: "presentation",
      pptx: "presentation",
      key: "presentation",
      ts: "code",
      tsx: "code",
      js: "code",
      jsx: "code",
      py: "code",
      json: "code",
      html: "code",
      css: "code",
      sql: "code",
      png: "image",
      jpg: "image",
      jpeg: "image",
      webp: "image",
      svg: "image",
      gif: "image",
      mp4: "video",
      webm: "video",
      mov: "video",
      mkv: "video",
      mp3: "audio",
      wav: "audio",
      m4a: "audio",
      ogg: "audio"
    };
    STOPWORDS = /* @__PURE__ */ new Set([
      "friday",
      "hey",
      "find",
      "search",
      "locate",
      "show",
      "me",
      "the",
      "my",
      "a",
      "an",
      "i",
      "was",
      "downloaded",
      "working",
      "on",
      "from",
      "in",
      "about",
      "with",
      "for",
      "where",
      "is",
      "that",
      "this",
      "recently",
      "recent",
      "latest",
      "newest",
      "last",
      "yesterday",
      "today",
      "week",
      "file",
      "files",
      "open",
      "play",
      "preview"
    ]);
  }
});

// src/core/unitConverter.ts
function normalizeUnitToken(raw) {
  const clean = raw.trim().toLowerCase().replace(/[?.!,]+$/g, "");
  return UNIT_ALIASES[clean] ?? null;
}
function formatNumber(val) {
  if (Math.abs(val) < 1e-9) return "0";
  if (Number.isInteger(val)) return String(val);
  const rounded = Number(val.toFixed(6));
  return String(rounded);
}
function convertTemperature(value, from, to) {
  let celsius;
  if (from === "C") celsius = value;
  else if (from === "F") celsius = (value - 32) * 5 / 9;
  else if (from === "K") celsius = value - 273.15;
  else return null;
  if (to === "C") return celsius;
  if (to === "F") return celsius * 9 / 5 + 32;
  if (to === "K") return celsius + 273.15;
  return null;
}
function tryConvertUnits(rawCommand) {
  const cleaned = rawCommand.trim().replace(/^(?:hey\s+friday[,\s]+|friday[,\s]+)?(?:please\s+)?/i, "").replace(/^(?:convert|what is|how many|turn)\s+/i, "").replace(/[?]+$/g, "").trim();
  const match = cleaned.match(
    /^(-?\d+(?:\.\d+)?)\s*([°a-zA-Z/]+)\s+(?:to|in|into|as)\s+([°a-zA-Z/]+)$/i
  );
  if (!match) return null;
  const inputValue = Number(match[1]);
  if (!Number.isFinite(inputValue)) return null;
  const fromUnit = normalizeUnitToken(match[2]);
  const toUnit = normalizeUnitToken(match[3]);
  if (!fromUnit || !toUnit) return null;
  if ((fromUnit === "C" || fromUnit === "F" || fromUnit === "K") && (toUnit === "C" || toUnit === "F" || toUnit === "K")) {
    const out = convertTemperature(inputValue, fromUnit, toUnit);
    if (out === null) return null;
    const formattedOutput2 = formatNumber(out);
    return {
      inputValue,
      fromUnit,
      toUnit,
      outputValue: out,
      formattedOutput: formattedOutput2,
      category: "temperature",
      explanation: `${inputValue}\xB0${fromUnit} equals ${formattedOutput2}\xB0${toUnit}.`
    };
  }
  const fromSpec = LINEAR_UNITS[fromUnit];
  const toSpec = LINEAR_UNITS[toUnit];
  if (!fromSpec || !toSpec || fromSpec.category !== toSpec.category) {
    return null;
  }
  const baseValue = inputValue * fromSpec.toBaseFactor;
  const outputValue = baseValue / toSpec.toBaseFactor;
  const formattedOutput = formatNumber(outputValue);
  return {
    inputValue,
    fromUnit: fromSpec.canonical,
    toUnit: toSpec.canonical,
    outputValue,
    formattedOutput,
    category: fromSpec.category,
    explanation: `${inputValue} ${fromSpec.canonical} equals ${formattedOutput} ${toSpec.canonical}.`
  };
}
var UNIT_ALIASES, LINEAR_UNITS;
var init_unitConverter = __esm({
  "src/core/unitConverter.ts"() {
    UNIT_ALIASES = {
      m: "m",
      meter: "m",
      meters: "m",
      metre: "m",
      metres: "m",
      km: "km",
      kilometer: "km",
      kilometers: "km",
      kilometre: "km",
      kilometres: "km",
      cm: "cm",
      centimeter: "cm",
      centimeters: "cm",
      mm: "mm",
      millimeter: "mm",
      millimeters: "mm",
      mi: "mi",
      mile: "mi",
      miles: "mi",
      ft: "ft",
      foot: "ft",
      feet: "ft",
      in: "in",
      inch: "in",
      inches: "in",
      yd: "yd",
      yard: "yd",
      yards: "yd",
      kg: "kg",
      kilogram: "kg",
      kilograms: "kg",
      g: "g",
      gram: "g",
      grams: "g",
      mg: "mg",
      milligram: "mg",
      milligrams: "mg",
      lb: "lb",
      lbs: "lb",
      pound: "lb",
      pounds: "lb",
      oz: "oz",
      ounce: "oz",
      ounces: "oz",
      c: "C",
      celsius: "C",
      centigrade: "C",
      "\xB0c": "C",
      f: "F",
      fahrenheit: "F",
      "\xB0f": "F",
      k: "K",
      kelvin: "K",
      b: "B",
      byte: "B",
      bytes: "B",
      kb: "KB",
      kilobyte: "KB",
      kilobytes: "KB",
      mb: "MB",
      megabyte: "MB",
      megabytes: "MB",
      gb: "GB",
      gigabyte: "GB",
      gigabytes: "GB",
      tb: "TB",
      terabyte: "TB",
      terabytes: "TB",
      kmh: "km/h",
      "km/h": "km/h",
      kph: "km/h",
      mph: "mph",
      "m/s": "m/s",
      ms: "m/s",
      s: "s",
      sec: "s",
      second: "s",
      seconds: "s",
      min: "min",
      mins: "min",
      minute: "min",
      minutes: "min",
      hr: "hr",
      hrs: "hr",
      hour: "hr",
      hours: "hr",
      day: "day",
      days: "day"
    };
    LINEAR_UNITS = {
      mm: { canonical: "mm", category: "length", toBaseFactor: 1e-3 },
      cm: { canonical: "cm", category: "length", toBaseFactor: 0.01 },
      m: { canonical: "m", category: "length", toBaseFactor: 1 },
      km: { canonical: "km", category: "length", toBaseFactor: 1e3 },
      in: { canonical: "in", category: "length", toBaseFactor: 0.0254 },
      ft: { canonical: "ft", category: "length", toBaseFactor: 0.3048 },
      yd: { canonical: "yd", category: "length", toBaseFactor: 0.9144 },
      mi: { canonical: "mi", category: "length", toBaseFactor: 1609.344 },
      mg: { canonical: "mg", category: "weight", toBaseFactor: 1e-6 },
      g: { canonical: "g", category: "weight", toBaseFactor: 1e-3 },
      kg: { canonical: "kg", category: "weight", toBaseFactor: 1 },
      lb: { canonical: "lb", category: "weight", toBaseFactor: 0.45359237 },
      oz: { canonical: "oz", category: "weight", toBaseFactor: 0.028349523125 },
      B: { canonical: "B", category: "data", toBaseFactor: 1 },
      KB: { canonical: "KB", category: "data", toBaseFactor: 1024 },
      MB: { canonical: "MB", category: "data", toBaseFactor: 1024 ** 2 },
      GB: { canonical: "GB", category: "data", toBaseFactor: 1024 ** 3 },
      TB: { canonical: "TB", category: "data", toBaseFactor: 1024 ** 4 },
      "m/s": { canonical: "m/s", category: "speed", toBaseFactor: 1 },
      "km/h": { canonical: "km/h", category: "speed", toBaseFactor: 1 / 3.6 },
      mph: { canonical: "mph", category: "speed", toBaseFactor: 0.44704 },
      s: { canonical: "s", category: "time", toBaseFactor: 1 },
      min: { canonical: "min", category: "time", toBaseFactor: 60 },
      hr: { canonical: "hr", category: "time", toBaseFactor: 3600 },
      day: { canonical: "day", category: "time", toBaseFactor: 86400 }
    };
  }
});

// src/core/translator.ts
function parseLanguageToken(token) {
  const lower = token.trim().toLowerCase();
  if (lower === "english" || lower === "en") return "en";
  if (lower === "hindi" || lower === "hi") return "hi";
  if (lower === "marathi" || lower === "mr") return "mr";
  return null;
}
function getLangDisplayName(lang) {
  if (lang === "mr") return "Marathi";
  if (lang === "hi") return "Hindi";
  return "English";
}
function tryTranslateCommand(rawCommand) {
  const cleaned = rawCommand.trim().replace(/^(?:hey\s+friday[,\s]+|friday[,\s]+)?(?:please\s+)?/i, "").trim();
  const match = cleaned.match(
    /^(?:translate|say|how\s+do\s+you\s+say|convert)\s+["'“]?(.+?)["'”]?\s+(?:to|into|in)\s+(english|hindi|marathi|en|hi|mr)[?.!]*$/i
  );
  if (!match) return null;
  const sourceText = match[1].trim();
  const targetLang = parseLanguageToken(match[2]);
  if (!sourceText || !targetLang) return null;
  return translateText(sourceText, targetLang);
}
function translateText(sourceText, targetLang) {
  const normalized = sourceText.trim().toLowerCase().replace(/[?.!,]+$/g, "");
  for (const entry of PHRASE_BOOK) {
    const matchesEn = entry.en === normalized;
    const matchesHi = entry.hi === sourceText.trim() || entry.hiRoman.toLowerCase() === normalized;
    const matchesMr = entry.mr === sourceText.trim() || entry.mrRoman.toLowerCase() === normalized;
    if (matchesEn || matchesHi || matchesMr) {
      const translatedText = targetLang === "en" ? entry.en : targetLang === "hi" ? entry.hi : entry.mr;
      const romanized = targetLang === "en" ? void 0 : targetLang === "hi" ? entry.hiRoman : entry.mrRoman;
      const sourceLang = matchesEn ? "en" : matchesHi ? "hi" : "mr";
      const label2 = getLangDisplayName(targetLang);
      return {
        sourceText,
        sourceLang,
        targetLang,
        translatedText,
        romanized,
        method: "offline-dictionary",
        exactPhraseMatch: true,
        explanation: `"${sourceText}" in ${label2}: ${translatedText}${romanized ? ` (${romanized})` : ""}.`
      };
    }
  }
  if (targetLang === "hi" || targetLang === "mr") {
    const tokens = normalized.split(/\s+/).filter(Boolean);
    let hits = 0;
    const mapped = tokens.map((tok) => {
      const found = WORD_DICTIONARY[tok];
      if (found) {
        hits += 1;
        return targetLang === "hi" ? found.hi : found.mr;
      }
      return tok;
    });
    if (hits > 0) {
      const translatedText = mapped.join(" ");
      const label2 = getLangDisplayName(targetLang);
      return {
        sourceText,
        sourceLang: "en",
        targetLang,
        translatedText,
        method: "word-by-word-fallback",
        exactPhraseMatch: false,
        explanation: hits === tokens.length ? `"${sourceText}" in ${label2}: ${translatedText}.` : `Offline ${label2} partial translation of "${sourceText}": ${translatedText}. (For full conversational sentences, connect to the internet for external lookup.)`
      };
    }
  }
  const label = getLangDisplayName(targetLang);
  return {
    sourceText,
    sourceLang: "auto",
    targetLang,
    translatedText: sourceText,
    method: "word-by-word-fallback",
    exactPhraseMatch: false,
    explanation: `I do not have an exact offline ${label} phrase entry for "${sourceText}". Common phrases like greetings, thank you, help, time, and daily vocabulary translate offline; connect to the internet for open-domain sentences.`
  };
}
var PHRASE_BOOK, WORD_DICTIONARY;
var init_translator = __esm({
  "src/core/translator.ts"() {
    PHRASE_BOOK = [
      {
        en: "hello",
        hi: "\u0928\u092E\u0938\u094D\u0924\u0947",
        hiRoman: "Namaste",
        mr: "\u0928\u092E\u0938\u094D\u0915\u093E\u0930",
        mrRoman: "Namaskar"
      },
      {
        en: "hi",
        hi: "\u0928\u092E\u0938\u094D\u0924\u0947",
        hiRoman: "Namaste",
        mr: "\u0928\u092E\u0938\u094D\u0915\u093E\u0930",
        mrRoman: "Namaskar"
      },
      {
        en: "good morning",
        hi: "\u0938\u0941\u092A\u094D\u0930\u092D\u093E\u0924",
        hiRoman: "Suprabhat",
        mr: "\u0936\u0941\u092D \u0938\u0915\u093E\u0933",
        mrRoman: "Shubh Sakal"
      },
      {
        en: "good afternoon",
        hi: "\u0936\u0941\u092D \u0926\u094B\u092A\u0939\u0930",
        hiRoman: "Shubh Dopahar",
        mr: "\u0936\u0941\u092D \u0926\u0941\u092A\u093E\u0930",
        mrRoman: "Shubh Dupar"
      },
      {
        en: "good evening",
        hi: "\u0936\u0941\u092D \u0938\u0902\u0927\u094D\u092F\u093E",
        hiRoman: "Shubh Sandhya",
        mr: "\u0936\u0941\u092D \u0938\u0902\u0927\u094D\u092F\u093E\u0915\u093E\u0933",
        mrRoman: "Shubh Sandhyakal"
      },
      {
        en: "good night",
        hi: "\u0936\u0941\u092D \u0930\u093E\u0924\u094D\u0930\u093F",
        hiRoman: "Shubh Ratri",
        mr: "\u0936\u0941\u092D \u0930\u093E\u0924\u094D\u0930\u0940",
        mrRoman: "Shubh Ratri"
      },
      {
        en: "how are you",
        hi: "\u0906\u092A \u0915\u0948\u0938\u0947 \u0939\u0948\u0902?",
        hiRoman: "Aap kaise hain?",
        mr: "\u0924\u0941\u092E\u094D\u0939\u0940 \u0915\u0938\u0947 \u0906\u0939\u093E\u0924?",
        mrRoman: "Tumhi kase aahat?"
      },
      {
        en: "i am fine",
        hi: "\u092E\u0948\u0902 \u0920\u0940\u0915 \u0939\u0942\u0901",
        hiRoman: "Main theek hoon",
        mr: "\u092E\u0940 \u0920\u0940\u0915 \u0906\u0939\u0947",
        mrRoman: "Mi theek aahe"
      },
      {
        en: "thank you",
        hi: "\u0927\u0928\u094D\u092F\u0935\u093E\u0926",
        hiRoman: "Dhanyavaad",
        mr: "\u0927\u0928\u094D\u092F\u0935\u093E\u0926",
        mrRoman: "Dhanyavaad"
      },
      {
        en: "thanks",
        hi: "\u0927\u0928\u094D\u092F\u0935\u093E\u0926",
        hiRoman: "Dhanyavaad",
        mr: "\u0906\u092D\u093E\u0930",
        mrRoman: "Aabhar"
      },
      {
        en: "please",
        hi: "\u0915\u0943\u092A\u092F\u093E",
        hiRoman: "Kripaya",
        mr: "\u0915\u0943\u092A\u092F\u093E",
        mrRoman: "Krupaya"
      },
      {
        en: "sorry",
        hi: "\u092E\u093E\u092B\u093C \u0915\u0940\u091C\u093F\u090F",
        hiRoman: "Maaf kijiye",
        mr: "\u092E\u093E\u092B \u0915\u0930\u093E",
        mrRoman: "Maaf kara"
      },
      {
        en: "yes",
        hi: "\u0939\u093E\u0901",
        hiRoman: "Haan",
        mr: "\u0939\u094B",
        mrRoman: "Ho"
      },
      {
        en: "no",
        hi: "\u0928\u0939\u0940\u0902",
        hiRoman: "Nahin",
        mr: "\u0928\u093E\u0939\u0940",
        mrRoman: "Nahi"
      },
      {
        en: "what is your name",
        hi: "\u0906\u092A\u0915\u093E \u0928\u093E\u092E \u0915\u094D\u092F\u093E \u0939\u0948?",
        hiRoman: "Aapka naam kya hai?",
        mr: "\u0924\u0941\u092E\u091A\u0947 \u0928\u093E\u0935 \u0915\u093E\u092F \u0906\u0939\u0947?",
        mrRoman: "Tumche naav kaay aahe?"
      },
      {
        en: "my name is",
        hi: "\u092E\u0947\u0930\u093E \u0928\u093E\u092E \u0939\u0948",
        hiRoman: "Mera naam hai",
        mr: "\u092E\u093E\u091D\u0947 \u0928\u093E\u0935 \u0906\u0939\u0947",
        mrRoman: "Majhe naav aahe"
      },
      {
        en: "help me",
        hi: "\u092E\u0947\u0930\u0940 \u092E\u0926\u0926 \u0915\u0940\u091C\u093F\u090F",
        hiRoman: "Meri madad kijiye",
        mr: "\u092E\u0932\u093E \u092E\u0926\u0924 \u0915\u0930\u093E",
        mrRoman: "Mala madat kara"
      },
      {
        en: "what time is it",
        hi: "\u0905\u092D\u0940 \u0915\u094D\u092F\u093E \u0938\u092E\u092F \u0939\u0941\u0906 \u0939\u0948?",
        hiRoman: "Abhi kya samay hua hai?",
        mr: "\u0906\u0924\u093E \u0915\u093F\u0924\u0940 \u0935\u093E\u091C\u0932\u0947 \u0906\u0939\u0947\u0924?",
        mrRoman: "Aata kiti vajle aahet?"
      },
      {
        en: "today",
        hi: "\u0906\u091C",
        hiRoman: "Aaj",
        mr: "\u0906\u091C",
        mrRoman: "Aaj"
      },
      {
        en: "tomorrow",
        hi: "\u0915\u0932",
        hiRoman: "Kal",
        mr: "\u0909\u0926\u094D\u092F\u093E",
        mrRoman: "Udya"
      },
      {
        en: "yesterday",
        hi: "\u0915\u0932 (\u092C\u0940\u0924\u093E \u0939\u0941\u0906)",
        hiRoman: "Kal",
        mr: "\u0915\u093E\u0932",
        mrRoman: "Kaal"
      },
      {
        en: "open",
        hi: "\u0916\u094B\u0932\u0947\u0902",
        hiRoman: "Kholen",
        mr: "\u0909\u0918\u0921\u093E",
        mrRoman: "Ughda"
      },
      {
        en: "close",
        hi: "\u092C\u0902\u0926 \u0915\u0930\u0947\u0902",
        hiRoman: "Band karen",
        mr: "\u092C\u0902\u0926 \u0915\u0930\u093E",
        mrRoman: "Band kara"
      },
      {
        en: "battery",
        hi: "\u092C\u0948\u091F\u0930\u0940",
        hiRoman: "Battery",
        mr: "\u092C\u0945\u091F\u0930\u0940",
        mrRoman: "Battery"
      },
      {
        en: "water",
        hi: "\u092A\u093E\u0928\u0940",
        hiRoman: "Paani",
        mr: "\u092A\u093E\u0923\u0940",
        mrRoman: "Paani"
      },
      {
        en: "food",
        hi: "\u0916\u093E\u0928\u093E",
        hiRoman: "Khaana",
        mr: "\u091C\u0947\u0935\u0923",
        mrRoman: "Jevan"
      },
      {
        en: "study",
        hi: "\u092A\u0922\u093C\u093E\u0908",
        hiRoman: "Padhai",
        mr: "\u0905\u092D\u094D\u092F\u093E\u0938",
        mrRoman: "Abhyas"
      },
      {
        en: "work",
        hi: "\u0915\u093E\u092E",
        hiRoman: "Kaam",
        mr: "\u0915\u093E\u092E",
        mrRoman: "Kaam"
      },
      {
        en: "friend",
        hi: "\u0926\u094B\u0938\u094D\u0924",
        hiRoman: "Dost",
        mr: "\u092E\u093F\u0924\u094D\u0930",
        mrRoman: "Mitra"
      },
      {
        en: "home",
        hi: "\u0918\u0930",
        hiRoman: "Ghar",
        mr: "\u0918\u0930",
        mrRoman: "Ghar"
      },
      {
        en: "welcome",
        hi: "\u0938\u094D\u0935\u093E\u0917\u0924 \u0939\u0948",
        hiRoman: "Swagat hai",
        mr: "\u0938\u094D\u0935\u093E\u0917\u0924 \u0906\u0939\u0947",
        mrRoman: "Swagat aahe"
      },
      {
        en: "i love you",
        hi: "\u092E\u0948\u0902 \u0924\u0941\u092E\u0938\u0947 \u092A\u094D\u092F\u093E\u0930 \u0915\u0930\u0924\u093E \u0939\u0942\u0901",
        hiRoman: "Main tumse pyaar karta hoon",
        mr: "\u092E\u093E\u091D\u0947 \u0924\u0941\u091D\u094D\u092F\u093E\u0935\u0930 \u092A\u094D\u0930\u0947\u092E \u0906\u0939\u0947",
        mrRoman: "Majhe tujhyavar prem aahe"
      },
      {
        en: "everything is fine",
        hi: "\u0938\u092C \u0915\u0941\u091B \u0920\u0940\u0915 \u0939\u0948",
        hiRoman: "Sab kuch theek hai",
        mr: "\u0938\u0930\u094D\u0935 \u0915\u093E\u0939\u0940 \u0920\u0940\u0915 \u0906\u0939\u0947",
        mrRoman: "Sarva kahi theek aahe"
      }
    ];
    WORD_DICTIONARY = {
      i: { hi: "\u092E\u0948\u0902", mr: "\u092E\u0940" },
      you: { hi: "\u0906\u092A", mr: "\u0924\u0941\u092E\u094D\u0939\u0940" },
      we: { hi: "\u0939\u092E", mr: "\u0906\u092E\u094D\u0939\u0940" },
      my: { hi: "\u092E\u0947\u0930\u093E", mr: "\u092E\u093E\u091D\u0947" },
      your: { hi: "\u0906\u092A\u0915\u093E", mr: "\u0924\u0941\u092E\u091A\u0947" },
      is: { hi: "\u0939\u0948", mr: "\u0906\u0939\u0947" },
      are: { hi: "\u0939\u0948\u0902", mr: "\u0906\u0939\u0947\u0924" },
      good: { hi: "\u0905\u091A\u094D\u091B\u093E", mr: "\u091A\u093E\u0902\u0917\u0932\u0947" },
      bad: { hi: "\u092C\u0941\u0930\u093E", mr: "\u0935\u093E\u0908\u091F" },
      day: { hi: "\u0926\u093F\u0928", mr: "\u0926\u093F\u0935\u0938" },
      night: { hi: "\u0930\u093E\u0924", mr: "\u0930\u093E\u0924\u094D\u0930" },
      morning: { hi: "\u0938\u0941\u092C\u0939", mr: "\u0938\u0915\u093E\u0933" },
      evening: { hi: "\u0936\u093E\u092E", mr: "\u0938\u0902\u0927\u094D\u092F\u093E\u0915\u093E\u0933" },
      name: { hi: "\u0928\u093E\u092E", mr: "\u0928\u093E\u0935" },
      time: { hi: "\u0938\u092E\u092F", mr: "\u0935\u0947\u0933" },
      help: { hi: "\u092E\u0926\u0926", mr: "\u092E\u0926\u0924" },
      book: { hi: "\u0915\u093F\u0924\u093E\u092C", mr: "\u092A\u0941\u0938\u094D\u0924\u0915" },
      phone: { hi: "\u092B\u093C\u094B\u0928", mr: "\u092B\u094B\u0928" },
      computer: { hi: "\u0915\u0902\u092A\u094D\u092F\u0942\u091F\u0930", mr: "\u0938\u0902\u0917\u0923\u0915" },
      assistant: { hi: "\u0938\u0939\u093E\u092F\u0915", mr: "\u0938\u0939\u093E\u092F\u094D\u092F\u0915" },
      reminder: { hi: "\u0930\u093F\u092E\u093E\u0907\u0902\u0921\u0930", mr: "\u0906\u0920\u0935\u0923" },
      note: { hi: "\u0928\u094B\u091F", mr: "\u0928\u094B\u0902\u0926" },
      music: { hi: "\u0938\u0902\u0917\u0940\u0924", mr: "\u0938\u0902\u0917\u0940\u0924" },
      weather: { hi: "\u092E\u094C\u0938\u092E", mr: "\u0939\u0935\u093E\u092E\u093E\u0928" },
      hot: { hi: "\u0917\u0930\u094D\u092E", mr: "\u0917\u0930\u092E" },
      cold: { hi: "\u0920\u0902\u0921\u093E", mr: "\u0925\u0902\u0921" },
      fast: { hi: "\u0924\u0947\u091C\u093C", mr: "\u0935\u0947\u0917\u0935\u093E\u0928" },
      now: { hi: "\u0905\u092D\u0940", mr: "\u0906\u0924\u093E" },
      here: { hi: "\u092F\u0939\u093E\u0901", mr: "\u092F\u0947\u0925\u0947" },
      there: { hi: "\u0935\u0939\u093E\u0901", mr: "\u0924\u0947\u0925\u0947" },
      all: { hi: "\u0938\u092D\u0940", mr: "\u0938\u0930\u094D\u0935" },
      ready: { hi: "\u0924\u0948\u092F\u093E\u0930", mr: "\u0924\u092F\u093E\u0930" }
    };
  }
});

// src/core/productivityTools.ts
function getRelativeIsoDate(offsetDays) {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function parseTimeExpression(raw) {
  const m = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return {
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    hour,
    minute
  };
}
function parseProductivityCommand(rawCommand) {
  const trimmed = rawCommand.trim().replace(/^(?:hey\s+friday[,\s]+|friday[,\s]+)?(?:please\s+)?/i, "").trim();
  const alarmMatch = trimmed.match(/^(?:set|create|add)\s+(?:an\s+)?alarm\s+(?:for|at)\s+(.+)$/i);
  if (alarmMatch) {
    const parsedTime = parseTimeExpression(alarmMatch[1]) ?? { time: "07:00", hour: 7, minute: 0 };
    return {
      kind: "alarm_set",
      title: `F.R.I.D.A.Y. Alarm (${parsedTime.time})`,
      time: parsedTime.time,
      hour: parsedTime.hour,
      minute: parsedTime.minute
    };
  }
  const remindMatch = trimmed.match(/^remind\s+me\s+(?:to\s+)?(.+)$/i);
  if (remindMatch) {
    const body = remindMatch[1].trim();
    const isTomorrow = /\btomorrow\b/i.test(body);
    const parsedTime = parseTimeExpression(body) ?? { time: "09:00", hour: 9, minute: 0 };
    const cleanTitle = body.replace(/\b(today|tomorrow)\b/gi, "").replace(/\b(at|for)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, "").replace(/\s+/g, " ").trim() || body;
    return {
      kind: "reminder_add",
      title: cleanTitle,
      date: getRelativeIsoDate(isTomorrow ? 1 : 0),
      time: parsedTime.time,
      hour: parsedTime.hour,
      minute: parsedTime.minute
    };
  }
  if (/^(?:show|list|read|open)\s+(?:my\s+)?notes$/i.test(trimmed)) {
    return { kind: "list_notes", title: "Notes" };
  }
  const noteAdd = trimmed.match(/^(?:take\s+a\s+note|save\s+(?:a\s+)?note|add\s+note|note\s+that|note:)[\s:-]*(.+)$/i);
  if (noteAdd && noteAdd[1].trim()) {
    const content = noteAdd[1].trim();
    const title = content.split(/[.!?\n]/)[0].slice(0, 48).trim() || "Quick Note";
    return {
      kind: "note_add",
      title,
      detail: content
    };
  }
  if (/^(?:show|list|check)\s+(?:my\s+)?(?:to-?do|tasks|todo\s+list)$/i.test(trimmed)) {
    return { kind: "list_todos", title: "To-Do List" };
  }
  const todoAdd = trimmed.match(
    /^(?:add\s+(?:to\s+(?:my\s+)?(?:to-?do|tasks)|task)|create\s+task|todo:)[\s:-]*(.+)$/i
  );
  if (todoAdd && todoAdd[1].trim()) {
    return {
      kind: "todo_add",
      title: todoAdd[1].trim()
    };
  }
  const summarizeTextMatch = trimmed.match(/^summarize(?:\s+this\s+text|\s+text)?[\s:]+([\s\S]{30,})$/i);
  if (summarizeTextMatch && !/https?:\/\//i.test(summarizeTextMatch[1])) {
    return {
      kind: "summarize",
      title: "Text Summary",
      detail: summarizeTextMatch[1].trim()
    };
  }
  const readMatch = trimmed.match(/^read(?:\s+this)?\s+aloud[\s:]+(.+)$/i);
  if (readMatch && readMatch[1].trim()) {
    return {
      kind: "read_aloud",
      title: "Read Aloud",
      detail: readMatch[1].trim()
    };
  }
  return null;
}
function summarizeTextExtractive(rawText, maxSentences = 3) {
  const clean = rawText.replace(/\s+/g, " ").trim();
  if (!clean) return "No text content provided to summarize.";
  const sentences = clean.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
  if (sentences.length <= maxSentences) {
    return sentences.join(" ");
  }
  const stopWords = /* @__PURE__ */ new Set([
    "the",
    "is",
    "at",
    "which",
    "on",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "for",
    "with",
    "that",
    "this",
    "it",
    "as",
    "are",
    "was",
    "be"
  ]);
  const wordFreq = /* @__PURE__ */ new Map();
  for (const word of clean.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/)) {
    if (word.length > 2 && !stopWords.has(word)) {
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
    }
  }
  const scored = sentences.map((sentence, idx) => {
    const tokens = sentence.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/);
    const freqScore = tokens.reduce((sum, tok) => sum + (wordFreq.get(tok) ?? 0), 0);
    const positionBoost = idx === 0 ? 1.35 : idx === sentences.length - 1 ? 1.1 : 1;
    return { idx, sentence, score: freqScore / Math.max(1, tokens.length) * positionBoost };
  });
  const top = scored.sort((a, b) => b.score - a.score).slice(0, maxSentences).sort((a, b) => a.idx - b.idx);
  return top.map((item) => item.sentence).join(" ");
}
var init_productivityTools = __esm({
  "src/core/productivityTools.ts"() {
  }
});

// src/core/intentEngine.ts
function analyzeUserCommand(command) {
  const trimmed = command.trim();
  const isSensitive = SENSITIVE_PATTERNS.some((rx) => rx.test(trimmed));
  if (isSensitive) {
    const isWindowClose = /\b(close|kill|terminate)\s+[a-z0-9._-]+/i.test(trimmed);
    const isPhoneCall = /\b(?:call|dial|phone)\s+[a-z0-9+._-]+/i.test(trimmed);
    return {
      category: "sensitive_action",
      agents: isWindowClose ? ["core", "application", "automation"] : ["core", "automation"],
      requiresConfirmation: true,
      confirmationReason: isWindowClose ? "Closing a running application can discard unsaved work and requires confirmation." : isPhoneCall ? "Placing a phone call or opening a dial action requires explicit confirmation before launching the dialer." : "Action modifies or deletes files, sends external communication, or alters important schedule state.",
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Evaluate command intent & safety boundaries", status: "completed" },
        { id: "step-2", agent: "automation", title: "Await explicit user confirmation", status: "requires_confirmation", detail: trimmed }
      ]
    };
  }
  if (tryConvertUnits(trimmed) !== null) {
    return {
      category: "unit_convert",
      agents: ["core"],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Compute offline unit conversion", status: "completed" }
      ]
    };
  }
  if (tryTranslateCommand(trimmed) !== null) {
    return {
      category: "translate",
      agents: ["core"],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Translate phrase (English / Hindi / Marathi)", status: "completed" }
      ]
    };
  }
  const prodAction = parseProductivityCommand(trimmed);
  if (prodAction) {
    if (prodAction.kind === "read_aloud") {
      return {
        category: "read_aloud",
        agents: ["core", "voice"],
        requiresConfirmation: false,
        extractedTarget: prodAction.detail || trimmed,
        steps: [
          { id: "step-1", agent: "voice", title: "Prepare natural voice playback", status: "completed" }
        ]
      };
    }
    if (prodAction.kind === "alarm_set" || prodAction.kind === "reminder_add") {
      return {
        category: "alarm_reminder",
        agents: ["core", "calendar"],
        requiresConfirmation: false,
        extractedTarget: trimmed,
        steps: [
          { id: "step-1", agent: "calendar", title: "Create local reminder or device alarm", status: "running" }
        ]
      };
    }
    if (prodAction.kind === "note_add" || prodAction.kind === "list_notes" || prodAction.kind === "todo_add" || prodAction.kind === "list_todos") {
      return {
        category: "note_todo",
        agents: ["core", "memory"],
        requiresConfirmation: false,
        extractedTarget: trimmed,
        steps: [
          { id: "step-1", agent: "memory", title: "Update local Notes & To-Do workspace", status: "running" }
        ]
      };
    }
  }
  if (WORKFLOW_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: "workflow_run",
      agents: ["core", "automation", "system", "calendar"],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Parse multi-step workflow trigger", status: "completed" },
        { id: "step-2", agent: "automation", title: "Execute coordinated agent pipeline", status: "running" }
      ]
    };
  }
  if (VISION_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: "vision_screen",
      agents: ["core", "vision"],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Route visual inspection request", status: "completed" },
        { id: "step-2", agent: "vision", title: "Inspect authorized screen/image context", status: "running" }
      ]
    };
  }
  if (MEDIA_ANALYZE_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: "media_analyze",
      agents: ["core", "media", "file"],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Identify document or media analysis target", status: "completed" },
        { id: "step-2", agent: "media", title: "Extract content & generate summary", status: "running" }
      ]
    };
  }
  if (MEDIA_CONTROL_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: "media_control",
      agents: ["core", "media", "file"],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Parse media or volume control command", status: "completed" },
        { id: "step-2", agent: "media", title: "Locate local media or dispatch Windows media control", status: "running" }
      ]
    };
  }
  if (SYSTEM_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: "system_telemetry",
      agents: ["core", "system"],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Classify hardware diagnostics request", status: "completed" },
        { id: "step-2", agent: "system", title: "Query live CPU, memory, storage & network sensors", status: "running" }
      ]
    };
  }
  if (PHONE_CONTROL_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: "phone_control",
      agents: ["core", "application", "system"],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Parse Android/device system control intent", status: "completed" },
        { id: "step-2", agent: "application", title: "Dispatch device bridge or app action", status: "running" }
      ]
    };
  }
  if (APP_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: "app_control",
      agents: ["core", "application"],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Identify target desktop application or window", status: "completed" },
        { id: "step-2", agent: "application", title: "Resolve executable or active window & dispatch action", status: "running" }
      ]
    };
  }
  if (FILE_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: "file_search",
      agents: ["core", "file"],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Extract file attributes, date & folder intent", status: "completed" },
        { id: "step-2", agent: "file", title: "Search permitted local directories & rank matches", status: "running" }
      ]
    };
  }
  if (WEB_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: "web_search",
      agents: ["core", "browser"],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Formulate live web research query", status: "completed" },
        { id: "step-2", agent: "browser", title: "Fetch live web results & verified links", status: "running" }
      ]
    };
  }
  if (CALENDAR_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: "calendar_schedule",
      agents: ["core", "calendar"],
      requiresConfirmation: /\b(schedule|create|book|add)\b/i.test(trimmed),
      confirmationReason: /\b(schedule|create|book|add)\b/i.test(trimmed) ? "Creating or modifying a calendar event requires explicit confirmation." : void 0,
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Extract schedule & date parameters", status: "completed" },
        { id: "step-2", agent: "calendar", title: "Inspect personal calendar & reminders", status: "running" }
      ]
    };
  }
  if (MEMORY_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: "memory_manage",
      agents: ["core", "memory"],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Identify personal context update", status: "completed" },
        { id: "step-2", agent: "memory", title: "Read or persist user-approved memory", status: "running" }
      ]
    };
  }
  if (/^(?:hey[,\s]+friday[,\s]+|friday[,\s]+)?(?:open|launch|start)\s+(?:the\s+|my\s+)?[a-z][a-z0-9._-]{1,30}(?:\s+[a-z0-9._-]{1,20}){0,2}$/i.test(
    trimmed
  ) && !/\.(?:pdf|docx?|xlsx?|pptx?|txt|csv|png|jpe?g|webp|zip|mp[34]|mkv)$/i.test(trimmed)) {
    return {
      category: "app_control",
      agents: ["core", "application"],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: "step-1", agent: "core", title: "Identify target application", status: "completed" },
        { id: "step-2", agent: "application", title: "Resolve app package or fuzzy match & launch", status: "running" }
      ]
    };
  }
  return {
    category: "general_assistant",
    agents: ["core", "memory"],
    requiresConfirmation: false,
    extractedTarget: trimmed,
    steps: [
      { id: "step-1", agent: "core", title: "Synthesize local contextual response", status: "running" }
    ]
  };
}
function isKnowledgeQuestion(rawCommand) {
  const clean = rawCommand.trim().toLowerCase();
  if (!clean) return false;
  if (/^(hi|hello|hey|thanks|thank you|good morning|good afternoon|good evening|bye|who are you|what can you do|help)\b/.test(
    clean
  )) {
    return false;
  }
  if (/\b(time|date|day is it|remember|my name)\b/.test(clean) && !/\b(history|world|meaning|explain|who)\b/.test(clean)) {
    return false;
  }
  if (/^(what|who|where|when|why|how|explain|define|tell me|compare|describe|summarize|difference between|meaning of)\b/.test(clean)) {
    return true;
  }
  return clean.endsWith("?") && clean.split(/\s+/).length >= 2;
}
function tryEvaluateSafeMath(rawCommand) {
  const cleaned = rawCommand.trim().toLowerCase().replace(/^(?:hey\s+friday[,\s]+|friday[,\s]+)?(?:what is|calculate|compute|evaluate|solve|find)\s+/i, "").replace(/\bmultiplied\s+by\b/g, "*").replace(/\btimes\b/g, "*").replace(/\bdivided\s+by\b/g, "/").replace(/\bover\b/g, "/").replace(/\bplus\b/g, "+").replace(/\bminus\b/g, "-").replace(/\bmodulo\b/g, "%").replace(/[?=\s]+$/g, "").trim();
  if (!cleaned) return null;
  const percentMatch = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*%\s*of\s*(-?\d+(?:\.\d+)?)$/);
  if (percentMatch) {
    const pct = Number(percentMatch[1]);
    const base = Number(percentMatch[2]);
    const result = pct / 100 * base;
    return Number.isFinite(result) ? Number.isInteger(result) ? String(result) : Number(result.toFixed(6)).toString() : null;
  }
  const expr = cleaned.replace(/\bx\b/g, "*").replace(/\s+/g, "");
  if (!/^[0-9+\-*/%^().]+$/.test(expr) || !/[+\-*/%^]/.test(expr)) {
    return null;
  }
  let pos = 0;
  function parseExpression() {
    let left = parseTerm();
    while (pos < expr.length && (expr[pos] === "+" || expr[pos] === "-")) {
      const op = expr[pos++];
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  function parseTerm() {
    let left = parsePower();
    while (pos < expr.length && (expr[pos] === "*" || expr[pos] === "/" || expr[pos] === "%")) {
      const op = expr[pos++];
      const right = parsePower();
      if ((op === "/" || op === "%") && right === 0) return Number.NaN;
      left = op === "*" ? left * right : op === "/" ? left / right : left % right;
    }
    return left;
  }
  function parsePower() {
    const base = parseUnary();
    if (pos < expr.length && expr[pos] === "^") {
      pos += 1;
      const exp = parsePower();
      return Math.pow(base, exp);
    }
    return base;
  }
  function parseUnary() {
    if (expr[pos] === "-") {
      pos += 1;
      return -parseUnary();
    }
    if (expr[pos] === "+") {
      pos += 1;
      return parseUnary();
    }
    return parsePrimary();
  }
  function parsePrimary() {
    if (expr[pos] === "(") {
      pos += 1;
      const val = parseExpression();
      if (expr[pos] !== ")") return Number.NaN;
      pos += 1;
      return val;
    }
    const start = pos;
    let seenDot = false;
    while (pos < expr.length && (/\d/.test(expr[pos]) || expr[pos] === "." && !seenDot)) {
      if (expr[pos] === ".") seenDot = true;
      pos += 1;
    }
    if (pos === start) return Number.NaN;
    return Number(expr.slice(start, pos));
  }
  const value = parseExpression();
  if (pos !== expr.length || !Number.isFinite(value)) return null;
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(6)).toString();
}
var SENSITIVE_PATTERNS, SYSTEM_PATTERNS, MEDIA_CONTROL_PATTERNS, FILE_PATTERNS, WEB_PATTERNS, PHONE_CONTROL_PATTERNS, APP_PATTERNS, CALENDAR_PATTERNS, MEMORY_PATTERNS, VISION_PATTERNS, MEDIA_ANALYZE_PATTERNS, WORKFLOW_PATTERNS;
var init_intentEngine = __esm({
  "src/core/intentEngine.ts"() {
    init_unitConverter();
    init_translator();
    init_productivityTools();
    SENSITIVE_PATTERNS = [
      /\b(delete|remove|erase|wipe|format|overwrite|destroy)\b/i,
      /\b(send\s+(email|message|sms|whatsapp)|purchase|buy|pay|transfer|install\s+software)\b/i,
      /\b(cancel\s+(all|meeting|event)|shutdown|restart\s+pc)\b/i,
      /\b(close|kill|terminate)\s+[a-z0-9._-]+/i,
      /\b(?:call|dial|phone)\s+[a-z0-9+._-]+/i
    ];
    SYSTEM_PATTERNS = [
      /\b(cpu|ram|memory\s+usage|gpu|battery|network|disk|storage|performance|system\s+monitor|diagnostics|uptime|running\s+processes|device\s+info)\b/i
    ];
    MEDIA_CONTROL_PATTERNS = [
      /\b(play|listen\s+to|pause|resume|next\s+track|previous\s+track|skip\s+song|stop\s+music)\b.*\b(music|song|songs|track|playlist|audio|video|movie|clip)\b/i,
      /\b(pause|resume)\s+(the\s+)?(video|music|audio|playback|song|media)\b/i,
      /\b(increase|decrease|raise|lower|mute|unmute|turn\s+up|turn\s+down)\s+(the\s+)?(volume|sound|audio)\b/i,
      /\b(next|previous)\s+(song|track)\b/i,
      /\b(i\s+want\s+to\s+listen\s+to\s+music|play\s+my\s+(downloaded|favourite|favorite)\s+(music|song|video))\b/i
    ];
    FILE_PATTERNS = [
      /\b(find|search|locate|open|show|where\s+is)\b.*\b(file|folder|resume|invoice|pdf|excel|spreadsheet|presentation|ppt|docx|document|image|picture|photo|video|code|downloads|desktop|documents|pictures|videos|music|project)\b/i,
      /\b(latest\s+file|downloaded\s+yesterday|downloaded\s+recently|downloaded\s+last\s+week|working\s+on\s+yesterday)\b/i,
      /\b(duplicate\s+files|organize\s+.*downloads|create\s+(a\s+)?new\s+folder)\b/i
    ];
    WEB_PATTERNS = [
      /\b(search\s+google|google\s+search|search\s+online|search\s+the\s+(web|internet)|latest\s+news|latest\s+information|research|website|summarize\s+https?:)\b/i,
      /\b(search\s+youtube|find\s+on\s+youtube|what\s+is\s+the\s+latest|who\s+won|news\s+about|best\s+.*projects)\b/i,
      /https?:\/\/\S+/i
    ];
    PHONE_CONTROL_PATTERNS = [
      /\b(turn\s+(on|off)|enable|disable|toggle)\s+(the\s+)?(flashlight|torch)\b/i,
      /\b(open|go\s+to|show)\s+(wi-?fi|wifi|bluetooth|display|brightness|sound|volume|app|application|notification|battery|android)\s*(settings?)?\b/i,
      /\b(open|launch)\s+(camera|gallery|photos|contacts|dialer|phone|maps|youtube|instagram|insta|whatsapp|telegram|spotify|notion|github|gmail|facebook|snapchat)\b/i,
      /\b(navigate\s+to|directions\s+to|search\s+maps\s+for)\s+.+/i,
      /\b(copy\s+to\s+clipboard|share\s+(this|text|note))\b/i
    ];
    APP_PATTERNS = [
      /\b(open|launch|start|switch\s+to|focus|minimize|maximize)\s+(google\s+chrome|chrome|edge|vs\s*code|vscode|visual\s+studio|whatsapp|android\s+studio|spotify|terminal|explorer|notepad|calculator|browser|music\s+player|vlc)\b/i,
      /\b(open\s+the\s+app(lication)?\s+i\s+use\s+for\s+(coding|browsing|music|notes|messaging|files))\b/i,
      /\b(show\s+me\s+(the\s+)?applications\s+currently\s+running|running\s+windows|installed\s+apps)\b/i
    ];
    CALENDAR_PATTERNS = [
      /\b(schedule|calendar|meeting|remind\s+me|reminder|today'?s\s+tasks|agenda|upcoming\s+events)\b/i
    ];
    MEMORY_PATTERNS = [
      /\b(remember\s+that|my\s+name\s+is|save\s+to\s+memory|what\s+do\s+you\s+remember|forget\s+that|clear\s+memory)\b/i
    ];
    VISION_PATTERNS = [
      /\b(on\s+my\s+screen|what\s+is\s+showing|read\s+.*screen|explain\s+this\s+(error|chart|screen)|analyze\s+this\s+(chart|screen|image))\b/i
    ];
    MEDIA_ANALYZE_PATTERNS = [
      /\b(transcribe|summarize\s+(this\s+)?(video|audio|recording|pdf|document)|explain\s+this\s+pdf)\b/i
    ];
    WORKFLOW_PATTERNS = [
      /\b(run\s+workflow|morning\s+briefing|organize\s+.*workspace|project\s+startup)\b/i
    ];
  }
});

// server/internetResearchService.ts
import dns from "dns/promises";
import net from "net";
function isPrivateIpAddress(ip) {
  const clean = ip.replace(/^::ffff:/i, "");
  if (net.isIPv4(clean)) {
    const parts = clean.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIPv6(clean)) {
    const lower = clean.toLowerCase();
    return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
  }
  return true;
}
async function validatePublicHttpUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("Invalid URL format.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http:// and https:// public URLs are permitted.");
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host === "0.0.0.0") {
    throw new Error("Access to local or internal hostnames is blocked for security.");
  }
  if (net.isIP(host)) {
    if (isPrivateIpAddress(host)) {
      throw new Error("Access to private IP addresses is blocked for security.");
    }
    return parsed;
  }
  try {
    const looked = await dns.lookup(host, { all: true });
    if (!looked.length || looked.some((entry) => isPrivateIpAddress(entry.address))) {
      throw new Error("Resolved address points to a private network and was blocked.");
    }
  } catch (err) {
    if (err.message.includes("blocked")) throw err;
    throw new Error(`Unable to resolve host "${host}". Check internet connectivity.`);
  }
  return parsed;
}
function decodeHtmlEntities(text) {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code))).replace(/\s+/g, " ").trim();
}
function stripHtmlToReadableText(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : "Web Document";
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<svg[\s\S]*?<\/svg>/gi, " ").replace(/<\/(p|div|li|h[1-6]|tr|br|article|section)>/gi, "\n").replace(/<[^>]+>/g, " ");
  const lines = body.split(/\n+/).map((line) => decodeHtmlEntities(line)).filter((line) => line.length >= 25);
  return {
    title,
    text: lines.join("\n").slice(0, 12e3)
  };
}
async function fetchPublicWebPage(rawUrl) {
  const safeUrl = await validatePublicHttpUrl(rawUrl);
  const res = await fetch(safeUrl.toString(), {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html, text/plain, application/json;q=0.9"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!res.ok) {
    throw new Error(`Website returned HTTP ${res.status} (${res.statusText || "Error"}).`);
  }
  const contentType = res.headers.get("content-type") || "text/plain";
  const rawBody = (await res.text()).slice(0, 3e5);
  if (contentType.includes("application/json")) {
    return {
      title: safeUrl.hostname,
      uri: res.url || safeUrl.toString(),
      excerpt: rawBody.slice(0, 6e3),
      contentType
    };
  }
  if (contentType.includes("text/html")) {
    const parsed = stripHtmlToReadableText(rawBody);
    return {
      title: parsed.title || safeUrl.hostname,
      uri: res.url || safeUrl.toString(),
      excerpt: parsed.text || "Page loaded, but little readable text was detected.",
      contentType
    };
  }
  return {
    title: safeUrl.hostname,
    uri: res.url || safeUrl.toString(),
    excerpt: rawBody.slice(0, 6e3),
    contentType
  };
}
function decodeDdgRedirectUrl(href) {
  try {
    if (href.startsWith("//")) href = `https:${href}`;
    if (href.startsWith("/l/?")) {
      const full = new URL(`https://duckduckgo.com${href}`);
      const uddg2 = full.searchParams.get("uddg");
      if (uddg2) return uddg2;
    }
    const parsed = new URL(href);
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) return uddg;
    return parsed.toString();
  } catch {
    return "";
  }
}
async function searchDuckDuckGoHtml(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html"
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!res.ok) return [];
  const html = await res.text();
  const items = [];
  const blockRegex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi;
  let match;
  while ((match = blockRegex.exec(html)) !== null && items.length < 8) {
    const targetUrl = decodeDdgRedirectUrl(match[1]);
    const title = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, ""));
    const snippet = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, ""));
    if (targetUrl && /^https?:\/\//i.test(targetUrl) && title) {
      items.push({ title, uri: targetUrl, snippet });
    }
  }
  return items;
}
async function searchWikipediaOpen(query) {
  const cleanQ = query.replace(/^(what is|what are|who is|who was|explain|define|tell me about|search( for)?|latest information about|news about)\s+/i, "").replace(/[?!.]+$/g, "").trim();
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
    cleanQ || query
  )}&limit=4&namespace=0&format=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(4500)
  });
  if (!res.ok) return [];
  const data = await res.json();
  const titles = Array.isArray(data?.[1]) ? data[1] : [];
  const descs = Array.isArray(data?.[2]) ? data[2] : [];
  const urls = Array.isArray(data?.[3]) ? data[3] : [];
  let topExtract = "";
  if (titles[0]) {
    try {
      const sumRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titles[0].replace(/\s+/g, "_"))}`,
        {
          headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
          signal: AbortSignal.timeout(2500)
        }
      );
      if (sumRes.ok) {
        const sumData = await sumRes.json();
        if (sumData.extract) topExtract = sumData.extract.trim();
      }
    } catch {
    }
  }
  const results = [];
  for (let i = 0; i < titles.length; i += 1) {
    if (urls[i]) {
      results.push({
        title: `${titles[i]} \u2014 Wikipedia`,
        uri: urls[i],
        snippet: i === 0 && topExtract || descs[i] || `Reference article for ${titles[i]}.`
      });
    }
  }
  return results;
}
async function searchFreeWeb(query, mode = "web") {
  const modeSuffix = mode === "news" ? " latest news" : mode === "docs" ? " official documentation" : mode === "video" ? " youtube tutorial" : "";
  const effectiveQuery = `${query.trim()}${modeSuffix}`.trim();
  try {
    const [ddgResults, wikiResults] = await Promise.all([
      searchDuckDuckGoHtml(effectiveQuery).catch(() => []),
      mode === "video" ? Promise.resolve([]) : searchWikipediaOpen(query).catch(() => [])
    ]);
    const seen = /* @__PURE__ */ new Set();
    const combined = [];
    for (const item of [...ddgResults, ...wikiResults]) {
      if (!seen.has(item.uri)) {
        seen.add(item.uri);
        combined.push(item);
      }
    }
    return {
      results: combined.slice(0, 8),
      sources: combined.slice(0, 6).map((r) => ({ title: r.title, uri: r.uri })),
      online: true
    };
  } catch (err) {
    return {
      results: [],
      sources: [],
      online: false,
      error: err.message
    };
  }
}
function buildExtractiveSummary(text, focusQuery, maxLines = 6) {
  const rawLines = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length >= 30);
  if (rawLines.length === 0) return text.slice(0, 600);
  const keywords = (focusQuery || "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (keywords.length === 0) {
    return rawLines.slice(0, maxLines).join(" ");
  }
  const scored = rawLines.map((line, index) => {
    const lower = line.toLowerCase();
    let score = index < 3 ? 2 : 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 3;
    }
    return { line, index, score };
  });
  const top = scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, maxLines).sort((a, b) => a.index - b.index).map((x) => x.line);
  return top.join(" ");
}
var REQUEST_TIMEOUT_MS, USER_AGENT;
var init_internetResearchService = __esm({
  "server/internetResearchService.ts"() {
    REQUEST_TIMEOUT_MS = 6500;
    USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) FRIDAY-Desktop-Assistant/1.0";
  }
});

// server/localAiService.ts
var localAiService_exports = {};
__export(localAiService_exports, {
  buildLocalDeterministicReply: () => buildLocalDeterministicReply,
  checkOllamaStatus: () => checkOllamaStatus,
  checkOpenAiCompatibleStatus: () => checkOpenAiCompatibleStatus,
  getOllamaHost: () => getOllamaHost,
  getOpenAiCompatibleBaseUrl: () => getOpenAiCompatibleBaseUrl,
  streamOllamaChat: () => streamOllamaChat,
  streamOpenAiCompatibleChat: () => streamOpenAiCompatibleChat
});
function getOllamaHost() {
  return (process.env.OLLAMA_HOST || "http://127.0.0.1:11434").replace(/\/+$/, "");
}
function getOpenAiCompatibleBaseUrl() {
  return (process.env.LOCAL_AI_BASE_URL || "").trim().replace(/\/+$/, "");
}
async function checkOpenAiCompatibleStatus(preferredModel) {
  const baseUrl = getOpenAiCompatibleBaseUrl();
  const started = Date.now();
  if (!baseUrl) {
    return {
      available: false,
      baseUrl: "",
      models: [],
      selectedModel: null,
      latencyMs: 0,
      error: "LOCAL_AI_BASE_URL not configured."
    };
  }
  try {
    const apiKey = process.env.LOCAL_AI_API_KEY?.trim();
    const headers = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(1200)
    });
    if (!res.ok) {
      return {
        available: false,
        baseUrl,
        models: [],
        selectedModel: null,
        latencyMs: Date.now() - started,
        error: `Local endpoint HTTP ${res.status}`
      };
    }
    const data = await res.json();
    const models = (data.data ?? []).map((m) => String(m.id || "").trim()).filter(Boolean);
    const envModel = process.env.LOCAL_AI_MODEL?.trim();
    const selectedModel = (preferredModel && models.includes(preferredModel) ? preferredModel : null) || envModel || models[0] || "local-model";
    return {
      available: true,
      baseUrl,
      models,
      selectedModel,
      latencyMs: Date.now() - started
    };
  } catch (err) {
    return {
      available: false,
      baseUrl,
      models: [],
      selectedModel: null,
      latencyMs: Date.now() - started,
      error: err.message
    };
  }
}
async function streamOpenAiCompatibleChat(params) {
  const started = Date.now();
  let firstTokenMs = 0;
  let fullText = "";
  const timeoutSignal = AbortSignal.timeout(45e3);
  const combinedSignal = params.signal ? AbortSignal.any([params.signal, timeoutSignal]) : timeoutSignal;
  const headers = {
    "Content-Type": "application/json"
  };
  const apiKey = process.env.LOCAL_AI_API_KEY?.trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${params.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: params.model,
      stream: true,
      temperature: 0.4,
      messages: params.messages
    }),
    signal: combinedSignal
  });
  if (!res.ok || !res.body) {
    throw new Error(`Local OpenAI-compatible inference error (HTTP ${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.error?.message) throw new Error(parsed.error.message);
        const token = parsed.choices?.[0]?.delta?.content ?? "";
        if (token) {
          if (!firstTokenMs) firstTokenMs = Date.now() - started;
          fullText += token;
          params.onToken?.(token);
        }
      } catch (err) {
        if (err.message && payload.includes('"error"')) throw err;
      }
    }
  }
  return {
    text: fullText.trim(),
    firstTokenMs: firstTokenMs || Date.now() - started,
    totalMs: Date.now() - started
  };
}
async function checkOllamaStatus(preferredModel) {
  const host = getOllamaHost();
  const started = Date.now();
  try {
    const res = await fetch(`${host}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(900)
    });
    if (!res.ok) {
      return {
        available: false,
        host,
        models: [],
        selectedModel: null,
        latencyMs: Date.now() - started,
        error: `Ollama HTTP ${res.status}`
      };
    }
    const data = await res.json();
    const models = (data.models ?? []).map((m) => String(m.name || "").trim()).filter(Boolean);
    const envModel = process.env.OLLAMA_MODEL?.trim();
    let selectedModel = null;
    if (preferredModel && models.includes(preferredModel)) {
      selectedModel = preferredModel;
    } else if (envModel && models.includes(envModel)) {
      selectedModel = envModel;
    } else {
      selectedModel = PREFERRED_OLLAMA_PREFIXES.map((p) => models.find((m) => m.toLowerCase().startsWith(p))).find(Boolean) || models[0] || null;
    }
    return {
      available: models.length > 0,
      host,
      models,
      selectedModel,
      latencyMs: Date.now() - started,
      error: models.length === 0 ? "Ollama is running, but no models are pulled yet." : void 0
    };
  } catch (err) {
    return {
      available: false,
      host,
      models: [],
      selectedModel: null,
      latencyMs: Date.now() - started,
      error: err.message
    };
  }
}
async function streamOllamaChat(params) {
  const host = getOllamaHost();
  const started = Date.now();
  let firstTokenMs = 0;
  let fullText = "";
  const timeoutSignal = AbortSignal.timeout(45e3);
  const combinedSignal = params.signal ? AbortSignal.any([params.signal, timeoutSignal]) : timeoutSignal;
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: params.model,
      stream: true,
      keep_alive: "10m",
      options: {
        temperature: 0.4,
        num_ctx: 4096
      },
      messages: params.messages
    }),
    signal: combinedSignal
  });
  if (!res.ok || !res.body) {
    throw new Error(`Ollama inference error (HTTP ${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.error) throw new Error(parsed.error);
        const token = parsed.message?.content ?? "";
        if (token) {
          if (!firstTokenMs) firstTokenMs = Date.now() - started;
          fullText += token;
          params.onToken?.(token);
        }
      } catch (err) {
        if (err.message && !trimmed.startsWith("{")) continue;
        if (err.message && trimmed.includes('"error"')) throw err;
      }
    }
  }
  return {
    text: fullText.trim(),
    firstTokenMs: firstTokenMs || Date.now() - started,
    totalMs: Date.now() - started
  };
}
function buildLocalDeterministicReply(params) {
  const lower = params.userCommand.trim().toLowerCase();
  if (params.mediaNotice) {
    return params.mediaNotice;
  }
  if (params.appNotice) {
    return params.appNotice;
  }
  if (params.runningWindows && /\b(running|windows|open\s+apps)\b/i.test(lower)) {
    if (params.runningWindows.length === 0) {
      return process.platform === "win32" ? "No titled desktop windows are currently active." : "Running window enumeration requires a live Windows desktop session.";
    }
    const list = params.runningWindows.slice(0, 10).map((w) => `- ${w.name}: ${w.title}`).join("\n");
    return `Currently active Windows applications (${params.runningWindows.length}):
${list}`;
  }
  if (params.category === "system_telemetry" && params.telemetry) {
    const t = params.telemetry;
    const battery = t.batteryPercent !== null ? `, Battery ${t.batteryPercent}%${t.batteryCharging ? " (charging)" : ""}` : "";
    const temp = t.cpuTemp !== null ? `, CPU Temp ${t.cpuTemp}\xB0C` : "";
    return `System status on ${t.hostname} (${t.platform}): CPU is at ${t.cpuLoad}% across ${t.cpuCores} cores${temp}. Memory is ${t.ramUsedGb} / ${t.ramTotalGb} GB (${t.ramPercent}%). Storage is ${t.storageUsedGb} / ${t.storageTotalGb} GB (${t.storagePercent}%). Network: \u2193 ${t.networkRxKbps} KB/s \xB7 \u2191 ${t.networkTxKbps} KB/s${battery}.`;
  }
  if (params.files && params.category === "file_search") {
    if (params.files.length === 0) {
      return `I searched your permitted folders for "${params.userCommand}", but found no matching files. You can grant access to Downloads, Desktop, or Documents in Settings if needed.`;
    }
    const top = params.files[0];
    const reason = top.matchReason ? ` (${top.matchReason})` : "";
    const lines = params.files.slice(0, 4).map((f, idx) => `${idx + 1}. ${f.name} \u2014 ${formatBytes(f.sizeBytes)}, ${f.relativePath}${f.matchReason ? ` [${f.matchReason}]` : ""}`).join("\n");
    return `I found ${params.files.length} matching file${params.files.length === 1 ? "" : "s"}. The most likely match is ${top.name}${reason}, modified ${new Date(top.modifiedAt).toLocaleString()}.

${lines}`;
  }
  if (params.webPage) {
    const excerpt = buildExtractiveSummary(params.webPage.excerpt, params.userCommand, 5);
    return `Summary of "${params.webPage.title}" (${params.webPage.uri}):

${excerpt}`;
  }
  if (params.webResults && params.webResults.length > 0) {
    const lead = params.webResults[0];
    const summaryLines = params.webResults.slice(0, 4).map((r, i) => `${i + 1}. ${r.title}: ${r.snippet || "Result available at linked source."}`).join("\n");
    if (params.category === "web_search") {
      return `Here is what I found online for "${params.userCommand}":

${summaryLines}`;
    }
    const rest = params.webResults.slice(1, 3).map((r) => `- ${r.title}: ${r.snippet || r.uri}`).join("\n");
    return `${lead.snippet || lead.title}${rest ? `

Related sources:
${rest}` : ""}`;
  }
  if (params.category === "web_search") {
    return `I attempted to search the live web for "${params.userCommand}", but no search results were returned. Check your internet connection or try a more specific query.`;
  }
  if (params.category === "calendar_schedule" && params.calendar) {
    if (params.calendar.length === 0) {
      return "You have no upcoming events scheduled on your calendar.";
    }
    const list = params.calendar.slice(0, 5).map((e) => `- ${e.date} at ${e.time}: ${e.title} (${e.completed ? "completed" : e.category})`).join("\n");
    return `Upcoming schedule (${params.calendar.length} item${params.calendar.length === 1 ? "" : "s"}):
${list}`;
  }
  if (params.memorySaved) {
    return `Noted, ${params.userName}. I saved that to your personal memory: "${params.memorySaved}".`;
  }
  if (/\b(what do you remember|my memory|what is my name|who am i)\b/i.test(lower)) {
    const items = (params.memoryEntries ?? []).filter((m) => m.approved).slice(0, 5);
    if (items.length === 0) {
      return `You are ${params.userName}. You have no custom personal memory entries saved yet\u2014say "remember that..." anytime to save one.`;
    }
    const lines = items.map((m) => `- ${m.key}: ${m.value}`).join("\n");
    return `Here is what I remember for ${params.userName}:
${lines}`;
  }
  if (params.weather) {
    const w = params.weather;
    return `Live weather in ${w.location}: ${w.temperature}\xB0C (${w.condition}), feels like ${w.feelsLike}\xB0C, humidity ${w.humidity}%, wind ${w.windSpeedKmh} km/h.`;
  }
  const unitResult = tryConvertUnits(params.userCommand);
  if (unitResult) {
    return unitResult.explanation;
  }
  const translateResult = tryTranslateCommand(params.userCommand);
  if (translateResult) {
    return translateResult.explanation;
  }
  const prod = parseProductivityCommand(params.userCommand);
  if (prod?.kind === "summarize" && prod.detail) {
    return `Summary:
${summarizeTextExtractive(prod.detail, 3)}`;
  }
  if (prod?.kind === "read_aloud" && prod.detail) {
    return prod.detail;
  }
  const mathAnswer = tryEvaluateSafeMath(params.userCommand);
  if (mathAnswer !== null) {
    return `The result is ${mathAnswer}.`;
  }
  if (/\b(hello|hi|hey|good morning|good afternoon|good evening)\b/i.test(lower)) {
    return `Hello ${params.userName}. F.R.I.D.A.Y. is online in built-in Local Core mode\u2014ask me to open apps, find files, play music, check your system, calculate numbers, or research anything online.`;
  }
  if (/\b(who are you|what can you do|help)\b/i.test(lower)) {
    return `I am F.R.I.D.A.Y., your Windows personal AI assistant. Without needing Ollama or any paid API key, I can launch and switch Windows apps, search Downloads/Desktop/Documents by description or date, play local music and videos, monitor CPU/RAM/disk/network, manage your calendar and personal memory, evaluate math, and answer questions using live web knowledge.`;
  }
  if (/\b(time|date|day is it)\b/i.test(lower)) {
    const now = /* @__PURE__ */ new Date();
    return `It is ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} on ${now.toLocaleDateString(void 0, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}.`;
  }
  return `I processed "${params.userCommand}" using the built-in Local Core, ${params.userName}. You can ask me to open apps ("open Chrome"), search files ("find files downloaded yesterday"), play music or control volume, check CPU/RAM/weather, ask general knowledge questions ("explain quantum computing"), or paste a URL to summarize.`;
}
var PREFERRED_OLLAMA_PREFIXES;
var init_localAiService = __esm({
  "server/localAiService.ts"() {
    init_internetResearchService();
    init_fileIndex();
    init_intentEngine();
    init_unitConverter();
    init_translator();
    init_productivityTools();
    PREFERRED_OLLAMA_PREFIXES = [
      "llama3.2",
      "qwen2.5",
      "llama3.1",
      "mistral",
      "gemma2",
      "phi3",
      "phi4",
      "deepseek-r1",
      "llama3"
    ];
  }
});

// server.ts
import "dotenv/config";
import express from "express";
import fs4 from "fs";
import path4 from "path";

// server/store.ts
import fs2 from "fs";
import path2 from "path";

// server/fileService.ts
init_fileIndex();
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
var IGNORED_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "dist-electron", ".playwright-cli", ".friday-data"]);
var TEXT_PREVIEW_EXTS = /* @__PURE__ */ new Set(["ts", "tsx", "js", "jsx", "json", "md", "txt", "css", "html", "csv", "py", "sql"]);
var cachedIndex = null;
function getDefaultPermittedFolders() {
  const cwd = path.resolve(process.cwd());
  const candidates = [cwd];
  if (process.platform === "win32") {
    const home = os.homedir();
    for (const sub of ["Downloads", "Desktop", "Documents", "Pictures", "Videos", "Music"]) {
      const full = path.join(home, sub);
      if (fs.existsSync(full)) {
        candidates.push(full);
      }
    }
  }
  return Array.from(new Set(candidates));
}
function invalidateFileIndexCache() {
  cachedIndex = null;
}
function isPathPermitted(targetPath, allowedFolders) {
  if (!targetPath || targetPath.includes("\0")) return false;
  if (process.platform !== "win32" && /^[a-zA-Z]:[\\/]/.test(targetPath.trim())) {
    return false;
  }
  const resolvedTarget = path.resolve(targetPath);
  return allowedFolders.some((folder) => {
    const resolvedRoot = path.resolve(folder);
    return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep);
  });
}
function scanPermittedFolders(allowedFolders, paused, maxFiles = 250) {
  if (paused) return [];
  const results = [];
  function walk(dir, rootDir, depth) {
    if (depth > 4 || results.length >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          walk(fullPath, rootDir, depth + 1);
        }
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          const ext = path.extname(entry.name).replace(/^\./, "").toLowerCase();
          let previewText;
          if (TEXT_PREVIEW_EXTS.has(ext) && stat.size < 64 * 1024) {
            previewText = fs.readFileSync(fullPath, "utf-8").slice(0, 400);
          }
          results.push({
            id: crypto.createHash("sha1").update(fullPath).digest("hex").slice(0, 16),
            name: entry.name,
            path: fullPath,
            relativePath: path.relative(rootDir, fullPath) || entry.name,
            extension: ext || "file",
            category: categorizeExtension(ext),
            sizeBytes: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            createdAt: stat.birthtime.toISOString(),
            previewText
          });
        } catch {
        }
      }
    }
  }
  for (const folder of allowedFolders) {
    if (fs.existsSync(folder)) {
      walk(path.resolve(folder), path.resolve(folder), 0);
    }
  }
  return results;
}
function getCachedFileIndex(allowedFolders, paused, maxFiles = 300, ttlMs = 3e4) {
  if (paused) return [];
  const key = `${allowedFolders.join("|")}::${maxFiles}`;
  const now = Date.now();
  if (cachedIndex && cachedIndex.key === key && now - cachedIndex.scannedAt < ttlMs) {
    return cachedIndex.files;
  }
  const files = scanPermittedFolders(allowedFolders, paused, maxFiles);
  cachedIndex = { key, scannedAt: now, files };
  return files;
}
function readPermittedFilePreview(filePath, allowedFolders) {
  const resolved = path.resolve(filePath);
  if (!isPathPermitted(resolved, allowedFolders)) {
    throw new Error("Access denied: file is outside user-permitted folders.");
  }
  if (!fs.existsSync(resolved)) {
    throw new Error("File not found.");
  }
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    throw new Error("Selected path is a directory.");
  }
  const ext = path.extname(resolved).replace(/^\./, "").toLowerCase();
  const category = categorizeExtension(ext);
  if (category === "image" || category === "video" || category === "audio") {
    return {
      name: path.basename(resolved),
      content: `[Binary ${category} file: ${path.basename(resolved)} \xB7 Use Open in Default App or /api/files/stream to view/play.]`,
      sizeBytes: stat.size,
      extension: ext,
      category
    };
  }
  if (stat.size > 512 * 1024) {
    return {
      name: path.basename(resolved),
      content: fs.readFileSync(resolved, "utf-8").slice(0, 16e3) + "\n\n... [Preview truncated at 16 KB]",
      sizeBytes: stat.size,
      extension: ext,
      category
    };
  }
  return {
    name: path.basename(resolved),
    content: fs.readFileSync(resolved, "utf-8"),
    sizeBytes: stat.size,
    extension: ext,
    category
  };
}

// server/store.ts
var DATA_DIR = process.env.FRIDAY_DATA_DIR ? path2.resolve(process.env.FRIDAY_DATA_DIR) : path2.resolve(process.cwd(), ".friday-data");
var DB_PATH = path2.join(DATA_DIR, "friday-db.json");
function getTodayIsoDate(offsetDays = 0) {
  const d = /* @__PURE__ */ new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
var DEFAULT_DB = {
  settings: {
    assistantName: "F.R.I.D.A.Y.",
    userName: "Siddesh",
    wakeWord: "Hey Friday",
    aiModel: "local-auto",
    ollamaModel: "",
    voiceName: "Kore",
    voiceGender: "female",
    speakingSpeed: 1,
    speakingPitch: 1,
    language: "en-US",
    continuousListening: false,
    wakeWordEnabled: true,
    autoSpeakReplies: false,
    pushToTalkKey: "Space",
    reopenShortcut: "Ctrl+Shift+Space",
    startFullscreen: true,
    launchOnStartup: false,
    themeAccent: "violet",
    animationQuality: "high",
    weatherLocation: "Kolhapur, MH",
    allowedFolders: getDefaultPermittedFolders(),
    pausedIndexing: false,
    screenCaptureConsent: false,
    wallpaper: {
      mode: "aurora-command",
      blurPx: 0,
      brightnessPercent: 95,
      opacityPercent: 92,
      performanceMode: false
    },
    hologram: {
      mode: "orbital",
      projectionBeam: true,
      scanlineIntensity: 0.65,
      holoOpacity: 0.85,
      autoRotate: true
    },
    enabledAgents: {
      core: true,
      voice: true,
      system: true,
      file: true,
      browser: true,
      application: true,
      vision: true,
      media: true,
      calendar: true,
      memory: true,
      automation: true
    }
  },
  calendar: [
    {
      id: "evt-1",
      title: "F.R.I.D.A.Y. Architecture & Telemetry Review",
      date: getTodayIsoDate(0),
      time: "10:30",
      category: "meeting",
      completed: false,
      notes: "Inspect multi-agent execution graph and latency metrics.",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      id: "evt-2",
      title: "Index Project Documents & Verify File Permissions",
      date: getTodayIsoDate(0),
      time: "14:00",
      category: "task",
      completed: false,
      notes: "Ensure only explicitly permitted directories are indexed.",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      id: "evt-3",
      title: "Deep Focus: Edge AI & Embedded Prototype",
      date: getTodayIsoDate(1),
      time: "09:00",
      category: "focus",
      completed: false,
      notes: "Review Raspberry Pi hardware benchmarks.",
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  ],
  memory: [
    {
      id: "mem-1",
      category: "profile",
      key: "Preferred Assistant Persona",
      value: "Concise, proactive, technical clarity without unnecessary filler.",
      approved: true,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      id: "mem-2",
      category: "project",
      key: "Primary Engineering Workspace",
      value: "F.R.I.D.A.Y. Desktop AI Companion & Multi-Agent Command Center",
      approved: true,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      id: "mem-3",
      category: "workflow",
      key: "Privacy Guardrail",
      value: "Always confirm before deleting files, modifying schedules, or capturing screen.",
      approved: true,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  ],
  chatHistory: [
    {
      id: "msg-welcome",
      role: "assistant",
      content: "F.R.I.D.A.Y. Command Center initialized. All eleven specialist agents are standing by. Ask me to inspect system performance, search permitted files, research the web with citations, or manage your schedule.",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      intent: "system_boot"
    }
  ],
  actionLogs: [
    {
      id: "log-1",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      agent: "core",
      action: "Initialize Multi-Agent Bus",
      target: "11 Specialist Agents",
      status: "completed",
      detail: "Command orchestrator ready"
    },
    {
      id: "log-2",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      agent: "file",
      action: "Enforce Folder Sandbox",
      target: path2.basename(process.cwd()) || "workspace",
      status: "completed",
      detail: "Least-privilege directory permissions verified"
    }
  ],
  workflows: [
    {
      id: "wf-morning-brief",
      name: "Morning Executive Briefing",
      description: "Checks live system health, today\u2019s calendar schedule, and local weather forecast.",
      triggerPhrase: "Run morning briefing workflow",
      steps: [
        { agent: "system", action: "Sample CPU, memory, storage & battery diagnostics" },
        { agent: "calendar", action: "Retrieve today\u2019s meetings and priority tasks" },
        { agent: "core", action: "Synthesize concise spoken & visual daily summary" }
      ],
      enabled: true,
      runCount: 1,
      lastRunAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    {
      id: "wf-workspace-audit",
      name: "Workspace File & Duplicate Audit",
      description: "Scans permitted folders for recent files and potential duplicates without modifying anything.",
      triggerPhrase: "Run workspace file audit",
      steps: [
        { agent: "file", action: "Index permitted directory tree" },
        { agent: "file", action: "Identify duplicate candidates by name and size" },
        { agent: "core", action: "Report findings for user review" }
      ],
      enabled: true,
      runCount: 0
    }
  ],
  apps: [
    {
      id: "app-vscode",
      name: "Visual Studio Code",
      category: "development",
      command: "code",
      installed: true,
      pinned: true,
      description: "Source code editor and workspace IDE"
    },
    {
      id: "app-chrome",
      name: "Google Chrome",
      category: "browser",
      command: "google-chrome",
      installed: true,
      pinned: true,
      description: "Web browser and developer inspector"
    },
    {
      id: "app-terminal",
      name: "Windows Terminal",
      category: "system",
      command: "wt",
      installed: true,
      pinned: true,
      description: "PowerShell, CMD, and WSL command shell"
    },
    {
      id: "app-explorer",
      name: "File Explorer",
      category: "system",
      command: "explorer",
      installed: true,
      pinned: true,
      description: "Local desktop file manager"
    },
    {
      id: "app-whatsapp",
      name: "WhatsApp Desktop",
      category: "communication",
      command: "whatsapp",
      installed: false,
      pinned: false,
      description: "Desktop messaging client"
    },
    {
      id: "app-android-studio",
      name: "Android Studio",
      category: "development",
      command: "studio64",
      installed: false,
      pinned: false,
      description: "Mobile SDK & emulator environment"
    },
    {
      id: "app-spotify",
      name: "Media Player",
      category: "media",
      command: "spotify",
      installed: false,
      pinned: false,
      description: "Audio playback & playlists"
    },
    {
      id: "app-notes",
      name: "Notes & Scratchpad",
      category: "productivity",
      command: "notepad",
      installed: true,
      pinned: false,
      description: "Quick plain-text note capture"
    }
  ]
};
function ensureDbDir() {
  if (!fs2.existsSync(DATA_DIR)) {
    fs2.mkdirSync(DATA_DIR, { recursive: true });
  }
}
function loadDb() {
  ensureDbDir();
  if (!fs2.existsSync(DB_PATH)) {
    fs2.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), "utf-8");
    return structuredClone(DEFAULT_DB);
  }
  try {
    const raw = fs2.readFileSync(DB_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const hasGemKey = Boolean(
      process.env.GEMINI_API_KEY?.trim() && process.env.GEMINI_API_KEY.trim() !== "MY_GEMINI_API_KEY"
    );
    const mergedSettings = {
      ...DEFAULT_DB.settings,
      ...parsed.settings,
      wallpaper: { ...DEFAULT_DB.settings.wallpaper, ...parsed.settings?.wallpaper || {} },
      hologram: { ...DEFAULT_DB.settings.hologram, ...parsed.settings?.hologram || {} },
      enabledAgents: { ...DEFAULT_DB.settings.enabledAgents, ...parsed.settings?.enabledAgents || {} }
    };
    if (!hasGemKey && mergedSettings.aiModel?.startsWith("gemini-")) {
      mergedSettings.aiModel = "local-auto";
    }
    if (mergedSettings.userName === "Vishvajit Pawar" || mergedSettings.userName === "Vishvajit") {
      mergedSettings.userName = "Siddesh";
    }
    if (mergedSettings.reopenShortcut === "Ctrl+Space") {
      mergedSettings.reopenShortcut = "Ctrl+Shift+Space";
    }
    if (!Array.isArray(mergedSettings.allowedFolders) || mergedSettings.allowedFolders.length === 0 || process.platform === "win32" && mergedSettings.allowedFolders.length === 1 && path2.resolve(mergedSettings.allowedFolders[0]) === path2.resolve(process.cwd())) {
      mergedSettings.allowedFolders = getDefaultPermittedFolders();
    }
    return {
      settings: mergedSettings,
      calendar: Array.isArray(parsed.calendar) ? parsed.calendar : DEFAULT_DB.calendar,
      memory: Array.isArray(parsed.memory) ? parsed.memory : DEFAULT_DB.memory,
      chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory : DEFAULT_DB.chatHistory,
      actionLogs: Array.isArray(parsed.actionLogs) ? parsed.actionLogs : DEFAULT_DB.actionLogs,
      workflows: Array.isArray(parsed.workflows) ? parsed.workflows : DEFAULT_DB.workflows,
      apps: Array.isArray(parsed.apps) ? parsed.apps : DEFAULT_DB.apps
    };
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}
function saveDb(db) {
  ensureDbDir();
  fs2.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}
function appendActionLog(db, entry) {
  const log = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...entry
  };
  db.actionLogs = [log, ...db.actionLogs].slice(0, 80);
  saveDb(db);
  return log;
}

// server/systemService.ts
import os2 from "os";
import { execFile as execFile2, spawn as spawn2 } from "child_process";
import { promisify as promisify2 } from "util";
import si from "systeminformation";

// electron/windowsAutomation.ts
import { execFile, spawn } from "child_process";
import { promisify } from "util";
var execFileAsync = promisify(execFile);
var SAFE_PROCESS_NAME = /^[a-zA-Z0-9._ -]+$/;
var SAFE_COMMAND_OR_APPID = /^[a-zA-Z0-9._:\\/\s-]+$/;
var MEDIA_VK_MAP = {
  play_pause: 179,
  // VK_MEDIA_PLAY_PAUSE
  next: 176,
  // VK_MEDIA_NEXT_TRACK
  previous: 177,
  // VK_MEDIA_PREV_TRACK
  volume_up: 175,
  // VK_VOLUME_UP
  volume_down: 174,
  // VK_VOLUME_DOWN
  mute: 173
  // VK_VOLUME_MUTE
};
async function discoverWindowsStartApps() {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Command", "Get-StartApps | Select-Object -First 80 Name, AppID | ConvertTo-Json"],
      { timeout: 6e3 }
    );
    const parsed = JSON.parse(stdout || "[]");
    const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return rows.filter((item) => item?.Name && item?.AppID).map((item) => ({ name: String(item.Name), appId: String(item.AppID) }));
  } catch {
    return [];
  }
}
async function listActiveWindows() {
  if (process.platform !== "win32") return [];
  try {
    const script = 'Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 30 Id, ProcessName, MainWindowTitle | ConvertTo-Json';
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      timeout: 5e3
    });
    const parsed = JSON.parse(stdout || "[]");
    const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return rows.map((r) => ({
      id: Number(r.Id),
      name: String(r.ProcessName || ""),
      title: String(r.MainWindowTitle || "")
    }));
  } catch {
    return [];
  }
}
async function focusWindowsWindow(processName) {
  if (process.platform !== "win32") return false;
  if (!SAFE_PROCESS_NAME.test(processName)) return false;
  const safeName = processName.replace(/['"`$]/g, "");
  const script = `
    $wshell = New-Object -ComObject wscript.shell;
    $proc = Get-Process | Where-Object { $_.MainWindowTitle -ne "" -and ($_.ProcessName -like "*${safeName}*" -or $_.MainWindowTitle -like "*${safeName}*") } | Select-Object -First 1;
    if ($proc) { $wshell.AppActivate($proc.Id) } else { $false }
  `;
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
    timeout: 4e3
  });
  return stdout.trim().toLowerCase() === "true";
}
async function setWindowsWindowState(processName, state) {
  if (process.platform !== "win32") return false;
  if (!SAFE_PROCESS_NAME.test(processName)) return false;
  const safeName = processName.replace(/['"`$]/g, "");
  const showCode = state === "minimize" ? 6 : state === "maximize" ? 3 : 9;
  const script = `
    Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);' -Name Win32ShowWindow -Namespace Win32Funcs -ErrorAction SilentlyContinue;
    $proc = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -like "*${safeName}*" -or $_.MainWindowTitle -like "*${safeName}*") } | Select-Object -First 1;
    if ($proc) { [Win32Funcs.Win32ShowWindow]::ShowWindowAsync($proc.MainWindowHandle, ${showCode}) } else { $false }
  `;
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      timeout: 4e3
    });
    return stdout.trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}
async function closeWindowsWindow(processName) {
  if (process.platform !== "win32") {
    return { closed: false, detail: "Window closing is only available on a Windows host." };
  }
  if (!SAFE_PROCESS_NAME.test(processName)) {
    return { closed: false, detail: "Disallowed process identifier." };
  }
  const safeName = processName.replace(/['"`$]/g, "");
  const script = `
    $procs = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -like "*${safeName}*" -or $_.MainWindowTitle -like "*${safeName}*") };
    if ($procs) {
      $procs | ForEach-Object { $_.CloseMainWindow() | Out-Null };
      "CLOSED:" + $procs.Count
    } else {
      "NOT_FOUND"
    }
  `;
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      timeout: 4500
    });
    const out = stdout.trim();
    if (out.startsWith("CLOSED:")) {
      return { closed: true, detail: `Requested graceful close for "${safeName}".` };
    }
    return { closed: false, detail: `No running window matched "${safeName}".` };
  } catch (err) {
    return { closed: false, detail: err.message };
  }
}
async function launchWindowsTarget(command) {
  if (process.platform !== "win32") {
    return { launched: false, detail: "Not running on a Windows host." };
  }
  const clean = command.trim();
  if (!clean || !SAFE_COMMAND_OR_APPID.test(clean)) {
    return { launched: false, detail: "Application identifier contains disallowed characters." };
  }
  return new Promise((resolve) => {
    try {
      const isAppId = clean.includes("!");
      const args = isAppId ? ["/c", "start", "", `shell:AppsFolder\\${clean}`] : ["/c", "start", "", clean];
      const child = spawn("cmd.exe", args, {
        detached: true,
        stdio: "ignore",
        shell: false
      });
      child.once("error", (err) => {
        resolve({ launched: false, detail: err.message });
      });
      child.unref();
      resolve({ launched: true, detail: `Dispatched Windows application launch for "${clean}".` });
    } catch (err) {
      resolve({ launched: false, detail: err.message });
    }
  });
}
async function openLocalPathInDefaultApp(targetPath) {
  if (!targetPath || targetPath.includes("\0")) {
    return { opened: false, detail: "Invalid target path." };
  }
  if (process.platform === "win32") {
    return new Promise((resolve) => {
      try {
        const child = spawn("cmd.exe", ["/c", "start", "", targetPath], {
          detached: true,
          stdio: "ignore",
          shell: false
        });
        child.once("error", (err) => resolve({ opened: false, detail: err.message }));
        child.unref();
        resolve({ opened: true, detail: `Opened "${targetPath}" using default Windows handler.` });
      } catch (err) {
        resolve({ opened: false, detail: err.message });
      }
    });
  }
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return {
      opened: false,
      detail: "File verified in permitted storage; native OS viewer requires a desktop session (e.g. Windows)."
    };
  }
  return new Promise((resolve) => {
    const child = spawn("xdg-open", [targetPath], { detached: true, stdio: "ignore", shell: false });
    child.once("error", (err) => resolve({ opened: false, detail: err.message }));
    child.unref();
    resolve({ opened: true, detail: `Opened "${targetPath}".` });
  });
}
async function sendWindowsMediaKey(action) {
  if (process.platform !== "win32") {
    return {
      executed: false,
      detail: `System media control (${action}) requires a Windows host session.`
    };
  }
  const vk = MEDIA_VK_MAP[action];
  if (!vk) {
    return { executed: false, detail: "Unsupported media key action." };
  }
  const repeat = action === "volume_up" || action === "volume_down" ? 4 : 1;
  const script = `
    Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);' -Name Win32Keys -Namespace Win32Media -ErrorAction SilentlyContinue;
    for ($i = 0; $i -lt ${repeat}; $i++) {
      [Win32Media.Win32Keys]::keybd_event(${vk}, 0, 0, [UIntPtr]::Zero);
      [Win32Media.Win32Keys]::keybd_event(${vk}, 0, 2, [UIntPtr]::Zero);
    }
  `;
  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], { timeout: 3e3 });
    return { executed: true, detail: `Executed Windows media action: ${action.replace(/_/g, " ")}.` };
  } catch (err) {
    return { executed: false, detail: err.message };
  }
}

// server/systemService.ts
var execFileAsync2 = promisify2(execFile2);
var cachedStaticInfo = null;
var cachedStartApps = null;
var cachedDetectedAt = 0;
async function getSystemTelemetry() {
  if (!cachedStaticInfo) {
    const [cpu, graphics2, osInfo] = await Promise.all([
      si.cpu().catch(() => null),
      si.graphics().catch(() => null),
      si.osInfo().catch(() => null)
    ]);
    const primaryGpu = graphics2?.controllers?.[0];
    cachedStaticInfo = {
      cpuModel: cpu ? `${cpu.manufacturer} ${cpu.brand}`.trim() : os2.cpus()[0]?.model ?? "Unavailable",
      cpuCores: cpu?.cores ?? os2.cpus().length,
      gpuName: primaryGpu?.model?.trim() || "Unavailable",
      platform: osInfo ? `${osInfo.distro || osInfo.platform} (${os2.arch()})` : `${os2.platform()} (${os2.arch()})`,
      hostname: osInfo?.hostname ?? os2.hostname()
    };
  }
  const [load, mem, fsSizes, netStats, battery, temp, graphics] = await Promise.all([
    si.currentLoad().catch(() => null),
    si.mem().catch(() => null),
    si.fsSize().catch(() => []),
    si.networkStats().catch(() => []),
    si.battery().catch(() => null),
    si.cpuTemperature().catch(() => null),
    si.graphics().catch(() => null)
  ]);
  const ramTotalBytes = mem?.total ?? os2.totalmem();
  const ramUsedBytes = mem?.active ?? ramTotalBytes - os2.freemem();
  const ramTotalGb = Number((ramTotalBytes / 1024 ** 3).toFixed(1));
  const ramUsedGb = Number((ramUsedBytes / 1024 ** 3).toFixed(1));
  const ramPercent = ramTotalBytes > 0 ? Math.round(ramUsedBytes / ramTotalBytes * 100) : 0;
  const primaryDisk = fsSizes.find((d) => d.mount === "/" || d.mount.toUpperCase().startsWith("C:")) ?? fsSizes[0];
  const storageTotalGb = primaryDisk ? Number((primaryDisk.size / 1024 ** 3).toFixed(1)) : 0;
  const storageUsedGb = primaryDisk ? Number((primaryDisk.used / 1024 ** 3).toFixed(1)) : 0;
  const storagePercent = primaryDisk ? Math.round(primaryDisk.use ?? 0) : 0;
  const totalRxSec = netStats.reduce((sum, n) => sum + (n.rx_sec > 0 ? n.rx_sec : 0), 0);
  const totalTxSec = netStats.reduce((sum, n) => sum + (n.tx_sec > 0 ? n.tx_sec : 0), 0);
  const gpuCtrl = graphics?.controllers?.[0];
  return {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    cpuLoad: Math.round(load?.currentLoad ?? 0),
    cpuTemp: temp?.main && temp.main > 0 ? Math.round(temp.main) : null,
    cpuCores: cachedStaticInfo.cpuCores,
    cpuModel: cachedStaticInfo.cpuModel,
    gpuName: cachedStaticInfo.gpuName,
    gpuUsage: typeof gpuCtrl?.utilizationGpu === "number" ? Math.round(gpuCtrl.utilizationGpu) : null,
    gpuTemp: typeof gpuCtrl?.temperatureGpu === "number" ? Math.round(gpuCtrl.temperatureGpu) : null,
    ramUsedGb,
    ramTotalGb,
    ramPercent,
    storageUsedGb,
    storageTotalGb,
    storagePercent,
    networkRxKbps: Number((totalRxSec / 1024).toFixed(1)),
    networkTxKbps: Number((totalTxSec / 1024).toFixed(1)),
    batteryPercent: battery?.hasBattery ? Math.round(battery.percent) : null,
    batteryCharging: battery?.hasBattery ? battery.isCharging : null,
    uptimeSeconds: Math.round(os2.uptime()),
    platform: cachedStaticInfo.platform,
    hostname: cachedStaticInfo.hostname
  };
}
async function checkCommandAvailable(command) {
  if (!/^[a-zA-Z0-9._-]+$/.test(command)) return false;
  try {
    const checker = process.platform === "win32" ? "where" : "which";
    await execFileAsync2(checker, [command], { timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}
async function getCachedWindowsStartApps() {
  if (process.platform !== "win32") return [];
  const now = Date.now();
  if (cachedStartApps && now - cachedStartApps.fetchedAt < 12e4) {
    return cachedStartApps.apps;
  }
  const apps = await discoverWindowsStartApps();
  cachedStartApps = { fetchedAt: now, apps };
  return apps;
}
async function detectInstalledApps(apps, force = false) {
  const now = Date.now();
  if (!force && cachedDetectedAt && now - cachedDetectedAt < 6e4) {
    return apps;
  }
  const [checked, startApps] = await Promise.all([
    Promise.all(
      apps.map(async (app) => {
        const available = await checkCommandAvailable(app.command);
        return { ...app, installed: available };
      })
    ),
    getCachedWindowsStartApps()
  ]);
  const enriched = checked.map((item) => {
    if (item.installed || startApps.length === 0) return item;
    const match = startApps.find((s) => s.name.toLowerCase().includes(item.name.split(" ")[0].toLowerCase()));
    return match ? { ...item, installed: true } : item;
  });
  const existingNames = new Set(enriched.map((a) => a.name.toLowerCase()));
  for (const sa of startApps.slice(0, 16)) {
    if (!existingNames.has(sa.name.toLowerCase())) {
      existingNames.add(sa.name.toLowerCase());
      enriched.push({
        id: `win-${sa.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 28)}`,
        name: sa.name,
        category: "productivity",
        command: sa.appId,
        installed: true,
        pinned: false,
        description: "Discovered Windows Start Application"
      });
    }
  }
  cachedDetectedAt = now;
  return enriched;
}
var SEMANTIC_APP_ALIASES = [
  { rx: /\b(coding|ide|vs\s*code|vscode|visual\s+studio\s+code)\b/i, lookup: "code", winCommands: ["code", "Code"] },
  { rx: /\b(chrome|google\s+chrome|browser)\b/i, lookup: "chrome", winCommands: ["chrome", "msedge"] },
  { rx: /\b(edge|microsoft\s+edge)\b/i, lookup: "msedge", winCommands: ["msedge"] },
  { rx: /\b(spotify|music\s+player)\b/i, lookup: "spotify", winCommands: ["spotify"] },
  { rx: /\b(whatsapp|messaging)\b/i, lookup: "whatsapp", winCommands: ["whatsapp"] },
  { rx: /\b(terminal|powershell|cmd|shell)\b/i, lookup: "wt", winCommands: ["wt", "powershell", "cmd"] },
  { rx: /\b(explorer|files|file\s+explorer)\b/i, lookup: "explorer", winCommands: ["explorer"] },
  { rx: /\b(notepad|notes)\b/i, lookup: "notepad", winCommands: ["notepad"] },
  { rx: /\b(calculator|calc)\b/i, lookup: "calc", winCommands: ["calc"] },
  { rx: /\b(vlc)\b/i, lookup: "vlc", winCommands: ["vlc"] }
];
async function launchApplication(app) {
  if (process.platform === "win32") {
    const winTarget = app.command === "google-chrome" ? "chrome" : app.command;
    const available2 = winTarget.includes("!") || await checkCommandAvailable(winTarget);
    const result = await launchWindowsTarget(available2 ? winTarget : app.name);
    return {
      launched: result.launched,
      message: result.launched ? `Launched ${app.name} on Windows desktop.` : result.detail
    };
  }
  const available = await checkCommandAvailable(app.command);
  if (!available) {
    return {
      launched: false,
      message: `${app.name} (${app.command}) is unavailable in this host environment. Run F.R.I.D.A.Y. in Windows Electron mode to launch local desktop applications.`
    };
  }
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return {
      launched: false,
      message: `${app.name} binary exists, but no desktop display session is active on this headless server.`
    };
  }
  return new Promise((resolve) => {
    try {
      const child = spawn2(app.command, [], { detached: true, stdio: "ignore", shell: false });
      child.once("error", (err) => {
        resolve({ launched: false, message: `Failed to launch ${app.name}: ${err.message}` });
      });
      child.unref();
      resolve({ launched: true, message: `Launched ${app.name} (${app.command}).` });
    } catch (err) {
      resolve({ launched: false, message: `Failed to launch ${app.name}: ${err.message}` });
    }
  });
}
async function handleAppOrWindowCommand(userCommand, apps) {
  const lower = userCommand.toLowerCase();
  if (/\b(running|active\s+windows|applications\s+currently\s+running)\b/i.test(lower)) {
    const windows = await listActiveWindows();
    return {
      handled: true,
      windows,
      message: windows.length > 0 ? `Active Windows (${windows.length}):
${windows.slice(0, 10).map((w) => `- ${w.name}: ${w.title}`).join("\n")}` : process.platform === "win32" ? "No active application windows with titles were detected." : "Running window enumeration requires a live Windows desktop session."
    };
  }
  const alias = SEMANTIC_APP_ALIASES.find((a) => a.rx.test(lower));
  const matchedApp = apps.find((a) => lower.includes(a.name.toLowerCase()) || lower.includes(a.command.toLowerCase())) || (alias ? apps.find(
    (a) => a.command.toLowerCase().includes(alias.lookup) || a.name.toLowerCase().includes(alias.lookup)
  ) : void 0);
  const targetName = matchedApp?.command === "google-chrome" ? "chrome" : matchedApp?.command || alias?.lookup || "";
  if (/\b(minimize)\b/i.test(lower) && targetName) {
    const ok = await setWindowsWindowState(targetName, "minimize");
    return {
      handled: true,
      message: ok ? `Minimized ${matchedApp?.name || targetName}.` : `Could not locate an active window for "${matchedApp?.name || targetName}" to minimize.`
    };
  }
  if (/\b(maximize)\b/i.test(lower) && targetName) {
    const ok = await setWindowsWindowState(targetName, "maximize");
    return {
      handled: true,
      message: ok ? `Maximized ${matchedApp?.name || targetName}.` : `Could not locate an active window for "${matchedApp?.name || targetName}" to maximize.`
    };
  }
  if (/\b(switch\s+to|focus)\b/i.test(lower) && targetName) {
    const ok = await focusWindowsWindow(targetName);
    if (ok) {
      return { handled: true, message: `Switched focus to ${matchedApp?.name || targetName}.` };
    }
    if (matchedApp) {
      const launched = await launchApplication(matchedApp);
      return { handled: true, launchedApp: matchedApp, message: launched.message };
    }
    return {
      handled: true,
      message: `No running window matched "${targetName}".`
    };
  }
  if (matchedApp) {
    const launched = await launchApplication(matchedApp);
    return { handled: true, launchedApp: matchedApp, message: launched.message };
  }
  const startApps = await getCachedWindowsStartApps();
  const startMatch = startApps.find((s) => lower.includes(s.name.toLowerCase()));
  if (startMatch) {
    const res = await launchWindowsTarget(startMatch.appId);
    return {
      handled: true,
      message: res.launched ? `Launched ${startMatch.name}.` : res.detail
    };
  }
  return {
    handled: true,
    message: `Which application would you like to open or switch to? Installed/known targets include: ${apps.slice(0, 8).map((a) => a.name).join(", ")}.`
  };
}
async function closeWindowSafe(targetSummary) {
  const m = targetSummary.match(/\b(?:close|kill|terminate)\s+([a-zA-Z0-9._ -]{2,40})/i);
  const name = (m?.[1] || targetSummary).trim();
  const alias = SEMANTIC_APP_ALIASES.find((a) => a.rx.test(name));
  return closeWindowsWindow(alias?.lookup || name);
}
async function getTopProcesses(limit = 12) {
  const data = await si.processes().catch(() => null);
  if (!data?.list) return [];
  return [...data.list].sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0)).slice(0, limit).map((p) => ({
    pid: p.pid,
    name: p.name || "process",
    cpu: Number((p.cpu ?? 0).toFixed(1)),
    mem: Number((p.mem ?? 0).toFixed(1)),
    state: p.state || "running"
  }));
}

// server/weatherService.ts
var WMO_CONDITIONS = {
  0: "Clear Sky",
  1: "Mainly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime Fog",
  51: "Light Drizzle",
  53: "Moderate Drizzle",
  55: "Dense Drizzle",
  61: "Slight Rain",
  63: "Moderate Rain",
  65: "Heavy Rain",
  71: "Slight Snow",
  73: "Moderate Snow",
  75: "Heavy Snow",
  80: "Rain Showers",
  81: "Moderate Showers",
  82: "Violent Showers",
  95: "Thunderstorm"
};
var cachedWeather = null;
async function getWeatherForLocation(locationQuery) {
  const cleanLocation = locationQuery.trim() || "San Francisco, US";
  const now = Date.now();
  if (cachedWeather && cachedWeather.key === cleanLocation && now - cachedWeather.fetchedAt < 10 * 60 * 1e3) {
    return cachedWeather.data;
  }
  let latitude = 37.7749;
  let longitude = -122.4194;
  let resolvedName = cleanLocation;
  try {
    const cityOnly = cleanLocation.split(",")[0].trim();
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityOnly)}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(4e3) }
    );
    if (geoRes.ok) {
      const geoJson = await geoRes.json();
      const first = geoJson.results?.[0];
      if (first) {
        latitude = first.latitude;
        longitude = first.longitude;
        resolvedName = first.country ? `${first.name}, ${first.country}` : first.name;
      }
    }
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=4`;
    const res = await fetch(weatherUrl, { signal: AbortSignal.timeout(5e3) });
    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }
    const json = await res.json();
    const forecast = (json.daily.time ?? []).slice(0, 4).map((date, idx) => ({
      date,
      tempMax: Math.round(json.daily.temperature_2m_max[idx] ?? 0),
      tempMin: Math.round(json.daily.temperature_2m_min[idx] ?? 0),
      code: json.daily.weather_code[idx] ?? 0,
      condition: WMO_CONDITIONS[json.daily.weather_code[idx] ?? 0] ?? "Clear"
    }));
    const data = {
      location: resolvedName,
      latitude,
      longitude,
      temperature: Math.round(json.current.temperature_2m),
      condition: WMO_CONDITIONS[json.current.weather_code] ?? "Clear",
      humidity: Math.round(json.current.relative_humidity_2m),
      windSpeedKmh: Math.round(json.current.wind_speed_10m),
      feelsLike: Math.round(json.current.apparent_temperature),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      forecast,
      source: "Open-Meteo Live API"
    };
    cachedWeather = { key: cleanLocation, fetchedAt: now, data };
    return data;
  } catch (err) {
    if (cachedWeather) return cachedWeather.data;
    throw err;
  }
}

// server/aiService.ts
init_intentEngine();
init_fileIndex();
init_unitConverter();
init_translator();
init_productivityTools();
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// server/mediaService.ts
init_fileIndex();
async function handleMediaVoiceCommand(userCommand, allowedFolders, pausedIndexing) {
  const lower = userCommand.toLowerCase();
  if (/\b(increase|raise|turn\s+up)\b.*\b(volume|sound|audio)\b/.test(lower)) {
    const res = await sendWindowsMediaKey("volume_up");
    return {
      handled: true,
      mediaAction: "volume_up",
      message: res.executed ? "Increased system volume." : res.detail
    };
  }
  if (/\b(decrease|lower|turn\s+down)\b.*\b(volume|sound|audio)\b/.test(lower)) {
    const res = await sendWindowsMediaKey("volume_down");
    return {
      handled: true,
      mediaAction: "volume_down",
      message: res.executed ? "Decreased system volume." : res.detail
    };
  }
  if (/\b(mute|unmute)\b/.test(lower)) {
    const res = await sendWindowsMediaKey("mute");
    return {
      handled: true,
      mediaAction: "mute",
      message: res.executed ? "Toggled system audio mute." : res.detail
    };
  }
  if (/\b(next\s+(track|song)|skip\s+song)\b/.test(lower)) {
    const res = await sendWindowsMediaKey("next");
    return {
      handled: true,
      mediaAction: "next",
      message: res.executed ? "Skipped to next media track." : res.detail
    };
  }
  if (/\b(previous\s+(track|song)|prev\s+song)\b/.test(lower)) {
    const res = await sendWindowsMediaKey("previous");
    return {
      handled: true,
      mediaAction: "previous",
      message: res.executed ? "Returned to previous media track." : res.detail
    };
  }
  if (/\b(pause|resume)\b/.test(lower) && !/\bplay\b.*\b(music|song|video|downloaded|favourite|favorite)\b/.test(lower)) {
    const res = await sendWindowsMediaKey("play_pause");
    return {
      handled: true,
      mediaAction: "play_pause",
      message: res.executed ? "Toggled media playback (Play/Pause)." : res.detail
    };
  }
  const files = getCachedFileIndex(allowedFolders, pausedIndexing, 300);
  const wantVideo = /\b(video|movie|clip)\b/.test(lower);
  const wantAudio = /\b(music|song|audio|track|listen|favourite|favorite)\b/.test(lower);
  const category = wantVideo ? "video" : wantAudio ? "audio" : "all";
  const matches = searchIndexedFiles(files, userCommand, category);
  if (matches.length === 0) {
    return {
      handled: true,
      message: wantVideo ? "No video files were found in your permitted folders (Downloads, Videos, Desktop, or workspace). Grant access to your Videos or Downloads folder in Settings." : "No local music or audio files were found in your permitted folders (Music, Downloads, or workspace). Grant access to your Music or Downloads folder in Settings."
    };
  }
  const top = matches[0];
  const openRes = await openLocalPathInDefaultApp(top.path);
  return {
    handled: true,
    matchedFile: top,
    message: openRes.opened ? `Playing "${top.name}" (${formatBytes(top.sizeBytes)}, ${top.relativePath}) using your default Windows player.` : `Found "${top.name}" (${formatBytes(top.sizeBytes)} at ${top.relativePath}). ${openRes.detail}`
  };
}

// server/aiService.ts
init_internetResearchService();
init_localAiService();
var recentPipelineTimings = [];
function getRecentPipelineTimings() {
  return [...recentPipelineTimings];
}
function recordPipelineTiming(timing) {
  recentPipelineTimings.unshift(timing);
  if (recentPipelineTimings.length > 20) {
    recentPipelineTimings.length = 20;
  }
}
function hasValidGeminiKey() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== "MY_GEMINI_API_KEY");
}
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY is not configured. F.R.I.D.A.Y. is running in paid-key-free local AI mode."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 2e4,
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
function extractGroundingSources(response) {
  const r = response;
  const chunks = r?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = /* @__PURE__ */ new Set();
  const sources = [];
  for (const c of chunks) {
    const uri = c.web?.uri;
    const title = c.web?.title || uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ title: title || uri, uri });
    }
  }
  return sources;
}
function extractFriendlyError(err) {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
  }
  return raw;
}
function isTransientGeminiError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("503") || msg.includes("429") || msg.includes("UNAVAILABLE") || msg.includes("high demand") || msg.includes("Deadline") || msg.includes("DEADLINE_EXCEEDED") || msg.includes("timeout") || msg.includes("timed out") || msg.includes("ECONNRESET") || msg.includes("fetch failed");
}
async function checkAiHealth(preferredPreference, ollamaModel) {
  const started = Date.now();
  const db = loadDb();
  const pref = preferredPreference || db.settings.aiModel || "local-auto";
  const targetOllama = ollamaModel || db.settings.ollamaModel;
  if (pref.startsWith("gemini-") && hasValidGeminiKey()) {
    const gem = await checkGeminiConnection();
    if (gem.connected) {
      return {
        connected: true,
        provider: gem.provider,
        model: gem.model,
        engine: "gemini",
        freeWebReady: true,
        requiresPaidKey: false,
        latencyMs: Date.now() - started
      };
    }
  }
  if (pref !== "local-core") {
    const openaiLocal = await checkOpenAiCompatibleStatus(targetOllama);
    if (openaiLocal.available && openaiLocal.selectedModel) {
      return {
        connected: true,
        provider: "Local OpenAI-Compatible Engine",
        model: openaiLocal.selectedModel,
        engine: "local-openai",
        freeWebReady: true,
        requiresPaidKey: false,
        latencyMs: Date.now() - started,
        ollamaModels: openaiLocal.models
      };
    }
    const ollama = await checkOllamaStatus(targetOllama);
    if (ollama.available && ollama.selectedModel) {
      return {
        connected: true,
        provider: "Local Ollama Engine",
        model: ollama.selectedModel,
        engine: "ollama",
        freeWebReady: true,
        requiresPaidKey: false,
        latencyMs: Date.now() - started,
        ollamaModels: ollama.models
      };
    }
  }
  return {
    connected: true,
    provider: "F.R.I.D.A.Y. Built-In Local Core + Live Web",
    model: "local-core-v2",
    engine: "local-core",
    freeWebReady: true,
    requiresPaidKey: false,
    latencyMs: Date.now() - started,
    ollamaModels: []
  };
}
async function checkGeminiConnection() {
  const started = Date.now();
  if (!hasValidGeminiKey()) {
    return {
      connected: false,
      provider: "Google Gemini (Optional)",
      model: "not-configured",
      latencyMs: Date.now() - started,
      error: "GEMINI_API_KEY is not configured (optional \u2014 local AI active)."
    };
  }
  const modelsToTry = ["gemini-3.1-flash-lite", "gemini-4-hydrogen"];
  let lastErr = null;
  try {
    const ai = getGeminiClient();
    for (const targetModel of modelsToTry) {
      try {
        const res = await ai.models.generateContent({
          model: targetModel,
          contents: "Reply with OK"
        });
        const text = (res.text ?? "").trim();
        return {
          connected: Boolean(text || res),
          provider: "Google Gemini (@google/genai)",
          model: targetModel,
          latencyMs: Date.now() - started
        };
      } catch (err) {
        lastErr = err;
        if (!isTransientGeminiError(err)) break;
        await new Promise((r) => setTimeout(r, 350));
      }
    }
    return {
      connected: false,
      provider: "Google Gemini (@google/genai)",
      model: "gemini-3.1-flash-lite",
      latencyMs: Date.now() - started,
      error: extractFriendlyError(lastErr)
    };
  } catch (err) {
    return {
      connected: false,
      provider: "Google Gemini (@google/genai)",
      model: "gemini-3.1-flash-lite",
      latencyMs: Date.now() - started,
      error: extractFriendlyError(err)
    };
  }
}
var geminiProvider = {
  name: "Google Gemini (@google/genai)",
  async generateText({ model, systemInstruction, prompt, useSearch, useUrlContext }) {
    const ai = getGeminiClient();
    const tools = [];
    if (useSearch) tools.push({ googleSearch: {} });
    if (useUrlContext) tools.push({ urlContext: {} });
    const callModel = async (targetModel) => {
      const supportsThinkingLevel = targetModel === "gemini-4-hydrogen" || targetModel === "gemini-4-neon" || targetModel === "gemini-4-carbon" || targetModel === "gemini-4-argon";
      return ai.models.generateContent({
        model: targetModel,
        contents: prompt,
        config: {
          systemInstruction,
          ...supportsThinkingLevel ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {},
          ...tools.length > 0 ? { tools } : {}
        }
      });
    };
    try {
      const response = await callModel(model);
      return {
        text: (response.text ?? "").trim(),
        sources: extractGroundingSources(response)
      };
    } catch (err) {
      if (isTransientGeminiError(err) && model !== "gemini-3.1-flash-lite") {
        try {
          const fallbackRes = await callModel("gemini-3.1-flash-lite");
          return {
            text: (fallbackRes.text ?? "").trim(),
            sources: extractGroundingSources(fallbackRes)
          };
        } catch (fallbackErr) {
          throw new Error(extractFriendlyError(fallbackErr));
        }
      }
      throw new Error(extractFriendlyError(err));
    }
  }
};
function emitChunkedTokens(text, onToken) {
  const parts = text.match(/\S+\s*/g) ?? [text];
  for (const part of parts) {
    onToken(part);
  }
}
async function streamAssistantCommand(userCommand, settings, emitEvent, signal) {
  const tStart = Date.now();
  const db = loadDb();
  const parsed = analyzeUserCommand(userCommand);
  const intentMs = Date.now() - tStart;
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const userMessage = {
    id: `msg-${Date.now()}-u`,
    role: "user",
    content: userCommand,
    timestamp: nowIso,
    intent: parsed.category
  };
  emitEvent({
    type: "status",
    phase: "routing",
    agents: parsed.agents,
    steps: parsed.steps,
    intent: parsed.category
  });
  const disabledAgent = parsed.agents.find((a) => settings.enabledAgents[a] === false);
  if (disabledAgent) {
    const text = `Cannot complete that command because the ${disabledAgent} agent is currently disabled in Settings. Re-enable it to proceed.`;
    emitChunkedTokens(text, (token) => emitEvent({ type: "token", token }));
    const timings2 = {
      engine: "local-core",
      intentMs,
      toolMs: 0,
      firstTokenMs: Date.now() - tStart,
      modelMs: 0,
      totalMs: Date.now() - tStart
    };
    const assistantMessage2 = {
      id: `msg-${Date.now()}-a`,
      role: "assistant",
      content: text,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      intent: parsed.category,
      timings: timings2,
      steps: [
        {
          id: "step-disabled",
          agent: disabledAgent,
          title: `${disabledAgent} agent is disabled`,
          status: "failed"
        }
      ]
    };
    db.chatHistory = [...db.chatHistory, userMessage, assistantMessage2].slice(-100);
    saveDb(db);
    emitEvent({ type: "done", userMessage, assistantMessage: assistantMessage2, activeAgents: [disabledAgent] });
    return { userMessage, assistantMessage: assistantMessage2, activeAgents: [disabledAgent] };
  }
  if (parsed.requiresConfirmation) {
    const actionId = `act-${Date.now()}`;
    appendActionLog(db, {
      agent: "automation",
      action: "Confirmation Required",
      target: userCommand.slice(0, 64),
      status: "pending_confirmation",
      detail: parsed.confirmationReason
    });
    const text = `${parsed.confirmationReason ?? "This action requires confirmation."} Review the requested operation below and confirm if you want me to proceed.`;
    emitChunkedTokens(text, (token) => emitEvent({ type: "token", token }));
    const timings2 = {
      engine: "local-core",
      intentMs,
      toolMs: 0,
      firstTokenMs: Date.now() - tStart,
      modelMs: 0,
      totalMs: Date.now() - tStart
    };
    const assistantMessage2 = {
      id: `msg-${Date.now()}-a`,
      role: "assistant",
      content: text,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      intent: parsed.category,
      timings: timings2,
      steps: parsed.steps,
      pendingConfirmation: {
        actionId,
        summary: userCommand,
        actionType: parsed.category,
        payload: { command: userCommand }
      }
    };
    db.chatHistory = [...db.chatHistory, userMessage, assistantMessage2].slice(-100);
    saveDb(db);
    emitEvent({ type: "done", userMessage, assistantMessage: assistantMessage2, activeAgents: parsed.agents });
    return { userMessage, assistantMessage: assistantMessage2, activeAgents: parsed.agents };
  }
  const tToolStart = Date.now();
  const steps = [...parsed.steps];
  const contextParts = [];
  const collectedSources = [];
  let telemetry = null;
  let matchedFiles;
  let appNotice = null;
  let runningWindows;
  let mediaNotice = null;
  let upcomingCalendar;
  let webResults;
  let webPage = null;
  let memorySaved = null;
  let weatherData = null;
  if (parsed.category === "system_telemetry" || parsed.category === "workflow_run") {
    telemetry = await getSystemTelemetry();
    contextParts.push(
      `LIVE SYSTEM TELEMETRY: CPU ${telemetry.cpuLoad}% (${telemetry.cpuModel}, ${telemetry.cpuCores} cores), RAM ${telemetry.ramUsedGb}/${telemetry.ramTotalGb} GB (${telemetry.ramPercent}%), Storage ${telemetry.storageUsedGb}/${telemetry.storageTotalGb} GB (${telemetry.storagePercent}%), Network RX ${telemetry.networkRxKbps} KB/s TX ${telemetry.networkTxKbps} KB/s, Platform ${telemetry.platform}.`
    );
    appendActionLog(db, {
      agent: "system",
      action: "Read Hardware Telemetry",
      target: telemetry.hostname,
      status: "completed",
      detail: `CPU ${telemetry.cpuLoad}% \xB7 RAM ${telemetry.ramPercent}%`
    });
  }
  if (parsed.category === "media_control") {
    const mediaRes = await handleMediaVoiceCommand(
      userCommand,
      settings.allowedFolders,
      settings.pausedIndexing
    );
    mediaNotice = mediaRes.message;
    contextParts.push(`MEDIA CONTROL RESULT: ${mediaRes.message}`);
    appendActionLog(db, {
      agent: "media",
      action: mediaRes.mediaAction ? `Media (${mediaRes.mediaAction})` : "Local Media Playback",
      target: mediaRes.matchedFile?.name || userCommand.slice(0, 48),
      status: "completed",
      detail: mediaRes.message
    });
  }
  if (parsed.category === "file_search" || parsed.category === "media_analyze") {
    const files = getCachedFileIndex(settings.allowedFolders, settings.pausedIndexing, 300);
    matchedFiles = searchIndexedFiles(files, userCommand).slice(0, 8);
    contextParts.push(
      matchedFiles.length > 0 ? `PERMITTED FILE SEARCH MATCHES (${matchedFiles.length}):
` + matchedFiles.map(
        (m) => `- ${m.name} (${m.category}, ${formatBytes(m.sizeBytes)}, modified ${m.modifiedAt}) at ${m.relativePath}${m.matchReason ? ` [${m.matchReason}]` : ""}${m.previewText ? ` | snippet: ${m.previewText.slice(0, 140).replace(/\s+/g, " ")}` : ""}`
      ).join("\n") : `PERMITTED FILE SEARCH: No matching files found across ${settings.allowedFolders.length} permitted folder(s). Total indexed files: ${files.length}.`
    );
    appendActionLog(db, {
      agent: "file",
      action: "Search Permitted Files",
      target: userCommand.slice(0, 48),
      status: "completed",
      detail: `${matchedFiles.length} matching file(s)`
    });
  }
  if (parsed.category === "app_control") {
    const appRes = await handleAppOrWindowCommand(userCommand, db.apps);
    appNotice = appRes.message;
    runningWindows = appRes.windows;
    if (appRes.launchedApp) {
      const target = db.apps.find((a) => a.id === appRes.launchedApp.id);
      if (target) target.lastUsed = (/* @__PURE__ */ new Date()).toISOString();
    }
    contextParts.push(`APPLICATION CONTROL RESULT: ${appRes.message}`);
    appendActionLog(db, {
      agent: "application",
      action: appRes.windows ? "Inspect Running Windows" : "Application / Window Control",
      target: appRes.launchedApp?.name || userCommand.slice(0, 48),
      status: "completed",
      detail: appRes.message.slice(0, 140)
    });
  }
  if (parsed.category === "calendar_schedule" || parsed.category === "workflow_run") {
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    upcomingCalendar = db.calendar.filter((e) => e.date >= today);
    contextParts.push(
      `CALENDAR SCHEDULE:
` + (upcomingCalendar.length > 0 ? upcomingCalendar.map((e) => `- [${e.date} ${e.time}] ${e.title} (${e.category}, completed=${e.completed})`).join("\n") : "No upcoming events scheduled.")
    );
    appendActionLog(db, {
      agent: "calendar",
      action: "Query Schedule",
      target: `${upcomingCalendar.length} upcoming items`,
      status: "completed"
    });
  }
  if (parsed.category === "memory_manage") {
    const rememberMatch = userCommand.match(/remember\s+(?:that\s+)?(.+)/i);
    if (rememberMatch && rememberMatch[1] && !/what\s+do\s+you\s+remember/i.test(userCommand)) {
      const value = rememberMatch[1].trim();
      db.memory.unshift({
        id: `mem-${Date.now()}`,
        category: "preference",
        key: "User Note",
        value,
        approved: true,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      memorySaved = value;
      contextParts.push(`MEMORY SAVED: "${value}"`);
      appendActionLog(db, {
        agent: "memory",
        action: "Persist User Memory",
        target: value.slice(0, 48),
        status: "completed"
      });
    } else {
      contextParts.push(
        `SAVED PERSONAL MEMORY:
${db.memory.map((m) => `- ${m.key}: ${m.value}`).join("\n") || "None stored yet."}`
      );
    }
  }
  const urlMatch = userCommand.match(/https?:\/\/\S+/i);
  if (parsed.category === "web_search" || urlMatch) {
    emitEvent({
      type: "status",
      phase: "searching",
      agents: parsed.agents,
      steps,
      intent: parsed.category
    });
    if (urlMatch) {
      try {
        webPage = await fetchPublicWebPage(urlMatch[0]);
        collectedSources.push({ title: webPage.title, uri: webPage.uri });
        contextParts.push(`PUBLIC WEBPAGE (${webPage.uri}) TITLE: ${webPage.title}
EXCERPT:
${webPage.excerpt.slice(0, 3500)}`);
      } catch (err) {
        contextParts.push(`URL FETCH NOTE: ${err.message}`);
      }
    }
    if (!urlMatch || userCommand.replace(urlMatch[0], "").trim().length > 12) {
      const searchRes = await searchFreeWeb(userCommand.replace(/https?:\/\/\S+/gi, "").trim() || userCommand, "web");
      webResults = searchRes.results;
      for (const s of searchRes.sources) {
        if (!collectedSources.some((x) => x.uri === s.uri)) {
          collectedSources.push(s);
        }
      }
      if (webResults.length > 0) {
        contextParts.push(
          `LIVE WEB SEARCH RESULTS:
${webResults.slice(0, 6).map((r, i) => `${i + 1}. ${r.title} (${r.uri}): ${r.snippet}`).join("\n")}`
        );
      }
    }
    appendActionLog(db, {
      agent: "browser",
      action: "Free Web Research",
      target: userCommand.slice(0, 56),
      status: "completed",
      detail: `${collectedSources.length} verified source(s)`
    });
  }
  if (/\bweather|temperature|forecast\b/i.test(userCommand)) {
    try {
      weatherData = await getWeatherForLocation(settings.weatherLocation);
      contextParts.push(
        `LIVE WEATHER (${weatherData.location}): ${weatherData.temperature}\xB0C, ${weatherData.condition}, Humidity ${weatherData.humidity}%, Wind ${weatherData.windSpeedKmh} km/h.`
      );
    } catch {
    }
  }
  const prodCmd = parseProductivityCommand(userCommand);
  if (prodCmd) {
    if (prodCmd.kind === "reminder_add" || prodCmd.kind === "alarm_set") {
      const date = prodCmd.date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const time = prodCmd.time || "09:00";
      db.calendar.unshift({
        id: `evt-${Date.now()}`,
        title: prodCmd.title,
        date,
        time,
        category: "reminder",
        completed: false,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      memorySaved = `${prodCmd.title} (${date} at ${time})`;
      contextParts.push(`REMINDER SCHEDULED: ${memorySaved}`);
    } else if (prodCmd.kind === "note_add" || prodCmd.kind === "todo_add") {
      const val = prodCmd.detail || prodCmd.title;
      db.memory.unshift({
        id: `mem-${Date.now()}`,
        category: "preference",
        key: prodCmd.kind === "note_add" ? "Note" : "To-Do Task",
        value: val,
        approved: true,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      memorySaved = val;
      contextParts.push(`SAVED ITEM: ${val}`);
    }
  }
  const toolMs = Date.now() - tToolStart;
  const tModelStart = Date.now();
  let firstTokenMs = 0;
  let finalText = "";
  let engineUsed = "local-core";
  const isInstantDeterministicAction = parsed.category === "media_control" || parsed.category === "app_control" || parsed.category === "unit_convert" || parsed.category === "translate" || parsed.category === "read_aloud" || Boolean(memorySaved) || tryConvertUnits(userCommand) !== null || tryTranslateCommand(userCommand) !== null || tryEvaluateSafeMath(userCommand) !== null;
  const memorySummary = db.memory.filter((m) => m.approved).slice(0, 10).map((m) => `- ${m.key}: ${m.value}`).join("\n");
  const systemInstruction = `You are F.R.I.D.A.Y. (Fully Responsive Intelligent Digital Assistant for You), a fast, precise desktop AI companion speaking to ${settings.userName}.
Respond concisely in clear natural language suitable for both screen reading and spoken voice output.
Never fabricate files, hardware numbers, or URLs\u2014only cite facts present in the provided tool results.
User-approved personal memory:
${memorySummary || "None"}`;
  const prompt = `${contextParts.length > 0 ? contextParts.join("\n\n") + "\n\n" : ""}User Command: ${userCommand}`;
  const pref = settings.aiModel || "local-auto";
  const wantsGemini = pref.startsWith("gemini-") && hasValidGeminiKey();
  const streamDeterministicReply = async (engineLabel) => {
    if (parsed.category === "general_assistant" && (!webResults || webResults.length === 0) && !webPage && !weatherData && tryEvaluateSafeMath(userCommand) === null && isKnowledgeQuestion(userCommand)) {
      emitEvent({
        type: "status",
        phase: "searching",
        agents: ["core", "browser"],
        steps,
        intent: parsed.category
      });
      const autoSearch = await searchFreeWeb(userCommand, "web").catch(() => ({
        results: [],
        sources: [],
        online: false
      }));
      webResults = autoSearch.results;
      for (const s of autoSearch.sources) {
        if (!collectedSources.some((x) => x.uri === s.uri)) {
          collectedSources.push(s);
        }
      }
    }
    finalText = buildLocalDeterministicReply({
      userCommand,
      category: parsed.category,
      userName: settings.userName,
      telemetry,
      files: matchedFiles,
      appNotice,
      runningWindows,
      availableApps: db.apps,
      mediaNotice,
      calendar: upcomingCalendar,
      webResults,
      webPage,
      weather: weatherData,
      memorySaved,
      memoryEntries: db.memory
    });
    firstTokenMs = Date.now() - tStart;
    emitChunkedTokens(finalText, (token) => emitEvent({ type: "token", token }));
    engineUsed = engineLabel;
  };
  if (isInstantDeterministicAction || pref === "local-core") {
    await streamDeterministicReply("local-core");
  } else if (wantsGemini) {
    try {
      const aiRes = await geminiProvider.generateText({
        model: pref,
        systemInstruction,
        prompt,
        useSearch: parsed.category === "web_search",
        useUrlContext: Boolean(urlMatch)
      });
      finalText = aiRes.text;
      for (const s of aiRes.sources) {
        if (!collectedSources.some((x) => x.uri === s.uri)) collectedSources.push(s);
      }
      firstTokenMs = Date.now() - tStart;
      emitChunkedTokens(finalText, (token) => emitEvent({ type: "token", token }));
      engineUsed = pref;
    } catch {
      await streamDeterministicReply("local-core (fallback)");
    }
  } else {
    const openaiLocal = await checkOpenAiCompatibleStatus(settings.ollamaModel);
    if (openaiLocal.available && openaiLocal.selectedModel) {
      try {
        const recentHistory = db.chatHistory.slice(-6).filter((m) => m.content && !m.pendingConfirmation).map((m) => ({
          role: m.role,
          content: m.content.slice(0, 800)
        }));
        const streamRes = await streamOpenAiCompatibleChat({
          baseUrl: openaiLocal.baseUrl,
          model: openaiLocal.selectedModel,
          messages: [
            { role: "system", content: systemInstruction },
            ...recentHistory,
            { role: "user", content: prompt }
          ],
          signal,
          onToken: (token) => {
            if (!firstTokenMs) firstTokenMs = Date.now() - tStart;
            emitEvent({ type: "token", token });
          }
        });
        finalText = streamRes.text;
        engineUsed = `local-openai:${openaiLocal.selectedModel}`;
      } catch (err) {
        if (err.name === "AbortError") throw err;
        await streamDeterministicReply("local-core (fallback)");
      }
    } else {
      const ollama = await checkOllamaStatus(settings.ollamaModel);
      if (ollama.available && ollama.selectedModel) {
        try {
          const recentHistory = db.chatHistory.slice(-6).filter((m) => m.content && !m.pendingConfirmation).map((m) => ({
            role: m.role,
            content: m.content.slice(0, 800)
          }));
          const streamRes = await streamOllamaChat({
            model: ollama.selectedModel,
            messages: [
              { role: "system", content: systemInstruction },
              ...recentHistory,
              { role: "user", content: prompt }
            ],
            signal,
            onToken: (token) => {
              if (!firstTokenMs) firstTokenMs = Date.now() - tStart;
              emitEvent({ type: "token", token });
            }
          });
          finalText = streamRes.text;
          engineUsed = `ollama:${ollama.selectedModel}`;
        } catch (err) {
          if (err.name === "AbortError") throw err;
          await streamDeterministicReply("local-core (fallback)");
        }
      } else {
        await streamDeterministicReply("local-core");
      }
    }
  }
  const modelMs = Date.now() - tModelStart;
  const totalMs = Date.now() - tStart;
  const timings = {
    engine: engineUsed,
    intentMs,
    toolMs,
    firstTokenMs: firstTokenMs || totalMs,
    modelMs,
    totalMs
  };
  recordPipelineTiming(timings);
  const finalizedSteps = steps.map((s) => ({
    ...s,
    status: "completed"
  }));
  const assistantMessage = {
    id: `msg-${Date.now()}-a`,
    role: "assistant",
    content: finalText || "Command completed.",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    intent: parsed.category,
    steps: finalizedSteps,
    sources: collectedSources.length > 0 ? collectedSources : void 0,
    timings
  };
  db.chatHistory = [...db.chatHistory, userMessage, assistantMessage].slice(-100);
  appendActionLog(db, {
    agent: "core",
    action: `Command (${parsed.category})`,
    target: userCommand.slice(0, 52),
    status: "completed",
    detail: `Engine: ${engineUsed} \xB7 ${totalMs}ms`
  });
  saveDb(db);
  emitEvent({
    type: "done",
    userMessage,
    assistantMessage,
    activeAgents: parsed.agents
  });
  return {
    userMessage,
    assistantMessage,
    activeAgents: parsed.agents
  };
}
async function runAssistantCommand(userCommand, settings) {
  return streamAssistantCommand(userCommand, settings, () => {
  });
}
async function runBrowserResearch(query, url, model = "local-auto", mode = "web") {
  const collectedSources = [];
  let pageExtract = null;
  let searchResults = [];
  if (url?.trim()) {
    pageExtract = await fetchPublicWebPage(url.trim());
    collectedSources.push({ title: pageExtract.title, uri: pageExtract.uri });
  }
  if (query.trim()) {
    const searchRes = await searchFreeWeb(query.trim(), mode);
    searchResults = searchRes.results;
    for (const s of searchRes.sources) {
      if (!collectedSources.some((x) => x.uri === s.uri)) {
        collectedSources.push(s);
      }
    }
  }
  const db = loadDb();
  let summary = "";
  const contextBlock = [
    pageExtract ? `PAGE (${pageExtract.uri}) \u2014 ${pageExtract.title}:
${pageExtract.excerpt.slice(0, 5e3)}` : "",
    searchResults.length > 0 ? `LIVE SEARCH RESULTS (${mode}):
${searchResults.map((r, i) => `${i + 1}. ${r.title} (${r.uri}): ${r.snippet}`).join("\n")}` : ""
  ].filter(Boolean).join("\n\n");
  if (model.startsWith("gemini-") && hasValidGeminiKey()) {
    try {
      const res = await geminiProvider.generateText({
        model,
        systemInstruction: "You are the F.R.I.D.A.Y. Browser Intelligence Agent. Synthesize accurate research summaries strictly from the retrieved web results and URL content.",
        prompt: `Focus: ${query || url}
Mode: ${mode}

${contextBlock}`,
        useSearch: true,
        useUrlContext: Boolean(url)
      });
      summary = res.text;
      for (const s of res.sources) {
        if (!collectedSources.some((x) => x.uri === s.uri)) collectedSources.push(s);
      }
    } catch {
      summary = "";
    }
  }
  if (!summary) {
    const ollama = await checkOllamaStatus(db.settings.ollamaModel);
    if (ollama.available && ollama.selectedModel && contextBlock) {
      try {
        const res = await streamOllamaChat({
          model: ollama.selectedModel,
          messages: [
            {
              role: "system",
              content: "You are F.R.I.D.A.Y. Browser Intelligence. Summarize the retrieved web data concisely with clear takeaways. Never invent URLs."
            },
            {
              role: "user",
              content: `Query: ${query || url}
Mode: ${mode}

${contextBlock}`
            }
          ]
        });
        summary = res.text;
      } catch {
        summary = "";
      }
    }
  }
  if (!summary) {
    if (pageExtract) {
      summary = `**${pageExtract.title}** (${pageExtract.uri})

${buildExtractiveSummary(
        pageExtract.excerpt,
        query,
        7
      )}`;
    } else if (searchResults.length > 0) {
      summary = `Live ${mode.toUpperCase()} research results for "${query}":

` + searchResults.map((r, i) => `${i + 1}. ${r.title}
   ${r.snippet || "Open linked source below for full details."}`).join("\n\n");
    } else {
      summary = `No live web results were returned for "${query || url}". Verify internet connectivity or try refining your keywords.`;
    }
  }
  appendActionLog(db, {
    agent: "browser",
    action: url ? "URL Synthesis" : `Web Research (${mode})`,
    target: (url || query).slice(0, 56),
    status: "completed",
    detail: `${collectedSources.length} source(s)`
  });
  return {
    summary,
    sources: collectedSources
  };
}
async function summarizeLocalFile(params) {
  const safeContent = params.content.slice(0, 18e3);
  const db = loadDb();
  let summary = "";
  if (params.model?.startsWith("gemini-") && hasValidGeminiKey()) {
    try {
      const res = await geminiProvider.generateText({
        model: params.model,
        systemInstruction: "You are the F.R.I.D.A.Y. File Intelligence Agent. Analyze only the provided permitted file content accurately.",
        prompt: params.question?.trim() ? `File: ${params.fileName}

Question: ${params.question}

Content:
${safeContent}` : `Summarize the purpose, key structure, and important details of "${params.fileName}":

${safeContent}`
      });
      summary = res.text;
    } catch {
      summary = "";
    }
  }
  if (!summary) {
    const ollama = await checkOllamaStatus(db.settings.ollamaModel);
    if (ollama.available && ollama.selectedModel) {
      try {
        const res = await streamOllamaChat({
          model: ollama.selectedModel,
          messages: [
            {
              role: "system",
              content: "You are F.R.I.D.A.Y. File Intelligence. Analyze only the provided permitted file content concisely."
            },
            {
              role: "user",
              content: params.question?.trim() ? `File: ${params.fileName}
Question: ${params.question}

Content:
${safeContent}` : `Summarize "${params.fileName}":

${safeContent}`
            }
          ]
        });
        summary = res.text;
      } catch {
        summary = "";
      }
    }
  }
  if (!summary) {
    const lineCount = safeContent.split(/\r?\n/).length;
    const excerpt = buildExtractiveSummary(safeContent, params.question, 6);
    summary = `Local summary of "${params.fileName}" (${lineCount} lines, ${safeContent.length} chars):

${excerpt}`;
  }
  appendActionLog(db, {
    agent: "file",
    action: "Local File Analysis",
    target: params.fileName,
    status: "completed"
  });
  return { summary };
}
async function generateDailyBriefing(model = "local-auto") {
  const db = loadDb();
  const telemetry = await getSystemTelemetry().catch(() => null);
  const weather = await getWeatherForLocation(db.settings.weatherLocation).catch(() => null);
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const events = db.calendar.filter((e) => e.date >= today).slice(0, 8);
  const rawPrompt = `Prepare a crisp executive daily briefing for ${db.settings.userName}.
Date: ${today}
Weather: ${weather ? `${weather.location}: ${weather.temperature}\xB0C, ${weather.condition}` : "Unavailable"}
System Health: ${telemetry ? `CPU ${telemetry.cpuLoad}%, RAM ${telemetry.ramPercent}%, Storage ${telemetry.storagePercent}%` : "Unavailable"}
Calendar Items:
${events.map((e) => `- ${e.date} ${e.time}: ${e.title} (${e.category}, done=${e.completed})`).join("\n") || "None scheduled"}`;
  let briefing = "";
  if (model.startsWith("gemini-") && hasValidGeminiKey()) {
    try {
      const res = await geminiProvider.generateText({
        model,
        systemInstruction: "You are F.R.I.D.A.Y. Deliver a concise, actionable morning briefing covering schedule priorities, weather, and system readiness.",
        prompt: rawPrompt
      });
      briefing = res.text;
    } catch {
      briefing = "";
    }
  }
  if (!briefing) {
    const ollama = await checkOllamaStatus(db.settings.ollamaModel);
    if (ollama.available && ollama.selectedModel) {
      try {
        const res = await streamOllamaChat({
          model: ollama.selectedModel,
          messages: [
            {
              role: "system",
              content: "Deliver a concise, actionable morning briefing for the user."
            },
            { role: "user", content: rawPrompt }
          ]
        });
        briefing = res.text;
      } catch {
        briefing = "";
      }
    }
  }
  if (!briefing) {
    const scheduleBlock = events.length > 0 ? events.map((e) => `\u2022 ${e.date} ${e.time} \u2014 ${e.title} (${e.completed ? "completed" : e.category})`).join("\n") : "\u2022 No upcoming events scheduled.";
    const weatherLine = weather ? `${weather.location}: ${weather.temperature}\xB0C (${weather.condition}), wind ${weather.windSpeedKmh} km/h` : "Weather telemetry unavailable.";
    const sysLine = telemetry ? `CPU ${telemetry.cpuLoad}% \xB7 RAM ${telemetry.ramPercent}% (${telemetry.ramUsedGb}/${telemetry.ramTotalGb} GB) \xB7 Storage ${telemetry.storagePercent}%` : "System sensors ready.";
    briefing = `Good day, ${db.settings.userName}. Here is your local briefing for ${today}:

Weather: ${weatherLine}
System Readiness: ${sysLine}

Upcoming Schedule:
${scheduleBlock}`;
  }
  appendActionLog(db, {
    agent: "calendar",
    action: "Daily Briefing Generated",
    target: today,
    status: "completed"
  });
  return { briefing };
}
async function analyzeMediaOrScreen(params) {
  const db = loadDb();
  const isAudio = params.mimeType.startsWith("audio/");
  const isImage = params.mimeType.startsWith("image/");
  if (hasValidGeminiKey()) {
    const ai = getGeminiClient();
    const targetModel = isAudio ? "gemini-3.5-transcribe" : "gemini-3.1-flash-lite";
    const response = await ai.models.generateContent({
      model: targetModel,
      contents: {
        parts: [
          { inlineData: { mimeType: params.mimeType, data: params.base64Data } },
          {
            text: params.prompt || (isAudio ? "Transcribe this audio accurately and provide a concise summary." : "Analyze this visual/document input clearly, extract key text/metrics, and explain any errors or insights.")
          }
        ]
      }
    });
    appendActionLog(db, {
      agent: isAudio ? "media" : "vision",
      action: isAudio ? "Audio Transcription & Summary" : "Visual / Document Analysis",
      target: params.mimeType,
      status: "completed"
    });
    return { analysis: (response.text ?? "").trim(), modelUsed: targetModel };
  }
  if (isImage) {
    const ollama = await checkOllamaStatus(db.settings.ollamaModel);
    const visionModel = ollama.models.find(
      (m) => /llava|vision|moondream|bakllava|minicpm-v/i.test(m)
    );
    if (ollama.available && visionModel) {
      const host = getOllamaHost();
      const res = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: visionModel,
          stream: false,
          messages: [
            {
              role: "user",
              content: params.prompt || "Analyze this image and extract key text or errors.",
              images: [params.base64Data]
            }
          ]
        }),
        signal: AbortSignal.timeout(35e3)
      });
      if (res.ok) {
        const data = await res.json();
        appendActionLog(db, {
          agent: "vision",
          action: "Local Ollama Vision Analysis",
          target: visionModel,
          status: "completed"
        });
        return {
          analysis: (data.message?.content ?? "").trim() || "Vision analysis completed.",
          modelUsed: `ollama:${visionModel}`
        };
      }
    }
  }
  const sizeKb = Math.round(params.base64Data.length * 3 / 4 / 1024);
  return {
    analysis: `Captured ${params.mimeType} payload (${sizeKb} KB). For offline local multimodal image analysis, pull a local vision model in Ollama (e.g., "ollama pull llava" or "ollama pull llama3.2-vision"), or optionally configure GEMINI_API_KEY in .env.`,
    modelUsed: "local-core"
  };
}
async function synthesizeSpeechWav(text, voiceName) {
  if (!hasValidGeminiKey()) {
    return {
      audioBase64: null,
      localFallback: true,
      reason: "Using fast local Windows/Browser SpeechSynthesis."
    };
  }
  const ai = getGeminiClient();
  const safeText = text.slice(0, 800);
  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash-lite-tts",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: safeText,
            speechMetadata: {
              style: "Clear, intelligent, composed personal desktop assistant"
            }
          }
        ]
      }
    ],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceName || "Kore"
          }
        }
      }
    }
  });
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    return {
      audioBase64: null,
      localFallback: true,
      reason: "TTS model returned empty payload; using local SpeechSynthesis."
    };
  }
  return { audioBase64: base64Audio, localFallback: false };
}
async function transcribeAudioBase64(base64Data, mimeType) {
  if (!hasValidGeminiKey()) {
    return {
      text: "",
      localFallback: true,
      reason: "Use the primary Microphone button (Web Speech API) or text command bar in local mode without a paid cloud key."
    };
  }
  const ai = getGeminiClient();
  const cleanMime = (mimeType || "audio/webm").split(";")[0].trim() || "audio/webm";
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-transcribe",
      contents: {
        parts: [
          { inlineData: { mimeType: cleanMime, data: base64Data } },
          { text: "Transcribe the user voice command verbatim without extra commentary." }
        ]
      }
    });
    return { text: (response.text ?? "").trim(), localFallback: false };
  } catch (err) {
    if (isTransientGeminiError(err)) {
      const fallback = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: {
          parts: [
            { inlineData: { mimeType: cleanMime, data: base64Data } },
            { text: "Transcribe the spoken audio accurately verbatim with no extra commentary." }
          ]
        }
      });
      return { text: (fallback.text ?? "").trim(), localFallback: false };
    }
    throw new Error(extractFriendlyError(err));
  }
}

// server/diagnosticsService.ts
import fs3 from "fs";
import os3 from "os";
import path3 from "path";
import si2 from "systeminformation";

// src/core/diagnostics.ts
function summarizeDiagnostics(checks) {
  return checks.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.status] += 1;
      return acc;
    },
    { total: 0, pass: 0, warning: 0, fail: 0, unavailable: 0 }
  );
}
function determineOptimizationProfile(ramTotalGb, cpuCores) {
  if (ramTotalGb > 0 && ramTotalGb < 8) return "low-power";
  if (cpuCores > 0 && cpuCores <= 2) return "low-power";
  if (ramTotalGb >= 24 && cpuCores >= 8) return "high-spec";
  return "standard-16gb";
}
function formatTestReportMarkdown(report) {
  const { audit, summary, checks } = report;
  const escapeCell = (val) => String(val ?? "\u2014").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
  const headerLines = [
    "# F.R.I.D.A.Y. \u2014 Automated Diagnostics & Windows Compatibility Test Report (`TEST_REPORT.md`)",
    "",
    `- **Test Date:** ${report.generatedAt}`,
    `- **Environment:** ${report.environment}`,
    `- **OS / Architecture:** ${audit.osName} ${audit.osVersion} (${audit.arch})`,
    `- **Node.js Version:** ${audit.nodeVersion}`,
    `- **Hardware:** ${audit.cpuModel} (${audit.cpuCores} cores) \xB7 ${audit.ramTotalGb} GB RAM \xB7 ${audit.gpuName}`,
    `- **Optimization Profile:** ${audit.optimizationProfile}`,
    `- **Summary:** ${summary.pass} Passed \xB7 ${summary.warning} Warnings \xB7 ${summary.unavailable} Unavailable \xB7 ${summary.fail} Failed (Total ${summary.total})`,
    "",
    "## Test Results",
    "",
    "| Test Name | Test Date | Environment | Expected Result | Actual Result | Status | Error Details | Fix Recommendation |",
    "|---|---|---|---|---|---|---|---|"
  ];
  const rows = checks.map(
    (c) => [
      escapeCell(c.name),
      escapeCell(c.checkedAt),
      escapeCell(report.environment),
      escapeCell(c.expected),
      escapeCell(c.actual),
      escapeCell(c.status.toUpperCase()),
      escapeCell(c.error || "None"),
      escapeCell(c.recommendation || "None")
    ].join(" | ").replace(/^/, "| ").concat(" |")
  );
  return [...headerLines, ...rows, ""].join("\n");
}
var VALID_CALENDAR_CATEGORIES = /* @__PURE__ */ new Set([
  "meeting",
  "reminder",
  "task",
  "focus"
]);
function sanitizeCalendarPatch(input) {
  if (!input || typeof input !== "object") return {};
  const raw = input;
  const patch = {};
  if (typeof raw.title === "string" && raw.title.trim()) patch.title = raw.title.trim().slice(0, 160);
  if (typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) patch.date = raw.date;
  if (typeof raw.time === "string" && /^\d{2}:\d{2}$/.test(raw.time)) patch.time = raw.time;
  if (typeof raw.category === "string" && VALID_CALENDAR_CATEGORIES.has(raw.category)) {
    patch.category = raw.category;
  }
  if (typeof raw.completed === "boolean") patch.completed = raw.completed;
  if (typeof raw.notes === "string") patch.notes = raw.notes.trim().slice(0, 500);
  return patch;
}
var VALID_MEMORY_CATEGORIES = /* @__PURE__ */ new Set([
  "profile",
  "preference",
  "project",
  "folder",
  "workflow"
]);
function sanitizeMemoryPatch(input) {
  if (!input || typeof input !== "object") return {};
  const raw = input;
  const patch = {};
  if (typeof raw.category === "string" && VALID_MEMORY_CATEGORIES.has(raw.category)) {
    patch.category = raw.category;
  }
  if (typeof raw.key === "string" && raw.key.trim()) patch.key = raw.key.trim().slice(0, 120);
  if (typeof raw.value === "string" && raw.value.trim()) patch.value = raw.value.trim().slice(0, 1e3);
  return patch;
}
var VALID_MODELS = /* @__PURE__ */ new Set([
  "local-auto",
  "ollama",
  "local-core",
  "gemini-4-hydrogen",
  "gemini-4-neon",
  "gemini-3.1-flash-lite"
]);
var VALID_VOICES = /* @__PURE__ */ new Set([
  "Kore",
  "Puck",
  "Charon",
  "Fenrir",
  "Zephyr"
]);
function sanitizeSettingsPatch(input, current) {
  if (!input || typeof input !== "object") return current;
  const raw = input;
  const next = structuredClone(current);
  if (typeof raw.userName === "string" && raw.userName.trim()) {
    next.userName = raw.userName.trim().slice(0, 60);
  }
  if (typeof raw.wakeWord === "string" && raw.wakeWord.trim()) {
    next.wakeWord = raw.wakeWord.trim().slice(0, 40);
  }
  if (typeof raw.aiModel === "string" && VALID_MODELS.has(raw.aiModel)) {
    next.aiModel = raw.aiModel;
  }
  if (typeof raw.ollamaModel === "string") {
    const trimmed = raw.ollamaModel.trim();
    if (trimmed === "" || /^[a-zA-Z0-9._:/-]{1,64}$/.test(trimmed)) {
      next.ollamaModel = trimmed;
    }
  }
  if (typeof raw.voiceName === "string" && VALID_VOICES.has(raw.voiceName)) {
    next.voiceName = raw.voiceName;
  }
  if (raw.voiceGender === "female" || raw.voiceGender === "male") {
    next.voiceGender = raw.voiceGender;
  }
  if (typeof raw.speakingSpeed === "number" && Number.isFinite(raw.speakingSpeed)) {
    next.speakingSpeed = Math.min(1.6, Math.max(0.65, raw.speakingSpeed));
  }
  if (typeof raw.speakingPitch === "number" && Number.isFinite(raw.speakingPitch)) {
    next.speakingPitch = Math.min(1.5, Math.max(0.6, raw.speakingPitch));
  }
  if (typeof raw.language === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(raw.language)) {
    next.language = raw.language;
  }
  if (typeof raw.continuousListening === "boolean") next.continuousListening = raw.continuousListening;
  if (typeof raw.wakeWordEnabled === "boolean") next.wakeWordEnabled = raw.wakeWordEnabled;
  if (typeof raw.autoSpeakReplies === "boolean") next.autoSpeakReplies = raw.autoSpeakReplies;
  if (typeof raw.reopenShortcut === "string" && raw.reopenShortcut.trim()) {
    next.reopenShortcut = raw.reopenShortcut.trim().slice(0, 32);
  }
  if (typeof raw.startFullscreen === "boolean") next.startFullscreen = raw.startFullscreen;
  if (typeof raw.launchOnStartup === "boolean") next.launchOnStartup = raw.launchOnStartup;
  if (raw.animationQuality === "high" || raw.animationQuality === "balanced" || raw.animationQuality === "low") {
    next.animationQuality = raw.animationQuality;
  }
  if (typeof raw.weatherLocation === "string" && raw.weatherLocation.trim()) {
    next.weatherLocation = raw.weatherLocation.trim().slice(0, 80);
  }
  if (Array.isArray(raw.allowedFolders)) {
    const clean = raw.allowedFolders.filter((f) => typeof f === "string" && f.trim().length > 0).map((f) => f.trim()).slice(0, 20);
    if (clean.length > 0) next.allowedFolders = clean;
  }
  if (typeof raw.pausedIndexing === "boolean") next.pausedIndexing = raw.pausedIndexing;
  if (typeof raw.screenCaptureConsent === "boolean") next.screenCaptureConsent = raw.screenCaptureConsent;
  if (raw.wallpaper && typeof raw.wallpaper === "object") {
    const w = raw.wallpaper;
    if (w.mode === "aurora-command" || w.mode === "neural-particles" || w.mode === "aurora-grid" || w.mode === "neural-horizon" || w.mode === "orbital-grid" || w.mode === "custom-video") {
      next.wallpaper.mode = w.mode;
    }
    if (typeof w.customVideoUrl === "string" && /^(blob:|https?:\/\/|\/)/.test(w.customVideoUrl)) {
      next.wallpaper.customVideoUrl = w.customVideoUrl;
    }
    if (typeof w.blurPx === "number" && Number.isFinite(w.blurPx)) {
      next.wallpaper.blurPx = Math.min(24, Math.max(0, w.blurPx));
    }
    if (typeof w.brightnessPercent === "number" && Number.isFinite(w.brightnessPercent)) {
      next.wallpaper.brightnessPercent = Math.min(140, Math.max(20, w.brightnessPercent));
    }
    if (typeof w.opacityPercent === "number" && Number.isFinite(w.opacityPercent)) {
      next.wallpaper.opacityPercent = Math.min(100, Math.max(15, w.opacityPercent));
    }
    if (typeof w.performanceMode === "boolean") next.wallpaper.performanceMode = w.performanceMode;
  }
  if (raw.hologram && typeof raw.hologram === "object") {
    const h = raw.hologram;
    if (h.mode === "orbital" || h.mode === "neural-matrix" || h.mode === "telemetry-sphere" || h.mode === "exploded") {
      next.hologram.mode = h.mode;
    }
    if (typeof h.projectionBeam === "boolean") next.hologram.projectionBeam = h.projectionBeam;
    if (typeof h.scanlineIntensity === "number" && Number.isFinite(h.scanlineIntensity)) {
      next.hologram.scanlineIntensity = Math.min(1, Math.max(0, h.scanlineIntensity));
    }
    if (typeof h.holoOpacity === "number" && Number.isFinite(h.holoOpacity)) {
      next.hologram.holoOpacity = Math.min(1, Math.max(0.2, h.holoOpacity));
    }
    if (typeof h.autoRotate === "boolean") next.hologram.autoRotate = h.autoRotate;
  }
  if (raw.enabledAgents && typeof raw.enabledAgents === "object") {
    const ea = raw.enabledAgents;
    for (const k of Object.keys(next.enabledAgents)) {
      if (typeof ea[k] === "boolean") {
        next.enabledAgents[k] = ea[k];
      }
    }
  }
  return next;
}

// server/diagnosticsService.ts
init_intentEngine();
init_internetResearchService();
init_localAiService();
async function getWindowsCompatibilityAudit() {
  const [osInfo, cpu, graphics, mem, fsSizes, diskLayout, netIfaces] = await Promise.all([
    si2.osInfo().catch(() => null),
    si2.cpu().catch(() => null),
    si2.graphics().catch(() => null),
    si2.mem().catch(() => null),
    si2.fsSize().catch(() => []),
    si2.diskLayout().catch(() => []),
    si2.networkInterfaces().catch(() => [])
  ]);
  const isWindows = process.platform === "win32";
  const ramTotalBytes = mem?.total ?? os3.totalmem();
  const ramAvailableBytes = mem?.available ?? os3.freemem();
  const ramTotalGb = Number((ramTotalBytes / 1024 ** 3).toFixed(1));
  const ramAvailableGb = Number((ramAvailableBytes / 1024 ** 3).toFixed(1));
  const primaryDisk = fsSizes.find((d) => d.mount === "/" || d.mount.toUpperCase().startsWith("C:")) ?? fsSizes[0];
  const storageTotalGb = primaryDisk ? Number((primaryDisk.size / 1024 ** 3).toFixed(1)) : 0;
  const storageFreeGb = primaryDisk ? Number(((primaryDisk.size - primaryDisk.used || 0) / 1024 ** 3).toFixed(1)) : 0;
  const primaryLayout = Array.isArray(diskLayout) ? diskLayout[0] : void 0;
  const storageType = primaryLayout?.type ? `${primaryLayout.type}${primaryLayout.interfaceType ? ` (${primaryLayout.interfaceType})` : ""}` : "Unavailable";
  const gpuCtrl = graphics?.controllers?.[0];
  const gpuName = gpuCtrl?.model?.trim() || "Unavailable";
  const gpuVendor = gpuCtrl?.vendor?.trim() || "Unavailable";
  const gpuVramMb = typeof gpuCtrl?.vram === "number" && gpuCtrl.vram > 0 ? gpuCtrl.vram : null;
  const gpuDriver = gpuCtrl?.driverVersion?.trim() || null;
  const cpuCores = cpu?.cores ?? os3.cpus().length;
  const cpuModel = cpu ? `${cpu.manufacturer} ${cpu.brand}`.trim() : os3.cpus()[0]?.model ?? "Unavailable";
  const cpuSpeedGhz = typeof cpu?.speed === "number" && cpu.speed > 0 ? Number(cpu.speed.toFixed(2)) : null;
  const electronMainPath = path3.resolve(process.cwd(), "electron/main.ts");
  const electronPreloadPath = path3.resolve(process.cwd(), "electron/preload.ts");
  const electronBuilderPath = path3.resolve(process.cwd(), "electron-builder.yml");
  const mainSource = fs3.existsSync(electronMainPath) ? fs3.readFileSync(electronMainPath, "utf-8") : "";
  const preloadSource = fs3.existsSync(electronPreloadPath) ? fs3.readFileSync(electronPreloadPath, "utf-8") : "";
  const electronConfigured = Boolean(mainSource) && Boolean(preloadSource) && fs3.existsSync(electronBuilderPath);
  const db = loadDb();
  const activeNet = Array.isArray(netIfaces) ? netIfaces.some((n) => !n.internal && n.operstate === "up") : false;
  const majorNode = Number(process.versions.node.split(".")[0] || 0);
  const windowsCompatible = majorNode >= 18 && (process.arch === "x64" || process.arch === "arm64") && electronConfigured;
  return {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    osName: osInfo?.distro || osInfo?.platform || process.platform,
    osEdition: isWindows ? osInfo?.release || "Windows Desktop" : "Container / Non-Windows Host",
    osVersion: osInfo?.release || os3.release(),
    platform: process.platform,
    arch: process.arch,
    isWindows,
    windowsCompatible,
    nodeVersion: process.version,
    cpuModel,
    cpuCores,
    cpuSpeedGhz,
    gpuName,
    gpuVendor,
    gpuVramMb,
    gpuDriver,
    ramTotalGb,
    ramAvailableGb,
    storageTotalGb,
    storageFreeGb,
    storageType,
    networkAvailable: activeNet || Object.keys(os3.networkInterfaces()).length > 0,
    hasApiKey: hasValidGeminiKey(),
    electronConfigured,
    securityPosture: {
      contextIsolation: mainSource.includes("contextIsolation: true"),
      nodeIntegrationDisabled: mainSource.includes("nodeIntegration: false"),
      folderSandboxActive: db.settings.allowedFolders.length > 0,
      apiKeyServerOnly: true
    },
    optimizationProfile: determineOptimizationProfile(ramTotalGb, cpuCores)
  };
}
async function runSafeDiagnosticsSuite() {
  const checks = [];
  const audit = await getWindowsCompatibilityAudit();
  const db = loadDb();
  async function runCheck(id, category, name, expected, fn) {
    const started = Date.now();
    try {
      const outcome = await fn();
      checks.push({
        id,
        category,
        name,
        expected,
        durationMs: Date.now() - started,
        checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
        ...outcome
      });
    } catch (err) {
      checks.push({
        id,
        category,
        name,
        expected,
        actual: "Check threw an unhandled exception",
        status: "fail",
        durationMs: Date.now() - started,
        error: err.message,
        recommendation: "Inspect server logs and verify configuration.",
        checkedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
  }
  await runCheck(
    "windows-compat",
    "Windows & Host",
    "Windows Target & Runtime Compatibility",
    "Node.js >= 18, x64/arm64, Electron & Windows 10/11 target verified",
    async () => {
      if (audit.isWindows) {
        return {
          actual: `${audit.osName} ${audit.osVersion} (${audit.arch}), Node ${audit.nodeVersion}`,
          status: audit.windowsCompatible ? "pass" : "warning",
          recommendation: audit.windowsCompatible ? void 0 : "Upgrade Node.js to LTS >= 20 and verify x64 Windows build."
        };
      }
      return {
        actual: `Running in ${audit.osName} (${audit.platform}/${audit.arch}), Node ${audit.nodeVersion}`,
        status: "warning",
        error: "Current host is Linux container, not a physical Windows 10/11 laptop.",
        recommendation: "Run npm run build && Electron desktop test on physical Windows 11/10 target."
      };
    }
  );
  await runCheck(
    "telemetry-core",
    "Hardware Monitoring",
    "CPU, RAM & Storage Sensors",
    "Live numeric CPU, RAM, and Storage readings from systeminformation",
    async () => {
      const t = await getSystemTelemetry();
      const valid = t.ramTotalGb > 0 && t.cpuCores > 0;
      return {
        actual: `CPU ${t.cpuLoad}% (${t.cpuCores} cores) \xB7 RAM ${t.ramUsedGb}/${t.ramTotalGb} GB (${t.ramPercent}%) \xB7 Disk ${t.storagePercent}%`,
        status: valid ? "pass" : "fail",
        error: valid ? void 0 : "Hardware sensor values returned zero.",
        recommendation: valid ? void 0 : "Verify systeminformation OS sensor access."
      };
    }
  );
  await runCheck(
    "telemetry-gpu-thermal",
    "Hardware Monitoring",
    "GPU Utilization & Thermal Sensors",
    "Report live GPU/thermal values or Unavailable without fabrication",
    async () => {
      const t = await getSystemTelemetry();
      if (t.gpuUsage !== null || t.cpuTemp !== null || t.gpuTemp !== null) {
        return {
          actual: `GPU ${t.gpuUsage ?? "Unavailable"}% \xB7 CPU Temp ${t.cpuTemp ?? "Unavailable"}\xB0C \xB7 GPU Temp ${t.gpuTemp ?? "Unavailable"}\xB0C`,
          status: "pass"
        };
      }
      return {
        actual: `GPU (${audit.gpuName}) utilization and thermal sensors report Unavailable on this host`,
        status: "unavailable",
        recommendation: "Test on physical Windows hardware with WMI / vendor GPU drivers enabled."
      };
    }
  );
  await runCheck(
    "local-ai-engine",
    "AI & Connectivity",
    "Local-First AI Engine & Zero-Key Readiness",
    "Assistant connects and operates cleanly without a paid cloud API key",
    async () => {
      const health = await checkAiHealth(db.settings.aiModel, db.settings.ollamaModel);
      return {
        actual: `${health.provider} (${health.model}) active in ${health.latencyMs}ms \xB7 Paid key required: ${health.requiresPaidKey ? "Yes" : "No"}`,
        status: health.connected ? "pass" : "fail"
      };
    }
  );
  await runCheck(
    "ollama-runtime",
    "AI & Connectivity",
    "Optional External Local LLM Runtime (LM Studio / llama.cpp / Ollama)",
    "Check optional local LLM endpoint if installed; built-in Local Core works without it",
    async () => {
      const openaiCompat = await Promise.resolve().then(() => (init_localAiService(), localAiService_exports)).then(
        (m) => m.checkOpenAiCompatibleStatus(db.settings.ollamaModel)
      );
      if (openaiCompat.available && openaiCompat.selectedModel) {
        return {
          actual: `Local OpenAI-compatible server active at ${openaiCompat.baseUrl} (${openaiCompat.selectedModel}) in ${openaiCompat.latencyMs}ms`,
          status: "pass"
        };
      }
      const ollama = await checkOllamaStatus(db.settings.ollamaModel);
      if (ollama.available && ollama.selectedModel) {
        return {
          actual: `Ollama ready at ${ollama.host} (${ollama.models.length} model(s), active: ${ollama.selectedModel}) in ${ollama.latencyMs}ms`,
          status: "pass"
        };
      }
      return {
        actual: "No external LLM server running \u2014 using Built-In Local Core + Live Web Knowledge",
        status: "pass"
      };
    }
  );
  await runCheck(
    "free-web-research",
    "AI & Connectivity",
    "Free Direct Web Research (No Paid API Key)",
    "Retrieve public search snippets and Wikipedia/DuckDuckGo links without API keys",
    async () => {
      const res = await searchFreeWeb("TypeScript", "docs");
      if (res.online && res.results.length > 0) {
        return {
          actual: `Retrieved ${res.results.length} live result(s) with verified links without paid API key`,
          status: "pass"
        };
      }
      return {
        actual: res.error ? `Search error: ${res.error}` : "No search results returned (offline or rate-limited)",
        status: "warning",
        recommendation: "Verify internet connectivity or retry live web research."
      };
    }
  );
  await runCheck(
    "pipeline-latency",
    "Performance",
    "Pipeline Stage Latency Telemetry",
    "Track intent, tool, first-token, and total response timing cleanly",
    async () => {
      const timings = getRecentPipelineTimings();
      if (timings.length === 0) {
        return {
          actual: "Latency tracker armed (send one command to populate live timing sample)",
          status: "pass"
        };
      }
      const latest = timings[0];
      return {
        actual: `Latest (${latest.engine}): intent ${latest.intentMs}ms \xB7 tools ${latest.toolMs}ms \xB7 first-token ${latest.firstTokenMs}ms \xB7 total ${latest.totalMs}ms`,
        status: "pass"
      };
    }
  );
  await runCheck(
    "database-rw",
    "Persistence",
    "Local Database Read & Integrity",
    "Load settings, calendar, memory, workflows, and action logs cleanly",
    async () => {
      const hasSettings = Boolean(db.settings?.assistantName);
      const counts = `${db.calendar.length} events, ${db.memory.length} memory, ${db.chatHistory.length} chats, ${db.actionLogs.length} logs`;
      return {
        actual: hasSettings ? `Healthy (${counts})` : "Database settings missing",
        status: hasSettings ? "pass" : "fail",
        recommendation: hasSettings ? void 0 : "Verify write permissions to .friday-data/friday-db.json."
      };
    }
  );
  await runCheck(
    "file-sandbox",
    "Files & Security",
    "Permitted Folder Index & Path Traversal Block",
    "Scan permitted folders and reject outside-sandbox & traversal paths",
    async () => {
      const indexed = scanPermittedFolders(db.settings.allowedFolders, false, 60);
      const unixBlocked = !isPathPermitted("/etc/passwd", db.settings.allowedFolders);
      const winBlocked = !isPathPermitted("C:\\Windows\\System32\\cmd.exe", db.settings.allowedFolders);
      const traversalBlocked = !isPathPermitted(
        path3.resolve(process.cwd(), "../outside-sandbox-check.txt"),
        db.settings.allowedFolders
      );
      if (unixBlocked && winBlocked && traversalBlocked) {
        return {
          actual: `Indexed ${indexed.length} permitted file(s); outside-sandbox & traversal paths blocked cleanly`,
          status: "pass"
        };
      }
      return {
        actual: "Path confinement check failed",
        status: "fail",
        error: "Outside-sandbox path was not rejected.",
        recommendation: "Review allowedFolders list in Settings."
      };
    }
  );
  await runCheck(
    "app-discovery",
    "Applications",
    "Desktop Application Discovery",
    "Check installed commands via OS path / Windows Get-StartApps",
    async () => {
      const apps = await detectInstalledApps(db.apps);
      const installedCount = apps.filter((a) => a.installed).length;
      const startApps = await discoverWindowsStartApps().catch(() => []);
      if (audit.isWindows) {
        return {
          actual: `${installedCount}/${apps.length} command apps + ${startApps.length} Windows Start Apps detected`,
          status: installedCount > 0 || startApps.length > 0 ? "pass" : "warning"
        };
      }
      return {
        actual: `${installedCount}/${apps.length} host commands detected (Windows Start Apps unavailable in Linux container)`,
        status: "unavailable",
        recommendation: "Run desktop discovery on Windows 10/11 host to detect Chrome, VS Code, Terminal, etc."
      };
    }
  );
  await runCheck(
    "intent-safety",
    "AI & Security",
    "Confirmation Gate & Permission Boundary",
    "Require explicit confirmation before destructive commands",
    async () => {
      const parsed = analyzeUserCommand("delete all temporary build files");
      return {
        actual: parsed.requiresConfirmation ? `Blocked for confirmation (${parsed.category})` : "Destructive command did not trigger confirmation gate",
        status: parsed.requiresConfirmation ? "pass" : "fail",
        recommendation: parsed.requiresConfirmation ? void 0 : "Audit SENSITIVE_PATTERNS in src/core/intentEngine.ts."
      };
    }
  );
  await runCheck(
    "electron-security",
    "Electron & Security",
    "Electron Context Isolation & Builder Config",
    "contextIsolation: true, nodeIntegration: false, preload bridge, electron-builder.yml present",
    async () => {
      const sec = audit.securityPosture;
      const ok = audit.electronConfigured && sec.contextIsolation && sec.nodeIntegrationDisabled;
      return {
        actual: ok ? "contextIsolation=true, nodeIntegration=false, IPC preload & electron-builder.yml verified" : "Electron configuration incomplete",
        status: ok ? "pass" : "warning",
        recommendation: ok ? void 0 : "Ensure electron/main.ts and electron/preload.ts compile cleanly."
      };
    }
  );
  const report = {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    environment: `${audit.osName} (${audit.platform}/${audit.arch})`,
    summary: summarizeDiagnostics(checks),
    audit,
    checks
  };
  return report;
}
function writeTestReportFile(report) {
  const md = formatTestReportMarkdown(report);
  const target = path3.resolve(process.cwd(), "TEST_REPORT.md");
  fs3.writeFileSync(target, md, "utf-8");
  return target;
}

// server.ts
init_fileIndex();
async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3e3;
  app.use(express.json({ limit: "15mb" }));
  const rateBuckets = /* @__PURE__ */ new Map();
  function aiRateLimit(req, res, next) {
    const key = `${req.ip || "local"}:${req.path}`;
    const now = Date.now();
    const recent = (rateBuckets.get(key) ?? []).filter((ts) => now - ts < 6e4);
    if (recent.length >= 30) {
      return res.status(429).json({ error: "Rate limit exceeded. Wait a few seconds before sending another AI request." });
    }
    recent.push(now);
    rateBuckets.set(key, recent);
    next();
  }
  app.use(["/api/assistant", "/api/voice", "/api/vision", "/api/browser"], aiRateLimit);
  let cachedAiHealth = null;
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      hasApiKey: hasValidGeminiKey(),
      localEngineReady: true,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.get("/api/health/ai", async (req, res) => {
    const forceRefresh = req.query.refresh === "1";
    const now = Date.now();
    if (!forceRefresh && cachedAiHealth && now - cachedAiHealth.checkedAt < 3e4) {
      return res.json(cachedAiHealth.status);
    }
    const db = loadDb();
    const status = await checkAiHealth(db.settings.aiModel, db.settings.ollamaModel);
    cachedAiHealth = { checkedAt: now, status };
    res.json(status);
  });
  app.get("/api/diagnostics/latency", (_req, res) => {
    res.json({ timings: getRecentPipelineTimings() });
  });
  app.get("/api/bootstrap", async (_req, res) => {
    try {
      const db = loadDb();
      const checkedApps = await detectInstalledApps(db.apps);
      db.apps = checkedApps;
      saveDb(db);
      res.json(db);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/telemetry", async (_req, res) => {
    try {
      const telemetry = await getSystemTelemetry();
      res.json(telemetry);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/system/processes", async (_req, res) => {
    try {
      const processes = await getTopProcesses(12);
      res.json({ processes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/diagnostics/audit", async (_req, res) => {
    try {
      const audit = await getWindowsCompatibilityAudit();
      res.json(audit);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/diagnostics/run", async (req, res) => {
    try {
      const report = await runSafeDiagnosticsSuite();
      if (req.body?.saveReport !== false) {
        writeTestReportFile(report);
      }
      const db = loadDb();
      appendActionLog(db, {
        agent: "system",
        action: "Run Safe Diagnostics Suite",
        target: `${report.summary.pass}/${report.summary.total} Passed`,
        status: report.summary.fail > 0 ? "failed" : "completed",
        detail: `${report.summary.warning} warning, ${report.summary.unavailable} unavailable`
      });
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/diagnostics/report", async (_req, res) => {
    try {
      const report = await runSafeDiagnosticsSuite();
      writeTestReportFile(report);
      const md = formatTestReportMarkdown(report);
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="TEST_REPORT.md"');
      res.send(md);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/settings/export", (_req, res) => {
    const db = loadDb();
    const safeExport = {
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      settings: db.settings,
      memory: db.memory,
      workflows: db.workflows
    };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="friday-settings-backup.json"');
    res.send(JSON.stringify(safeExport, null, 2));
  });
  app.get("/api/weather", async (req, res) => {
    try {
      const db = loadDb();
      const loc = req.query.location || db.settings.weatherLocation;
      const weather = await getWeatherForLocation(loc);
      res.json(weather);
    } catch (err) {
      res.status(502).json({ error: `Weather service unavailable: ${err.message}` });
    }
  });
  app.get("/api/files", (req, res) => {
    try {
      const db = loadDb();
      const query = String(req.query.q ?? "");
      const category = String(req.query.category ?? "all");
      const indexed = getCachedFileIndex(db.settings.allowedFolders, db.settings.pausedIndexing, 300);
      const matches = searchIndexedFiles(indexed, query, category);
      const duplicates = findDuplicateGroups(indexed);
      res.json({
        paused: db.settings.pausedIndexing,
        allowedFolders: db.settings.allowedFolders,
        totalIndexed: indexed.length,
        files: matches,
        duplicates
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/files/read", (req, res) => {
    try {
      const { filePath } = req.body;
      if (!filePath) {
        return res.status(400).json({ error: "filePath is required" });
      }
      const db = loadDb();
      const preview = readPermittedFilePreview(filePath, db.settings.allowedFolders);
      appendActionLog(db, {
        agent: "file",
        action: "Preview Local File",
        target: preview.name,
        status: "completed"
      });
      res.json(preview);
    } catch (err) {
      res.status(403).json({ error: err.message });
    }
  });
  app.post("/api/files/open", async (req, res) => {
    try {
      const { filePath } = req.body;
      if (!filePath) return res.status(400).json({ error: "filePath is required" });
      const db = loadDb();
      const resolved = path4.resolve(filePath);
      if (!isPathPermitted(resolved, db.settings.allowedFolders)) {
        return res.status(403).json({ error: "Access denied: file is outside user-permitted folders." });
      }
      if (!fs4.existsSync(resolved)) {
        return res.status(404).json({ error: "File not found." });
      }
      const result = await openLocalPathInDefaultApp(resolved);
      appendActionLog(db, {
        agent: "file",
        action: "Open Local File in Default App",
        target: path4.basename(resolved),
        status: result.opened ? "completed" : "blocked",
        detail: result.detail
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/files/stream", (req, res) => {
    try {
      const rawPath = String(req.query.path ?? "");
      if (!rawPath) return res.status(400).json({ error: "path query parameter is required" });
      const db = loadDb();
      const resolved = path4.resolve(rawPath);
      if (!isPathPermitted(resolved, db.settings.allowedFolders)) {
        return res.status(403).json({ error: "Access denied: file is outside permitted directories." });
      }
      if (!fs4.existsSync(resolved) || !fs4.statSync(resolved).isFile()) {
        return res.status(404).json({ error: "File not found." });
      }
      res.sendFile(resolved);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/files/folder", (req, res) => {
    try {
      const { folderPath, confirmCreate } = req.body;
      if (!folderPath) {
        return res.status(400).json({ error: "folderPath is required" });
      }
      const db = loadDb();
      const resolved = path4.resolve(folderPath);
      if (!isPathPermitted(resolved, db.settings.allowedFolders)) {
        return res.status(403).json({ error: "Target folder is outside permitted workspace directories." });
      }
      if (!confirmCreate) {
        return res.status(400).json({ error: "Explicit confirmation is required to create a folder." });
      }
      fs4.mkdirSync(resolved, { recursive: true });
      invalidateFileIndexCache();
      appendActionLog(db, {
        agent: "file",
        action: "Create Directory",
        target: path4.basename(resolved),
        status: "completed"
      });
      res.json({ created: true, path: resolved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/assistant/command", async (req, res) => {
    try {
      const { command } = req.body;
      if (!command || !command.trim()) {
        return res.status(400).json({ error: "Command text is required." });
      }
      const db = loadDb();
      const result = await runAssistantCommand(command.trim(), db.settings);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/assistant/stream", async (req, res) => {
    const { command } = req.body;
    if (!command || !command.trim()) {
      return res.status(400).json({ error: "Command text is required." });
    }
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const controller = new AbortController();
    let closed = false;
    res.on("close", () => {
      closed = true;
      controller.abort();
    });
    try {
      const db = loadDb();
      await streamAssistantCommand(
        command.trim(),
        db.settings,
        (ev) => {
          if (!closed) {
            res.write(`data: ${JSON.stringify(ev)}

`);
          }
        },
        controller.signal
      );
    } catch (err) {
      if (!closed && err.name !== "AbortError") {
        res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}

`);
      }
    } finally {
      if (!closed) {
        res.end();
      }
    }
  });
  app.post("/api/assistant/confirm", async (req, res) => {
    try {
      const { actionType, summary, approved } = req.body;
      const db = loadDb();
      if (!approved) {
        appendActionLog(db, {
          agent: "automation",
          action: "Action Cancelled by User",
          target: summary.slice(0, 48),
          status: "blocked"
        });
        const msg2 = {
          id: `msg-${Date.now()}-a`,
          role: "assistant",
          content: "Understood. I cancelled the pending operation and made no changes.",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          intent: actionType
        };
        db.chatHistory = [...db.chatHistory, msg2].slice(-100);
        saveDb(db);
        return res.json({ message: msg2 });
      }
      if (actionType === "calendar_schedule") {
        const evt = {
          id: `evt-${Date.now()}`,
          title: summary.replace(/^(friday,?\s*)?(schedule|create|book|add)\s*/i, "").trim() || "Scheduled Event",
          date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
          time: "15:00",
          category: "meeting",
          completed: false,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        db.calendar.unshift(evt);
        appendActionLog(db, {
          agent: "calendar",
          action: "Confirmed & Scheduled Event",
          target: evt.title,
          status: "completed"
        });
        const msg2 = {
          id: `msg-${Date.now()}-a`,
          role: "assistant",
          content: `Confirmed. Added "${evt.title}" to your calendar for ${evt.date} at ${evt.time}.`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          intent: actionType
        };
        db.chatHistory = [...db.chatHistory, msg2].slice(-100);
        saveDb(db);
        return res.json({ message: msg2, calendarEvent: evt });
      }
      if (actionType === "sensitive_action" && /\b(close|kill|terminate)\s+/i.test(summary)) {
        const closeRes = await closeWindowSafe(summary);
        appendActionLog(db, {
          agent: "application",
          action: closeRes.closed ? "Closed Window" : "Window Close Check",
          target: summary.slice(0, 48),
          status: closeRes.closed ? "completed" : "blocked",
          detail: closeRes.detail
        });
        const msg2 = {
          id: `msg-${Date.now()}-a`,
          role: "assistant",
          content: closeRes.detail,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          intent: actionType
        };
        db.chatHistory = [...db.chatHistory, msg2].slice(-100);
        saveDb(db);
        return res.json({ message: msg2 });
      }
      if (actionType === "sensitive_action" && /\bcreate\s+(?:a\s+)?(?:new\s+)?folder\s+([a-zA-Z0-9._-]+)/i.test(summary)) {
        const match = summary.match(/\bcreate\s+(?:a\s+)?(?:new\s+)?folder\s+([a-zA-Z0-9._-]+)/i);
        const folderName = match?.[1]?.replace(/[^a-zA-Z0-9._-]/g, "_") || "NewFolder";
        const base = db.settings.allowedFolders[0] || process.cwd();
        const target = path4.resolve(base, folderName);
        if (!isPathPermitted(target, db.settings.allowedFolders)) {
          return res.status(403).json({ error: "Target folder outside permitted workspace." });
        }
        fs4.mkdirSync(target, { recursive: true });
        invalidateFileIndexCache();
        appendActionLog(db, {
          agent: "file",
          action: "Create Permitted Folder",
          target: folderName,
          status: "completed"
        });
        const msg2 = {
          id: `msg-${Date.now()}-a`,
          role: "assistant",
          content: `Confirmed. Created folder "${target}".`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          intent: actionType
        };
        db.chatHistory = [...db.chatHistory, msg2].slice(-100);
        saveDb(db);
        return res.json({ message: msg2 });
      }
      appendActionLog(db, {
        agent: "automation",
        action: "Confirmed Safe Execution",
        target: summary.slice(0, 48),
        status: "completed",
        detail: "User-approved safety gate recorded"
      });
      const msg = {
        id: `msg-${Date.now()}-a`,
        role: "assistant",
        content: `Confirmed: "${summary}". Safety check passed and action has been logged to your audit history.`,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        intent: actionType
      };
      db.chatHistory = [...db.chatHistory, msg].slice(-100);
      saveDb(db);
      res.json({ message: msg });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/files/summarize", async (req, res) => {
    try {
      const { filePath, question } = req.body;
      if (!filePath) return res.status(400).json({ error: "filePath is required" });
      const db = loadDb();
      const preview = readPermittedFilePreview(filePath, db.settings.allowedFolders);
      const result = await summarizeLocalFile({
        fileName: preview.name,
        content: preview.content,
        question,
        model: db.settings.aiModel
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/browser/research", async (req, res) => {
    try {
      const { query, url, mode } = req.body;
      if (!query?.trim() && !url?.trim()) {
        return res.status(400).json({ error: "A search query or URL is required." });
      }
      const db = loadDb();
      const result = await runBrowserResearch(query?.trim() || "", url?.trim(), db.settings.aiModel, mode || "web");
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/calendar/briefing", async (_req, res) => {
    try {
      const db = loadDb();
      const result = await generateDailyBriefing(db.settings.aiModel);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/vision/analyze", async (req, res) => {
    try {
      const { base64Data, mimeType, prompt } = req.body;
      if (!base64Data || !mimeType) {
        return res.status(400).json({ error: "Media payload (base64Data and mimeType) is required." });
      }
      const db = loadDb();
      const result = await analyzeMediaOrScreen({
        base64Data,
        mimeType,
        prompt: prompt || "",
        model: db.settings.aiModel
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/voice/tts", async (req, res) => {
    try {
      const { text, voiceName } = req.body;
      if (!text?.trim()) {
        return res.status(400).json({ error: "text is required" });
      }
      const db = loadDb();
      const tts = await synthesizeSpeechWav(text.trim(), voiceName || db.settings.voiceName);
      res.json({
        audioBase64: tts.audioBase64,
        mimeType: tts.audioBase64 ? "audio/wav" : null,
        localFallback: tts.localFallback,
        reason: tts.reason
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/voice/transcribe", async (req, res) => {
    try {
      const { base64Data, mimeType } = req.body;
      if (!base64Data) {
        return res.status(400).json({ error: "base64Data is required" });
      }
      const result = await transcribeAudioBase64(base64Data, mimeType || "audio/webm");
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get("/api/apps/windows", async (_req, res) => {
    try {
      const windows = await listActiveWindows();
      res.json({ windows, platform: process.platform });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/apps/window-action", async (req, res) => {
    try {
      const { processName, action, confirmed } = req.body;
      if (!processName || !action) {
        return res.status(400).json({ error: "processName and action are required." });
      }
      const db = loadDb();
      if (action === "close") {
        if (!confirmed) {
          return res.status(400).json({ error: "Explicit confirmation is required before closing a window." });
        }
        const closeRes = await closeWindowsWindow(processName);
        appendActionLog(db, {
          agent: "application",
          action: "Close Desktop Window",
          target: processName,
          status: closeRes.closed ? "completed" : "blocked",
          detail: closeRes.detail
        });
        return res.json(closeRes);
      }
      if (action === "focus") {
        const ok = await focusWindowsWindow(processName);
        return res.json({ ok, detail: ok ? `Focused ${processName}` : `Window "${processName}" not found.` });
      }
      if (action === "minimize" || action === "maximize") {
        const ok = await setWindowsWindowState(processName, action);
        return res.json({ ok, detail: ok ? `${action}d ${processName}` : `Window "${processName}" not found.` });
      }
      res.status(400).json({ error: "Unsupported window action." });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/media/control", async (req, res) => {
    try {
      const { action } = req.body;
      const allowed = /* @__PURE__ */ new Set([
        "play_pause",
        "next",
        "previous",
        "volume_up",
        "volume_down",
        "mute"
      ]);
      if (!action || !allowed.has(action)) {
        return res.status(400).json({ error: "Invalid media control action." });
      }
      const result = await sendWindowsMediaKey(action);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/apps/:id/launch", async (req, res) => {
    try {
      const db = loadDb();
      const target = db.apps.find((a) => a.id === req.params.id);
      if (!target) return res.status(404).json({ error: "Application not found" });
      const result = await launchApplication(target);
      target.lastUsed = (/* @__PURE__ */ new Date()).toISOString();
      appendActionLog(db, {
        agent: "application",
        action: result.launched ? "Launch App" : "App Launch Requested",
        target: target.name,
        status: result.launched ? "completed" : "blocked",
        detail: result.message
      });
      res.json({ app: target, ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/apps/:id/pin", (req, res) => {
    const db = loadDb();
    const target = db.apps.find((a) => a.id === req.params.id);
    if (!target) return res.status(404).json({ error: "Application not found" });
    target.pinned = !target.pinned;
    saveDb(db);
    res.json(target);
  });
  app.post("/api/calendar", (req, res) => {
    const { title, date, time, category, notes } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Title is required" });
    const db = loadDb();
    const evt = {
      id: `evt-${Date.now()}`,
      title: title.trim(),
      date: date || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      time: time || "12:00",
      category: category || "task",
      completed: false,
      notes: notes?.trim(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    db.calendar.unshift(evt);
    appendActionLog(db, {
      agent: "calendar",
      action: "Create Calendar Event",
      target: evt.title,
      status: "completed"
    });
    res.json(evt);
  });
  app.patch("/api/calendar/:id", (req, res) => {
    const db = loadDb();
    const evt = db.calendar.find((e) => e.id === req.params.id);
    if (!evt) return res.status(404).json({ error: "Event not found" });
    const patch = sanitizeCalendarPatch(req.body);
    Object.assign(evt, patch);
    saveDb(db);
    res.json(evt);
  });
  app.delete("/api/calendar/:id", (req, res) => {
    const db = loadDb();
    const before = db.calendar.length;
    db.calendar = db.calendar.filter((e) => e.id !== req.params.id);
    if (db.calendar.length === before) return res.status(404).json({ error: "Event not found" });
    appendActionLog(db, {
      agent: "calendar",
      action: "Delete Calendar Event",
      target: req.params.id,
      status: "completed"
    });
    res.json({ deleted: true });
  });
  app.post("/api/memory", (req, res) => {
    const { category, key, value } = req.body;
    if (!key?.trim() || !value?.trim()) {
      return res.status(400).json({ error: "Memory key and value are required" });
    }
    const db = loadDb();
    const item = {
      id: `mem-${Date.now()}`,
      category: category || "preference",
      key: key.trim(),
      value: value.trim(),
      approved: true,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    db.memory.unshift(item);
    appendActionLog(db, {
      agent: "memory",
      action: "Store Personal Memory",
      target: item.key,
      status: "completed"
    });
    res.json(item);
  });
  app.patch("/api/memory/:id", (req, res) => {
    const db = loadDb();
    const item = db.memory.find((m) => m.id === req.params.id);
    if (!item) return res.status(404).json({ error: "Memory item not found" });
    const patch = sanitizeMemoryPatch(req.body);
    Object.assign(item, patch, { updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    saveDb(db);
    res.json(item);
  });
  app.delete("/api/memory/:id", (req, res) => {
    const db = loadDb();
    db.memory = db.memory.filter((m) => m.id !== req.params.id);
    appendActionLog(db, {
      agent: "memory",
      action: "Delete Memory Entry",
      target: req.params.id,
      status: "completed"
    });
    res.json({ deleted: true });
  });
  app.post("/api/workflows/:id/run", async (req, res) => {
    try {
      const db = loadDb();
      const wf = db.workflows.find((w) => w.id === req.params.id);
      if (!wf) return res.status(404).json({ error: "Workflow not found" });
      wf.runCount += 1;
      wf.lastRunAt = (/* @__PURE__ */ new Date()).toISOString();
      saveDb(db);
      const result = await runAssistantCommand(wf.triggerPhrase, db.settings);
      res.json({ workflow: wf, ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/api/workflows", (req, res) => {
    const { name, description, triggerPhrase } = req.body;
    if (!name?.trim() || !triggerPhrase?.trim()) {
      return res.status(400).json({ error: "Workflow name and trigger phrase are required." });
    }
    const db = loadDb();
    const wf = {
      id: `wf-${Date.now()}`,
      name: name.trim(),
      description: description?.trim() || "Custom multi-agent automation workflow",
      triggerPhrase: triggerPhrase.trim(),
      steps: [
        { agent: "core", action: "Parse workflow intent" },
        { agent: "automation", action: triggerPhrase.trim() }
      ],
      enabled: true,
      runCount: 0
    };
    db.workflows.unshift(wf);
    saveDb(db);
    res.json(wf);
  });
  app.patch("/api/settings", (req, res) => {
    const db = loadDb();
    db.settings = sanitizeSettingsPatch(req.body, db.settings);
    cachedAiHealth = null;
    invalidateFileIndexCache();
    saveDb(db);
    res.json(db.settings);
  });
  app.delete("/api/chat", (_req, res) => {
    const db = loadDb();
    db.chatHistory = [];
    saveDb(db);
    res.json({ cleared: true });
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = process.env.FRIDAY_DIST_DIR ? path4.resolve(process.env.FRIDAY_DIST_DIR) : path4.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path4.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`F.R.I.D.A.Y. Command Server active at http://localhost:${PORT}`);
  });
}
startServer();
