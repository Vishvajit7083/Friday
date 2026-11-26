import type {
  DecisionOutcome,
  DynamicIntentDefinition,
  LanguageUnderstandingResult,
  StructuredTaskPlan,
  TaskPlanStep,
} from './types';

const SENSITIVE_VERB_REGEX = /\b(delete|remove|erase|wipe|format|overwrite|destroy|organize|clean\s+up|shutdown|restart|kill|close)\b/i;

export function buildStructuredTaskPlan(params: {
  goal: string;
  intent: DynamicIntentDefinition;
  understanding: LanguageUnderstandingResult;
  resolvedFolder?: string;
}): StructuredTaskPlan {
  const now = new Date().toISOString();
  const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const steps: TaskPlanStep[] = [];

  if (params.intent.handlerAction === 'custom.compound_actions') {
    const actionsText = String(params.intent.handlerPayload?.actionsText || params.goal);
    const clauses = actionsText
      .split(/\b(?:and|aur|then|phir)\b|,/i)
      .map((s) => s.trim())
      .filter(Boolean);

    clauses.forEach((clause, idx) => {
      const stepId = `${planId}-s${idx + 1}`;
      const dep = idx > 0 ? [`${planId}-s${idx}`] : [];
      const isApp = /\b(?:open|launch|start|kholo)\b/i.test(clause) && !/\b(?:folder|directory)\b/i.test(clause);
      const isFolder = /\b(?:folder|directory|project)\b/i.test(clause);
      const isSensitive = SENSITIVE_VERB_REGEX.test(clause);

      steps.push({
        id: stepId,
        order: idx + 1,
        title: clause.charAt(0).toUpperCase() + clause.slice(1),
        agent: isFolder ? 'file' : isApp ? 'application' : 'automation',
        action: isFolder ? 'tool.open_folder' : isApp ? 'tool.open_app' : 'tool.custom_clause',
        target: clause,
        dependsOn: dep,
        expectedResult: isFolder
          ? `Target folder resolved and opened/inspected safely`
          : isApp
            ? `Application launched or focused`
            : `Action "${clause}" verified`,
        failureCondition: isFolder
          ? 'Folder path is outside permitted sandbox or missing'
          : 'Application binary missing or action blocked',
        requiresConfirmation: isSensitive,
        status: isSensitive ? 'awaiting_confirmation' : 'pending',
      });
    });
  } else if (params.intent.handlerAction === 'plan.sensitive_folder') {
    const folderTarget = params.resolvedFolder || params.understanding.entities.folder || 'target folder';
    steps.push(
      {
        id: `${planId}-s1`,
        order: 1,
        title: `Inspect files in ${folderTarget} (read-only audit)`,
        agent: 'file',
        action: 'tool.folder_inspect',
        target: folderTarget,
        dependsOn: [],
        expectedResult: 'List files by extension, size, and duplicate risk without modifying anything',
        failureCondition: 'Folder is not inside permitted directories',
        requiresConfirmation: false,
        status: 'pending',
      },
      {
        id: `${planId}-s2`,
        order: 2,
        title: `Request confirmation before modifying or organizing ${folderTarget}`,
        agent: 'automation',
        action: 'tool.confirm_folder_modify',
        target: folderTarget,
        dependsOn: [`${planId}-s1`],
        expectedResult: 'Explicit user confirmation received before moving, renaming, or deleting files',
        failureCondition: 'User declines confirmation or folder is protected',
        requiresConfirmation: true,
        status: 'awaiting_confirmation',
      }
    );
  } else {
    steps.push({
      id: `${planId}-s1`,
      order: 1,
      title: params.intent.name,
      agent:
        params.intent.category === 'weather_query'
          ? 'browser'
          : params.intent.category === 'app_control'
            ? 'application'
            : params.intent.category === 'file_search'
              ? 'file'
              : params.intent.category === 'system_telemetry'
                ? 'system'
                : params.intent.category === 'memory_manage'
                  ? 'memory'
                  : 'core',
      action: params.intent.handlerAction,
      target:
        params.understanding.entities.app ||
        params.resolvedFolder ||
        params.understanding.entities.location ||
        params.goal,
      dependsOn: [],
      expectedResult: `${params.intent.name} completes with verified output`,
      failureCondition: 'Required tool or permission unavailable',
      requiresConfirmation: Boolean(params.intent.confirmationRequired),
      status: params.intent.confirmationRequired ? 'awaiting_confirmation' : 'pending',
    });
  }

  const requiresConfirmation =
    Boolean(params.intent.confirmationRequired) ||
    steps.some((s) => s.requiresConfirmation) ||
    SENSITIVE_VERB_REGEX.test(params.goal);

  return {
    id: planId,
    goal: params.goal,
    intentId: params.intent.id,
    steps,
    status: requiresConfirmation ? 'awaiting_confirmation' : 'draft',
    requiresConfirmation,
    confirmationSummary: requiresConfirmation
      ? `This plan ("${params.goal}") may modify files or system state. Confirm before proceeding.`
      : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function decideExecutionRoute(params: {
  understanding: LanguageUnderstandingResult;
  topIntent?: DynamicIntentDefinition;
  confidence: number;
  online: boolean;
  confirmedAction?: boolean;
  hasKnowledgeHit: boolean;
  requiresClarification?: boolean;
  clarificationPrompt?: string;
}): DecisionOutcome {
  const { understanding, topIntent, confidence, online, confirmedAction, hasKnowledgeHit } = params;

  if (understanding.turnTypeHint === 'teach_intent') {
    return {
      route: 'teach_intent',
      confidence: Math.max(confidence, 0.9),
      requiresOnline: false,
      onlineAvailable: online,
      requiresConfirmation: false,
      rationale: 'User is teaching a reusable custom voice/text command rule.',
    };
  }

  if (understanding.isCorrection && topIntent?.id === 'intent.correction_learning') {
    return {
      route: 'learn_correction',
      confidence: Math.max(confidence, 0.88),
      requiresOnline: false,
      onlineAvailable: online,
      requiresConfirmation: false,
      rationale: 'User negated the previous interpretation; record correction and clarify intended target.',
    };
  }

  if (params.requiresClarification && params.clarificationPrompt) {
    return {
      route: 'ask_clarification',
      confidence,
      requiresOnline: false,
      onlineAvailable: online,
      requiresConfirmation: false,
      clarificationPrompt: params.clarificationPrompt,
      rationale: 'Ambiguous target or low confidence; ask user for quick clarification.',
    };
  }

  const isSensitive =
    Boolean(topIntent?.confirmationRequired) ||
    (topIntent?.category === 'sensitive_action') ||
    SENSITIVE_VERB_REGEX.test(understanding.correctedInput);

  if (isSensitive && !confirmedAction) {
    return {
      route: 'require_confirmation',
      confidence: Math.max(confidence, 0.75),
      requiresOnline: false,
      onlineAvailable: online,
      requiresConfirmation: true,
      confirmationPrompt: `Confirm action "${understanding.correctedInput}" before modifying files, schedules, or running applications.`,
      rationale: 'Safety guardrail requires explicit confirmation for destructive or file-modifying actions.',
    };
  }

  const requiresOnline =
    topIntent?.handlerAction === 'tool.web_research' || topIntent?.handlerAction === 'tool.weather';

  if (requiresOnline && !online) {
    return {
      route: 'offline_honest_fallback',
      confidence,
      requiresOnline: true,
      onlineAvailable: false,
      requiresConfirmation: false,
      rationale: 'Requested tool requires live network connectivity, which is currently offline.',
    };
  }

  if (topIntent?.handlerAction === 'tool.web_research') {
    return {
      route: 'online_research',
      confidence,
      requiresOnline: true,
      onlineAvailable: true,
      requiresConfirmation: false,
      rationale: 'Dispatching explicit online Web Research Engine.',
    };
  }

  if (topIntent?.handlerAction === 'custom.compound_actions') {
    return {
      route: 'execute_task_plan',
      confidence,
      requiresOnline: false,
      onlineAvailable: online,
      requiresConfirmation: false,
      rationale: 'Executing multi-step custom task plan sequentially.',
    };
  }

  if (topIntent && topIntent.handlerAction.startsWith('tool.')) {
    return {
      route: 'execute_local_tool',
      confidence,
      requiresOnline,
      onlineAvailable: online,
      requiresConfirmation: false,
      rationale: `High-confidence local tool execution (${topIntent.name}).`,
    };
  }

  if (hasKnowledgeHit) {
    return {
      route: 'knowledge_answer',
      confidence: Math.max(confidence, 0.68),
      requiresOnline: false,
      onlineAvailable: online,
      requiresConfirmation: false,
      rationale: 'Found grounded local knowledge / memory evidence.',
    };
  }

  return {
    route: 'conversational_reply',
    confidence,
    requiresOnline: false,
    onlineAvailable: online,
    requiresConfirmation: false,
    rationale: 'Handled locally via F.R.I.D.A.Y. Cognitive Dialogue & Context Engine.',
  };
}
