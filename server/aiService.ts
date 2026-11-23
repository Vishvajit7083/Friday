import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type {
  AgentId,
  AssistantSettings,
  ChatMessage,
  ExecutionStep,
  GroundingSource,
  PipelineTimings,
  SystemTelemetry,
} from '../src/core/types.ts';
import { analyzeUserCommand, isKnowledgeQuestion, tryEvaluateSafeMath } from '../src/core/intentEngine.ts';
import { searchIndexedFiles, formatBytes } from '../src/core/fileIndex.ts';
import { tryConvertUnits } from '../src/core/unitConverter.ts';
import { tryTranslateCommand } from '../src/core/translator.ts';
import { parseProductivityCommand } from '../src/core/productivityTools.ts';
import { appendActionLog, loadDb, saveDb } from './store.ts';
import { getSystemTelemetry, handleAppOrWindowCommand } from './systemService.ts';
import { getWeatherForLocation } from './weatherService.ts';
import { getCachedFileIndex } from './fileService.ts';
import { handleMediaVoiceCommand } from './mediaService.ts';
import {
  buildExtractiveSummary,
  fetchPublicWebPage,
  searchFreeWeb,
  type WebPageExtract,
  type WebSearchResultItem,
} from './internetResearchService.ts';
import {
  buildLocalDeterministicReply,
  checkOllamaStatus,
  checkOpenAiCompatibleStatus,
  getOllamaHost,
  streamOllamaChat,
  streamOpenAiCompatibleChat,
} from './localAiService.ts';

export interface AIProviderAdapter {
  readonly name: string;
  generateText(params: {
    model: string;
    systemInstruction: string;
    prompt: string;
    useSearch?: boolean;
    useUrlContext?: boolean;
  }): Promise<{ text: string; sources: GroundingSource[] }>;
}

export type StreamAssistantEvent =
  | {
      type: 'status';
      phase: string;
      agents: AgentId[];
      steps: ExecutionStep[];
      intent: string;
    }
  | {
      type: 'token';
      token: string;
    }
  | {
      type: 'done';
      userMessage: ChatMessage;
      assistantMessage: ChatMessage;
      activeAgents: AgentId[];
    }
  | {
      type: 'error';
      error: string;
    };

const recentPipelineTimings: PipelineTimings[] = [];

export function getRecentPipelineTimings(): PipelineTimings[] {
  return [...recentPipelineTimings];
}

function recordPipelineTiming(timing: PipelineTimings) {
  recentPipelineTimings.unshift(timing);
  if (recentPipelineTimings.length > 20) {
    recentPipelineTimings.length = 20;
  }
}

export function hasValidGeminiKey(): boolean {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. F.R.I.D.A.Y. is running in paid-key-free local AI mode.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 20000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function extractGroundingSources(response: unknown): GroundingSource[] {
  const r = response as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      };
    }>;
  };
  const chunks = r?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: GroundingSource[] = [];
  for (const c of chunks) {
    const uri = c.web?.uri;
    const title = c.web?.title || uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ title: title || uri, uri });
    }
  }
  return sources;
}

function extractFriendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    // Not raw JSON
  }
  return raw;
}

function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('Deadline') ||
    msg.includes('DEADLINE_EXCEEDED') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('ECONNRESET') ||
    msg.includes('fetch failed')
  );
}

export async function checkAiHealth(
  preferredPreference?: string,
  ollamaModel?: string
): Promise<{
  connected: boolean;
  provider: string;
  model: string;
  engine: 'ollama' | 'local-openai' | 'local-core' | 'gemini';
  freeWebReady: boolean;
  requiresPaidKey: boolean;
  latencyMs: number;
  ollamaModels?: string[];
  error?: string;
}> {
  const started = Date.now();
  const db = loadDb();
  const pref = preferredPreference || db.settings.aiModel || 'local-auto';
  const targetOllama = ollamaModel || db.settings.ollamaModel;

  if (pref.startsWith('gemini-') && hasValidGeminiKey()) {
    const gem = await checkGeminiConnection();
    if (gem.connected) {
      return {
        connected: true,
        provider: gem.provider,
        model: gem.model,
        engine: 'gemini',
        freeWebReady: true,
        requiresPaidKey: false,
        latencyMs: Date.now() - started,
      };
    }
  }

  if (pref !== 'local-core') {
    const openaiLocal = await checkOpenAiCompatibleStatus(targetOllama);
    if (openaiLocal.available && openaiLocal.selectedModel) {
      return {
        connected: true,
        provider: 'Local OpenAI-Compatible Engine',
        model: openaiLocal.selectedModel,
        engine: 'local-openai',
        freeWebReady: true,
        requiresPaidKey: false,
        latencyMs: Date.now() - started,
        ollamaModels: openaiLocal.models,
      };
    }

    const ollama = await checkOllamaStatus(targetOllama);
    if (ollama.available && ollama.selectedModel) {
      return {
        connected: true,
        provider: 'Local Ollama Engine',
        model: ollama.selectedModel,
        engine: 'ollama',
        freeWebReady: true,
        requiresPaidKey: false,
        latencyMs: Date.now() - started,
        ollamaModels: ollama.models,
      };
    }
  }

  return {
    connected: true,
    provider: 'F.R.I.D.A.Y. Built-In Local Core + Live Web',
    model: 'local-core-v2',
    engine: 'local-core',
    freeWebReady: true,
    requiresPaidKey: false,
    latencyMs: Date.now() - started,
    ollamaModels: [],
  };
}

export async function checkGeminiConnection(): Promise<{
  connected: boolean;
  provider: string;
  model: string;
  latencyMs?: number;
  error?: string;
}> {
  const started = Date.now();
  if (!hasValidGeminiKey()) {
    return {
      connected: false,
      provider: 'Google Gemini (Optional)',
      model: 'not-configured',
      latencyMs: Date.now() - started,
      error: 'GEMINI_API_KEY is not configured (optional — local AI active).',
    };
  }

  const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;
  let lastErr: unknown = null;
  try {
    const ai = getGeminiClient();
    for (const targetModel of modelsToTry) {
      try {
        const res = await ai.models.generateContent({
          model: targetModel,
          contents: 'Reply with OK',
        });
        const text = (res.text ?? '').trim();
        return {
          connected: Boolean(text || res),
          provider: 'Google Gemini (@google/genai)',
          model: targetModel,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        lastErr = err;
        if (!isTransientGeminiError(err)) break;
        await new Promise((r) => setTimeout(r, 350));
      }
    }
    return {
      connected: false,
      provider: 'Google Gemini (@google/genai)',
      model: 'gemini-3.1-flash-lite',
      latencyMs: Date.now() - started,
      error: extractFriendlyError(lastErr),
    };
  } catch (err) {
    return {
      connected: false,
      provider: 'Google Gemini (@google/genai)',
      model: 'gemini-3.1-flash-lite',
      latencyMs: Date.now() - started,
      error: extractFriendlyError(err),
    };
  }
}

export const geminiProvider: AIProviderAdapter = {
  name: 'Google Gemini (@google/genai)',
  async generateText({ model, systemInstruction, prompt, useSearch, useUrlContext }) {
    const ai = getGeminiClient();
    const tools: Array<{ googleSearch?: Record<string, never>; urlContext?: Record<string, never> }> = [];
    if (useSearch) tools.push({ googleSearch: {} });
    if (useUrlContext) tools.push({ urlContext: {} });

    const callModel = async (targetModel: string) => {
      const supportsThinkingLevel =
        targetModel === 'gemini-4-hydrogen' ||
        targetModel === 'gemini-4-neon' ||
        targetModel === 'gemini-4-carbon' ||
        targetModel === 'gemini-4-argon';

      return ai.models.generateContent({
        model: targetModel,
        contents: prompt,
        config: {
          systemInstruction,
          ...(supportsThinkingLevel
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
          ...(tools.length > 0 ? { tools } : {}),
        },
      });
    };

    try {
      const response = await callModel(model);
      return {
        text: (response.text ?? '').trim(),
        sources: extractGroundingSources(response),
      };
    } catch (err) {
      if (isTransientGeminiError(err) && model !== 'gemini-3.1-flash-lite') {
        try {
          const fallbackRes = await callModel('gemini-3.1-flash-lite');
          return {
            text: (fallbackRes.text ?? '').trim(),
            sources: extractGroundingSources(fallbackRes),
          };
        } catch (fallbackErr) {
          throw new Error(extractFriendlyError(fallbackErr));
        }
      }
      throw new Error(extractFriendlyError(err));
    }
  },
};

function emitChunkedTokens(text: string, onToken: (chunk: string) => void) {
  const parts = text.match(/\S+\s*/g) ?? [text];
  for (const part of parts) {
    onToken(part);
  }
}

export async function streamAssistantCommand(
  userCommand: string,
  settings: AssistantSettings,
  emitEvent: (ev: StreamAssistantEvent) => void,
  signal?: AbortSignal
): Promise<{
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  activeAgents: AgentId[];
}> {
  const tStart = Date.now();
  const db = loadDb();
  const parsed = analyzeUserCommand(userCommand);
  const intentMs = Date.now() - tStart;
  const nowIso = new Date().toISOString();

  const userMessage: ChatMessage = {
    id: `msg-${Date.now()}-u`,
    role: 'user',
    content: userCommand,
    timestamp: nowIso,
    intent: parsed.category,
  };

  emitEvent({
    type: 'status',
    phase: 'routing',
    agents: parsed.agents,
    steps: parsed.steps,
    intent: parsed.category,
  });

  // Enforce agent enable/disable flags
  const disabledAgent = parsed.agents.find((a) => settings.enabledAgents[a] === false);
  if (disabledAgent) {
    const text = `Cannot complete that command because the ${disabledAgent} agent is currently disabled in Settings. Re-enable it to proceed.`;
    emitChunkedTokens(text, (token) => emitEvent({ type: 'token', token }));
    const timings: PipelineTimings = {
      engine: 'local-core',
      intentMs,
      toolMs: 0,
      firstTokenMs: Date.now() - tStart,
      modelMs: 0,
      totalMs: Date.now() - tStart,
    };
    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}-a`,
      role: 'assistant',
      content: text,
      timestamp: new Date().toISOString(),
      intent: parsed.category,
      timings,
      steps: [
        {
          id: 'step-disabled',
          agent: disabledAgent,
          title: `${disabledAgent} agent is disabled`,
          status: 'failed',
        },
      ],
    };
    db.chatHistory = [...db.chatHistory, userMessage, assistantMessage].slice(-100);
    saveDb(db);
    emitEvent({ type: 'done', userMessage, assistantMessage, activeAgents: [disabledAgent] });
    return { userMessage, assistantMessage, activeAgents: [disabledAgent] };
  }

  // Enforce safety / confirmation gates for sensitive or schedule-mutating requests
  if (parsed.requiresConfirmation) {
    const actionId = `act-${Date.now()}`;
    appendActionLog(db, {
      agent: 'automation',
      action: 'Confirmation Required',
      target: userCommand.slice(0, 64),
      status: 'pending_confirmation',
      detail: parsed.confirmationReason,
    });
    const text = `${parsed.confirmationReason ?? 'This action requires confirmation.'} Review the requested operation below and confirm if you want me to proceed.`;
    emitChunkedTokens(text, (token) => emitEvent({ type: 'token', token }));
    const timings: PipelineTimings = {
      engine: 'local-core',
      intentMs,
      toolMs: 0,
      firstTokenMs: Date.now() - tStart,
      modelMs: 0,
      totalMs: Date.now() - tStart,
    };
    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}-a`,
      role: 'assistant',
      content: text,
      timestamp: new Date().toISOString(),
      intent: parsed.category,
      timings,
      steps: parsed.steps,
      pendingConfirmation: {
        actionId,
        summary: userCommand,
        actionType: parsed.category,
        payload: { command: userCommand },
      },
    };
    db.chatHistory = [...db.chatHistory, userMessage, assistantMessage].slice(-100);
    saveDb(db);
    emitEvent({ type: 'done', userMessage, assistantMessage, activeAgents: parsed.agents });
    return { userMessage, assistantMessage, activeAgents: parsed.agents };
  }

  // Stage 2: Tool Orchestration (Local OS, Files, Media, Calendar, Memory, Free Web)
  const tToolStart = Date.now();
  const steps: ExecutionStep[] = [...parsed.steps];
  const contextParts: string[] = [];
  const collectedSources: GroundingSource[] = [];

  let telemetry: SystemTelemetry | null = null;
  let matchedFiles: ReturnType<typeof searchIndexedFiles> | undefined;
  let appNotice: string | null = null;
  let runningWindows: Awaited<ReturnType<typeof handleAppOrWindowCommand>>['windows'];
  let mediaNotice: string | null = null;
  let upcomingCalendar: typeof db.calendar | undefined;
  let webResults: WebSearchResultItem[] | undefined;
  let webPage: WebPageExtract | null = null;
  let memorySaved: string | null = null;
  let weatherData: Awaited<ReturnType<typeof getWeatherForLocation>> | null = null;

  if (parsed.category === 'system_telemetry' || parsed.category === 'workflow_run') {
    telemetry = await getSystemTelemetry();
    contextParts.push(
      `LIVE SYSTEM TELEMETRY: CPU ${telemetry.cpuLoad}% (${telemetry.cpuModel}, ${telemetry.cpuCores} cores), RAM ${telemetry.ramUsedGb}/${telemetry.ramTotalGb} GB (${telemetry.ramPercent}%), Storage ${telemetry.storageUsedGb}/${telemetry.storageTotalGb} GB (${telemetry.storagePercent}%), Network RX ${telemetry.networkRxKbps} KB/s TX ${telemetry.networkTxKbps} KB/s, Platform ${telemetry.platform}.`
    );
    appendActionLog(db, {
      agent: 'system',
      action: 'Read Hardware Telemetry',
      target: telemetry.hostname,
      status: 'completed',
      detail: `CPU ${telemetry.cpuLoad}% · RAM ${telemetry.ramPercent}%`,
    });
  }

  if (parsed.category === 'media_control') {
    const mediaRes = await handleMediaVoiceCommand(
      userCommand,
      settings.allowedFolders,
      settings.pausedIndexing
    );
    mediaNotice = mediaRes.message;
    contextParts.push(`MEDIA CONTROL RESULT: ${mediaRes.message}`);
    appendActionLog(db, {
      agent: 'media',
      action: mediaRes.mediaAction ? `Media (${mediaRes.mediaAction})` : 'Local Media Playback',
      target: mediaRes.matchedFile?.name || userCommand.slice(0, 48),
      status: 'completed',
      detail: mediaRes.message,
    });
  }

  if (parsed.category === 'file_search' || parsed.category === 'media_analyze') {
    const files = getCachedFileIndex(settings.allowedFolders, settings.pausedIndexing, 300);
    matchedFiles = searchIndexedFiles(files, userCommand).slice(0, 8);
    contextParts.push(
      matchedFiles.length > 0
        ? `PERMITTED FILE SEARCH MATCHES (${matchedFiles.length}):\n` +
            matchedFiles
              .map(
                (m) =>
                  `- ${m.name} (${m.category}, ${formatBytes(m.sizeBytes)}, modified ${m.modifiedAt}) at ${m.relativePath}${
                    m.matchReason ? ` [${m.matchReason}]` : ''
                  }${m.previewText ? ` | snippet: ${m.previewText.slice(0, 140).replace(/\s+/g, ' ')}` : ''}`
              )
              .join('\n')
        : `PERMITTED FILE SEARCH: No matching files found across ${settings.allowedFolders.length} permitted folder(s). Total indexed files: ${files.length}.`
    );
    appendActionLog(db, {
      agent: 'file',
      action: 'Search Permitted Files',
      target: userCommand.slice(0, 48),
      status: 'completed',
      detail: `${matchedFiles.length} matching file(s)`,
    });
  }

  if (parsed.category === 'app_control') {
    const appRes = await handleAppOrWindowCommand(userCommand, db.apps);
    appNotice = appRes.message;
    runningWindows = appRes.windows;
    if (appRes.launchedApp) {
      const target = db.apps.find((a) => a.id === appRes.launchedApp!.id);
      if (target) target.lastUsed = new Date().toISOString();
    }
    contextParts.push(`APPLICATION CONTROL RESULT: ${appRes.message}`);
    appendActionLog(db, {
      agent: 'application',
      action: appRes.windows ? 'Inspect Running Windows' : 'Application / Window Control',
      target: appRes.launchedApp?.name || userCommand.slice(0, 48),
      status: 'completed',
      detail: appRes.message.slice(0, 140),
    });
  }

  if (parsed.category === 'calendar_schedule' || parsed.category === 'workflow_run') {
    const today = new Date().toISOString().slice(0, 10);
    upcomingCalendar = db.calendar.filter((e) => e.date >= today);
    contextParts.push(
      `CALENDAR SCHEDULE:\n` +
        (upcomingCalendar.length > 0
          ? upcomingCalendar
              .map((e) => `- [${e.date} ${e.time}] ${e.title} (${e.category}, completed=${e.completed})`)
              .join('\n')
          : 'No upcoming events scheduled.')
    );
    appendActionLog(db, {
      agent: 'calendar',
      action: 'Query Schedule',
      target: `${upcomingCalendar.length} upcoming items`,
      status: 'completed',
    });
  }

  if (parsed.category === 'memory_manage') {
    const rememberMatch = userCommand.match(/remember\s+(?:that\s+)?(.+)/i);
    if (rememberMatch && rememberMatch[1] && !/what\s+do\s+you\s+remember/i.test(userCommand)) {
      const value = rememberMatch[1].trim();
      db.memory.unshift({
        id: `mem-${Date.now()}`,
        category: 'preference',
        key: 'User Note',
        value,
        approved: true,
        updatedAt: new Date().toISOString(),
      });
      memorySaved = value;
      contextParts.push(`MEMORY SAVED: "${value}"`);
      appendActionLog(db, {
        agent: 'memory',
        action: 'Persist User Memory',
        target: value.slice(0, 48),
        status: 'completed',
      });
    } else {
      contextParts.push(
        `SAVED PERSONAL MEMORY:\n${
          db.memory.map((m) => `- ${m.key}: ${m.value}`).join('\n') || 'None stored yet.'
        }`
      );
    }
  }

  const urlMatch = userCommand.match(/https?:\/\/\S+/i);
  if (parsed.category === 'web_search' || urlMatch) {
    emitEvent({
      type: 'status',
      phase: 'searching',
      agents: parsed.agents,
      steps,
      intent: parsed.category,
    });
    if (urlMatch) {
      try {
        webPage = await fetchPublicWebPage(urlMatch[0]);
        collectedSources.push({ title: webPage.title, uri: webPage.uri });
        contextParts.push(`PUBLIC WEBPAGE (${webPage.uri}) TITLE: ${webPage.title}\nEXCERPT:\n${webPage.excerpt.slice(0, 3500)}`);
      } catch (err) {
        contextParts.push(`URL FETCH NOTE: ${(err as Error).message}`);
      }
    }
    if (!urlMatch || userCommand.replace(urlMatch[0], '').trim().length > 12) {
      const searchRes = await searchFreeWeb(userCommand.replace(/https?:\/\/\S+/gi, '').trim() || userCommand, 'web');
      webResults = searchRes.results;
      for (const s of searchRes.sources) {
        if (!collectedSources.some((x) => x.uri === s.uri)) {
          collectedSources.push(s);
        }
      }
      if (webResults.length > 0) {
        contextParts.push(
          `LIVE WEB SEARCH RESULTS:\n${webResults
            .slice(0, 6)
            .map((r, i) => `${i + 1}. ${r.title} (${r.uri}): ${r.snippet}`)
            .join('\n')}`
        );
      }
    }
    appendActionLog(db, {
      agent: 'browser',
      action: 'Free Web Research',
      target: userCommand.slice(0, 56),
      status: 'completed',
      detail: `${collectedSources.length} verified source(s)`,
    });
  }

  if (/\bweather|temperature|forecast\b/i.test(userCommand)) {
    try {
      weatherData = await getWeatherForLocation(settings.weatherLocation);
      contextParts.push(
        `LIVE WEATHER (${weatherData.location}): ${weatherData.temperature}°C, ${weatherData.condition}, Humidity ${weatherData.humidity}%, Wind ${weatherData.windSpeedKmh} km/h.`
      );
    } catch {
      // Ignore transient weather failure if unrelated
    }
  }

  const prodCmd = parseProductivityCommand(userCommand);
  if (prodCmd) {
    if (prodCmd.kind === 'reminder_add' || prodCmd.kind === 'alarm_set') {
      const date = prodCmd.date || new Date().toISOString().slice(0, 10);
      const time = prodCmd.time || '09:00';
      db.calendar.unshift({
        id: `evt-${Date.now()}`,
        title: prodCmd.title,
        date,
        time,
        category: 'reminder',
        completed: false,
        createdAt: new Date().toISOString(),
      });
      memorySaved = `${prodCmd.title} (${date} at ${time})`;
      contextParts.push(`REMINDER SCHEDULED: ${memorySaved}`);
    } else if (prodCmd.kind === 'note_add' || prodCmd.kind === 'todo_add') {
      const val = prodCmd.detail || prodCmd.title;
      db.memory.unshift({
        id: `mem-${Date.now()}`,
        category: 'preference',
        key: prodCmd.kind === 'note_add' ? 'Note' : 'To-Do Task',
        value: val,
        approved: true,
        updatedAt: new Date().toISOString(),
      });
      memorySaved = val;
      contextParts.push(`SAVED ITEM: ${val}`);
    }
  }

  const toolMs = Date.now() - tToolStart;

  // Stage 3: Local-First Response Generation + Token Streaming
  const tModelStart = Date.now();
  let firstTokenMs = 0;
  let finalText = '';
  let engineUsed = 'local-core';

  const isInstantDeterministicAction =
    parsed.category === 'media_control' ||
    parsed.category === 'app_control' ||
    parsed.category === 'unit_convert' ||
    parsed.category === 'translate' ||
    parsed.category === 'read_aloud' ||
    Boolean(memorySaved) ||
    tryConvertUnits(userCommand) !== null ||
    tryTranslateCommand(userCommand) !== null ||
    tryEvaluateSafeMath(userCommand) !== null;

  const memorySummary = db.memory
    .filter((m) => m.approved)
    .slice(0, 10)
    .map((m) => `- ${m.key}: ${m.value}`)
    .join('\n');

  const systemInstruction = `You are F.R.I.D.A.Y. (Fully Responsive Intelligent Digital Assistant for You), a fast, precise desktop AI companion speaking to ${settings.userName}.
Respond concisely in clear natural language suitable for both screen reading and spoken voice output.
Never fabricate files, hardware numbers, or URLs—only cite facts present in the provided tool results.
User-approved personal memory:
${memorySummary || 'None'}`;

  const prompt = `${contextParts.length > 0 ? contextParts.join('\n\n') + '\n\n' : ''}User Command: ${userCommand}`;

  const pref = settings.aiModel || 'local-auto';
  const wantsGemini = pref.startsWith('gemini-') && hasValidGeminiKey();

  const streamDeterministicReply = async (engineLabel: string) => {
    // When running without an external LLM, automatically look up live web/Wikipedia facts for open knowledge questions
    if (
      parsed.category === 'general_assistant' &&
      (!webResults || webResults.length === 0) &&
      !webPage &&
      !weatherData &&
      tryEvaluateSafeMath(userCommand) === null &&
      isKnowledgeQuestion(userCommand)
    ) {
      emitEvent({
        type: 'status',
        phase: 'searching',
        agents: ['core', 'browser'],
        steps,
        intent: parsed.category,
      });
      const autoSearch = await searchFreeWeb(userCommand, 'web').catch(() => ({
        results: [] as WebSearchResultItem[],
        sources: [] as GroundingSource[],
        online: false,
      }));
      webResults = autoSearch.results;
      for (const s of autoSearch.sources) {
        if (!collectedSources.some((x) => x.uri === s.uri)) {
          collectedSources.push(s);
        }
      }
    }

    finalText = buildLocalDeterministicReply({
      userCommand,
      category: parsed.category,
      userName: settings.userName,
      telemetry,
      files: matchedFiles,
      appNotice,
      runningWindows,
      availableApps: db.apps,
      mediaNotice,
      calendar: upcomingCalendar,
      webResults,
      webPage,
      weather: weatherData,
      memorySaved,
      memoryEntries: db.memory,
    });
    firstTokenMs = Date.now() - tStart;
    emitChunkedTokens(finalText, (token) => emitEvent({ type: 'token', token }));
    engineUsed = engineLabel;
  };

  if (isInstantDeterministicAction || pref === 'local-core') {
    await streamDeterministicReply('local-core');
  } else if (wantsGemini) {
    try {
      const aiRes = await geminiProvider.generateText({
        model: pref,
        systemInstruction,
        prompt,
        useSearch: parsed.category === 'web_search',
        useUrlContext: Boolean(urlMatch),
      });
      finalText = aiRes.text;
      for (const s of aiRes.sources) {
        if (!collectedSources.some((x) => x.uri === s.uri)) collectedSources.push(s);
      }
      firstTokenMs = Date.now() - tStart;
      emitChunkedTokens(finalText, (token) => emitEvent({ type: 'token', token }));
      engineUsed = pref;
    } catch {
      await streamDeterministicReply('local-core (fallback)');
    }
  } else {
    const openaiLocal = await checkOpenAiCompatibleStatus(settings.ollamaModel);
    if (openaiLocal.available && openaiLocal.selectedModel) {
      try {
        const recentHistory = db.chatHistory
          .slice(-6)
          .filter((m) => m.content && !m.pendingConfirmation)
          .map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content.slice(0, 800),
          }));

        const streamRes = await streamOpenAiCompatibleChat({
          baseUrl: openaiLocal.baseUrl,
          model: openaiLocal.selectedModel,
          messages: [
            { role: 'system', content: systemInstruction },
            ...recentHistory,
            { role: 'user', content: prompt },
          ],
          signal,
          onToken: (token) => {
            if (!firstTokenMs) firstTokenMs = Date.now() - tStart;
            emitEvent({ type: 'token', token });
          },
        });
        finalText = streamRes.text;
        engineUsed = `local-openai:${openaiLocal.selectedModel}`;
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        await streamDeterministicReply('local-core (fallback)');
      }
    } else {
      const ollama = await checkOllamaStatus(settings.ollamaModel);
      if (ollama.available && ollama.selectedModel) {
        try {
          const recentHistory = db.chatHistory
            .slice(-6)
            .filter((m) => m.content && !m.pendingConfirmation)
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content.slice(0, 800),
            }));

          const streamRes = await streamOllamaChat({
            model: ollama.selectedModel,
            messages: [
              { role: 'system', content: systemInstruction },
              ...recentHistory,
              { role: 'user', content: prompt },
            ],
            signal,
            onToken: (token) => {
              if (!firstTokenMs) firstTokenMs = Date.now() - tStart;
              emitEvent({ type: 'token', token });
            },
          });
          finalText = streamRes.text;
          engineUsed = `ollama:${ollama.selectedModel}`;
        } catch (err) {
          if ((err as Error).name === 'AbortError') throw err;
          await streamDeterministicReply('local-core (fallback)');
        }
      } else {
        await streamDeterministicReply('local-core');
      }
    }
  }

  const modelMs = Date.now() - tModelStart;
  const totalMs = Date.now() - tStart;
  const timings: PipelineTimings = {
    engine: engineUsed,
    intentMs,
    toolMs,
    firstTokenMs: firstTokenMs || totalMs,
    modelMs,
    totalMs,
  };
  recordPipelineTiming(timings);

  const finalizedSteps: ExecutionStep[] = steps.map((s) => ({
    ...s,
    status: 'completed',
  }));

  const assistantMessage: ChatMessage = {
    id: `msg-${Date.now()}-a`,
    role: 'assistant',
    content: finalText || 'Command completed.',
    timestamp: new Date().toISOString(),
    intent: parsed.category,
    steps: finalizedSteps,
    sources: collectedSources.length > 0 ? collectedSources : undefined,
    timings,
  };

  db.chatHistory = [...db.chatHistory, userMessage, assistantMessage].slice(-100);
  appendActionLog(db, {
    agent: 'core',
    action: `Command (${parsed.category})`,
    target: userCommand.slice(0, 52),
    status: 'completed',
    detail: `Engine: ${engineUsed} · ${totalMs}ms`,
  });
  saveDb(db);

  emitEvent({
    type: 'done',
    userMessage,
    assistantMessage,
    activeAgents: parsed.agents,
  });

  return {
    userMessage,
    assistantMessage,
    activeAgents: parsed.agents,
  };
}

export async function runAssistantCommand(
  userCommand: string,
  settings: AssistantSettings
): Promise<{
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  activeAgents: AgentId[];
}> {
  return streamAssistantCommand(userCommand, settings, () => {});
}

export async function runBrowserResearch(
  query: string,
  url?: string,
  model = 'local-auto',
  mode: 'web' | 'news' | 'docs' | 'video' = 'web'
) {
  const collectedSources: GroundingSource[] = [];
  let pageExtract: WebPageExtract | null = null;
  let searchResults: WebSearchResultItem[] = [];

  if (url?.trim()) {
    pageExtract = await fetchPublicWebPage(url.trim());
    collectedSources.push({ title: pageExtract.title, uri: pageExtract.uri });
  }

  if (query.trim()) {
    const searchRes = await searchFreeWeb(query.trim(), mode);
    searchResults = searchRes.results;
    for (const s of searchRes.sources) {
      if (!collectedSources.some((x) => x.uri === s.uri)) {
        collectedSources.push(s);
      }
    }
  }

  const db = loadDb();
  let summary = '';

  const contextBlock = [
    pageExtract ? `PAGE (${pageExtract.uri}) — ${pageExtract.title}:\n${pageExtract.excerpt.slice(0, 5000)}` : '',
    searchResults.length > 0
      ? `LIVE SEARCH RESULTS (${mode}):\n${searchResults
          .map((r, i) => `${i + 1}. ${r.title} (${r.uri}): ${r.snippet}`)
          .join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  if (model.startsWith('gemini-') && hasValidGeminiKey()) {
    try {
      const res = await geminiProvider.generateText({
        model,
        systemInstruction:
          'You are the F.R.I.D.A.Y. Browser Intelligence Agent. Synthesize accurate research summaries strictly from the retrieved web results and URL content.',
        prompt: `Focus: ${query || url}\nMode: ${mode}\n\n${contextBlock}`,
        useSearch: true,
        useUrlContext: Boolean(url),
      });
      summary = res.text;
      for (const s of res.sources) {
        if (!collectedSources.some((x) => x.uri === s.uri)) collectedSources.push(s);
      }
    } catch {
      summary = '';
    }
  }

  if (!summary) {
    const ollama = await checkOllamaStatus(db.settings.ollamaModel);
    if (ollama.available && ollama.selectedModel && contextBlock) {
      try {
        const res = await streamOllamaChat({
          model: ollama.selectedModel,
          messages: [
            {
              role: 'system',
              content:
                'You are F.R.I.D.A.Y. Browser Intelligence. Summarize the retrieved web data concisely with clear takeaways. Never invent URLs.',
            },
            {
              role: 'user',
              content: `Query: ${query || url}\nMode: ${mode}\n\n${contextBlock}`,
            },
          ],
        });
        summary = res.text;
      } catch {
        summary = '';
      }
    }
  }

  if (!summary) {
    if (pageExtract) {
      summary = `**${pageExtract.title}** (${pageExtract.uri})\n\n${buildExtractiveSummary(
        pageExtract.excerpt,
        query,
        7
      )}`;
    } else if (searchResults.length > 0) {
      summary =
        `Live ${mode.toUpperCase()} research results for "${query}":\n\n` +
        searchResults
          .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet || 'Open linked source below for full details.'}`)
          .join('\n\n');
    } else {
      summary = `No live web results were returned for "${query || url}". Verify internet connectivity or try refining your keywords.`;
    }
  }

  appendActionLog(db, {
    agent: 'browser',
    action: url ? 'URL Synthesis' : `Web Research (${mode})`,
    target: (url || query).slice(0, 56),
    status: 'completed',
    detail: `${collectedSources.length} source(s)`,
  });

  return {
    summary,
    sources: collectedSources,
  };
}

export async function summarizeLocalFile(params: {
  fileName: string;
  content: string;
  question?: string;
  model?: string;
}) {
  const safeContent = params.content.slice(0, 18000);
  const db = loadDb();
  let summary = '';

  if (params.model?.startsWith('gemini-') && hasValidGeminiKey()) {
    try {
      const res = await geminiProvider.generateText({
        model: params.model,
        systemInstruction:
          'You are the F.R.I.D.A.Y. File Intelligence Agent. Analyze only the provided permitted file content accurately.',
        prompt: params.question?.trim()
          ? `File: ${params.fileName}\n\nQuestion: ${params.question}\n\nContent:\n${safeContent}`
          : `Summarize the purpose, key structure, and important details of "${params.fileName}":\n\n${safeContent}`,
      });
      summary = res.text;
    } catch {
      summary = '';
    }
  }

  if (!summary) {
    const ollama = await checkOllamaStatus(db.settings.ollamaModel);
    if (ollama.available && ollama.selectedModel) {
      try {
        const res = await streamOllamaChat({
          model: ollama.selectedModel,
          messages: [
            {
              role: 'system',
              content:
                'You are F.R.I.D.A.Y. File Intelligence. Analyze only the provided permitted file content concisely.',
            },
            {
              role: 'user',
              content: params.question?.trim()
                ? `File: ${params.fileName}\nQuestion: ${params.question}\n\nContent:\n${safeContent}`
                : `Summarize "${params.fileName}":\n\n${safeContent}`,
            },
          ],
        });
        summary = res.text;
      } catch {
        summary = '';
      }
    }
  }

  if (!summary) {
    const lineCount = safeContent.split(/\r?\n/).length;
    const excerpt = buildExtractiveSummary(safeContent, params.question, 6);
    summary = `Local summary of "${params.fileName}" (${lineCount} lines, ${safeContent.length} chars):\n\n${excerpt}`;
  }

  appendActionLog(db, {
    agent: 'file',
    action: 'Local File Analysis',
    target: params.fileName,
    status: 'completed',
  });

  return { summary };
}

export async function generateDailyBriefing(model = 'local-auto') {
  const db = loadDb();
  const telemetry = await getSystemTelemetry().catch(() => null);
  const weather = await getWeatherForLocation(db.settings.weatherLocation).catch(() => null);
  const today = new Date().toISOString().slice(0, 10);
  const events = db.calendar.filter((e) => e.date >= today).slice(0, 8);

  const rawPrompt = `Prepare a crisp executive daily briefing for ${db.settings.userName}.
Date: ${today}
Weather: ${weather ? `${weather.location}: ${weather.temperature}°C, ${weather.condition}` : 'Unavailable'}
System Health: ${telemetry ? `CPU ${telemetry.cpuLoad}%, RAM ${telemetry.ramPercent}%, Storage ${telemetry.storagePercent}%` : 'Unavailable'}
Calendar Items:\n${events.map((e) => `- ${e.date} ${e.time}: ${e.title} (${e.category}, done=${e.completed})`).join('\n') || 'None scheduled'}`;

  let briefing = '';
  if (model.startsWith('gemini-') && hasValidGeminiKey()) {
    try {
      const res = await geminiProvider.generateText({
        model,
        systemInstruction:
          'You are F.R.I.D.A.Y. Deliver a concise, actionable morning briefing covering schedule priorities, weather, and system readiness.',
        prompt: rawPrompt,
      });
      briefing = res.text;
    } catch {
      briefing = '';
    }
  }

  if (!briefing) {
    const ollama = await checkOllamaStatus(db.settings.ollamaModel);
    if (ollama.available && ollama.selectedModel) {
      try {
        const res = await streamOllamaChat({
          model: ollama.selectedModel,
          messages: [
            {
              role: 'system',
              content: 'Deliver a concise, actionable morning briefing for the user.',
            },
            { role: 'user', content: rawPrompt },
          ],
        });
        briefing = res.text;
      } catch {
        briefing = '';
      }
    }
  }

  if (!briefing) {
    const scheduleBlock =
      events.length > 0
        ? events.map((e) => `• ${e.date} ${e.time} — ${e.title} (${e.completed ? 'completed' : e.category})`).join('\n')
        : '• No upcoming events scheduled.';
    const weatherLine = weather
      ? `${weather.location}: ${weather.temperature}°C (${weather.condition}), wind ${weather.windSpeedKmh} km/h`
      : 'Weather telemetry unavailable.';
    const sysLine = telemetry
      ? `CPU ${telemetry.cpuLoad}% · RAM ${telemetry.ramPercent}% (${telemetry.ramUsedGb}/${telemetry.ramTotalGb} GB) · Storage ${telemetry.storagePercent}%`
      : 'System sensors ready.';
    briefing = `Good day, ${db.settings.userName}. Here is your local briefing for ${today}:\n\nWeather: ${weatherLine}\nSystem Readiness: ${sysLine}\n\nUpcoming Schedule:\n${scheduleBlock}`;
  }

  appendActionLog(db, {
    agent: 'calendar',
    action: 'Daily Briefing Generated',
    target: today,
    status: 'completed',
  });

  return { briefing };
}

export async function analyzeMediaOrScreen(params: {
  base64Data: string;
  mimeType: string;
  prompt: string;
  model?: string;
}) {
  const db = loadDb();
  const isAudio = params.mimeType.startsWith('audio/');
  const isImage = params.mimeType.startsWith('image/');

  if (hasValidGeminiKey()) {
    const ai = getGeminiClient();
    const targetModel = isAudio ? 'gemini-3.5-transcribe' : 'gemini-3.1-flash-lite';
    const response = await ai.models.generateContent({
      model: targetModel,
      contents: {
        parts: [
          { inlineData: { mimeType: params.mimeType, data: params.base64Data } },
          {
            text:
              params.prompt ||
              (isAudio
                ? 'Transcribe this audio accurately and provide a concise summary.'
                : 'Analyze this visual/document input clearly, extract key text/metrics, and explain any errors or insights.'),
          },
        ],
      },
    });
    appendActionLog(db, {
      agent: isAudio ? 'media' : 'vision',
      action: isAudio ? 'Audio Transcription & Summary' : 'Visual / Document Analysis',
      target: params.mimeType,
      status: 'completed',
    });
    return { analysis: (response.text ?? '').trim(), modelUsed: targetModel };
  }

  if (isImage) {
    const ollama = await checkOllamaStatus(db.settings.ollamaModel);
    const visionModel = ollama.models.find((m) =>
      /llava|vision|moondream|bakllava|minicpm-v/i.test(m)
    );
    if (ollama.available && visionModel) {
      const host = getOllamaHost();
      const res = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: visionModel,
          stream: false,
          messages: [
            {
              role: 'user',
              content: params.prompt || 'Analyze this image and extract key text or errors.',
              images: [params.base64Data],
            },
          ],
        }),
        signal: AbortSignal.timeout(35_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { message?: { content?: string } };
        appendActionLog(db, {
          agent: 'vision',
          action: 'Local Ollama Vision Analysis',
          target: visionModel,
          status: 'completed',
        });
        return {
          analysis: (data.message?.content ?? '').trim() || 'Vision analysis completed.',
          modelUsed: `ollama:${visionModel}`,
        };
      }
    }
  }

  const sizeKb = Math.round((params.base64Data.length * 3) / 4 / 1024);
  return {
    analysis: `Captured ${params.mimeType} payload (${sizeKb} KB). For offline local multimodal image analysis, pull a local vision model in Ollama (e.g., "ollama pull llava" or "ollama pull llama3.2-vision"), or optionally configure GEMINI_API_KEY in .env.`,
    modelUsed: 'local-core',
  };
}

export async function synthesizeSpeechWav(
  text: string,
  voiceName: string
): Promise<{ audioBase64: string | null; localFallback: boolean; reason?: string }> {
  if (!hasValidGeminiKey()) {
    return {
      audioBase64: null,
      localFallback: true,
      reason: 'Using fast local Windows/Browser SpeechSynthesis.',
    };
  }
  const ai = getGeminiClient();
  const safeText = text.slice(0, 800);
  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: safeText,
            speechMetadata: {
              style: 'Clear, intelligent, composed personal desktop assistant',
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceName || 'Kore',
          },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    return {
      audioBase64: null,
      localFallback: true,
      reason: 'TTS model returned empty payload; using local SpeechSynthesis.',
    };
  }
  return { audioBase64: base64Audio, localFallback: false };
}

export async function transcribeAudioBase64(
  base64Data: string,
  mimeType: string
): Promise<{ text: string; localFallback: boolean; reason?: string }> {
  if (!hasValidGeminiKey()) {
    return {
      text: '',
      localFallback: true,
      reason: 'Use the primary Microphone button (Web Speech API) or text command bar in local mode without a paid cloud key.',
    };
  }
  const ai = getGeminiClient();
  const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          { inlineData: { mimeType: cleanMime, data: base64Data } },
          { text: 'Transcribe the user voice command verbatim without extra commentary.' },
        ],
      },
    });
    return { text: (response.text ?? '').trim(), localFallback: false };
  } catch (err) {
    if (isTransientGeminiError(err)) {
      const fallback = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: {
          parts: [
            { inlineData: { mimeType: cleanMime, data: base64Data } },
            { text: 'Transcribe the spoken audio accurately verbatim with no extra commentary.' },
          ],
        },
      });
      return { text: (fallback.text ?? '').trim(), localFallback: false };
    }
    throw new Error(extractFriendlyError(err));
  }
}
