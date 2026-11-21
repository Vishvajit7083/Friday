import type { AgentId, ExecutionStep } from './types';

export type IntentCategory =
  | 'system_telemetry'
  | 'file_search'
  | 'web_search'
  | 'app_control'
  | 'calendar_schedule'
  | 'memory_manage'
  | 'vision_screen'
  | 'media_analyze'
  | 'workflow_run'
  | 'sensitive_action'
  | 'general_assistant';

export interface ParsedIntent {
  category: IntentCategory;
  agents: AgentId[];
  requiresConfirmation: boolean;
  confirmationReason?: string;
  extractedTarget?: string;
  steps: ExecutionStep[];
}

const SENSITIVE_PATTERNS = [
  /\b(delete|remove|erase|wipe|format|overwrite|destroy)\b/i,
  /\b(send\s+(email|message|whatsapp)|purchase|buy|pay|transfer)\b/i,
  /\b(cancel\s+(all|meeting|event)|shutdown|restart\s+pc)\b/i,
];

const SYSTEM_PATTERNS = [
  /\b(cpu|ram|memory\s+usage|gpu|battery|network|disk|storage|performance|system\s+monitor|diagnostics|uptime)\b/i,
];

const FILE_PATTERNS = [
  /\b(find|search|locate|open|show)\b.*\b(file|folder|resume|pdf|excel|spreadsheet|presentation|ppt|docx|document|image|picture|photo|video|code|downloads|desktop|project)\b/i,
  /\b(duplicate\s+files|organize\s+.*downloads|create\s+(a\s+)?new\s+folder)\b/i,
];

const WEB_PATTERNS = [
  /\b(search\s+google|google\s+search|search\s+online|search\s+the\s+web|latest\s+news|research|youtube|website|summarize\s+https?:)\b/i,
  /\b(what\s+is\s+the\s+latest|who\s+won|news\s+about|best\s+.*projects)\b/i,
];

const APP_PATTERNS = [
  /\b(open|launch|start|switch\s+to|close)\s+(google\s+chrome|chrome|vs\s*code|visual\s+studio|whatsapp|android\s+studio|spotify|terminal|explorer|notepad|calculator|browser|music\s+player)\b/i,
  /\b(take\s+a\s+screenshot|installed\s+apps)\b/i,
];

const CALENDAR_PATTERNS = [
  /\b(schedule|calendar|meeting|remind\s+me|reminder|today'?s\s+tasks|agenda|upcoming\s+events)\b/i,
];

const MEMORY_PATTERNS = [
  /\b(remember\s+that|my\s+name\s+is|save\s+to\s+memory|what\s+do\s+you\s+remember|forget\s+that|clear\s+memory)\b/i,
];

const VISION_PATTERNS = [
  /\b(on\s+my\s+screen|what\s+is\s+showing|explain\s+this\s+(error|chart|screen)|analyze\s+this\s+(chart|screen|image))\b/i,
];

const MEDIA_PATTERNS = [
  /\b(transcribe|summarize\s+(this\s+)?(video|audio|recording|pdf|document)|explain\s+this\s+pdf)\b/i,
];

const WORKFLOW_PATTERNS = [
  /\b(run\s+workflow|morning\s+briefing|organize\s+.*workspace|project\s+startup)\b/i,
];

export function analyzeUserCommand(command: string): ParsedIntent {
  const trimmed = command.trim();
  const isSensitive = SENSITIVE_PATTERNS.some((rx) => rx.test(trimmed));

  if (isSensitive) {
    return {
      category: 'sensitive_action',
      agents: ['core', 'automation'],
      requiresConfirmation: true,
      confirmationReason: 'Action modifies or deletes files, sends external communication, or alters important schedule state.',
      extractedTarget: trimmed,
      steps: [
        { id: 'step-1', agent: 'core', title: 'Evaluate command intent & safety boundaries', status: 'completed' },
        { id: 'step-2', agent: 'automation', title: 'Await explicit user confirmation', status: 'requires_confirmation', detail: trimmed },
      ],
    };
  }

  if (WORKFLOW_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: 'workflow_run',
      agents: ['core', 'automation', 'system', 'calendar'],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: 'step-1', agent: 'core', title: 'Parse multi-step workflow trigger', status: 'completed' },
        { id: 'step-2', agent: 'automation', title: 'Execute coordinated agent pipeline', status: 'running' },
      ],
    };
  }

  if (VISION_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: 'vision_screen',
      agents: ['core', 'vision'],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: 'step-1', agent: 'core', title: 'Route visual inspection request', status: 'completed' },
        { id: 'step-2', agent: 'vision', title: 'Inspect authorized screen/image context', status: 'running' },
      ],
    };
  }

  if (MEDIA_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: 'media_analyze',
      agents: ['core', 'media', 'file'],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: 'step-1', agent: 'core', title: 'Identify document or media analysis target', status: 'completed' },
        { id: 'step-2', agent: 'media', title: 'Extract content & generate summary', status: 'running' },
      ],
    };
  }

  if (SYSTEM_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: 'system_telemetry',
      agents: ['core', 'system'],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: 'step-1', agent: 'core', title: 'Classify hardware diagnostics request', status: 'completed' },
        { id: 'step-2', agent: 'system', title: 'Query live CPU, memory, storage & network sensors', status: 'running' },
      ],
    };
  }

  if (APP_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: 'app_control',
      agents: ['core', 'application'],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: 'step-1', agent: 'core', title: 'Identify target desktop application', status: 'completed' },
        { id: 'step-2', agent: 'application', title: 'Resolve executable & dispatch launch control', status: 'running' },
      ],
    };
  }

  if (FILE_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: 'file_search',
      agents: ['core', 'file'],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: 'step-1', agent: 'core', title: 'Extract file attributes & natural query terms', status: 'completed' },
        { id: 'step-2', agent: 'file', title: 'Search permitted local directories', status: 'running' },
      ],
    };
  }

  if (WEB_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: 'web_search',
      agents: ['core', 'browser'],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: 'step-1', agent: 'core', title: 'Formulate grounded web research query', status: 'completed' },
        { id: 'step-2', agent: 'browser', title: 'Fetch verified search results & citations', status: 'running' },
      ],
    };
  }

  if (CALENDAR_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: 'calendar_schedule',
      agents: ['core', 'calendar'],
      requiresConfirmation: /\b(schedule|create|book|add)\b/i.test(trimmed),
      confirmationReason: /\b(schedule|create|book|add)\b/i.test(trimmed)
        ? 'Creating or modifying a calendar event requires explicit confirmation.'
        : undefined,
      extractedTarget: trimmed,
      steps: [
        { id: 'step-1', agent: 'core', title: 'Extract schedule & date parameters', status: 'completed' },
        { id: 'step-2', agent: 'calendar', title: 'Inspect personal calendar & reminders', status: 'running' },
      ],
    };
  }

  if (MEMORY_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: 'memory_manage',
      agents: ['core', 'memory'],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: 'step-1', agent: 'core', title: 'Identify personal context update', status: 'completed' },
        { id: 'step-2', agent: 'memory', title: 'Read or persist user-approved memory', status: 'running' },
      ],
    };
  }

  return {
    category: 'general_assistant',
    agents: ['core', 'memory'],
    requiresConfirmation: false,
    extractedTarget: trimmed,
    steps: [
      { id: 'step-1', agent: 'core', title: 'Synthesize contextual response', status: 'running' },
    ],
  };
}

export function extractVoiceCommand(
  rawTranscript: string,
  wakeWord: string,
  requireWakeWord: boolean
): { matched: boolean; command: string } {
  const trimmed = rawTranscript.trim();
  if (!trimmed) {
    return { matched: false, command: '' };
  }

  const normalizedWake = wakeWord.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wakeRegex = new RegExp(
    `(?:${normalizedWake}|hey[,\\s]+f\\.?r\\.?i\\.?d\\.?a\\.?y\\.?|hey[,\\s]+friday|f\\.?r\\.?i\\.?d\\.?a\\.?y\\.?)`,
    'i'
  );

  const hasWake = wakeRegex.test(trimmed);
  if (requireWakeWord && !hasWake) {
    return { matched: false, command: '' };
  }

  const stripped = trimmed
    .replace(wakeRegex, '')
    .replace(/^[\s,.:;!?-]+/, '')
    .trim();

  return {
    matched: true,
    command: stripped || trimmed,
  };
}
