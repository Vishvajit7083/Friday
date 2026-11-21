import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type {
  AssistantSettings,
  ChatMessage,
  ExecutionStep,
  GroundingSource,
  SystemTelemetry,
} from '../src/core/types.ts';
import { analyzeUserCommand } from '../src/core/intentEngine.ts';
import { searchIndexedFiles, formatBytes } from '../src/core/fileIndex.ts';
import { appendActionLog, loadDb, saveDb } from './store.ts';
import { getSystemTelemetry, launchApplication } from './systemService.ts';
import { getWeatherForLocation } from './weatherService.ts';
import { scanPermittedFolders } from './fileService.ts';

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

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add your key in the AI Studio Settings > Secrets panel to enable F.R.I.D.A.Y. AI reasoning.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 30000,
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

export async function checkGeminiConnection(): Promise<{
  connected: boolean;
  provider: string;
  model: string;
  latencyMs?: number;
  error?: string;
}> {
  const started = Date.now();
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
        await new Promise((r) => setTimeout(r, 450));
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

export async function runAssistantCommand(
  userCommand: string,
  settings: AssistantSettings
): Promise<{
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  activeAgents: string[];
}> {
  const db = loadDb();
  const parsed = analyzeUserCommand(userCommand);
  const nowIso = new Date().toISOString();

  const userMessage: ChatMessage = {
    id: `msg-${Date.now()}-u`,
    role: 'user',
    content: userCommand,
    timestamp: nowIso,
    intent: parsed.category,
  };

  // Enforce agent enable/disable flags
  const disabledAgent = parsed.agents.find((a) => settings.enabledAgents[a] === false);
  if (disabledAgent) {
    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}-a`,
      role: 'assistant',
      content: `Cannot complete that command because the ${disabledAgent} agent is currently disabled in Settings. Re-enable it to proceed.`,
      timestamp: new Date().toISOString(),
      intent: parsed.category,
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
    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}-a`,
      role: 'assistant',
      content: `${parsed.confirmationReason ?? 'This action requires confirmation.'} Review the requested operation below and confirm if you want me to proceed.`,
      timestamp: new Date().toISOString(),
      intent: parsed.category,
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
    return { userMessage, assistantMessage, activeAgents: parsed.agents };
  }

  // Gather real grounded context for specialist agents
  const steps: ExecutionStep[] = [...parsed.steps];
  const contextParts: string[] = [];
  let useSearch = false;
  let useUrlContext = /https?:\/\//i.test(userCommand);

  let telemetry: SystemTelemetry | null = null;
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

  if (parsed.category === 'file_search' || parsed.category === 'media_analyze') {
    const files = scanPermittedFolders(settings.allowedFolders, settings.pausedIndexing, 250);
    const matches = searchIndexedFiles(files, userCommand).slice(0, 8);
    contextParts.push(
      matches.length > 0
        ? `PERMITTED FILE SEARCH MATCHES (${matches.length}):\n` +
            matches
              .map(
                (m) =>
                  `- ${m.name} (${m.category}, ${formatBytes(m.sizeBytes)}, modified ${m.modifiedAt}) at ${m.relativePath}${
                    m.previewText ? ` | snippet: ${m.previewText.slice(0, 140).replace(/\s+/g, ' ')}` : ''
                  }`
              )
              .join('\n')
        : `PERMITTED FILE SEARCH: No matching files found across ${settings.allowedFolders.length} permitted folder(s). Total indexed files: ${files.length}.`
    );
    appendActionLog(db, {
      agent: 'file',
      action: 'Search Permitted Files',
      target: userCommand.slice(0, 48),
      status: 'completed',
      detail: `${matches.length} matching file(s)`,
    });
  }

  if (parsed.category === 'app_control') {
    const lower = userCommand.toLowerCase();
    const matchedApp = db.apps.find(
      (a) => lower.includes(a.name.toLowerCase()) || lower.includes(a.command.toLowerCase())
    );
    if (matchedApp) {
      const result = await launchApplication(matchedApp);
      matchedApp.lastUsed = new Date().toISOString();
      contextParts.push(`APPLICATION CONTROL RESULT: ${result.message}`);
      appendActionLog(db, {
        agent: 'application',
        action: result.launched ? 'Launch Application' : 'App Discovery Check',
        target: matchedApp.name,
        status: result.launched ? 'completed' : 'blocked',
        detail: result.message,
      });
    } else {
      contextParts.push(
        `AVAILABLE APPLICATIONS: ${db.apps.map((a) => `${a.name} (${a.installed ? 'available' : 'desktop-only'})`).join(', ')}`
      );
    }
  }

  if (parsed.category === 'calendar_schedule' || parsed.category === 'workflow_run') {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = db.calendar.filter((e) => e.date >= today);
    contextParts.push(
      `CALENDAR SCHEDULE:\n` +
        (upcoming.length > 0
          ? upcoming.map((e) => `- [${e.date} ${e.time}] ${e.title} (${e.category}, completed=${e.completed})`).join('\n')
          : 'No upcoming events scheduled.')
    );
    appendActionLog(db, {
      agent: 'calendar',
      action: 'Query Schedule',
      target: `${upcoming.length} upcoming items`,
      status: 'completed',
    });
  }

  if (parsed.category === 'memory_manage') {
    const rememberMatch = userCommand.match(/remember\s+(?:that\s+)?(.+)/i);
    if (rememberMatch && rememberMatch[1]) {
      const value = rememberMatch[1].trim();
      db.memory.unshift({
        id: `mem-${Date.now()}`,
        category: 'preference',
        key: 'User Note',
        value,
        approved: true,
        updatedAt: new Date().toISOString(),
      });
      contextParts.push(`MEMORY SAVED: "${value}"`);
      appendActionLog(db, {
        agent: 'memory',
        action: 'Persist User Memory',
        target: value.slice(0, 48),
        status: 'completed',
      });
    }
  }

  if (parsed.category === 'web_search') {
    useSearch = true;
    appendActionLog(db, {
      agent: 'browser',
      action: 'Grounded Web Research',
      target: userCommand.slice(0, 56),
      status: 'completed',
    });
  }

  if (/\bweather|temperature|forecast\b/i.test(userCommand)) {
    try {
      const weather = await getWeatherForLocation(settings.weatherLocation);
      contextParts.push(
        `LIVE WEATHER (${weather.location}): ${weather.temperature}°C, ${weather.condition}, Humidity ${weather.humidity}%, Wind ${weather.windSpeedKmh} km/h.`
      );
    } catch {
      // Ignore transient weather failure if unrelated
    }
  }

  const memorySummary = db.memory
    .filter((m) => m.approved)
    .slice(0, 10)
    .map((m) => `- ${m.key}: ${m.value}`)
    .join('\n');

  const systemInstruction = `You are F.R.I.D.A.Y. (Fully Responsive Intelligent Digital Assistant for You), an intelligent, precise, trustworthy desktop AI companion speaking to ${settings.userName}.
Respond concisely in clear, natural language. Never fabricate files, hardware numbers, or URLs—only cite facts present in the real context or grounded search results.
If a desktop-only Windows operation cannot run inside a sandboxed Linux web host, explain honestly how it works and what was verified.
User-approved personal memory:
${memorySummary || 'None'}`;

  const prompt = `${contextParts.length > 0 ? contextParts.join('\n\n') + '\n\n' : ''}User Command: ${userCommand}`;

  const aiResult = await geminiProvider.generateText({
    model: settings.aiModel || 'gemini-4-hydrogen',
    systemInstruction,
    prompt,
    useSearch,
    useUrlContext,
  });

  const finalizedSteps: ExecutionStep[] = steps.map((s) => ({
    ...s,
    status: 'completed',
  }));

  const assistantMessage: ChatMessage = {
    id: `msg-${Date.now()}-a`,
    role: 'assistant',
    content: aiResult.text || 'Command completed.',
    timestamp: new Date().toISOString(),
    intent: parsed.category,
    steps: finalizedSteps,
    sources: aiResult.sources,
  };

  db.chatHistory = [...db.chatHistory, userMessage, assistantMessage].slice(-100);
  appendActionLog(db, {
    agent: 'core',
    action: `Command (${parsed.category})`,
    target: userCommand.slice(0, 52),
    status: 'completed',
    detail: `Agents: ${parsed.agents.join(', ')}`,
  });
  saveDb(db);

  return {
    userMessage,
    assistantMessage,
    activeAgents: parsed.agents,
  };
}

export async function runBrowserResearch(
  query: string,
  url?: string,
  model = 'gemini-4-hydrogen',
  mode: 'web' | 'news' | 'docs' | 'video' = 'web'
) {
  const ai = getGeminiClient();
  const modePromptMap = {
    web: 'Provide a clear, well-structured research briefing with verified findings and citations.',
    news: 'Summarize the latest verified news developments, dates, and primary reporting sources.',
    docs: 'Extract technical specifications, API details, and authoritative documentation links.',
    video: 'Discover relevant YouTube videos, tutorials, and talks with direct verified links and descriptions.',
  };

  const prompt = url
    ? `Analyze and summarize this URL thoroughly with key takeaways and verified details: ${url}\n\nFocus query: ${query}`
    : `${modePromptMap[mode]}\n\nQuery: ${query}`;

  const tools = url ? [{ urlContext: {} }, { googleSearch: {} }] : [{ googleSearch: {} }];

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction:
        'You are the F.R.I.D.A.Y. Browser Intelligence Agent. Synthesize accurate research summaries from grounded search results and URLs. Never fabricate links.',
      tools,
    },
  });

  const db = loadDb();
  appendActionLog(db, {
    agent: 'browser',
    action: url ? 'URL Synthesis' : `Web Research (${mode})`,
    target: (url || query).slice(0, 56),
    status: 'completed',
  });

  return {
    summary: (response.text ?? '').trim(),
    sources: extractGroundingSources(response),
  };
}

export async function summarizeLocalFile(params: {
  fileName: string;
  content: string;
  question?: string;
  model?: string;
}) {
  const ai = getGeminiClient();
  const safeContent = params.content.slice(0, 24000);
  const prompt = params.question?.trim()
    ? `File: ${params.fileName}\n\nQuestion: ${params.question}\n\nContent:\n${safeContent}`
    : `Summarize the purpose, key structure, and important details of "${params.fileName}":\n\n${safeContent}`;

  const response = await ai.models.generateContent({
    model: params.model || 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction:
        'You are the F.R.I.D.A.Y. File Intelligence Agent. Analyze only the provided permitted file content accurately.',
    },
  });

  const db = loadDb();
  appendActionLog(db, {
    agent: 'file',
    action: 'AI File Analysis',
    target: params.fileName,
    status: 'completed',
  });

  return {
    summary: (response.text ?? '').trim(),
  };
}

export async function generateDailyBriefing(model = 'gemini-4-hydrogen') {
  const ai = getGeminiClient();
  const db = loadDb();
  const telemetry = await getSystemTelemetry().catch(() => null);
  const weather = await getWeatherForLocation(db.settings.weatherLocation).catch(() => null);
  const today = new Date().toISOString().slice(0, 10);
  const events = db.calendar.filter((e) => e.date >= today).slice(0, 8);

  const prompt = `Prepare a crisp executive daily briefing for ${db.settings.userName}.
Date: ${today}
Weather: ${weather ? `${weather.location}: ${weather.temperature}°C, ${weather.condition}` : 'Unavailable'}
System Health: ${telemetry ? `CPU ${telemetry.cpuLoad}%, RAM ${telemetry.ramPercent}%, Storage ${telemetry.storagePercent}%` : 'Unavailable'}
Calendar Items:\n${events.map((e) => `- ${e.date} ${e.time}: ${e.title} (${e.category}, done=${e.completed})`).join('\n') || 'None scheduled'}`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction:
        'You are F.R.I.D.A.Y. Deliver a concise, actionable morning briefing covering schedule priorities, weather, and system readiness.',
    },
  });

  appendActionLog(db, {
    agent: 'calendar',
    action: 'Daily Briefing Generated',
    target: today,
    status: 'completed',
  });

  return { briefing: (response.text ?? '').trim() };
}

export async function analyzeMediaOrScreen(params: {
  base64Data: string;
  mimeType: string;
  prompt: string;
  model?: string;
}) {
  const ai = getGeminiClient();
  const isAudio = params.mimeType.startsWith('audio/');
  const targetModel = isAudio ? 'gemini-3.5-transcribe' : params.model || 'gemini-4-hydrogen';

  const response = await ai.models.generateContent({
    model: targetModel,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType,
            data: params.base64Data,
          },
        },
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

  const db = loadDb();
  appendActionLog(db, {
    agent: isAudio ? 'media' : 'vision',
    action: isAudio ? 'Audio Transcription & Summary' : 'Visual / Document Analysis',
    target: params.mimeType,
    status: 'completed',
  });

  return {
    analysis: (response.text ?? '').trim(),
    modelUsed: targetModel,
  };
}

export async function synthesizeSpeechWav(text: string, voiceName: string): Promise<string> {
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
    throw new Error('TTS model did not return audio data.');
  }
  return base64Audio;
}

export async function transcribeAudioBase64(base64Data: string, mimeType: string): Promise<string> {
  const ai = getGeminiClient();
  const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: cleanMime,
              data: base64Data,
            },
          },
          {
            text: 'Transcribe the user voice command verbatim without extra commentary.',
          },
        ],
      },
    });
    return (response.text ?? '').trim();
  } catch (err) {
    if (isTransientGeminiError(err)) {
      const fallback = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: cleanMime,
                data: base64Data,
              },
            },
            {
              text: 'Transcribe the spoken audio accurately verbatim with no extra commentary.',
            },
          ],
        },
      });
      return (fallback.text ?? '').trim();
    }
    throw new Error(extractFriendlyError(err));
  }
}
