import type {
  DynamicIntentDefinition,
  IntentMatchScore,
  LanguageUnderstandingResult,
  LearningCorrectionRecord,
} from './types';
import { phraseTokenOverlap, stringSimilarity } from './languageUnderstanding';

const NOW = new Date().toISOString();

export const BUILTIN_DYNAMIC_INTENTS: DynamicIntentDefinition[] = [
  {
    id: 'intent.greeting_status',
    name: 'Greeting & Self Status',
    description: 'Respond warmly when the user greets Friday or asks what she is doing',
    category: 'conversational',
    exampleSentences: [
      'friday kya kar rahi hai',
      'hello friday',
      'hi friday how are you',
      'kya haal hai',
      'good morning friday',
    ],
    languages: ['english', 'hinglish', 'hindi'],
    synonyms: ['status', 'kya kar rahi hai', 'what are you doing', 'kaise ho'],
    requiredParameters: [],
    optionalParameters: [],
    handlerAction: 'conversational.status',
    confidenceThreshold: 0.45,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.weather_check',
    name: 'Weather & Forecast Check',
    description: 'Fetch local weather or forecast in English or Hinglish',
    category: 'weather_query',
    exampleSentences: [
      'kal ka weather check kar',
      'aaj ka mausam kaisa hai',
      'check weather tomorrow',
      'what is the weather today',
      'mausam bata',
    ],
    languages: ['english', 'hinglish', 'hindi'],
    synonyms: ['weather', 'mausam', 'forecast', 'barish', 'temperature'],
    requiredParameters: [],
    optionalParameters: ['location', 'dateHint'],
    handlerAction: 'tool.weather',
    confidenceThreshold: 0.48,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.open_app',
    name: 'Open Desktop Application',
    description: 'Launch a validated Windows desktop application safely',
    category: 'app_control',
    exampleSentences: [
      'chrome kholo',
      'open chrome',
      'open vscode',
      'vs code chalu kar',
      'terminal open kar',
      'open notepad',
    ],
    languages: ['english', 'hinglish'],
    synonyms: ['open', 'launch', 'kholo', 'chalu kar', 'start'],
    requiredParameters: ['app'],
    optionalParameters: [],
    handlerAction: 'tool.open_app',
    confidenceThreshold: 0.5,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.folder_inspect',
    name: 'Inspect or Open Permitted Folder',
    description: 'List contents of a permitted folder or open it in File Explorer',
    category: 'file_search',
    exampleSentences: [
      'is folder ke andar kya hai',
      'what is inside this folder',
      'open downloads folder',
      'show files in project folder',
      'open my project folder',
    ],
    languages: ['english', 'hinglish', 'mixed'],
    synonyms: ['folder', 'andar kya hai', 'directory', 'files inside', 'project folder'],
    requiredParameters: [],
    optionalParameters: ['folder', 'fileQuery'],
    handlerAction: 'tool.folder_inspect',
    confidenceThreshold: 0.48,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.file_search',
    name: 'Search Permitted Files',
    description: 'Search indexed local files inside permitted directories',
    category: 'file_search',
    exampleSentences: [
      'find my resume file',
      'search project files',
      'excel file dhund',
      'locate pdf in documents',
    ],
    languages: ['english', 'hinglish'],
    synonyms: ['find file', 'search file', 'dhund', 'locate'],
    requiredParameters: [],
    optionalParameters: ['fileQuery', 'folder'],
    handlerAction: 'tool.file_search',
    confidenceThreshold: 0.45,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.system_telemetry',
    name: 'System Performance & Hardware Telemetry',
    description: 'Inspect live CPU, RAM, storage, battery, and network usage',
    category: 'system_telemetry',
    exampleSentences: [
      'check system performance',
      'laptop ka cpu ram dikha',
      'show battery and storage',
      'system monitor check kar',
    ],
    languages: ['english', 'hinglish'],
    synonyms: ['cpu', 'ram', 'battery', 'storage', 'performance', 'telemetry'],
    requiredParameters: [],
    optionalParameters: [],
    handlerAction: 'tool.system_telemetry',
    confidenceThreshold: 0.5,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.reminder_create',
    name: 'Create Reminder or Task',
    description: 'Save a reminder or todo item into persistent SQLite schedule',
    category: 'alarm_reminder',
    exampleSentences: [
      'ek reminder laga de',
      'set a reminder for tomorrow',
      'remind me at 5pm',
      'mera reminder set kar',
    ],
    languages: ['english', 'hinglish'],
    synonyms: ['reminder', 'laga de', 'remind me', 'yaad dila'],
    requiredParameters: [],
    optionalParameters: ['dateHint', 'timeHint'],
    handlerAction: 'tool.create_reminder',
    confidenceThreshold: 0.48,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.memory_save',
    name: 'Save Context or Fact to Memory',
    description: 'Persist user fact, preference, or last context item into SQLite memory',
    category: 'memory_manage',
    exampleSentences: [
      'isko save kar',
      'save this to memory',
      'remember that I prefer Hinglish',
      'yaad rakhna mera project folder',
    ],
    languages: ['english', 'hinglish'],
    synonyms: ['save kar', 'remember', 'yaad rakh', 'save this'],
    requiredParameters: [],
    optionalParameters: ['memoryKey', 'memoryValue'],
    handlerAction: 'memory.save',
    confidenceThreshold: 0.5,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.repeat_last',
    name: 'Repeat Last Reply',
    description: 'Repeat the last spoken or displayed assistant response',
    category: 'conversational',
    exampleSentences: [
      'jo last mein bola tha wo repeat kar',
      'repeat what you just said',
      'dobara bol',
      'phir se bata',
    ],
    languages: ['english', 'hinglish'],
    synonyms: ['repeat', 'dobara', 'last mein bola'],
    requiredParameters: [],
    optionalParameters: [],
    handlerAction: 'context.repeat_last',
    confidenceThreshold: 0.45,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.explain_hindi_simple',
    name: 'Simplify Explanation in Simple Hindi',
    description: 'Rewrite the previous answer or topic in clear simple Hindi/Hinglish',
    category: 'conversational',
    exampleSentences: [
      'thoda hindi mein samjha',
      'explain in simple hindi',
      'hindi mein batao',
      'aasaan hindi mein samjhao',
    ],
    languages: ['hinglish', 'hindi', 'english'],
    synonyms: ['hindi mein samjha', 'simple hindi', 'hindi mein'],
    requiredParameters: [],
    optionalParameters: ['topic'],
    handlerAction: 'context.simplify_hindi',
    confidenceThreshold: 0.48,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.select_option',
    name: 'Select Previous Option',
    description: 'Choose one of the previously returned candidates such as the second option',
    category: 'conversational',
    exampleSentences: [
      'ab doosra wala kar',
      'do the second one',
      'pehla wala kholo',
      'run option 2',
    ],
    languages: ['hinglish', 'english'],
    synonyms: ['doosra wala', 'dusra wala', 'pehla wala', 'second one'],
    requiredParameters: [],
    optionalParameters: ['ordinalChoice'],
    handlerAction: 'context.select_candidate',
    confidenceThreshold: 0.45,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.continue_task',
    name: 'Continue Paused Task or Discussed Project',
    description: 'Resume an interrupted task plan or previously discussed project',
    category: 'workflow_run',
    exampleSentences: [
      'ab continue kar',
      'kal jo project discuss kiya tha usko continue kar',
      'continue where we left off',
      'resume task',
    ],
    languages: ['english', 'hinglish'],
    synonyms: ['continue', 'resume', 'aage badh', 'discuss kiya tha'],
    requiredParameters: [],
    optionalParameters: ['topic'],
    handlerAction: 'context.continue',
    confidenceThreshold: 0.45,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.correction_learning',
    name: 'Handle User Correction',
    description: 'Acknowledge misunderstanding and learn corrected intent/action mapping',
    category: 'learning',
    exampleSentences: [
      'arey nahi maine ye nahi bola',
      'no not that open my project folder',
      'galat samjhi',
      'i meant open vscode',
    ],
    languages: ['english', 'hinglish'],
    synonyms: ['arey nahi', 'nahi ye nahi', 'not that', 'galat'],
    requiredParameters: [],
    optionalParameters: [],
    handlerAction: 'learning.correct',
    confidenceThreshold: 0.45,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.teach_custom_command',
    name: 'Teach Custom Intent Rule',
    description: 'Register a reusable user-taught voice/text command mapping',
    category: 'learning',
    exampleSentences: [
      'when i say coding mode open vscode and my project folder',
      'jab main coding mode bolu tab vscode aur project folder kholo',
    ],
    languages: ['english', 'hinglish'],
    synonyms: ['when i say', 'jab main bolu'],
    requiredParameters: ['customPhrase', 'customActionsText'],
    optionalParameters: [],
    handlerAction: 'learning.teach_intent',
    confidenceThreshold: 0.55,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.organize_folder_confirm',
    name: 'Organize or Modify Folder (Confirmation Gated)',
    description: 'Plan folder organization or cleanup and require user confirmation before execution',
    category: 'sensitive_action',
    exampleSentences: [
      'organize my project folder',
      'delete old files in downloads',
      'clean up desktop folder',
    ],
    languages: ['english', 'hinglish'],
    synonyms: ['organize', 'delete', 'clean up', 'wipe', 'remove'],
    requiredParameters: [],
    optionalParameters: ['folder'],
    handlerAction: 'plan.sensitive_folder',
    confirmationRequired: true,
    confidenceThreshold: 0.52,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.media_control',
    name: 'Media & Volume Control',
    description: 'Play/pause music or adjust system audio volume',
    category: 'media_control',
    exampleSentences: [
      'play music',
      'volume badha',
      'increase volume',
      'mute audio',
      'gaana chalao',
      'ek achha sa song lagao',
      'song bajao',
    ],
    languages: ['english', 'hinglish'],
    synonyms: ['volume', 'music', 'song', 'songs', 'gaana', 'gana', 'mute', 'pause', 'lagao', 'bajao'],
    requiredParameters: [],
    optionalParameters: [],
    handlerAction: 'tool.media_control',
    confidenceThreshold: 0.45,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.web_research',
    name: 'Live Web Research (Online Tool)',
    description: 'Run online public web search when network connectivity is available',
    category: 'web_search',
    exampleSentences: [
      'search google for raspberry pi projects',
      'search online for latest node sqlite docs',
      'research online about transformers',
      'search for python programming',
      'search for c programming',
    ],
    languages: ['english', 'hinglish'],
    synonyms: ['search google', 'search online', 'search for', 'web search', 'internet search'],
    requiredParameters: [],
    optionalParameters: ['topic'],
    handlerAction: 'tool.web_research',
    confidenceThreshold: 0.52,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'intent.knowledge_query',
    name: 'Local Knowledge & Personal Facts Query',
    description: 'Answer questions from indexed local notes, files, FAQs, built-in concepts, and memories with provenance',
    category: 'knowledge',
    exampleSentences: [
      'what do you know about my project',
      'explain my workspace notes',
      'what is in my knowledge base',
      'what is ram',
      'mujhe python samjhao',
      'explain python programming',
    ],
    languages: ['english', 'hinglish'],
    synonyms: ['knowledge', 'explain', 'what is', 'kya hai', 'samjhao'],
    requiredParameters: [],
    optionalParameters: ['topic'],
    handlerAction: 'knowledge.search',
    confidenceThreshold: 0.4,
    enabled: true,
    usageCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

export class DynamicIntentRegistry {
  private intents: DynamicIntentDefinition[];

  constructor(initialCustomIntents: DynamicIntentDefinition[] = []) {
    const map = new Map<string, DynamicIntentDefinition>();
    for (const def of BUILTIN_DYNAMIC_INTENTS) {
      map.set(def.id, { ...def });
    }
    for (const custom of initialCustomIntents) {
      map.set(custom.id, { ...custom });
    }
    this.intents = Array.from(map.values());
  }

  getAllIntents(): DynamicIntentDefinition[] {
    return this.intents;
  }

  getById(id: string): DynamicIntentDefinition | undefined {
    return this.intents.find((i) => i.id === id);
  }

  registerIntent(intent: DynamicIntentDefinition): DynamicIntentDefinition {
    const existingIdx = this.intents.findIndex(
      (i) => i.id === intent.id || i.name.toLowerCase() === intent.name.toLowerCase()
    );
    if (existingIdx >= 0) {
      this.intents[existingIdx] = { ...intent, updatedAt: new Date().toISOString() };
      return this.intents[existingIdx];
    }
    this.intents.push(intent);
    return intent;
  }

  removeIntent(id: string): boolean {
    const target = this.intents.find((i) => i.id === id);
    if (!target || !target.userDefined) return false;
    this.intents = this.intents.filter((i) => i.id !== id);
    return true;
  }

  teachCustomIntent(phrase: string, actionsText: string): DynamicIntentDefinition {
    const cleanPhrase = phrase.trim().replace(/^["']|["']$/g, '');
    const id = `intent.custom.${cleanPhrase.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 32)}`;
    const now = new Date().toISOString();
    const def: DynamicIntentDefinition = {
      id,
      name: `Custom Rule: ${cleanPhrase}`,
      description: `User-taught command: when saying "${cleanPhrase}", execute "${actionsText.trim()}"`,
      category: 'workflow_run',
      exampleSentences: [cleanPhrase.toLowerCase()],
      languages: ['english', 'hinglish', 'mixed'],
      synonyms: [cleanPhrase.toLowerCase()],
      requiredParameters: [],
      optionalParameters: [],
      handlerAction: 'custom.compound_actions',
      handlerPayload: {
        triggerPhrase: cleanPhrase,
        actionsText: actionsText.trim(),
      },
      confirmationRequired: /\b(delete|remove|wipe|format|shutdown|close)\b/i.test(actionsText),
      confidenceThreshold: 0.55,
      userDefined: true,
      enabled: true,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    return this.registerIntent(def);
  }

  matchIntent(
    understanding: LanguageUnderstandingResult,
    corrections: LearningCorrectionRecord[] = []
  ): IntentMatchScore[] {
    const queryLower = understanding.correctedInput.toLowerCase().trim();
    const canonicalJoined = understanding.canonicalTokens.join(' ');
    const scores: IntentMatchScore[] = [];

    // 1. Direct structural signals from Understanding Engine
    if (understanding.turnTypeHint === 'teach_intent') {
      const teachDef = this.getById('intent.teach_custom_command');
      if (teachDef) {
        return [{ intent: teachDef, confidence: 0.97, matchedExample: understanding.entities.customPhrase, reason: 'Matched teach-intent grammar' }];
      }
    }

    if (understanding.isRepeatRequest) {
      const repDef = this.getById('intent.repeat_last');
      if (repDef) {
        return [{ intent: repDef, confidence: 0.95, reason: 'Matched repeat-last request' }];
      }
    }

    if (understanding.isHindiSimplifyRequest) {
      const hindiDef = this.getById('intent.explain_hindi_simple');
      if (hindiDef) {
        return [{ intent: hindiDef, confidence: 0.94, reason: 'Matched Hindi simplification follow-up' }];
      }
    }

    if (understanding.isOrdinalSelectRequest) {
      const ordDef = this.getById('intent.select_option');
      if (ordDef) {
        return [{ intent: ordDef, confidence: 0.93, reason: 'Matched ordinal candidate selection' }];
      }
    }

    if (understanding.isSaveReferenceRequest && understanding.turnTypeHint !== 'teach_intent') {
      const saveDef = this.getById('intent.memory_save');
      if (saveDef) {
        return [{ intent: saveDef, confidence: 0.91, reason: 'Matched save-to-memory reference' }];
      }
    }

    if (understanding.isContinueRequest) {
      const contDef = this.getById('intent.continue_task');
      if (contDef) {
        return [{ intent: contDef, confidence: 0.91, reason: 'Matched continue/resume cue' }];
      }
    }

    if (understanding.turnTypeHint === 'greeting') {
      const greetDef = this.getById('intent.greeting_status');
      if (greetDef) {
        return [{ intent: greetDef, confidence: 0.92, reason: 'Matched greeting utterance' }];
      }
    }

    if (understanding.isCorrection && !understanding.entities.app && !understanding.entities.folder) {
      const corrDef = this.getById('intent.correction_learning');
      if (corrDef) {
        return [{ intent: corrDef, confidence: 0.9, reason: 'Matched correction negation phrase' }];
      }
    }

    // 2. Check learned user corrections first
    for (const corr of corrections) {
      const sim = Math.max(
        stringSimilarity(queryLower, corr.wrongInput.toLowerCase()),
        stringSimilarity(queryLower, corr.correctedPhrase.toLowerCase())
      );
      if (sim >= 0.78) {
        const learnedDef = this.getById(corr.targetIntentId);
        if (learnedDef) {
          scores.push({
            intent: learnedDef,
            confidence: Math.min(0.96, Number((0.82 + sim * 0.14).toFixed(2))),
            matchedExample: corr.correctedPhrase,
            reason: `Learned from user correction (${corr.correctedPhrase})`,
          });
        }
      }
    }

    // 3. Score all enabled dynamic intents
    for (const intent of this.intents) {
      if (!intent.enabled) continue;
      let bestScore = 0;
      let bestEx = '';
      let reason = 'Fuzzy example similarity';

      // Priority boost for user-defined custom commands
      if (intent.userDefined) {
        for (const ex of intent.exampleSentences) {
          const sim = Math.max(stringSimilarity(queryLower, ex), phraseTokenOverlap(queryLower, ex));
          if (queryLower.includes(ex) || sim >= 0.75) {
            bestScore = Math.max(bestScore, queryLower === ex ? 0.98 : Math.min(0.95, 0.75 + sim * 0.2));
            bestEx = ex;
            reason = 'Matched user-taught custom command';
          }
        }
      }

      for (const ex of intent.exampleSentences) {
        const simRaw = stringSimilarity(queryLower, ex);
        const simCanon = stringSimilarity(canonicalJoined, ex);
        const overlap = Math.max(phraseTokenOverlap(queryLower, ex), phraseTokenOverlap(canonicalJoined, ex));
        const combined = Math.max(simRaw, simCanon, overlap * 0.92);
        if (combined > bestScore) {
          bestScore = combined;
          bestEx = ex;
        }
      }

      // Synonym & entity signals
      let synBonus = 0;
      for (const syn of intent.synonyms) {
        const sLower = syn.toLowerCase();
        if (queryLower.includes(sLower) || canonicalJoined.includes(sLower)) {
          synBonus = Math.max(synBonus, 0.25);
          reason = `Matched lexicon cue "${syn}"`;
        }
      }

      let entityBonus = 0;
      if (intent.id === 'intent.open_app' && understanding.entities.app && /\b(open|launch|start|kholo|chalu)\b/i.test(canonicalJoined)) {
        entityBonus = 0.35;
        reason = `Open app entity "${understanding.entities.app}"`;
      } else if (intent.id === 'intent.weather_check' && /\b(weather|mausam|forecast|barish|taapman)\b/i.test(canonicalJoined)) {
        entityBonus = 0.38;
        reason = 'Weather keyword & date/location cue';
      } else if (
        intent.id === 'intent.folder_inspect' &&
        (understanding.entities.folder || /\b(folder|andar\s+kya\s+hai|directory)\b/i.test(queryLower))
      ) {
        entityBonus = 0.35;
        reason = 'Folder inspection cue';
      } else if (intent.id === 'intent.organize_folder_confirm' && /\b(organize|delete|remove|wipe|clean\s+up|format)\b/i.test(queryLower)) {
        entityBonus = 0.42;
        reason = 'Sensitive folder/file action requires confirmation';
      } else if (intent.id === 'intent.reminder_create' && /\b(reminder|remind|alarm|yaad\s+dila|laga\s+de)\b/i.test(queryLower)) {
        entityBonus = 0.35;
        reason = 'Reminder creation cue';
      } else if (
        intent.id === 'intent.web_research' &&
        (/\b(search\s+google|search\s+online|internet|research\s+online)\b/i.test(queryLower) ||
          (/\bsearch\s+(?:for|about)\b/i.test(queryLower) &&
            !/\b(file|files|folder|directory|downloads?|documents?|desktop)\b/i.test(queryLower)))
      ) {
        entityBonus = 0.38;
        reason = 'Explicit web research cue';
      } else if (intent.id === 'intent.system_telemetry' && /\b(cpu|ram|battery|storage|performance|telemetry|system)\b/i.test(queryLower) && !/^(?:what\s+is|explain|define)\b|\b(?:kya\s+hai|samjhao)\b/i.test(queryLower)) {
        entityBonus = 0.32;
        reason = 'System telemetry cue';
      } else if (
        intent.id === 'intent.knowledge_query' &&
        /^(?:what\s+is|what\s+are|define|explain|tell\s+me\s+about)\b|\b(?:samjhao|samjha|kya\s+hai|kya\s+hota\s+hai)\b/i.test(queryLower) &&
        !/\b(weather|mausam|time|date|folder)\b/i.test(queryLower)
      ) {
        entityBonus = 0.36;
        reason = 'Knowledge & explanation cue';
      }

      const finalScore = Math.min(0.98, Number((bestScore * 0.65 + synBonus + entityBonus).toFixed(2)));
      if (finalScore >= 0.35) {
        scores.push({
          intent,
          confidence: finalScore,
          matchedExample: bestEx,
          reason,
        });
      }
    }

    return scores.sort((a, b) => b.confidence - a.confidence);
  }
}
