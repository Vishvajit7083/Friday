import type { AgentId, ExecutionStep, GroundingSource } from '../types';

export type CognitiveLanguage = 'english' | 'hindi' | 'hinglish' | 'mixed';

export type ResponseStyle =
  | 'casual'
  | 'informative'
  | 'failure'
  | 'clarification'
  | 'hindi_simple'
  | 'hinglish';

export type MemoryLayer =
  | 'working'
  | 'short_term'
  | 'long_term'
  | 'episodic'
  | 'semantic'
  | 'procedural';

export type KnowledgeProvenance = 'retrieved' | 'user_provided' | 'inferred' | 'unknown';

export type CognitiveTurnType =
  | 'question'
  | 'command'
  | 'continuation'
  | 'correction'
  | 'teach_intent'
  | 'clarification_reply'
  | 'task_start'
  | 'greeting'
  | 'interruption';

export interface LexiconEntry {
  id: string;
  phrase: string;
  canonical: string;
  language: CognitiveLanguage;
  kind:
    | 'verb'
    | 'time'
    | 'pronoun'
    | 'entity'
    | 'interruption'
    | 'correction'
    | 'clarification'
    | 'polite'
    | 'typo';
  synonyms: string[];
  notes?: string;
  userAdded?: boolean;
  updatedAt: string;
}

export interface ExtractedEntities {
  app?: string;
  folder?: string;
  fileQuery?: string;
  location?: string;
  dateHint?: 'today' | 'tomorrow' | 'yesterday' | 'upcoming' | string;
  timeHint?: string;
  url?: string;
  topic?: string;
  customPhrase?: string;
  customActionsText?: string;
  memoryKey?: string;
  memoryValue?: string;
  preferenceValue?: string;
  ordinalChoice?: number; // e.g., 1 = first, 2 = doosra wala
  numbers: number[];
}

export interface LanguageUnderstandingResult {
  rawInput: string;
  normalizedInput: string;
  correctedInput: string;
  spellingCorrections: Array<{ from: string; to: string }>;
  detectedLanguage: CognitiveLanguage;
  confidence: number;
  tokens: string[];
  canonicalTokens: string[];
  entities: ExtractedEntities;
  turnTypeHint: CognitiveTurnType;
  isQuestion: boolean;
  isCommand: boolean;
  isFollowUp: boolean;
  isRepeatRequest: boolean;
  isHindiSimplifyRequest: boolean;
  isCorrection: boolean;
  isContinueRequest: boolean;
  isSaveReferenceRequest: boolean;
  isOrdinalSelectRequest: boolean;
}

export interface ConversationCandidate {
  id: string;
  label: string;
  kind: 'app' | 'file' | 'folder' | 'workflow' | 'action' | 'search_result';
  target: string;
  intentId?: string;
}

export interface ConversationTurnRecord {
  id: string;
  timestamp: string;
  userInput: string;
  normalizedInput: string;
  detectedLanguage: CognitiveLanguage;
  intentId: string;
  topic?: string;
  entities: ExtractedEntities;
  assistantReply: string;
}

export interface CognitiveContextState {
  sessionId: string;
  activeTopic?: string;
  lastIntentId?: string;
  lastIntentCategory?: string;
  lastEntities: ExtractedEntities;
  lastUserInput?: string;
  lastAssistantReply?: string;
  lastAssistantLanguage?: CognitiveLanguage;
  lastCandidates: ConversationCandidate[];
  lastToolResultSummary?: string;
  lastCreatedItem?: { kind: string; title: string; detail?: string };
  pausedTaskPlan?: StructuredTaskPlan | null;
  activeTaskPlan?: StructuredTaskPlan | null;
  pendingClarification?: {
    question: string;
    originalInput: string;
    options: ConversationCandidate[];
  } | null;
  pendingWorkflowSuggestion?: TaskPatternSuggestion | null;
  recentTopics: string[];
  turns: ConversationTurnRecord[];
  updatedAt: string;
}

export interface CognitiveMemoryRecord {
  id: string;
  layer: MemoryLayer;
  category: string;
  key: string;
  value: string;
  tags: string[];
  importance: number; // 0..1
  confidence: number; // 0..1
  source: KnowledgeProvenance;
  accessCount: number;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
  expiresAt?: string;
}

export interface CognitiveMemorySearchQuery {
  query?: string;
  layer?: MemoryLayer;
  category?: string;
  tag?: string;
  limit?: number;
}

export interface KnowledgeChunk {
  id: string;
  title: string;
  content: string;
  sourceType: 'file' | 'note' | 'faq' | 'fact' | 'lexicon';
  sourcePath?: string;
  provenance: KnowledgeProvenance;
  tags: string[];
  updatedAt: string;
}

export interface KnowledgeSearchResult {
  chunk: KnowledgeChunk;
  score: number;
  matchedTerms: string[];
}

export interface DynamicIntentDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  exampleSentences: string[];
  languages: CognitiveLanguage[];
  synonyms: string[];
  requiredParameters: string[];
  optionalParameters: string[];
  handlerAction: string;
  handlerPayload?: Record<string, unknown>;
  confirmationRequired?: boolean;
  confidenceThreshold: number;
  userDefined?: boolean;
  enabled: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IntentMatchScore {
  intent: DynamicIntentDefinition;
  confidence: number;
  matchedExample?: string;
  reason: string;
}

export interface TaskPlanStep {
  id: string;
  order: number;
  title: string;
  agent: AgentId;
  action: string;
  target?: string;
  dependsOn: string[];
  expectedResult: string;
  failureCondition: string;
  requiresConfirmation: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_confirmation' | 'paused' | 'skipped';
  outputSummary?: string;
  error?: string;
}

export interface StructuredTaskPlan {
  id: string;
  goal: string;
  intentId: string;
  steps: TaskPlanStep[];
  status: 'draft' | 'awaiting_confirmation' | 'running' | 'paused' | 'completed' | 'failed';
  requiresConfirmation: boolean;
  confirmationSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export type DecisionRoute =
  | 'execute_local_tool'
  | 'execute_task_plan'
  | 'require_confirmation'
  | 'ask_clarification'
  | 'knowledge_answer'
  | 'online_research'
  | 'conversational_reply'
  | 'teach_intent'
  | 'learn_correction'
  | 'offline_honest_fallback';

export interface DecisionOutcome {
  route: DecisionRoute;
  confidence: number;
  requiresOnline: boolean;
  onlineAvailable: boolean;
  requiresConfirmation: boolean;
  confirmationPrompt?: string;
  clarificationPrompt?: string;
  rationale: string;
}

export interface LearningCorrectionRecord {
  id: string;
  wrongInput: string;
  wrongIntentId?: string;
  correctedPhrase: string;
  targetIntentId: string;
  targetAction: string;
  targetPayload?: Record<string, unknown>;
  createdAt: string;
}

export interface UserPreferenceProfile {
  preferredLanguage: 'auto' | CognitiveLanguage;
  preferredStyle: 'auto' | 'concise' | 'detailed' | 'hinglish' | 'hindi_simple' | 'english';
  topApps: Record<string, number>;
  topCommands: Record<string, number>;
  correctionCount: number;
  optInDatasetCollection: boolean;
  updatedAt: string;
}

export interface TaskPatternSuggestion {
  id: string;
  sequenceKey: string;
  steps: string[];
  occurrences: number;
  suggestedName: string;
  suggestedTrigger: string;
  status: 'suggested' | 'accepted' | 'dismissed';
  lastSeenAt: string;
}

export interface TrainingDatasetSample {
  id: string;
  prompt: string;
  normalizedPrompt: string;
  language: CognitiveLanguage;
  intentId: string;
  entities: ExtractedEntities;
  response: string;
  qualityScore: number;
  approved: boolean;
  createdAt: string;
}

export interface TokenizerVocabArtifact {
  version: string;
  createdAt: string;
  vocabSize: number;
  specialTokens: string[];
  tokenToId: Record<string, number>;
  mergePairs: Array<[string, string]>;
  sampleCount: number;
  evalMetrics: {
    trainCount: number;
    evalCount: number;
    avgTokensPerSample: number;
    unkRate: number;
  };
}

export interface ModelGenerationRequest {
  input: string;
  language: CognitiveLanguage;
  style: ResponseStyle;
  intentId: string;
  confidence: number;
  toolResultSummary?: string;
  knowledgeHits: KnowledgeSearchResult[];
  memoryHits: CognitiveMemoryRecord[];
  context: CognitiveContextState;
  provenance: KnowledgeProvenance;
}

export interface ModelGenerationResponse {
  text: string;
  providerId: string;
  providerKind: 'cognitive_local' | 'future_language_core';
  usedTrainedModel: boolean;
  confidence: number;
}

export interface ModelProvider {
  readonly id: string;
  readonly name: string;
  readonly kind: 'cognitive_local' | 'future_language_core';
  isReady(): boolean;
  describeCapabilities(): string;
  generateResponse(req: ModelGenerationRequest): Promise<ModelGenerationResponse>;
}

export interface SpeechCapabilityReport {
  platform: string;
  sttProvider: string;
  ttsProvider: string;
  offlineEnglishStt: boolean;
  hindiHinglishSttSupport: 'native_if_installed' | 'limited_windows_recognizer' | 'browser_or_whisper_needed';
  limitations: string[];
  recommendedLocalAdapters: Array<{
    name: string;
    role: 'stt' | 'tts';
    status: 'adapter_ready' | 'not_bundled';
    notes: string;
  }>;
}

export interface SpeechProvider {
  readonly id: string;
  readonly name: string;
  getCapabilities(): Promise<SpeechCapabilityReport>;
  isInterruption(transcript: string): boolean;
}

export interface CognitiveToolAdapter {
  isOnline(): boolean;
  getWeather?(location?: string, dateHint?: string): Promise<{ ok: boolean; summary: string; detail?: string }>;
  getSystemTelemetry?(): Promise<{ ok: boolean; summary: string }>;
  openApp?(appTarget: string): Promise<{ ok: boolean; summary: string; target?: string }>;
  openFolder?(folderTarget: string): Promise<{ ok: boolean; summary: string; path?: string; candidates?: ConversationCandidate[] }>;
  listFolderContents?(folderTarget?: string): Promise<{ ok: boolean; summary: string; items?: ConversationCandidate[] }>;
  searchFiles?(query: string): Promise<{ ok: boolean; summary: string; items?: ConversationCandidate[] }>;
  createReminderOrTodo?(title: string, dateHint?: string, timeHint?: string): Promise<{ ok: boolean; summary: string }>;
  createNote?(title: string, content: string): Promise<{ ok: boolean; summary: string }>;
  mediaControl?(action: string): Promise<{ ok: boolean; summary: string }>;
  webResearch?(query: string): Promise<{ ok: boolean; summary: string; sources?: GroundingSource[] }>;
  runActionByName?(
    action: string,
    payload: Record<string, unknown>
  ): Promise<{ ok: boolean; summary: string; sources?: GroundingSource[]; candidates?: ConversationCandidate[] }>;
}

export interface CognitiveTurnInput {
  rawText: string;
  userName: string;
  assistantName: string;
  defaultLocation?: string;
  online: boolean;
  confirmedAction?: boolean;
  source?: 'text' | 'voice';
}

export interface CognitiveOrchestratorResult {
  reply: string;
  language: CognitiveLanguage;
  style: ResponseStyle;
  intentId: string;
  intentCategory: string;
  confidence: number;
  provenance: KnowledgeProvenance;
  decision: DecisionOutcome;
  understanding: LanguageUnderstandingResult;
  taskPlan?: StructuredTaskPlan;
  steps: ExecutionStep[];
  agents: AgentId[];
  sources: GroundingSource[];
  candidates?: ConversationCandidate[];
  requiresConfirmation?: boolean;
  confirmationSummary?: string;
  confirmationPayload?: Record<string, unknown>;
  pausedOrStopped?: boolean;
  learnedEvent?: string;
  suggestedWorkflow?: TaskPatternSuggestion;
  timings: {
    understandMs: number;
    memoryMs: number;
    knowledgeMs: number;
    planMs: number;
    toolMs: number;
    generateMs: number;
    totalMs: number;
  };
}
