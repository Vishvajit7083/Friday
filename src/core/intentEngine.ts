import type { AgentId, ExecutionStep } from './types';

export type IntentCategory =
  | 'system_telemetry'
  | 'file_search'
  | 'web_search'
  | 'app_control'
  | 'media_control'
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
  /\b(send\s+(email|message|whatsapp)|purchase|buy|pay|transfer|install\s+software)\b/i,
  /\b(cancel\s+(all|meeting|event)|shutdown|restart\s+pc)\b/i,
  /\b(close|kill|terminate)\s+[a-z0-9._-]+/i,
];

const SYSTEM_PATTERNS = [
  /\b(cpu|ram|memory\s+usage|gpu|battery|network|disk|storage|performance|system\s+monitor|diagnostics|uptime|running\s+processes)\b/i,
];

const MEDIA_CONTROL_PATTERNS = [
  /\b(play|listen\s+to|pause|resume|next\s+track|previous\s+track|skip\s+song|stop\s+music)\b.*\b(music|song|songs|track|playlist|audio|video|movie|clip)\b/i,
  /\b(pause|resume)\s+(the\s+)?(video|music|audio|playback|song|media)\b/i,
  /\b(increase|decrease|raise|lower|mute|unmute|turn\s+up|turn\s+down)\s+(the\s+)?(volume|sound|audio)\b/i,
  /\b(next|previous)\s+(song|track)\b/i,
  /\b(i\s+want\s+to\s+listen\s+to\s+music|play\s+my\s+(downloaded|favourite|favorite)\s+(music|song|video))\b/i,
];

const FILE_PATTERNS = [
  /\b(find|search|locate|open|show|where\s+is)\b.*\b(file|folder|resume|invoice|pdf|excel|spreadsheet|presentation|ppt|docx|document|image|picture|photo|video|code|downloads|desktop|documents|pictures|videos|music|project)\b/i,
  /\b(latest\s+file|downloaded\s+yesterday|downloaded\s+recently|downloaded\s+last\s+week|working\s+on\s+yesterday)\b/i,
  /\b(duplicate\s+files|organize\s+.*downloads|create\s+(a\s+)?new\s+folder)\b/i,
];

const WEB_PATTERNS = [
  /\b(search\s+google|google\s+search|search\s+online|search\s+the\s+(web|internet)|latest\s+news|latest\s+information|research|youtube|website|summarize\s+https?:)\b/i,
  /\b(what\s+is\s+the\s+latest|who\s+won|news\s+about|best\s+.*projects)\b/i,
  /https?:\/\/\S+/i,
];

const APP_PATTERNS = [
  /\b(open|launch|start|switch\s+to|focus|minimize|maximize)\s+(google\s+chrome|chrome|edge|vs\s*code|vscode|visual\s+studio|whatsapp|android\s+studio|spotify|terminal|explorer|notepad|calculator|browser|music\s+player|vlc)\b/i,
  /\b(open\s+the\s+app(lication)?\s+i\s+use\s+for\s+(coding|browsing|music|notes|messaging|files))\b/i,
  /\b(show\s+me\s+(the\s+)?applications\s+currently\s+running|running\s+windows|installed\s+apps)\b/i,
];

const CALENDAR_PATTERNS = [
  /\b(schedule|calendar|meeting|remind\s+me|reminder|today'?s\s+tasks|agenda|upcoming\s+events)\b/i,
];

const MEMORY_PATTERNS = [
  /\b(remember\s+that|my\s+name\s+is|save\s+to\s+memory|what\s+do\s+you\s+remember|forget\s+that|clear\s+memory)\b/i,
];

const VISION_PATTERNS = [
  /\b(on\s+my\s+screen|what\s+is\s+showing|read\s+.*screen|explain\s+this\s+(error|chart|screen)|analyze\s+this\s+(chart|screen|image))\b/i,
];

const MEDIA_ANALYZE_PATTERNS = [
  /\b(transcribe|summarize\s+(this\s+)?(video|audio|recording|pdf|document)|explain\s+this\s+pdf)\b/i,
];

const WORKFLOW_PATTERNS = [
  /\b(run\s+workflow|morning\s+briefing|organize\s+.*workspace|project\s+startup)\b/i,
];

export function isInterruptionCommand(rawTranscript: string): boolean {
  const clean = rawTranscript
    .trim()
    .toLowerCase()
    .replace(/[.,!?]+$/g, '')
    .trim();
  return /^(friday[,\s]+)?(stop|stop\s+(speaking|talking|reading|now)|quiet|be\s+quiet|shut\s+up|hush|cancel|abort)(\s+please)?$/.test(
    clean
  );
}

export function analyzeUserCommand(command: string): ParsedIntent {
  const trimmed = command.trim();
  const isSensitive = SENSITIVE_PATTERNS.some((rx) => rx.test(trimmed));

  if (isSensitive) {
    const isWindowClose = /\b(close|kill|terminate)\s+[a-z0-9._-]+/i.test(trimmed);
    return {
      category: 'sensitive_action',
      agents: isWindowClose ? ['core', 'application', 'automation'] : ['core', 'automation'],
      requiresConfirmation: true,
      confirmationReason: isWindowClose
        ? 'Closing a running Windows application can discard unsaved work and requires confirmation.'
        : 'Action modifies or deletes files, sends external communication, or alters important schedule state.',
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

  if (MEDIA_ANALYZE_PATTERNS.some((rx) => rx.test(trimmed))) {
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

  if (MEDIA_CONTROL_PATTERNS.some((rx) => rx.test(trimmed))) {
    return {
      category: 'media_control',
      agents: ['core', 'media', 'file'],
      requiresConfirmation: false,
      extractedTarget: trimmed,
      steps: [
        { id: 'step-1', agent: 'core', title: 'Parse media or volume control command', status: 'completed' },
        { id: 'step-2', agent: 'media', title: 'Locate local media or dispatch Windows media control', status: 'running' },
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
        { id: 'step-1', agent: 'core', title: 'Identify target desktop application or window', status: 'completed' },
        { id: 'step-2', agent: 'application', title: 'Resolve executable or active window & dispatch action', status: 'running' },
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
        { id: 'step-1', agent: 'core', title: 'Extract file attributes, date & folder intent', status: 'completed' },
        { id: 'step-2', agent: 'file', title: 'Search permitted local directories & rank matches', status: 'running' },
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
        { id: 'step-1', agent: 'core', title: 'Formulate live web research query', status: 'completed' },
        { id: 'step-2', agent: 'browser', title: 'Fetch live web results & verified links', status: 'running' },
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
      { id: 'step-1', agent: 'core', title: 'Synthesize local contextual response', status: 'running' },
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

export function isKnowledgeQuestion(rawCommand: string): boolean {
  const clean = rawCommand.trim().toLowerCase();
  if (!clean) return false;
  if (
    /^(hi|hello|hey|thanks|thank you|good morning|good afternoon|good evening|bye|who are you|what can you do|help)\b/.test(
      clean
    )
  ) {
    return false;
  }
  if (/\b(time|date|day is it|remember|my name)\b/.test(clean) && !/\b(history|world|meaning|explain|who)\b/.test(clean)) {
    return false;
  }
  if (/^(what|who|where|when|why|how|explain|define|tell me|compare|describe|summarize|difference between|meaning of)\b/.test(clean)) {
    return true;
  }
  return clean.endsWith('?') && clean.split(/\s+/).length >= 2;
}

export function tryEvaluateSafeMath(rawCommand: string): string | null {
  const cleaned = rawCommand
    .trim()
    .toLowerCase()
    .replace(/^(what is|calculate|compute|evaluate|solve|find)\s+/i, '')
    .replace(/[?=\s]+$/g, '')
    .trim();

  if (!cleaned) return null;

  const percentMatch = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*%\s*of\s*(-?\d+(?:\.\d+)?)$/);
  if (percentMatch) {
    const pct = Number(percentMatch[1]);
    const base = Number(percentMatch[2]);
    const result = (pct / 100) * base;
    return Number.isFinite(result)
      ? Number.isInteger(result)
        ? String(result)
        : Number(result.toFixed(6)).toString()
      : null;
  }

  const expr = cleaned.replace(/\bx\b/g, '*').replace(/\s+/g, '');
  if (!/^[0-9+\-*/%^().]+$/.test(expr) || !/[+\-*/%^]/.test(expr)) {
    return null;
  }

  let pos = 0;

  function parseExpression(): number {
    let left = parseTerm();
    while (pos < expr.length && (expr[pos] === '+' || expr[pos] === '-')) {
      const op = expr[pos++];
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parsePower();
    while (pos < expr.length && (expr[pos] === '*' || expr[pos] === '/' || expr[pos] === '%')) {
      const op = expr[pos++];
      const right = parsePower();
      if ((op === '/' || op === '%') && right === 0) return Number.NaN;
      left = op === '*' ? left * right : op === '/' ? left / right : left % right;
    }
    return left;
  }

  function parsePower(): number {
    const base = parseUnary();
    if (pos < expr.length && expr[pos] === '^') {
      pos += 1;
      const exp = parsePower();
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    if (expr[pos] === '-') {
      pos += 1;
      return -parseUnary();
    }
    if (expr[pos] === '+') {
      pos += 1;
      return parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    if (expr[pos] === '(') {
      pos += 1;
      const val = parseExpression();
      if (expr[pos] !== ')') return Number.NaN;
      pos += 1;
      return val;
    }
    const start = pos;
    let seenDot = false;
    while (pos < expr.length && (/\d/.test(expr[pos]) || (expr[pos] === '.' && !seenDot))) {
      if (expr[pos] === '.') seenDot = true;
      pos += 1;
    }
    if (pos === start) return Number.NaN;
    return Number(expr.slice(start, pos));
  }

  const value = parseExpression();
  if (pos !== expr.length || !Number.isFinite(value)) return null;
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(6)).toString();
}
