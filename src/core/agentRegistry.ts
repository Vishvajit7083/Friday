import type { AgentDescriptor, AgentId, VoiceState } from './types';

export const SPECIALIST_AGENTS: Omit<AgentDescriptor, 'enabled' | 'status'>[] = [
  {
    id: 'core',
    name: 'Core AI Agent',
    role: 'Natural intent recognition, reasoning & multi-step task planning',
    capabilities: ['Intent parsing', 'Plan synthesis', 'Verification', 'Tool orchestration'],
  },
  {
    id: 'voice',
    name: 'Voice Agent',
    role: 'Wake-word detection, speech recognition & neural TTS synthesis',
    capabilities: ['Hey Friday trigger', 'Live transcription', 'Gemini TTS', 'Interruption handling'],
  },
  {
    id: 'system',
    name: 'System Agent',
    role: 'Real-time hardware telemetry, process diagnostics & desktop control',
    capabilities: ['CPU/RAM/Disk monitor', 'Network RX/TX', 'Battery status', 'OS diagnostics'],
  },
  {
    id: 'file',
    name: 'File Agent',
    role: 'Permission-gated local folder indexing, search & duplicate detection',
    capabilities: ['Natural file search', 'Content indexing', 'Duplicate scan', 'Safe folder ops'],
  },
  {
    id: 'browser',
    name: 'Browser Agent',
    role: 'Grounded web research, URL summarization & media discovery',
    capabilities: ['Google Search grounding', 'Source citations', 'Page synthesis', 'Tech docs lookup'],
  },
  {
    id: 'application',
    name: 'Application Agent',
    role: 'Installed app discovery, launching & window workflow control',
    capabilities: ['App discovery', 'Launch & focus', 'Window shortcuts', 'Pinned launcher'],
  },
  {
    id: 'vision',
    name: 'Vision Agent',
    role: 'Permission-controlled screen capture analysis & image inspection',
    capabilities: ['Screen OCR', 'Error diagnosis', 'Chart analysis', 'Object recognition'],
  },
  {
    id: 'media',
    name: 'Media Agent',
    role: 'Audio transcription, video metadata & document parsing',
    capabilities: ['Audio transcription', 'Document summary', 'Video metadata', 'Playback control'],
  },
  {
    id: 'calendar',
    name: 'Calendar Agent',
    role: 'Daily schedule, meeting reminders & task completion tracking',
    capabilities: ['Event scheduling', 'Daily briefing', 'Task reminders', 'Conflict checks'],
  },
  {
    id: 'memory',
    name: 'Memory Agent',
    role: 'User-approved persistent preferences, projects & conversation memory',
    capabilities: ['Long-term memory', 'Project context', 'Privacy controls', 'History search'],
  },
  {
    id: 'automation',
    name: 'Automation Agent',
    role: 'Multi-step workflow execution & cross-agent pipelines',
    capabilities: ['Workflow runner', 'Scheduled tasks', 'Confirmation gates', 'Audit logging'],
  },
];

export const VOICE_STATE_META: Record<
  VoiceState,
  { label: string; color: string; accentHex: string; description: string }
> = {
  standby: {
    label: 'Standby',
    color: 'text-sky-300',
    accentHex: '#38bdf8',
    description: 'Awaiting voice wake word or command input',
  },
  listening: {
    label: 'Listening',
    color: 'text-cyan-300',
    accentHex: '#22d3ee',
    description: 'Capturing live microphone audio stream',
  },
  processing: {
    label: 'Processing',
    color: 'text-indigo-300',
    accentHex: '#818cf8',
    description: 'Analyzing intent and decomposing execution plan',
  },
  searching: {
    label: 'Searching',
    color: 'text-blue-300',
    accentHex: '#60a5fa',
    description: 'Querying authorized files and grounded web sources',
  },
  executing: {
    label: 'Executing',
    color: 'text-teal-300',
    accentHex: '#2dd4bf',
    description: 'Dispatching specialist agents and verifying outputs',
  },
  speaking: {
    label: 'Speaking',
    color: 'text-cyan-200',
    accentHex: '#67e8f9',
    description: 'Synthesizing natural voice response',
  },
  completed: {
    label: 'Completed',
    color: 'text-emerald-300',
    accentHex: '#34d399',
    description: 'Task verified and logged to intelligence feed',
  },
  error: {
    label: 'Attention',
    color: 'text-rose-300',
    accentHex: '#fb7185',
    description: 'Execution halted or requires user confirmation',
  },
};

export function buildAgentList(
  enabledMap: Record<AgentId, boolean>,
  activeAgents: AgentId[] = [],
  lastActions: Partial<Record<AgentId, string>> = {}
): AgentDescriptor[] {
  return SPECIALIST_AGENTS.map((agent) => {
    const enabled = enabledMap[agent.id] ?? true;
    const isActive = activeAgents.includes(agent.id);
    return {
      ...agent,
      enabled,
      status: !enabled ? 'disabled' : isActive ? 'active' : 'idle',
      lastAction: lastActions[agent.id],
    };
  });
}
