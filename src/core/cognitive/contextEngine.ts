import type {
  CognitiveContextState,
  CognitiveMemoryRecord,
  ConversationCandidate,
  ConversationTurnRecord,
  ExtractedEntities,
  LanguageUnderstandingResult,
  StructuredTaskPlan,
  TaskPatternSuggestion,
} from './types';

export function createInitialContextState(sessionId = 'default-session'): CognitiveContextState {
  return {
    sessionId,
    activeTopic: undefined,
    lastIntentId: undefined,
    lastIntentCategory: undefined,
    lastEntities: { numbers: [] },
    lastUserInput: undefined,
    lastAssistantReply: undefined,
    lastAssistantLanguage: 'english',
    lastCandidates: [],
    lastToolResultSummary: undefined,
    lastCreatedItem: undefined,
    pausedTaskPlan: null,
    activeTaskPlan: null,
    pendingClarification: null,
    pendingWorkflowSuggestion: null,
    recentTopics: [],
    turns: [],
    updatedAt: new Date().toISOString(),
  };
}

export interface ContextResolutionResult {
  resolvedTopic?: string;
  resolvedEntities: ExtractedEntities;
  resolvedCandidate?: ConversationCandidate;
  targetForRepeat?: string;
  targetForSimplify?: string;
  targetForSave?: { key: string; value: string; category: string };
  targetForResumePlan?: StructuredTaskPlan | null;
  targetForResumeMemory?: CognitiveMemoryRecord;
  correctionContext?: {
    wrongInput?: string;
    wrongIntentId?: string;
  };
}

export function resolveContextReferences(
  context: CognitiveContextState,
  understanding: LanguageUnderstandingResult,
  memories: CognitiveMemoryRecord[] = []
): ContextResolutionResult {
  const mergedEntities: ExtractedEntities = {
    ...understanding.entities,
    numbers: understanding.entities.numbers,
  };

  let resolvedTopic = understanding.entities.topic || context.activeTopic;
  let resolvedCandidate: ConversationCandidate | undefined;

  // Resolve demonstrative references: "isko", "usko", "is folder ke andar", "wo"
  if (
    !mergedEntities.folder &&
    /\b(?:is\s+folder|this\s+folder|folder\s+ke\s+andar|isko|usko)\b/i.test(understanding.correctedInput)
  ) {
    if (context.lastEntities.folder) {
      mergedEntities.folder = context.lastEntities.folder;
    } else if (context.lastCreatedItem?.kind === 'folder') {
      mergedEntities.folder = context.lastCreatedItem.title;
    }
  }

  if (!mergedEntities.app && /\b(?:isko|usko|that\s+app)\b/i.test(understanding.correctedInput) && context.lastEntities.app) {
    mergedEntities.app = context.lastEntities.app;
  }

  if (!mergedEntities.location && context.lastEntities.location) {
    mergedEntities.location = context.lastEntities.location;
  }

  // Ordinal selection: "Ab doosra wala kar" -> index 1 from lastCandidates
  if (understanding.isOrdinalSelectRequest && typeof understanding.entities.ordinalChoice === 'number') {
    const idx = understanding.entities.ordinalChoice - 1;
    if (idx >= 0 && idx < context.lastCandidates.length) {
      resolvedCandidate = context.lastCandidates[idx];
    }
  }

  // Repeat last reply
  const targetForRepeat = understanding.isRepeatRequest ? context.lastAssistantReply : undefined;

  // Simplify in Hindi ("Thoda Hindi mein samjha")
  const targetForSimplify = understanding.isHindiSimplifyRequest
    ? context.lastAssistantReply || context.lastToolResultSummary
    : undefined;

  // Save this ("Isko save kar")
  let targetForSave: { key: string; value: string; category: string } | undefined;
  if (understanding.isSaveReferenceRequest) {
    const saveText =
      context.lastToolResultSummary ||
      context.lastAssistantReply ||
      context.lastUserInput ||
      understanding.correctedInput;
    if (saveText) {
      targetForSave = {
        key: context.activeTopic || context.lastIntentId || 'Saved Context Note',
        value: saveText.slice(0, 600),
        category: 'knowledge',
      };
    }
  }

  // Continue paused task or yesterday's project
  let targetForResumePlan = understanding.isContinueRequest
    ? context.pausedTaskPlan || context.activeTaskPlan || null
    : null;

  let targetForResumeMemory: CognitiveMemoryRecord | undefined;
  if (understanding.isContinueRequest && !targetForResumePlan) {
    const projectQuery = /\b(?:project|kal|yesterday)\b/i.test(understanding.correctedInput);
    if (projectQuery) {
      targetForResumeMemory = memories.find(
        (m) =>
          m.category === 'project' ||
          m.layer === 'episodic' ||
          m.tags.includes('project') ||
          /project/i.test(m.key) ||
          /project/i.test(m.value)
      );
      if (targetForResumeMemory) {
        resolvedTopic = targetForResumeMemory.key;
      }
    }
  }

  // Correction context ("Arey nahi, maine ye nahi bola")
  const correctionContext = understanding.isCorrection
    ? {
        wrongInput: context.lastUserInput,
        wrongIntentId: context.lastIntentId,
      }
    : undefined;

  return {
    resolvedTopic,
    resolvedEntities: mergedEntities,
    resolvedCandidate,
    targetForRepeat,
    targetForSimplify,
    targetForSave,
    targetForResumePlan,
    targetForResumeMemory,
    correctionContext,
  };
}

export function updateContextAfterTurn(
  context: CognitiveContextState,
  params: {
    understanding: LanguageUnderstandingResult;
    intentId: string;
    intentCategory: string;
    assistantReply: string;
    topic?: string;
    candidates?: ConversationCandidate[];
    toolResultSummary?: string;
    createdItem?: { kind: string; title: string; detail?: string };
    activeTaskPlan?: StructuredTaskPlan | null;
    pausedTaskPlan?: StructuredTaskPlan | null;
    pendingClarification?: CognitiveContextState['pendingClarification'];
    pendingWorkflowSuggestion?: TaskPatternSuggestion | null;
  }
): CognitiveContextState {
  const turn: ConversationTurnRecord = {
    id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    userInput: params.understanding.rawInput,
    normalizedInput: params.understanding.correctedInput,
    detectedLanguage: params.understanding.detectedLanguage,
    intentId: params.intentId,
    topic: params.topic || context.activeTopic,
    entities: params.understanding.entities,
    assistantReply: params.assistantReply,
  };

  const nextTopic = params.topic || params.understanding.entities.topic || context.activeTopic;
  const recentTopics = nextTopic
    ? [nextTopic, ...context.recentTopics.filter((t) => t !== nextTopic)].slice(0, 8)
    : context.recentTopics;

  // Do not overwrite lastAssistantReply if the user literally just asked to repeat it
  const shouldKeepPriorReply = params.understanding.isRepeatRequest && Boolean(context.lastAssistantReply);
  const isPureCorrectionAck = params.intentId === 'intent.correction_learning';

  return {
    ...context,
    activeTopic: nextTopic,
    lastIntentId: isPureCorrectionAck && context.lastIntentId ? context.lastIntentId : params.intentId,
    lastIntentCategory: isPureCorrectionAck && context.lastIntentCategory ? context.lastIntentCategory : params.intentCategory,
    lastEntities: {
      ...context.lastEntities,
      ...Object.fromEntries(
        Object.entries(params.understanding.entities).filter(([, v]) => v !== undefined && (!Array.isArray(v) || v.length > 0))
      ),
      numbers: params.understanding.entities.numbers,
    },
    lastUserInput: isPureCorrectionAck && context.lastUserInput ? context.lastUserInput : params.understanding.rawInput,
    lastAssistantReply: shouldKeepPriorReply ? context.lastAssistantReply : params.assistantReply,
    lastAssistantLanguage: params.understanding.detectedLanguage,
    lastCandidates: params.candidates && params.candidates.length > 0 ? params.candidates : context.lastCandidates,
    lastToolResultSummary: params.toolResultSummary ?? context.lastToolResultSummary,
    lastCreatedItem: params.createdItem ?? context.lastCreatedItem,
    activeTaskPlan: params.activeTaskPlan !== undefined ? params.activeTaskPlan : context.activeTaskPlan,
    pausedTaskPlan: params.pausedTaskPlan !== undefined ? params.pausedTaskPlan : context.pausedTaskPlan,
    pendingClarification:
      params.pendingClarification !== undefined ? params.pendingClarification : null,
    pendingWorkflowSuggestion:
      params.pendingWorkflowSuggestion !== undefined
        ? params.pendingWorkflowSuggestion
        : context.pendingWorkflowSuggestion,
    recentTopics,
    turns: [...context.turns, turn].slice(-20),
    updatedAt: new Date().toISOString(),
  };
}
