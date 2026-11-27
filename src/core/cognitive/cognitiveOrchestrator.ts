import type { AgentId, ExecutionStep, GroundingSource } from '../types';
import type {
  CognitiveContextState,
  CognitiveMemoryRecord,
  CognitiveMemorySearchQuery,
  CognitiveOrchestratorResult,
  CognitiveToolAdapter,
  CognitiveTurnInput,
  DynamicIntentDefinition,
  KnowledgeProvenance,
  KnowledgeSearchResult,
  LearningCorrectionRecord,
  LexiconEntry,
  ModelProvider,
  TaskPatternSuggestion,
  TrainingDatasetSample,
  UserPreferenceProfile,
} from './types';
import { DEFAULT_HINGLISH_LEXICON, mergeLexicons } from './vocabularyData';
import { lookupBuiltinKnowledge } from './builtinKnowledge';
import { isHinglishInterruptionPhrase } from './hinglishNlp';
import { understandUserInput } from './languageUnderstanding';
import {
  createInitialContextState,
  resolveContextReferences,
  updateContextAfterTurn,
} from './contextEngine';
import { DynamicIntentRegistry } from './intentRegistry';
import { buildStructuredTaskPlan, decideExecutionRoute } from './taskPlanner';
import {
  createDefaultPreferenceProfile,
  createTrainingSample,
  detectRepeatedTaskPattern,
  recordCorrectionLearning,
  updatePreferenceLearning,
} from './learningPipeline';
import { selectResponseStyle } from './personalityEngine';
import {
  buildGreetingResponse,
  LocalCognitiveModelProvider,
  translateSummaryToSimpleHindi,
} from './responseGenerator';

export interface CognitiveMemoryStorePort {
  search(query: CognitiveMemorySearchQuery): CognitiveMemoryRecord[];
  save(record: Omit<CognitiveMemoryRecord, 'id' | 'createdAt' | 'updatedAt' | 'lastAccessedAt' | 'accessCount'>): CognitiveMemoryRecord;
}

export interface CognitiveKnowledgePort {
  search(query: string, limit?: number): KnowledgeSearchResult[];
}

export interface CognitiveLearningStorePort {
  getCustomLexicon(): LexiconEntry[];
  getCustomIntents(): DynamicIntentDefinition[];
  saveCustomIntent(intent: DynamicIntentDefinition): void;
  getCorrections(): LearningCorrectionRecord[];
  saveCorrection(correction: LearningCorrectionRecord): void;
  getPreferenceProfile(): UserPreferenceProfile;
  savePreferenceProfile(profile: UserPreferenceProfile): void;
  getPatternSuggestions(): TaskPatternSuggestion[];
  savePatternSuggestion(suggestion: TaskPatternSuggestion): void;
  appendTrainingSample?(sample: TrainingDatasetSample): void;
}

export class InMemoryCognitivePorts
  implements CognitiveMemoryStorePort, CognitiveKnowledgePort, CognitiveLearningStorePort
{
  memories: CognitiveMemoryRecord[] = [];
  lexicon: LexiconEntry[] = [];
  customIntents: DynamicIntentDefinition[] = [];
  corrections: LearningCorrectionRecord[] = [];
  preferences: UserPreferenceProfile = createDefaultPreferenceProfile();
  patterns: TaskPatternSuggestion[] = [];
  dataset: TrainingDatasetSample[] = [];
  knowledgeChunks: KnowledgeSearchResult[] = [];

  search(query: CognitiveMemorySearchQuery): CognitiveMemoryRecord[];
  search(query: string, limit?: number): KnowledgeSearchResult[];
  search(query: CognitiveMemorySearchQuery | string, limit = 5): CognitiveMemoryRecord[] | KnowledgeSearchResult[] {
    if (typeof query === 'string') {
      const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
      return this.knowledgeChunks
        .map((k) => {
          const hay = `${k.chunk.title} ${k.chunk.content}`.toLowerCase();
          const matchedTerms = terms.filter((t) => hay.includes(t));
          return { chunk: k.chunk, score: matchedTerms.length, matchedTerms };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    }

    const q = (query.query || '').toLowerCase();
    return this.memories
      .filter((m) => (!query.layer || m.layer === query.layer) && (!query.category || m.category === query.category))
      .filter((m) => !q || `${m.key} ${m.value} ${m.tags.join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, query.limit ?? 10);
  }

  save(
    record: Omit<CognitiveMemoryRecord, 'id' | 'createdAt' | 'updatedAt' | 'lastAccessedAt' | 'accessCount'>
  ): CognitiveMemoryRecord {
    const now = new Date().toISOString();
    const item: CognitiveMemoryRecord = {
      ...record,
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      accessCount: 1,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
    };
    this.memories.unshift(item);
    return item;
  }

  getCustomLexicon(): LexiconEntry[] {
    return this.lexicon;
  }
  getCustomIntents(): DynamicIntentDefinition[] {
    return this.customIntents;
  }
  saveCustomIntent(intent: DynamicIntentDefinition): void {
    const idx = this.customIntents.findIndex((i) => i.id === intent.id);
    if (idx >= 0) this.customIntents[idx] = intent;
    else this.customIntents.push(intent);
  }
  getCorrections(): LearningCorrectionRecord[] {
    return this.corrections;
  }
  saveCorrection(correction: LearningCorrectionRecord): void {
    this.corrections.push(correction);
  }
  getPreferenceProfile(): UserPreferenceProfile {
    return this.preferences;
  }
  savePreferenceProfile(profile: UserPreferenceProfile): void {
    this.preferences = profile;
  }
  getPatternSuggestions(): TaskPatternSuggestion[] {
    return this.patterns;
  }
  savePatternSuggestion(suggestion: TaskPatternSuggestion): void {
    const idx = this.patterns.findIndex((p) => p.id === suggestion.id);
    if (idx >= 0) this.patterns[idx] = suggestion;
    else this.patterns.push(suggestion);
  }
  appendTrainingSample(sample: TrainingDatasetSample): void {
    this.dataset.push(sample);
  }
}

export class CognitiveOrchestrator {
  private context: CognitiveContextState;
  private recentCommandKeys: string[] = [];
  private modelProvider: ModelProvider;

  constructor(
    private deps: {
      memoryStore: CognitiveMemoryStorePort;
      knowledgeEngine: CognitiveKnowledgePort;
      learningStore: CognitiveLearningStorePort;
      toolAdapter: CognitiveToolAdapter;
      modelProvider?: ModelProvider;
      sessionId?: string;
    }
  ) {
    this.context = createInitialContextState(deps.sessionId || 'default');
    this.modelProvider = deps.modelProvider || new LocalCognitiveModelProvider();
  }

  getContextState(): CognitiveContextState {
    return this.context;
  }

  resetContext(): void {
    this.context = createInitialContextState(this.context.sessionId);
  }

  setModelProvider(provider: ModelProvider): void {
    this.modelProvider = provider;
  }

  async processTurn(turn: CognitiveTurnInput): Promise<CognitiveOrchestratorResult> {
    const t0 = performance.now();
    const lexicon = mergeLexicons(DEFAULT_HINGLISH_LEXICON, this.deps.learningStore.getCustomLexicon());
    const registry = new DynamicIntentRegistry(this.deps.learningStore.getCustomIntents());
    const corrections = this.deps.learningStore.getCorrections();
    const prefs = this.deps.learningStore.getPreferenceProfile();

    // 1-4: Receive, normalize, detect language, extract entities & spelling corrections
    const understanding = understandUserInput(turn.rawText, lexicon);
    const tUnderstand = performance.now();

    // Fast path for Hinglish/English voice interruption
    if (isHinglishInterruptionPhrase(turn.rawText)) {
      if (this.context.activeTaskPlan) {
        this.context.pausedTaskPlan = { ...this.context.activeTaskPlan, status: 'paused' };
        this.context.activeTaskPlan = null;
      }
      const reply =
        understanding.detectedLanguage === 'hinglish' || understanding.detectedLanguage === 'hindi'
          ? 'Theek hai, ruk gayi.'
          : 'Stopped.';
      const totalMs = Math.max(1, Math.round(performance.now() - t0));
      this.context = updateContextAfterTurn(this.context, {
        understanding,
        intentId: 'intent.interruption',
        intentCategory: 'voice_interruption',
        assistantReply: reply,
        pausedTaskPlan: this.context.pausedTaskPlan,
      });
      return {
        reply,
        language: understanding.detectedLanguage,
        style: 'casual',
        intentId: 'intent.interruption',
        intentCategory: 'voice_interruption',
        confidence: 0.99,
        provenance: 'inferred',
        decision: {
          route: 'conversational_reply',
          confidence: 0.99,
          requiresOnline: false,
          onlineAvailable: turn.online,
          requiresConfirmation: false,
          rationale: 'Immediate voice/task interruption command.',
        },
        understanding,
        steps: [{ id: 'step-1', agent: 'voice', title: 'Halt speech & pause active task', status: 'completed' }],
        agents: ['voice', 'core'],
        sources: [],
        pausedOrStopped: true,
        timings: {
          understandMs: Math.max(1, Math.round(tUnderstand - t0)),
          memoryMs: 0,
          knowledgeMs: 0,
          planMs: 0,
          toolMs: 0,
          generateMs: 0,
          totalMs,
        },
      };
    }

    // 5-6: Retrieve relevant memories & resolve conversational context
    const tMemStart = performance.now();
    const memoryHits = this.deps.memoryStore.search({ query: understanding.correctedInput, limit: 6 });
    const groundedMemoryHits = memoryHits.filter((m) => m.layer !== 'working');
    const episodicHits = understanding.isContinueRequest
      ? this.deps.memoryStore.search({ layer: 'episodic', limit: 6 })
      : [];
    const fallbackMemories = memoryHits.length > 0 ? memoryHits : this.deps.memoryStore.search({ limit: 8 });
    const allMemories = [...episodicHits, ...fallbackMemories];
    const resolvedCtx = resolveContextReferences(this.context, understanding, allMemories);
    const tMemEnd = performance.now();

    // Merge resolved folder/app entities back into understanding
    understanding.entities = resolvedCtx.resolvedEntities;

    // 7: Retrieve relevant knowledge (indexed DB + built-in offline CS/tech concepts)
    const tKnowStart = performance.now();
    const knowledgeHits = this.deps.knowledgeEngine.search(understanding.correctedInput, 4);
    const preferHinglish =
      understanding.detectedLanguage === 'hinglish' || understanding.detectedLanguage === 'hindi';
    const builtinKnowledge =
      knowledgeHits.length === 0
        ? lookupBuiltinKnowledge(understanding.correctedInput, preferHinglish)
        : null;
    const tKnowEnd = performance.now();

    // 8: Match intent dynamically
    const rankedIntents = registry.matchIntent(understanding, corrections);
    let topMatch = rankedIntents[0];

    // Special case: User corrected Friday AND specified the right target (e.g. "No, open my project folder")
    let learnedEvent: string | undefined;
    if (understanding.isCorrection && resolvedCtx.correctionContext?.wrongInput) {
      const altMatch = rankedIntents.find((m) => m.intent.id !== 'intent.correction_learning');
      if (altMatch && (understanding.entities.app || understanding.entities.folder || altMatch.confidence >= 0.55)) {
        const corr = recordCorrectionLearning({
          wrongInput: resolvedCtx.correctionContext.wrongInput,
          wrongIntentId: resolvedCtx.correctionContext.wrongIntentId,
          correctedPhrase: understanding.correctedInput,
          targetIntent: altMatch.intent,
        });
        this.deps.learningStore.saveCorrection(corr);
        this.deps.learningStore.saveCustomIntent(altMatch.intent);
        topMatch = altMatch;
        learnedEvent = `Learned correction: "${resolvedCtx.correctionContext.wrongInput}" -> ${altMatch.intent.name}`;
      }
    }

    const topIntent = topMatch?.intent;
    const confidence = topMatch?.confidence ?? 0.45;

    // 9-10: Build task plan & decide execution route
    const tPlanStart = performance.now();
    const taskPlan = topIntent
      ? buildStructuredTaskPlan({
          goal: understanding.correctedInput,
          intent: topIntent,
          understanding,
          resolvedFolder: resolvedCtx.resolvedEntities.folder,
        })
      : undefined;

    const clarificationPrompt =
      (!topIntent || confidence < 0.52) &&
      knowledgeHits.length === 0 &&
      !builtinKnowledge &&
      groundedMemoryHits.length === 0 &&
      !understanding.isQuestion
        ? understanding.detectedLanguage === 'hinglish' || understanding.detectedLanguage === 'hindi'
          ? `Mujhe pakka samajh nahi aaya "${turn.rawText}" se aap kya chahte hain — koi app kholna hai, web search karna hai, ya kuch explain karun?`
          : `I didn't quite catch what you'd like me to do with "${turn.rawText}". Did you want to open an app, search the web, check system performance, or ask a question?`
        : undefined;

    const decision = decideExecutionRoute({
      understanding,
      topIntent,
      confidence,
      online: turn.online,
      confirmedAction: turn.confirmedAction,
      hasKnowledgeHit: knowledgeHits.length > 0 || Boolean(builtinKnowledge),
      requiresClarification: Boolean(clarificationPrompt),
      clarificationPrompt,
    });
    const tPlanEnd = performance.now();

    const steps: ExecutionStep[] = [];
    const agents = new Set<AgentId>(['core']);
    let sources: GroundingSource[] = [];
    let toolResultSummary: string | undefined;
    let provenance: KnowledgeProvenance = knowledgeHits.length > 0 ? knowledgeHits[0].chunk.provenance : 'inferred';
    let candidates = undefined as CognitiveOrchestratorResult['candidates'];
    let createdItem: { kind: string; title: string; detail?: string } | undefined;
    let isFailure = false;

    const tToolStart = performance.now();

    // 11: Execute according to Decision Engine route
    if (decision.route === 'teach_intent' && understanding.entities.customPhrase && understanding.entities.customActionsText) {
      const taught = registry.teachCustomIntent(
        understanding.entities.customPhrase,
        understanding.entities.customActionsText
      );
      this.deps.learningStore.saveCustomIntent(taught);
      learnedEvent = `Registered custom command "${understanding.entities.customPhrase}" -> ${understanding.entities.customActionsText}`;
      provenance = 'user_provided';
      toolResultSummary =
        understanding.detectedLanguage === 'hinglish'
          ? `Seekh liya! Ab jab bhi tum "${understanding.entities.customPhrase}" bologe, main "${understanding.entities.customActionsText}" chala dungi.`
          : `Got it — next time you say "${understanding.entities.customPhrase}", I will execute: ${understanding.entities.customActionsText}.`;
      agents.add('automation');
      steps.push({ id: 'step-1', agent: 'automation', title: `Save custom intent "${taught.name}"`, status: 'completed' });
    } else if (decision.route === 'learn_correction') {
      provenance = 'user_provided';
      toolResultSummary =
        understanding.detectedLanguage === 'hinglish'
          ? 'Sorry, galat samajh liya! Sahi command batao — main yaad rakh lungi taaki agli baar galti na ho.'
          : 'My mistake — tell me what you wanted instead, and I will remember that correction for next time.';
      steps.push({ id: 'step-1', agent: 'core', title: 'Await corrected command for learning', status: 'completed' });
    } else if (decision.route === 'require_confirmation') {
      if (taskPlan) taskPlan.status = 'awaiting_confirmation';
      toolResultSummary = decision.confirmationPrompt;
      agents.add('automation');
      steps.push({
        id: 'step-1',
        agent: 'automation',
        title: 'Hold for explicit user confirmation',
        status: 'requires_confirmation',
        detail: decision.confirmationPrompt,
      });
    } else if (decision.route === 'ask_clarification') {
      toolResultSummary = decision.clarificationPrompt;
      provenance = 'unknown';
      steps.push({ id: 'step-1', agent: 'core', title: 'Request user clarification', status: 'completed' });
    } else if (decision.route === 'offline_honest_fallback') {
      isFailure = true;
      provenance = 'unknown';
      toolResultSummary =
        understanding.detectedLanguage === 'hinglish'
          ? 'Abhi internet offline hai, isliye live web/weather data nahi la sakti. Local files, apps, notes aur memory sab bina internet ke kaam kar rahe hain.'
          : 'Network is currently offline, so I cannot fetch live online data without fabricating results. Local tools, apps, files, and memory remain available offline.';
      agents.add('browser');
      steps.push({ id: 'step-1', agent: 'browser', title: 'Report honest offline network status', status: 'completed' });
    } else if (topIntent?.handlerAction === 'context.repeat_last') {
      toolResultSummary = resolvedCtx.targetForRepeat
        ? resolvedCtx.targetForRepeat
        : understanding.detectedLanguage === 'hinglish'
          ? 'Abhi tak maine koi pichla reply nahi diya hai jo repeat karun.'
          : 'There is no previous reply in this session yet to repeat.';
      steps.push({ id: 'step-1', agent: 'voice', title: 'Retrieve last assistant utterance', status: 'completed' });
    } else if (topIntent?.handlerAction === 'context.simplify_hindi') {
      const sourceText = resolvedCtx.targetForSimplify || knowledgeHits[0]?.chunk.content || '';
      toolResultSummary = translateSummaryToSimpleHindi(sourceText, resolvedCtx.resolvedTopic);
      steps.push({ id: 'step-1', agent: 'core', title: 'Simplify context in Hindi', status: 'completed' });
    } else if (topIntent?.handlerAction === 'context.select_candidate') {
      const chosen = resolvedCtx.resolvedCandidate;
      if (chosen && this.deps.toolAdapter.runActionByName) {
        const res = await this.deps.toolAdapter.runActionByName(chosen.intentId || chosen.kind, {
          target: chosen.target,
          label: chosen.label,
        });
        toolResultSummary = `Selected option ${understanding.entities.ordinalChoice}: ${chosen.label}. ${res.summary}`;
      } else if (chosen) {
        toolResultSummary = `Selected option ${understanding.entities.ordinalChoice}: ${chosen.label} (${chosen.target}).`;
      } else {
        isFailure = true;
        toolResultSummary =
          understanding.detectedLanguage === 'hinglish'
            ? 'Pichle options list mein woh number nahi mila. Ek baar dobara search ya list karne bolo.'
            : 'No matching option from the previous list was found.';
      }
      steps.push({ id: 'step-1', agent: 'core', title: 'Resolve ordinal option from context', status: 'completed' });
    } else if (topIntent?.handlerAction === 'context.continue') {
      if (resolvedCtx.targetForResumePlan) {
        resolvedCtx.targetForResumePlan.status = 'running';
        const nextStep = resolvedCtx.targetForResumePlan.steps.find((s) => s.status === 'paused' || s.status === 'pending');
        if (nextStep && this.deps.toolAdapter.runActionByName) {
          const res = await this.deps.toolAdapter.runActionByName(nextStep.action, { target: nextStep.target });
          nextStep.status = res.ok ? 'completed' : 'failed';
          toolResultSummary = `Resumed "${resolvedCtx.targetForResumePlan.goal}" — ${res.summary}`;
        } else {
          toolResultSummary = `Resuming task plan: ${resolvedCtx.targetForResumePlan.goal}.`;
        }
        agents.add('automation');
      } else if (resolvedCtx.targetForResumeMemory) {
        const mem = resolvedCtx.targetForResumeMemory;
        provenance = mem.source;
        toolResultSummary =
          understanding.detectedLanguage === 'hinglish'
            ? `Haan bilkul — "${mem.key}" (${mem.value}) par wapas aa gaye hain. Batao aage kya step lena hai?`
            : `Picking back up on "${mem.key}" (${mem.value}). What would you like to do next?`;
        agents.add('memory');
      } else {
        toolResultSummary =
          understanding.detectedLanguage === 'hinglish'
            ? 'Abhi koi ruka hua task ya pichla project context nahi mila — naya task batao!'
            : 'No paused task or prior project context was found to resume; tell me what to start.';
      }
      steps.push({ id: 'step-1', agent: 'memory', title: 'Restore paused task or discussed project', status: 'completed' });
    } else if (topIntent?.handlerAction === 'memory.save') {
      const payload = resolvedCtx.targetForSave || {
        key: understanding.entities.memoryKey || 'User Context Fact',
        value: understanding.correctedInput,
        category: 'knowledge',
      };
      const saved = this.deps.memoryStore.save({
        layer: 'long_term',
        category: payload.category,
        key: payload.key,
        value: payload.value,
        tags: [understanding.detectedLanguage, 'user-saved'],
        importance: 0.85,
        confidence: 0.95,
        source: 'user_provided',
      });
      provenance = 'user_provided';
      agents.add('memory');
      toolResultSummary =
        understanding.detectedLanguage === 'hinglish'
          ? `Done! "${saved.key}" ko long-term memory mein save kar liya hai.`
          : `Saved "${saved.key}" to long-term memory.`;
      steps.push({ id: 'step-1', agent: 'memory', title: 'Persist item to long-term SQLite memory', status: 'completed' });
    } else if (decision.route === 'execute_task_plan' && taskPlan) {
      taskPlan.status = 'running';
      const stepResults: string[] = [];
      for (const step of taskPlan.steps) {
        if (step.requiresConfirmation && !turn.confirmedAction) {
          step.status = 'awaiting_confirmation';
          break;
        }
        if (this.deps.toolAdapter.runActionByName) {
          const res = await this.deps.toolAdapter.runActionByName(step.action, { target: step.target });
          step.status = res.ok ? 'completed' : 'failed';
          step.outputSummary = res.summary;
          stepResults.push(res.summary);
        } else {
          step.status = 'completed';
          stepResults.push(step.expectedResult);
        }
        agents.add(step.agent);
      }
      taskPlan.status = taskPlan.steps.some((s) => s.status === 'failed') ? 'failed' : 'completed';
      toolResultSummary = stepResults.join(' ');
      steps.push({ id: 'step-1', agent: 'automation', title: `Execute ${taskPlan.steps.length}-step task plan`, status: 'completed' });
    } else if (topIntent?.handlerAction === 'tool.open_app' && this.deps.toolAdapter.openApp) {
      const target = understanding.entities.app || understanding.correctedInput;
      const res = await this.deps.toolAdapter.openApp(target);
      isFailure = !res.ok;
      toolResultSummary = res.summary;
      agents.add('application');
      steps.push({ id: 'step-1', agent: 'application', title: `Launch ${res.target || target}`, status: res.ok ? 'completed' : 'failed' });
    } else if (topIntent?.handlerAction === 'tool.weather' && this.deps.toolAdapter.getWeather) {
      const res = await this.deps.toolAdapter.getWeather(
        understanding.entities.location || turn.defaultLocation,
        understanding.entities.dateHint
      );
      isFailure = !res.ok;
      toolResultSummary = res.summary;
      provenance = 'retrieved';
      agents.add('browser');
      steps.push({ id: 'step-1', agent: 'browser', title: 'Fetch live weather forecast', status: res.ok ? 'completed' : 'failed' });
    } else if (topIntent?.handlerAction === 'tool.folder_inspect' && this.deps.toolAdapter.listFolderContents) {
      const folder = resolvedCtx.resolvedEntities.folder || 'workspace';
      const res = await this.deps.toolAdapter.listFolderContents(folder);
      isFailure = !res.ok;
      toolResultSummary = res.summary;
      candidates = res.items;
      provenance = 'retrieved';
      agents.add('file');
      steps.push({ id: 'step-1', agent: 'file', title: `Inspect permitted folder (${folder})`, status: res.ok ? 'completed' : 'failed' });
    } else if (topIntent?.handlerAction === 'tool.file_search' && this.deps.toolAdapter.searchFiles) {
      const res = await this.deps.toolAdapter.searchFiles(understanding.correctedInput);
      isFailure = !res.ok;
      toolResultSummary = res.summary;
      candidates = res.items;
      provenance = 'retrieved';
      agents.add('file');
      steps.push({ id: 'step-1', agent: 'file', title: 'Search indexed local files', status: res.ok ? 'completed' : 'failed' });
    } else if (topIntent?.handlerAction === 'tool.system_telemetry' && this.deps.toolAdapter.getSystemTelemetry) {
      const res = await this.deps.toolAdapter.getSystemTelemetry();
      isFailure = !res.ok;
      toolResultSummary = res.summary;
      provenance = 'retrieved';
      agents.add('system');
      steps.push({ id: 'step-1', agent: 'system', title: 'Read live CPU/RAM/storage telemetry', status: 'completed' });
    } else if (topIntent?.handlerAction === 'tool.create_reminder' && this.deps.toolAdapter.createReminderOrTodo) {
      const title = understanding.correctedInput
        .replace(/^(?:ek\s+)?(?:reminder|remind\s+me)\s*(?:laga\s+de|set\s+kar|for|to)?/i, '')
        .trim() || 'Follow-up Reminder';
      const res = await this.deps.toolAdapter.createReminderOrTodo(
        title,
        understanding.entities.dateHint,
        understanding.entities.timeHint
      );
      isFailure = !res.ok;
      toolResultSummary = res.summary;
      createdItem = { kind: 'reminder', title };
      agents.add('calendar');
      steps.push({ id: 'step-1', agent: 'calendar', title: 'Save reminder to SQLite schedule', status: res.ok ? 'completed' : 'failed' });
    } else if (topIntent?.handlerAction === 'tool.media_control' && this.deps.toolAdapter.mediaControl) {
      const text = understanding.correctedInput;
      const isSpecificSongRequest =
        /\b(song|songs|gaana|music|track|video|movie|lagao|bajao|chalao|sunao)\b/i.test(text) &&
        !/\b(pause|resume|next|previous|skip|mute|volume|badha|kam|rok|stop)\b/i.test(text);
      const action = /\b(badha|increase|up|raise)\b/i.test(text)
        ? 'volume_up'
        : /\b(kam|decrease|down|lower)\b/i.test(text)
          ? 'volume_down'
          : /\b(mute)\b/i.test(text)
            ? 'mute'
            : /\b(next|agla|skip)\b/i.test(text)
              ? 'next'
              : /\b(previous|pichla|prev)\b/i.test(text)
                ? 'previous'
                : isSpecificSongRequest
                  ? turn.rawText
                  : 'play_pause';
      const res = await this.deps.toolAdapter.mediaControl(action);
      toolResultSummary = res.summary;
      agents.add('media');
      steps.push({ id: 'step-1', agent: 'media', title: `Media control (${isSpecificSongRequest ? 'play' : action})`, status: res.ok ? 'completed' : 'failed' });
    } else if (decision.route === 'online_research' && this.deps.toolAdapter.webResearch) {
      const res = await this.deps.toolAdapter.webResearch(understanding.correctedInput);
      isFailure = !res.ok;
      toolResultSummary = res.summary;
      sources = res.sources || [];
      provenance = 'retrieved';
      agents.add('browser');
      steps.push({ id: 'step-1', agent: 'browser', title: 'Execute live public web research', status: res.ok ? 'completed' : 'failed' });
    } else if (builtinKnowledge) {
      toolResultSummary = builtinKnowledge.summary;
      provenance = 'retrieved';
      steps.push({ id: 'step-1', agent: 'core', title: `Explain ${builtinKnowledge.title}`, status: 'completed' });
    } else if (topIntent?.handlerAction === 'knowledge.search' && knowledgeHits.length === 0 && turn.online && this.deps.toolAdapter.webResearch) {
      const res = await this.deps.toolAdapter.webResearch(understanding.correctedInput);
      if (res.ok) {
        toolResultSummary = res.summary;
        sources = res.sources || [];
        provenance = 'retrieved';
        agents.add('browser');
        steps.push({ id: 'step-1', agent: 'browser', title: 'Look up live public knowledge', status: 'completed' });
      }
    } else if (topIntent?.handlerAction === 'conversational.status') {
      const style = selectResponseStyle({
        detectedLanguage: understanding.detectedLanguage,
        userPreference: prefs,
      });
      toolResultSummary = buildGreetingResponse({
        userName: turn.userName,
        language: understanding.detectedLanguage,
        style,
        activeTopic: this.context.activeTopic,
        seed: turn.rawText,
      });
      steps.push({ id: 'step-1', agent: 'core', title: 'Prepare conversational reply', status: 'completed' });
    }

    const tToolEnd = performance.now();

    if (
      !toolResultSummary &&
      knowledgeHits.length === 0 &&
      groundedMemoryHits.length === 0 &&
      decision.route !== 'require_confirmation' &&
      decision.route !== 'teach_intent' &&
      decision.route !== 'learn_correction'
    ) {
      provenance = 'unknown';
    }

    // 12-13: Personality & Response Generation
    const tGenStart = performance.now();
    const style = selectResponseStyle({
      detectedLanguage: understanding.detectedLanguage,
      userPreference: prefs,
      isFailure,
      isClarification: decision.route === 'ask_clarification',
      isHindiSimplify: understanding.isHindiSimplifyRequest,
      isInformative: Boolean(knowledgeHits.length > 0 || builtinKnowledge || sources.length > 0),
    });

    const gen = await this.modelProvider.generateResponse({
      input: understanding.correctedInput,
      language: understanding.detectedLanguage,
      style,
      intentId: topIntent?.id || 'intent.general',
      confidence,
      toolResultSummary,
      knowledgeHits,
      memoryHits: groundedMemoryHits,
      context: this.context,
      provenance,
    });
    const tGenEnd = performance.now();

    // 14: Self-Learning updates (Preferences, Episodic/Working memory, L4 Pattern detection, L5 Opt-In Dataset)
    const intentKey = topIntent?.id || 'intent.general';
    const nextPrefs = updatePreferenceLearning(prefs, understanding, intentKey);
    this.deps.learningStore.savePreferenceProfile(nextPrefs);

    this.recentCommandKeys = [...this.recentCommandKeys, intentKey].slice(-12);
    const patternSuggestions = this.deps.learningStore.getPatternSuggestions();
    const newSuggestion = detectRepeatedTaskPattern(this.recentCommandKeys, patternSuggestions);
    if (newSuggestion) {
      this.deps.learningStore.savePatternSuggestion(newSuggestion);
    }

    // Store working memory snapshot for this turn
    this.deps.memoryStore.save({
      layer: 'working',
      category: 'turn',
      key: `${intentKey}:${understanding.entities.app || understanding.entities.folder || 'turn'}`,
      value: `${turn.rawText} -> ${gen.text.slice(0, 180)}`,
      tags: [understanding.detectedLanguage, intentKey],
      importance: 0.45,
      confidence,
      source: provenance,
    });

    // Store episodic record when substantive task or project discussion happens
    if (
      understanding.entities.topic ||
      topIntent?.handlerAction.startsWith('tool.') ||
      topIntent?.handlerAction === 'learning.teach_intent'
    ) {
      this.deps.memoryStore.save({
        layer: 'episodic',
        category: understanding.entities.topic ? 'project' : 'episode',
        key: understanding.entities.topic || topIntent?.name || 'Session Action',
        value: `User asked: "${turn.rawText}". Result: ${gen.text.slice(0, 220)}`,
        tags: [understanding.detectedLanguage, ...(understanding.entities.topic ? ['project'] : [])],
        importance: 0.72,
        confidence,
        source: provenance,
      });
    }

    if (prefs.optInDatasetCollection && this.deps.learningStore.appendTrainingSample) {
      this.deps.learningStore.appendTrainingSample(
        createTrainingSample({
          prompt: turn.rawText,
          normalizedPrompt: understanding.correctedInput,
          language: understanding.detectedLanguage,
          intentId: intentKey,
          entities: understanding.entities,
          response: gen.text,
          confidence,
        })
      );
    }

    // 15: Update conversational context
    this.context = updateContextAfterTurn(this.context, {
      understanding,
      intentId: intentKey,
      intentCategory: topIntent?.category || 'general_assistant',
      assistantReply: gen.text,
      topic: resolvedCtx.resolvedTopic || understanding.entities.topic || understanding.entities.folder || understanding.entities.app,
      candidates,
      toolResultSummary: gen.text,
      createdItem,
      activeTaskPlan: decision.route === 'require_confirmation' ? taskPlan : null,
      pendingWorkflowSuggestion: newSuggestion || this.context.pendingWorkflowSuggestion,
    });

    const totalMs = Math.max(1, Math.round(performance.now() - t0));

    return {
      reply: gen.text,
      language: understanding.detectedLanguage,
      style,
      intentId: intentKey,
      intentCategory: topIntent?.category || 'general_assistant',
      confidence,
      provenance,
      decision,
      understanding,
      taskPlan,
      steps:
        steps.length > 0
          ? steps
          : [{ id: 'step-1', agent: 'core', title: 'Process Cognitive Engine turn', status: 'completed' }],
      agents: Array.from(agents),
      sources,
      candidates,
      requiresConfirmation: decision.requiresConfirmation,
      confirmationSummary: decision.confirmationPrompt,
      confirmationPayload: decision.requiresConfirmation
        ? {
            goal: understanding.correctedInput,
            intentId: intentKey,
            folder: resolvedCtx.resolvedEntities.folder,
            app: resolvedCtx.resolvedEntities.app,
          }
        : undefined,
      learnedEvent,
      suggestedWorkflow: newSuggestion || undefined,
      timings: {
        understandMs: Math.max(1, Math.round(tUnderstand - t0)),
        memoryMs: Math.max(0, Math.round(tMemEnd - tMemStart)),
        knowledgeMs: Math.max(0, Math.round(tKnowEnd - tKnowStart)),
        planMs: Math.max(0, Math.round(tPlanEnd - tPlanStart)),
        toolMs: Math.max(0, Math.round(tToolEnd - tToolStart)),
        generateMs: Math.max(0, Math.round(tGenEnd - tGenStart)),
        totalMs,
      },
    };
  }
}
