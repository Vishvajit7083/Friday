import type {
  CalendarEvent,
  DesktopAppItem,
  IndexedFileItem,
  MemoryItem,
  RunningWindowInfo,
  SystemTelemetry,
  WeatherData,
} from '../src/core/types.ts';
import type { WebPageExtract, WebSearchResultItem } from './internetResearchService.ts';
import { buildExtractiveSummary } from './internetResearchService.ts';
import { formatBytes } from '../src/core/fileIndex.ts';
import { tryEvaluateSafeMath } from '../src/core/intentEngine.ts';

export interface OllamaStatus {
  available: boolean;
  host: string;
  models: string[];
  selectedModel: string | null;
  latencyMs: number;
  error?: string;
}

export interface OpenAiCompatibleStatus {
  available: boolean;
  baseUrl: string;
  models: string[];
  selectedModel: string | null;
  latencyMs: number;
  error?: string;
}

const PREFERRED_OLLAMA_PREFIXES = [
  'llama3.2',
  'qwen2.5',
  'llama3.1',
  'mistral',
  'gemma2',
  'phi3',
  'phi4',
  'deepseek-r1',
  'llama3',
];

export function getOllamaHost(): string {
  return (process.env.OLLAMA_HOST || 'http://127.0.0.1:11434').replace(/\/+$/, '');
}

export function getOpenAiCompatibleBaseUrl(): string {
  return (process.env.LOCAL_AI_BASE_URL || '').trim().replace(/\/+$/, '');
}

export async function checkOpenAiCompatibleStatus(
  preferredModel?: string
): Promise<OpenAiCompatibleStatus> {
  const baseUrl = getOpenAiCompatibleBaseUrl();
  const started = Date.now();
  if (!baseUrl) {
    return {
      available: false,
      baseUrl: '',
      models: [],
      selectedModel: null,
      latencyMs: 0,
      error: 'LOCAL_AI_BASE_URL not configured.',
    };
  }

  try {
    const apiKey = process.env.LOCAL_AI_API_KEY?.trim();
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) {
      return {
        available: false,
        baseUrl,
        models: [],
        selectedModel: null,
        latencyMs: Date.now() - started,
        error: `Local endpoint HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = (data.data ?? []).map((m) => String(m.id || '').trim()).filter(Boolean);
    const envModel = process.env.LOCAL_AI_MODEL?.trim();
    const selectedModel =
      (preferredModel && models.includes(preferredModel) ? preferredModel : null) ||
      envModel ||
      models[0] ||
      'local-model';

    return {
      available: true,
      baseUrl,
      models,
      selectedModel,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      available: false,
      baseUrl,
      models: [],
      selectedModel: null,
      latencyMs: Date.now() - started,
      error: (err as Error).message,
    };
  }
}

export async function streamOpenAiCompatibleChat(params: {
  baseUrl: string;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<{ text: string; firstTokenMs: number; totalMs: number }> {
  const started = Date.now();
  let firstTokenMs = 0;
  let fullText = '';

  const timeoutSignal = AbortSignal.timeout(45_000);
  const combinedSignal = params.signal
    ? AbortSignal.any([params.signal, timeoutSignal])
    : timeoutSignal;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const apiKey = process.env.LOCAL_AI_API_KEY?.trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${params.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: params.model,
      stream: true,
      temperature: 0.4,
      messages: params.messages,
    }),
    signal: combinedSignal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Local OpenAI-compatible inference error (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
          error?: { message?: string };
        };
        if (parsed.error?.message) throw new Error(parsed.error.message);
        const token = parsed.choices?.[0]?.delta?.content ?? '';
        if (token) {
          if (!firstTokenMs) firstTokenMs = Date.now() - started;
          fullText += token;
          params.onToken?.(token);
        }
      } catch (err) {
        if ((err as Error).message && payload.includes('"error"')) throw err;
      }
    }
  }

  return {
    text: fullText.trim(),
    firstTokenMs: firstTokenMs || Date.now() - started,
    totalMs: Date.now() - started,
  };
}

export async function checkOllamaStatus(preferredModel?: string): Promise<OllamaStatus> {
  const host = getOllamaHost();
  const started = Date.now();
  try {
    const res = await fetch(`${host}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(900),
    });
    if (!res.ok) {
      return {
        available: false,
        host,
        models: [],
        selectedModel: null,
        latencyMs: Date.now() - started,
        error: `Ollama HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    const models = (data.models ?? [])
      .map((m) => String(m.name || '').trim())
      .filter(Boolean);

    const envModel = process.env.OLLAMA_MODEL?.trim();
    let selectedModel: string | null = null;
    if (preferredModel && models.includes(preferredModel)) {
      selectedModel = preferredModel;
    } else if (envModel && models.includes(envModel)) {
      selectedModel = envModel;
    } else {
      selectedModel =
        PREFERRED_OLLAMA_PREFIXES.map((p) => models.find((m) => m.toLowerCase().startsWith(p))).find(Boolean) ||
        models[0] ||
        null;
    }

    return {
      available: models.length > 0,
      host,
      models,
      selectedModel,
      latencyMs: Date.now() - started,
      error: models.length === 0 ? 'Ollama is running, but no models are pulled yet.' : undefined,
    };
  } catch (err) {
    return {
      available: false,
      host,
      models: [],
      selectedModel: null,
      latencyMs: Date.now() - started,
      error: (err as Error).message,
    };
  }
}

export async function streamOllamaChat(params: {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<{ text: string; firstTokenMs: number; totalMs: number }> {
  const host = getOllamaHost();
  const started = Date.now();
  let firstTokenMs = 0;
  let fullText = '';

  const timeoutSignal = AbortSignal.timeout(45_000);
  const combinedSignal = params.signal
    ? AbortSignal.any([params.signal, timeoutSignal])
    : timeoutSignal;

  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: params.model,
      stream: true,
      keep_alive: '10m',
      options: {
        temperature: 0.4,
        num_ctx: 4096,
      },
      messages: params.messages,
    }),
    signal: combinedSignal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama inference error (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as {
          message?: { content?: string };
          done?: boolean;
          error?: string;
        };
        if (parsed.error) throw new Error(parsed.error);
        const token = parsed.message?.content ?? '';
        if (token) {
          if (!firstTokenMs) firstTokenMs = Date.now() - started;
          fullText += token;
          params.onToken?.(token);
        }
      } catch (err) {
        if ((err as Error).message && !trimmed.startsWith('{')) continue;
        if ((err as Error).message && trimmed.includes('"error"')) throw err;
      }
    }
  }

  return {
    text: fullText.trim(),
    firstTokenMs: firstTokenMs || Date.now() - started,
    totalMs: Date.now() - started,
  };
}

export function buildLocalDeterministicReply(params: {
  userCommand: string;
  category: string;
  userName: string;
  telemetry?: SystemTelemetry | null;
  files?: IndexedFileItem[];
  appNotice?: string | null;
  runningWindows?: RunningWindowInfo[];
  availableApps?: DesktopAppItem[];
  mediaNotice?: string | null;
  calendar?: CalendarEvent[];
  webResults?: WebSearchResultItem[];
  webPage?: WebPageExtract | null;
  weather?: WeatherData | null;
  memorySaved?: string | null;
  memoryEntries?: MemoryItem[];
}): string {
  const lower = params.userCommand.trim().toLowerCase();

  if (params.mediaNotice) {
    return params.mediaNotice;
  }

  if (params.appNotice) {
    return params.appNotice;
  }

  if (params.runningWindows && /\b(running|windows|open\s+apps)\b/i.test(lower)) {
    if (params.runningWindows.length === 0) {
      return process.platform === 'win32'
        ? 'No titled desktop windows are currently active.'
        : 'Running window enumeration requires a live Windows desktop session.';
    }
    const list = params.runningWindows
      .slice(0, 10)
      .map((w) => `- ${w.name}: ${w.title}`)
      .join('\n');
    return `Currently active Windows applications (${params.runningWindows.length}):\n${list}`;
  }

  if (params.category === 'system_telemetry' && params.telemetry) {
    const t = params.telemetry;
    const battery = t.batteryPercent !== null ? `, Battery ${t.batteryPercent}%${t.batteryCharging ? ' (charging)' : ''}` : '';
    const temp = t.cpuTemp !== null ? `, CPU Temp ${t.cpuTemp}°C` : '';
    return `System status on ${t.hostname} (${t.platform}): CPU is at ${t.cpuLoad}% across ${t.cpuCores} cores${temp}. Memory is ${t.ramUsedGb} / ${t.ramTotalGb} GB (${t.ramPercent}%). Storage is ${t.storageUsedGb} / ${t.storageTotalGb} GB (${t.storagePercent}%). Network: ↓ ${t.networkRxKbps} KB/s · ↑ ${t.networkTxKbps} KB/s${battery}.`;
  }

  if (params.files && params.category === 'file_search') {
    if (params.files.length === 0) {
      return `I searched your permitted folders for "${params.userCommand}", but found no matching files. You can grant access to Downloads, Desktop, or Documents in Settings if needed.`;
    }
    const top = params.files[0];
    const reason = top.matchReason ? ` (${top.matchReason})` : '';
    const lines = params.files
      .slice(0, 4)
      .map((f, idx) => `${idx + 1}. ${f.name} — ${formatBytes(f.sizeBytes)}, ${f.relativePath}${f.matchReason ? ` [${f.matchReason}]` : ''}`)
      .join('\n');
    return `I found ${params.files.length} matching file${params.files.length === 1 ? '' : 's'}. The most likely match is ${top.name}${reason}, modified ${new Date(top.modifiedAt).toLocaleString()}.\n\n${lines}`;
  }

  if (params.webPage) {
    const excerpt = buildExtractiveSummary(params.webPage.excerpt, params.userCommand, 5);
    return `Summary of "${params.webPage.title}" (${params.webPage.uri}):\n\n${excerpt}`;
  }

  if (params.webResults && params.webResults.length > 0) {
    const lead = params.webResults[0];
    const summaryLines = params.webResults
      .slice(0, 4)
      .map((r, i) => `${i + 1}. ${r.title}: ${r.snippet || 'Result available at linked source.'}`)
      .join('\n');
    if (params.category === 'web_search') {
      return `Here is what I found online for "${params.userCommand}":\n\n${summaryLines}`;
    }
    const rest = params.webResults
      .slice(1, 3)
      .map((r) => `- ${r.title}: ${r.snippet || r.uri}`)
      .join('\n');
    return `${lead.snippet || lead.title}${rest ? `\n\nRelated sources:\n${rest}` : ''}`;
  }

  if (params.category === 'web_search') {
    return `I attempted to search the live web for "${params.userCommand}", but no search results were returned. Check your internet connection or try a more specific query.`;
  }

  if (params.category === 'calendar_schedule' && params.calendar) {
    if (params.calendar.length === 0) {
      return 'You have no upcoming events scheduled on your calendar.';
    }
    const list = params.calendar
      .slice(0, 5)
      .map((e) => `- ${e.date} at ${e.time}: ${e.title} (${e.completed ? 'completed' : e.category})`)
      .join('\n');
    return `Upcoming schedule (${params.calendar.length} item${params.calendar.length === 1 ? '' : 's'}):\n${list}`;
  }

  if (params.memorySaved) {
    return `Noted, ${params.userName}. I saved that to your personal memory: "${params.memorySaved}".`;
  }

  if (/\b(what do you remember|my memory|what is my name|who am i)\b/i.test(lower)) {
    const items = (params.memoryEntries ?? []).filter((m) => m.approved).slice(0, 5);
    if (items.length === 0) {
      return `You are ${params.userName}. You have no custom personal memory entries saved yet—say "remember that..." anytime to save one.`;
    }
    const lines = items.map((m) => `- ${m.key}: ${m.value}`).join('\n');
    return `Here is what I remember for ${params.userName}:\n${lines}`;
  }

  if (params.weather) {
    const w = params.weather;
    return `Live weather in ${w.location}: ${w.temperature}°C (${w.condition}), feels like ${w.feelsLike}°C, humidity ${w.humidity}%, wind ${w.windSpeedKmh} km/h.`;
  }

  const mathAnswer = tryEvaluateSafeMath(params.userCommand);
  if (mathAnswer !== null) {
    return `The result is ${mathAnswer}.`;
  }

  if (/\b(hello|hi|hey|good morning|good afternoon|good evening)\b/i.test(lower)) {
    return `Hello ${params.userName}. F.R.I.D.A.Y. is online in built-in Local Core mode—ask me to open apps, find files, play music, check your system, calculate numbers, or research anything online.`;
  }

  if (/\b(who are you|what can you do|help)\b/i.test(lower)) {
    return `I am F.R.I.D.A.Y., your Windows personal AI assistant. Without needing Ollama or any paid API key, I can launch and switch Windows apps, search Downloads/Desktop/Documents by description or date, play local music and videos, monitor CPU/RAM/disk/network, manage your calendar and personal memory, evaluate math, and answer questions using live web knowledge.`;
  }

  if (/\b(time|date|day is it)\b/i.test(lower)) {
    const now = new Date();
    return `It is ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`;
  }

  return `I processed "${params.userCommand}" using the built-in Local Core, ${params.userName}. You can ask me to open apps ("open Chrome"), search files ("find files downloaded yesterday"), play music or control volume, check CPU/RAM/weather, ask general knowledge questions ("explain quantum computing"), or paste a URL to summarize.`;
}
