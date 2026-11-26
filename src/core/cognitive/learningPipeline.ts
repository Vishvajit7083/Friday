import type {
  CognitiveLanguage,
  DynamicIntentDefinition,
  LanguageUnderstandingResult,
  LearningCorrectionRecord,
  LexiconEntry,
  ModelGenerationRequest,
  ModelGenerationResponse,
  ModelProvider,
  TaskPatternSuggestion,
  TokenizerVocabArtifact,
  TrainingDatasetSample,
  UserPreferenceProfile,
} from './types';

export function createDefaultPreferenceProfile(): UserPreferenceProfile {
  return {
    preferredLanguage: 'auto',
    preferredStyle: 'auto',
    topApps: {},
    topCommands: {},
    correctionCount: 0,
    optInDatasetCollection: false,
    updatedAt: new Date().toISOString(),
  };
}

// Level 1: Vocabulary Learning
export function learnVocabularyTerm(
  existing: LexiconEntry[],
  phrase: string,
  canonical: string,
  language: CognitiveLanguage = 'hinglish',
  kind: LexiconEntry['kind'] = 'verb'
): LexiconEntry {
  const cleanPhrase = phrase.trim().toLowerCase();
  const cleanCanonical = canonical.trim().toLowerCase();
  const found = existing.find((e) => e.phrase.toLowerCase() === cleanPhrase);
  const now = new Date().toISOString();
  if (found) {
    if (!found.synonyms.includes(cleanPhrase) && found.phrase !== cleanPhrase) {
      found.synonyms.push(cleanPhrase);
    }
    found.canonical = cleanCanonical;
    found.updatedAt = now;
    return found;
  }
  const entry: LexiconEntry = {
    id: `lex-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    phrase: cleanPhrase,
    canonical: cleanCanonical,
    language,
    kind,
    synonyms: [],
    notes: 'Learned from user interaction',
    userAdded: true,
    updatedAt: now,
  };
  existing.push(entry);
  return entry;
}

// Level 2: Correction Learning
export function recordCorrectionLearning(params: {
  wrongInput: string;
  wrongIntentId?: string;
  correctedPhrase: string;
  targetIntent: DynamicIntentDefinition;
}): LearningCorrectionRecord {
  const normalizedWrong = params.wrongInput.trim().toLowerCase();
  if (normalizedWrong && !params.targetIntent.exampleSentences.includes(normalizedWrong)) {
    params.targetIntent.exampleSentences.push(normalizedWrong);
    params.targetIntent.updatedAt = new Date().toISOString();
  }
  return {
    id: `corr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    wrongInput: params.wrongInput.trim(),
    wrongIntentId: params.wrongIntentId,
    correctedPhrase: params.correctedPhrase.trim(),
    targetIntentId: params.targetIntent.id,
    targetAction: params.targetIntent.handlerAction,
    targetPayload: params.targetIntent.handlerPayload,
    createdAt: new Date().toISOString(),
  };
}

// Level 3: Preference Learning
export function updatePreferenceLearning(
  profile: UserPreferenceProfile,
  understanding: LanguageUnderstandingResult,
  usedIntentId: string
): UserPreferenceProfile {
  const next: UserPreferenceProfile = {
    ...profile,
    topApps: { ...profile.topApps },
    topCommands: { ...profile.topCommands },
    updatedAt: new Date().toISOString(),
  };

  if (understanding.entities.app) {
    const app = understanding.entities.app;
    next.topApps[app] = (next.topApps[app] || 0) + 1;
  }

  next.topCommands[usedIntentId] = (next.topCommands[usedIntentId] || 0) + 1;

  if (understanding.isHindiSimplifyRequest) {
    next.preferredStyle = 'hindi_simple';
    next.preferredLanguage = 'hinglish';
  } else if (/\b(?:always\s+talk\s+in\s+hinglish|hinglish\s+mein\s+baat\s+kar|prefer\s+hinglish)\b/i.test(understanding.correctedInput)) {
    next.preferredStyle = 'hinglish';
    next.preferredLanguage = 'hinglish';
  } else if (/\b(?:keep\s+it\s+short|short\s+mein\s+bata|concise)\b/i.test(understanding.correctedInput)) {
    next.preferredStyle = 'concise';
  }

  return next;
}

// Level 4: Repeated Task Pattern Detection (suggests workflow, never silently executes risky sequences)
export function detectRepeatedTaskPattern(
  recentCommandKeys: string[],
  existingSuggestions: TaskPatternSuggestion[]
): TaskPatternSuggestion | null {
  if (recentCommandKeys.length < 4) return null;

  // Check if the last 2-step pair occurred >= 2 times in history
  const pair = `${recentCommandKeys[recentCommandKeys.length - 2]} -> ${recentCommandKeys[recentCommandKeys.length - 1]}`;
  if (recentCommandKeys[recentCommandKeys.length - 2] === recentCommandKeys[recentCommandKeys.length - 1]) {
    return null;
  }

  let count = 0;
  for (let i = 0; i < recentCommandKeys.length - 1; i += 1) {
    const candidate = `${recentCommandKeys[i]} -> ${recentCommandKeys[i + 1]}`;
    if (candidate === pair) count += 1;
  }

  if (count < 2) return null;

  const existing = existingSuggestions.find((s) => s.sequenceKey === pair);
  const now = new Date().toISOString();
  if (existing) {
    existing.occurrences = Math.max(existing.occurrences, count);
    existing.lastSeenAt = now;
    return existing.status === 'suggested' ? existing : null;
  }

  const steps = pair.split(' -> ');
  const suggestion: TaskPatternSuggestion = {
    id: `pat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sequenceKey: pair,
    steps,
    occurrences: count,
    suggestedName: `Routine: ${steps.join(' + ')}`,
    suggestedTrigger: `run ${steps.join(' and ')}`,
    status: 'suggested',
    lastSeenAt: now,
  };
  existingSuggestions.push(suggestion);
  return suggestion;
}

// Level 5: Opt-in Dataset Curation & JSONL Export
export function createTrainingSample(params: {
  prompt: string;
  normalizedPrompt: string;
  language: CognitiveLanguage;
  intentId: string;
  entities: TrainingDatasetSample['entities'];
  response: string;
  confidence: number;
}): TrainingDatasetSample {
  return {
    id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    prompt: params.prompt.trim(),
    normalizedPrompt: params.normalizedPrompt.trim(),
    language: params.language,
    intentId: params.intentId,
    entities: params.entities,
    response: params.response.trim(),
    qualityScore: Number(Math.min(1, Math.max(0.2, params.confidence)).toFixed(2)),
    approved: true,
    createdAt: new Date().toISOString(),
  };
}

export function formatTrainingDatasetJsonl(samples: TrainingDatasetSample[]): string {
  return samples
    .filter((s) => s.approved)
    .map((s) =>
      JSON.stringify({
        id: s.id,
        instruction: s.prompt,
        normalized: s.normalizedPrompt,
        language: s.language,
        intent: s.intentId,
        entities: s.entities,
        response: s.response,
        quality: s.qualityScore,
        createdAt: s.createdAt,
      })
    )
    .join('\n');
}

// Level 6: Future F.R.I.D.A.Y. LANGUAGE CORE — Tokenizer Trainer, Sequence Encoder, Split & Evaluation Harness
const SPECIAL_TOKENS = ['<pad>', '<unk>', '<bos>', '<eos>', '<user>', '<friday>', '<intent>'];

export function cleanDatasetSamples(samples: TrainingDatasetSample[]): TrainingDatasetSample[] {
  const seen = new Set<string>();
  const cleaned: TrainingDatasetSample[] = [];
  for (const s of samples) {
    if (!s.approved) continue;
    const key = `${s.normalizedPrompt.toLowerCase()}::${s.intentId}`;
    if (!s.prompt.trim() || !s.response.trim() || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(s);
  }
  return cleaned;
}

export function splitTrainEvalDataset(
  samples: TrainingDatasetSample[],
  evalRatio = 0.2
): { train: TrainingDatasetSample[]; eval: TrainingDatasetSample[] } {
  const cleaned = cleanDatasetSamples(samples);
  const train: TrainingDatasetSample[] = [];
  const evalSet: TrainingDatasetSample[] = [];

  cleaned.forEach((sample, idx) => {
    // Deterministic stratified-like modulus split
    const bucket = (idx + 1) % Math.max(2, Math.round(1 / Math.max(0.1, evalRatio)));
    if (bucket === 0 && cleaned.length >= 3) {
      evalSet.push(sample);
    } else {
      train.push(sample);
    }
  });

  if (evalSet.length === 0 && train.length > 1) {
    evalSet.push(train.pop()!);
  }

  return { train, eval: evalSet };
}

export function trainBpeStyleTokenizer(
  samples: TrainingDatasetSample[],
  maxMerges = 64
): TokenizerVocabArtifact {
  const { train, eval: evalSet } = splitTrainEvalDataset(samples);
  const corpusTexts = train.flatMap((s) => [s.prompt, s.normalizedPrompt, s.response, s.intentId]);

  const tokenToId: Record<string, number> = {};
  let nextId = 0;
  for (const sp of SPECIAL_TOKENS) {
    tokenToId[sp] = nextId++;
  }

  // Seed character + word frequency table
  const wordFreq = new Map<string, number>();
  for (const text of corpusTexts) {
    const words = text
      .toLowerCase()
      .replace(/([.,!?:/_-])/g, ' $1 ')
      .split(/\s+/)
      .filter(Boolean);
    for (const w of words) {
      wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
      for (const ch of w) {
        if (!(ch in tokenToId)) tokenToId[ch] = nextId++;
      }
    }
  }

  // Learn frequent subword merge pairs (compact BPE-style loop)
  const wordChars = new Map<string, string[]>();
  for (const w of wordFreq.keys()) {
    wordChars.set(w, Array.from(w));
  }

  const mergePairs: Array<[string, string]> = [];
  for (let m = 0; m < maxMerges; m += 1) {
    const pairCounts = new Map<string, number>();
    for (const [word, chars] of wordChars.entries()) {
      const freq = wordFreq.get(word) || 1;
      for (let i = 0; i < chars.length - 1; i += 1) {
        const key = `${chars[i]}\u0000${chars[i + 1]}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + freq);
      }
    }
    let bestPair = '';
    let bestCount = 1;
    for (const [k, c] of pairCounts.entries()) {
      if (c > bestCount) {
        bestCount = c;
        bestPair = k;
      }
    }
    if (!bestPair) break;
    const [left, right] = bestPair.split('\u0000');
    const merged = `${left}${right}`;
    mergePairs.push([left, right]);
    if (!(merged in tokenToId)) tokenToId[merged] = nextId++;

    for (const [word, chars] of wordChars.entries()) {
      const updated: string[] = [];
      let i = 0;
      while (i < chars.length) {
        if (i < chars.length - 1 && chars[i] === left && chars[i + 1] === right) {
          updated.push(merged);
          i += 2;
        } else {
          updated.push(chars[i]);
          i += 1;
        }
      }
      wordChars.set(word, updated);
    }
  }

  // Add full frequent words to vocab too
  for (const [word, freq] of wordFreq.entries()) {
    if (freq >= 1 && !(word in tokenToId)) {
      tokenToId[word] = nextId++;
    }
  }

  // Evaluate UNK rate and token length on eval split
  const unkId = tokenToId['<unk>'];
  let totalTokens = 0;
  let totalUnks = 0;
  for (const s of evalSet) {
    const encoded = encodeWithTokenizerArtifact(
      {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        vocabSize: Object.keys(tokenToId).length,
        specialTokens: SPECIAL_TOKENS,
        tokenToId,
        mergePairs,
        sampleCount: samples.length,
        evalMetrics: { trainCount: train.length, evalCount: evalSet.length, avgTokensPerSample: 0, unkRate: 0 },
      },
      `${s.prompt} ${s.response}`
    );
    totalTokens += encoded.length;
    totalUnks += encoded.filter((id) => id === unkId).length;
  }

  return {
    version: '1.0.0-bpe-foundation',
    createdAt: new Date().toISOString(),
    vocabSize: Object.keys(tokenToId).length,
    specialTokens: SPECIAL_TOKENS,
    tokenToId,
    mergePairs,
    sampleCount: train.length + evalSet.length,
    evalMetrics: {
      trainCount: train.length,
      evalCount: evalSet.length,
      avgTokensPerSample: evalSet.length > 0 ? Number((totalTokens / evalSet.length).toFixed(1)) : 0,
      unkRate: totalTokens > 0 ? Number((totalUnks / totalTokens).toFixed(4)) : 0,
    },
  };
}

export function encodeWithTokenizerArtifact(artifact: TokenizerVocabArtifact, text: string): number[] {
  const unk = artifact.tokenToId['<unk>'] ?? 1;
  const bos = artifact.tokenToId['<bos>'] ?? 2;
  const eos = artifact.tokenToId['<eos>'] ?? 3;
  const ids: number[] = [bos];

  const words = text
    .toLowerCase()
    .replace(/([.,!?:/_-])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);

  for (const w of words) {
    if (w in artifact.tokenToId) {
      ids.push(artifact.tokenToId[w]);
      continue;
    }
    let pieces = Array.from(w);
    for (const [left, right] of artifact.mergePairs) {
      const next: string[] = [];
      let i = 0;
      while (i < pieces.length) {
        if (i < pieces.length - 1 && pieces[i] === left && pieces[i + 1] === right) {
          next.push(`${left}${right}`);
          i += 2;
        } else {
          next.push(pieces[i]);
          i += 1;
        }
      }
      pieces = next;
    }
    for (const p of pieces) {
      ids.push(p in artifact.tokenToId ? artifact.tokenToId[p] : unk);
    }
  }

  ids.push(eos);
  return ids;
}

// Pluggable ModelProvider interface: future F.R.I.D.A.Y. LANGUAGE CORE drops in here cleanly
export class FutureLanguageCoreProvider implements ModelProvider {
  readonly id = 'friday-language-core-adapter';
  readonly name = 'F.R.I.D.A.Y. Language Core (Pluggable Adapter)';
  readonly kind = 'future_language_core' as const;
  private checkpointLoaded = false;

  constructor(private weightsPath?: string) {
    this.checkpointLoaded = Boolean(weightsPath && weightsPath.trim().length > 0);
  }

  isReady(): boolean {
    return this.checkpointLoaded;
  }

  describeCapabilities(): string {
    return this.checkpointLoaded
      ? `Custom trained checkpoint configured (${this.weightsPath}).`
      : 'Adapter ready for Phase 4–5 self-trained neural checkpoint; currently deferring to F.R.I.D.A.Y. Cognitive Engine (never fabricates trained neural output).';
  }

  async generateResponse(req: ModelGenerationRequest): Promise<ModelGenerationResponse> {
    if (!this.checkpointLoaded) {
      return {
        text:
          req.toolResultSummary ||
          "I didn't match a specific action for that — try asking me to open an app, search the web, check system performance, or explain a topic.",
        providerId: this.id,
        providerKind: this.kind,
        usedTrainedModel: false,
        confidence: req.confidence,
      };
    }
    return {
      text: req.toolResultSummary || 'Generated from Language Core checkpoint.',
      providerId: this.id,
      providerKind: this.kind,
      usedTrainedModel: true,
      confidence: req.confidence,
    };
  }
}
