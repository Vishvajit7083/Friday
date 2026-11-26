import type {
  AgentId,
  ChatMessage,
  ExecutionStep,
  GroundingSource,
  PipelineTimings,
} from '../src/core/types.ts';
import { tryEvaluateSafeMath } from '../src/core/intentEngine.ts';
import { tryConvertUnits } from '../src/core/unitConverter.ts';
import { tryTranslateCommand } from '../src/core/translator.ts';
import { parseProductivityCommand } from '../src/core/productivityTools.ts';
import { appendActionLog, loadDb, saveDb } from './store.ts';
import { getSystemTelemetry } from './systemService.ts';
import { recognizeWindowsSpeechFromWav } from '../electron/windowsAutomation.ts';
import { getWeatherForLocation } from './weatherService.ts';
import { extractPdfTextFromBuffer } from './pdfParser.ts';
import { inspectImageDimensions, inspectWavAudioBuffer } from './mediaInspect.ts';
import {
  buildExtractiveSummary,
  fetchPublicWebPage,
  searchFreeWeb,
  type WebPageExtract,
  type WebSearchResultItem,
} from './internetResearchService.ts';
import {
  getSavedTokenizerArtifact,
  listCognitiveMemories,
  listCustomLexicon,
  listDynamicIntents,
  listKnowledgeChunks,
  listTrainingDatasetSamples,
} from './cognitiveDb.ts';
import { runCognitiveTurn } from './cognitiveRuntime.ts';
import { FutureLanguageCoreProvider } from '../src/core/cognitive/learningPipeline.ts';
import { WorkflowPlanner } from '../src/core/automation/workflowPlanner.ts';
import { automationTaskManager } from './automation/workflowExecutor.ts';

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

export async function checkAiHealth(preferredPreference?: string) {
  const started = Date.now();
  const db = loadDb();
  const pref = preferredPreference || db.settings.aiModel || 'friday-cognitive';
  const langCore = new FutureLanguageCoreProvider(process.env.FRIDAY_LANGUAGE_CORE_WEIGHTS);
  const memories = listCognitiveMemories(undefined, 1000);
  const customIntents = listDynamicIntents();
  const lexicon = listCustomLexicon();
  const knowledge = listKnowledgeChunks(500);
  const dataset = listTrainingDatasetSamples(1000);
  const tokenizer = getSavedTokenizerArtifact();

  const useLangCore = pref === 'friday-language-core' && langCore.isReady();

  return {
    connected: true,
    provider: useLangCore
      ? 'F.R.I.D.A.Y. Language Core (Self-Trained Checkpoint)'
      : 'F.R.I.D.A.Y. Cognitive Engine (Self-Owned Offline-First)',
    model: useLangCore
      ? process.env.FRIDAY_LANGUAGE_CORE_WEIGHTS || 'friday-language-core-v1'
      : tokenizer
        ? `cognitive-v1 (vocab:${tokenizer.vocabSize})`
        : 'cognitive-v1 (15-module brain)',
    engine: (pref === 'friday-language-core' ? 'friday-language-core' : 'friday-cognitive') as
      | 'friday-cognitive'
      | 'friday-language-core'
      | 'local-core',
    freeWebReady: true,
    requiresPaidKey: false,
    latencyMs: Math.max(1, Date.now() - started),
    cognitiveStats: {
      memoryCount: memories.length,
      customIntentCount: customIntents.length,
      lexiconCount: lexicon.length,
      knowledgeChunks: knowledge.length,
      datasetSamples: dataset.length,
      languageCoreReady: langCore.isReady(),
    },
  };
}

export async function streamAssistantCommand(
  commandOrParams:
    | string
    | {
        command: string;
        confirmedAction?: boolean;
        onEvent: (ev: StreamAssistantEvent) => void;
      },
  _settings?: unknown,
  onEventArg?: (ev: StreamAssistantEvent) => void,
  signal?: AbortSignal
) {
  const startedAt = Date.now();
  const command = typeof commandOrParams === 'string' ? commandOrParams : commandOrParams.command;
  const confirmedAction = typeof commandOrParams === 'string' ? false : Boolean(commandOrParams.confirmedAction);
  const onEvent = typeof commandOrParams === 'string' ? onEventArg || (() => {}) : commandOrParams.onEvent;

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const db = loadDb();

  const userMessage: ChatMessage = {
    id: `msg-${Date.now()}-u`,
    role: 'user',
    content: command,
    timestamp: new Date().toISOString(),
  };

  // Fast offline deterministic tools (math, unit conversion, translation, notes/todos)
  const mathVal = tryEvaluateSafeMath(command);
  const unitVal = mathVal === null ? tryConvertUnits(command) : null;
  const transVal = mathVal === null && !unitVal ? tryTranslateCommand(command) : null;
  const prodCmd =
    mathVal === null && !unitVal && !transVal ? parseProductivityCommand(command) : null;

  if (mathVal !== null || unitVal || transVal || prodCmd) {
    let quickReply = '';
    let intentName = 'general_assistant';
    const agents: AgentId[] = ['core'];
    const steps: ExecutionStep[] = [];

    if (mathVal !== null) {
      quickReply = `The result is ${mathVal}.`;
      intentName = 'safe_math';
      steps.push({ id: 'step-1', agent: 'core', title: 'Evaluate arithmetic locally', status: 'completed' });
    } else if (unitVal) {
      quickReply = `${unitVal.formattedOutput} (${unitVal.explanation})`;
      intentName = 'unit_convert';
      steps.push({ id: 'step-1', agent: 'core', title: 'Convert units offline', status: 'completed' });
    } else if (transVal) {
      quickReply = `${transVal.translatedText}${transVal.romanized ? ` (${transVal.romanized})` : ''}`;
      intentName = 'translate';
      steps.push({ id: 'step-1', agent: 'core', title: 'Translate phrase locally', status: 'completed' });
    } else if (prodCmd) {
      const nowIso = new Date().toISOString();
      if (prodCmd.kind === 'note_add') {
        db.notes = [
          {
            id: `note-${Date.now()}`,
            title: prodCmd.title,
            content: prodCmd.detail || prodCmd.title,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          ...db.notes,
        ];
        saveDb(db);
        quickReply = `Saved note: "${prodCmd.title}".`;
      } else if (prodCmd.kind === 'todo_add') {
        db.todos = [
          {
            id: `todo-${Date.now()}`,
            title: prodCmd.title,
            completed: false,
            priority: 'normal',
            dueDate: nowIso.slice(0, 10),
            createdAt: nowIso,
          },
          ...db.todos,
        ];
        saveDb(db);
        quickReply = `Added task: "${prodCmd.title}".`;
      } else if (prodCmd.kind === 'reminder_add' || prodCmd.kind === 'alarm_set') {
        const date = prodCmd.date || nowIso.slice(0, 10);
        const time = prodCmd.time || '09:00';
        db.calendar = [
          {
            id: `evt-${Date.now()}`,
            title: prodCmd.title,
            date,
            time,
            category: 'reminder',
            completed: false,
            createdAt: nowIso,
          },
          ...db.calendar,
        ];
        saveDb(db);
        quickReply = `Reminder scheduled for ${date} at ${time}: "${prodCmd.title}".`;
      } else {
        quickReply = `Your workspace has ${db.notes.length} note(s) and ${db.todos.filter((t) => !t.completed).length} active to-do item(s).`;
      }
      intentName = 'note_todo';
      agents.push('calendar');
      steps.push({ id: 'step-1', agent: 'calendar', title: 'Persist local productivity update', status: 'completed' });
    }

    onEvent({ type: 'status', phase: 'executing', agents, steps, intent: intentName });
    onEvent({ type: 'token', token: quickReply });

    const totalMs = Math.max(1, Date.now() - startedAt);
    const timings: PipelineTimings = {
      engine: 'friday-cognitive-fast',
      intentMs: 1,
      toolMs: totalMs,
      firstTokenMs: totalMs,
      modelMs: 0,
      totalMs,
    };
    recordPipelineTiming(timings);

    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}-a`,
      role: 'assistant',
      content: quickReply,
      timestamp: new Date().toISOString(),
      intent: intentName,
      steps,
      timings,
    };

    const freshDb = loadDb();
    freshDb.chatHistory = [...freshDb.chatHistory, userMessage, assistantMessage].slice(-120);
    saveDb(freshDb);
    onEvent({ type: 'done', userMessage, assistantMessage, activeAgents: agents });
    return { userMessage, assistantMessage, activeAgents: agents };
  }

  // Autonomous Workflow Orchestrator (control commands & multi-step desktop/office/code workflows)
  const wfControl = WorkflowPlanner.isWorkflowControlCommand(command);
  if (wfControl) {
    let replyText = '';
    const agents: AgentId[] = ['core', 'automation'];
    const steps: ExecutionStep[] = [
      { id: 'step-1', agent: 'automation', title: `Workflow control: ${wfControl}`, status: 'completed' },
    ];

    if (wfControl === 'pause') {
      const paused = automationTaskManager.pauseLatestActive();
      replyText = paused
        ? `Paused active workflow "${paused.goal}" at step ${paused.currentStepIndex + 1}/${paused.steps.length}.`
        : 'There is no active workflow running right now to pause.';
    } else if (wfControl === 'resume') {
      const resumed = automationTaskManager.resumeLatestPaused();
      replyText = resumed
        ? `Resumed workflow "${resumed.goal}". Progress: ${resumed.progressPercent}%.`
        : 'There are no paused or waiting workflows to resume.';
    } else if (wfControl === 'cancel') {
      const cancelled = automationTaskManager.cancelLatestActive();
      replyText = cancelled
        ? `Cancelled workflow "${cancelled.goal}".`
        : 'There is no active workflow to cancel.';
    } else {
      const tasks = automationTaskManager.listTasks(5);
      replyText =
        tasks.length > 0
          ? 'Recent background workflows:\n' +
            tasks
              .map(
                (t) =>
                  `• [${t.state.toUpperCase()} ${t.progressPercent}%] ${t.goal}` +
                  (t.artifacts.length ? ` (${t.artifacts.join(', ')})` : '')
              )
              .join('\n')
          : 'No background workflows have been queued yet.';
    }

    onEvent({ type: 'status', phase: 'executing', agents, steps, intent: 'automation_control' });
    onEvent({ type: 'token', token: replyText });

    const totalMs = Math.max(1, Date.now() - startedAt);
    const timings: PipelineTimings = {
      engine: 'friday-workflow-orchestrator',
      intentMs: 1,
      toolMs: totalMs,
      firstTokenMs: totalMs,
      modelMs: 0,
      totalMs,
    };
    recordPipelineTiming(timings);

    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}-a`,
      role: 'assistant',
      content: replyText,
      timestamp: new Date().toISOString(),
      intent: 'workflow_run',
      steps,
      timings,
    };
    const freshDb = loadDb();
    freshDb.chatHistory = [...freshDb.chatHistory, userMessage, assistantMessage].slice(-120);
    saveDb(freshDb);
    onEvent({ type: 'done', userMessage, assistantMessage, activeAgents: agents });
    return { userMessage, assistantMessage, activeAgents: agents };
  }

  if (WorkflowPlanner.isAutomationGoal(command)) {
    const initialPlan = automationTaskManager.planWorkflow(command, confirmedAction);
    const activeAgentsList: AgentId[] = Array.from(
      new Set<AgentId>(['automation', ...initialPlan.steps.map((s) => s.agent)])
    );
    const initialSteps: ExecutionStep[] = initialPlan.steps.map((s) => ({
      id: s.id,
      agent: s.agent,
      title: s.title,
      status: initialPlan.requiresConfirmation && !confirmedAction ? 'pending' : 'running',
    }));

    onEvent({
      type: 'status',
      phase: initialPlan.requiresConfirmation && !confirmedAction ? 'awaiting_confirmation' : 'executing',
      agents: activeAgentsList,
      steps: initialSteps,
      intent: initialPlan.scenarioKey,
    });

    const task = await automationTaskManager.createAndStartTask({
      goal: command,
      confirmed: confirmedAction,
      waitForCompletion: true,
    });

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const mappedSteps: ExecutionStep[] = task.steps.map((s) => ({
      id: s.stepId,
      agent: initialPlan.steps.find((ps) => ps.id === s.stepId)?.agent || 'automation',
      title: s.title,
      status:
        s.status === 'completed'
          ? 'completed'
          : s.status === 'failed' || s.status === 'cancelled'
            ? 'failed'
            : s.status === 'running' || s.status === 'retrying'
              ? 'running'
              : 'pending',
      detail: s.verificationDetail || s.output || s.error,
    }));

    const replyText =
      task.state === 'waiting_for_user'
        ? `Approval required before running "${task.goal}":\n${task.confirmationSummary || 'Confirm high-impact or external path workflow.'}`
        : task.summary ||
          `Workflow "${task.scenarioKey}" finished with state: ${task.state}.` +
            (task.artifacts.length ? `\nVerified outputs: ${task.artifacts.join(', ')}` : '');

    onEvent({
      type: 'status',
      phase: task.state === 'waiting_for_user' ? 'awaiting_confirmation' : 'executing',
      agents: activeAgentsList,
      steps: mappedSteps,
      intent: task.scenarioKey,
    });

    const chunks = replyText.split(/(?<=\s)/);
    let firstTokenMs = 0;
    for (const chunk of chunks) {
      if (signal?.aborted) break;
      if (!firstTokenMs) firstTokenMs = Math.max(1, Date.now() - startedAt);
      onEvent({ type: 'token', token: chunk });
    }

    const totalMs = Math.max(1, Date.now() - startedAt);
    const timings: PipelineTimings = {
      engine: 'friday-workflow-orchestrator',
      intentMs: 2,
      toolMs: totalMs,
      firstTokenMs: firstTokenMs || totalMs,
      modelMs: 0,
      totalMs,
    };
    recordPipelineTiming(timings);

    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}-a`,
      role: 'assistant',
      content: replyText,
      timestamp: new Date().toISOString(),
      intent: 'workflow_run',
      steps: mappedSteps,
      sources: task.sources.length > 0 ? task.sources : undefined,
      timings,
      pendingConfirmation:
        task.state === 'waiting_for_user'
          ? {
              actionId: task.id,
              summary: task.confirmationSummary || command,
              actionType: 'automation_workflow',
              payload: { automationTaskId: task.id, goal: command },
            }
          : undefined,
    };

    const freshDb = loadDb();
    freshDb.chatHistory = [...freshDb.chatHistory, userMessage, assistantMessage].slice(-120);
    saveDb(freshDb);
    onEvent({ type: 'done', userMessage, assistantMessage, activeAgents: activeAgentsList });
    return { userMessage, assistantMessage, activeAgents: activeAgentsList };
  }

  // Main 15-Module F.R.I.D.A.Y. Cognitive Engine Orchestrator
  onEvent({
    type: 'status',
    phase: 'processing',
    agents: ['core'],
    steps: [{ id: 'step-1', agent: 'core', title: 'Run 15-module Cognitive Orchestrator', status: 'running' }],
    intent: 'cognitive_turn',
  });

  const cogResult = await runCognitiveTurn({
    command,
    confirmedAction,
  });

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  onEvent({
    type: 'status',
    phase: cogResult.requiresConfirmation ? 'awaiting_confirmation' : 'executing',
    agents: cogResult.agents,
    steps: cogResult.steps,
    intent: cogResult.intentId,
  });

  const chunks = cogResult.reply.split(/(?<=\s)/);
  let firstTokenMs = 0;
  for (const chunk of chunks) {
    if (signal?.aborted) break;
    if (!firstTokenMs) firstTokenMs = Math.max(1, Date.now() - startedAt);
    onEvent({ type: 'token', token: chunk });
  }

  const totalMs = Math.max(1, Date.now() - startedAt);
  const timings: PipelineTimings = {
    engine: 'friday-cognitive-engine',
    intentMs: cogResult.timings.understandMs,
    toolMs: cogResult.timings.toolMs,
    firstTokenMs: firstTokenMs || totalMs,
    modelMs: cogResult.timings.generateMs,
    totalMs,
  };
  recordPipelineTiming(timings);

  const assistantMessage: ChatMessage = {
    id: `msg-${Date.now()}-a`,
    role: 'assistant',
    content: cogResult.reply,
    timestamp: new Date().toISOString(),
    intent: cogResult.intentId,
    steps: cogResult.steps,
    sources: cogResult.sources.length > 0 ? cogResult.sources : undefined,
    timings,
    pendingConfirmation: cogResult.requiresConfirmation
      ? {
          actionId: `act-${Date.now()}`,
          summary: cogResult.confirmationSummary || command,
          actionType: cogResult.intentCategory,
          payload: cogResult.confirmationPayload || { originalCommand: command },
        }
      : undefined,
  };

  const freshDb = loadDb();
  freshDb.chatHistory = [...freshDb.chatHistory, userMessage, assistantMessage].slice(-120);
  saveDb(freshDb);
  appendActionLog(freshDb, {
    agent: cogResult.agents[0] || 'core',
    action: `Cognitive Turn (${cogResult.intentId})`,
    target: command.slice(0, 48),
    status: cogResult.requiresConfirmation ? 'pending_confirmation' : 'completed',
    detail: `${cogResult.language} · conf ${cogResult.confidence} · ${cogResult.provenance}`,
  });

  onEvent({
    type: 'done',
    userMessage,
    assistantMessage,
    activeAgents: cogResult.agents,
  });

  return {
    userMessage,
    assistantMessage,
    activeAgents: cogResult.agents,
  };
}

export async function runAssistantCommand(
  commandOrParams: string | { command: string; confirmedAction?: boolean },
  _settings?: unknown
) {
  const command = typeof commandOrParams === 'string' ? commandOrParams : commandOrParams.command;
  const confirmedAction = typeof commandOrParams === 'string' ? false : Boolean(commandOrParams.confirmedAction);
  return streamAssistantCommand({
    command,
    confirmedAction,
    onEvent: () => {},
  });
}

export async function runBrowserResearch(
  queryOrParams:
    | string
    | {
        query: string;
        mode: 'web' | 'news' | 'docs' | 'video';
        url?: string;
      },
  urlArg?: string,
  _modelArg?: string,
  modeArg?: 'web' | 'news' | 'docs' | 'video'
) {
  const db = loadDb();
  const query = (typeof queryOrParams === 'string' ? queryOrParams : queryOrParams.query)?.trim() || '';
  const url = (typeof queryOrParams === 'string' ? urlArg : queryOrParams.url)?.trim() || '';
  const mode = (typeof queryOrParams === 'string' ? modeArg : queryOrParams.mode) || 'web';

  let pageExtract: WebPageExtract | null = null;
  let searchResults: WebSearchResultItem[] = [];
  const collectedSources: GroundingSource[] = [];

  if (url) {
    try {
      pageExtract = await fetchPublicWebPage(url);
      collectedSources.push({ title: pageExtract.title, uri: pageExtract.uri });
    } catch (err) {
      return {
        summary: `Unable to fetch "${url}": ${(err as Error).message}`,
        sources: [],
      };
    }
  } else if (query) {
    const res = await searchFreeWeb(query, mode);
    if (!res.online) {
      return {
        summary:
          res.error ||
          `Network is currently offline. Live web research for "${query}" cannot run offline.`,
        sources: [],
      };
    }
    searchResults = res.results;
    for (const r of searchResults) {
      collectedSources.push({ title: r.title, uri: r.uri });
    }
  }

  let summary = '';
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
  const lineCount = safeContent.split(/\r?\n/).length;
  const excerpt = buildExtractiveSummary(safeContent, params.question, 6);
  const summary = `Local Cognitive Summary of "${params.fileName}" (${lineCount} lines, ${safeContent.length} chars):\n\n${excerpt}`;

  appendActionLog(db, {
    agent: 'file',
    action: 'Local File Analysis',
    target: params.fileName,
    status: 'completed',
  });

  return { summary };
}

export async function generateDailyBriefing(_model?: string) {
  const db = loadDb();
  const telemetry = await getSystemTelemetry().catch(() => null);
  const weather = await getWeatherForLocation(db.settings.weatherLocation).catch(() => null);
  const today = new Date().toISOString().slice(0, 10);
  const events = db.calendar.filter((e) => e.date >= today).slice(0, 8);

  const scheduleBlock =
    events.length > 0
      ? events.map((e) => `• ${e.date} ${e.time} — ${e.title} (${e.completed ? 'completed' : e.category})`).join('\n')
      : '• No upcoming events scheduled.';
  const weatherLine = weather
    ? `${weather.location}: ${weather.temperature}°C (${weather.condition}), wind ${weather.windSpeedKmh} km/h`
    : 'Weather telemetry unavailable (offline or unreachable).';
  const sysLine = telemetry
    ? `CPU ${telemetry.cpuLoad}% · RAM ${telemetry.ramPercent}% (${telemetry.ramUsedGb}/${telemetry.ramTotalGb} GB) · Storage ${telemetry.storagePercent}%`
    : 'System sensors ready.';
  const briefing = `Good day, ${db.settings.userName}. Here is your Cognitive Engine briefing for ${today}:\n\nWeather: ${weatherLine}\nSystem Readiness: ${sysLine}\n\nUpcoming Schedule:\n${scheduleBlock}`;

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
  const isPdf = params.mimeType === 'application/pdf';
  const isAudio = params.mimeType.startsWith('audio/');
  const isImage = params.mimeType.startsWith('image/');
  const rawBuffer = Buffer.from(params.base64Data, 'base64');

  if (isPdf) {
    try {
      const parsed = await extractPdfTextFromBuffer(rawBuffer);
      if (parsed.isScannedImageOnly) {
        appendActionLog(db, {
          agent: 'media',
          action: 'PDF Inspection (Scanned)',
          target: `${parsed.numPages} page(s)`,
          status: 'completed',
        });
        return {
          analysis: `PDF detected (${parsed.numPages} page${parsed.numPages === 1 ? '' : 's'}), but no embedded text layer was found (appears to be a scanned/image-only PDF).`,
          modelUsed: 'local-pdf-parser',
        };
      }
      const summarized = await summarizeLocalFile({
        fileName: parsed.title || 'Uploaded Document.pdf',
        content: parsed.text,
        question: params.prompt || undefined,
      });
      return {
        analysis: `PDF Analysis (${parsed.numPages} page${parsed.numPages === 1 ? '' : 's'}):\n\n${summarized.summary}`,
        modelUsed: 'local-pdf-parser',
      };
    } catch (err) {
      return {
        analysis: `Could not parse PDF payload locally: ${(err as Error).message}`,
        modelUsed: 'local-pdf-parser',
      };
    }
  }

  if (isAudio) {
    const wavInfo = inspectWavAudioBuffer(rawBuffer);
    if (process.platform === 'win32' && wavInfo.isRiffWave) {
      const stt = await recognizeWindowsSpeechFromWav(params.base64Data, db.settings.language || 'en-US');
      if (stt.ok && stt.text) {
        appendActionLog(db, {
          agent: 'media',
          action: 'Local Audio Transcription',
          target: params.mimeType,
          status: 'completed',
        });
        return {
          analysis: `Transcript (${wavInfo.durationSec ?? '?'}s WAV, ${wavInfo.sampleRate} Hz):\n${stt.text}`,
          modelUsed: stt.engine,
        };
      }
    }

    const detail = wavInfo.isRiffWave
      ? `WAV audio (${wavInfo.durationSec ?? '?'}s, ${wavInfo.channels}ch, ${wavInfo.sampleRate} Hz, ${wavInfo.bitsPerSample}-bit, ${wavInfo.sizeKb} KB)`
      : `${params.mimeType} audio (${wavInfo.sizeKb} KB)`;
    return {
      analysis: `Inspected ${detail}. Offline transcription uses Windows System.Speech (PCM WAV on Windows 10/11) or Web Speech API in browser. For multilingual Hindi/Hinglish offline STT, connect a local whisper.cpp / Vosk adapter via LOCAL_SPEECH_MODEL_DIR.`,
      modelUsed: 'local-audio-inspector',
    };
  }

  if (isImage) {
    const imgMeta = inspectImageDimensions(rawBuffer, params.mimeType);
    const dims = imgMeta.width && imgMeta.height ? `${imgMeta.width}×${imgMeta.height}px` : 'dimensions unknown';
    appendActionLog(db, {
      agent: 'vision',
      action: 'Local Image Inspection',
      target: `${imgMeta.format} (${dims})`,
      status: 'completed',
    });
    return {
      analysis: `Captured ${imgMeta.format} visual payload (${dims}, ${imgMeta.sizeKb} KB). Prompt: "${
        params.prompt || 'Inspect image'
      }". Local image metadata inspection completed offline (no external cloud vision APIs are used).`,
      modelUsed: 'local-image-inspector',
    };
  }

  const sizeKb = Math.max(1, Math.round(rawBuffer.length / 1024));
  return {
    analysis: `Inspected ${params.mimeType} payload (${sizeKb} KB) locally.`,
    modelUsed: 'friday-cognitive-engine',
  };
}

export async function synthesizeSpeechWav(
  _text: string,
  _voiceName: string
): Promise<{ audioBase64: string | null; localFallback: boolean; reason?: string }> {
  return {
    audioBase64: null,
    localFallback: true,
    reason: 'Using self-owned local Windows System.Speech / Browser Web SpeechSynthesis.',
  };
}

export async function transcribeAudioBase64(
  base64Data: string,
  mimeType: string,
  language = 'en-US'
): Promise<{ text: string; localFallback: boolean; engine?: string; reason?: string }> {
  const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';

  if (process.platform === 'win32' && cleanMime.includes('wav')) {
    const winStt = await recognizeWindowsSpeechFromWav(base64Data, language);
    if (winStt.ok && winStt.text) {
      return {
        text: winStt.text,
        localFallback: false,
        engine: winStt.engine,
      };
    }
    return {
      text: '',
      localFallback: true,
      engine: winStt.engine,
      reason:
        winStt.error ||
        'Windows Speech Recognition could not detect clear speech or lacks the requested language pack.',
    };
  }

  return {
    text: '',
    localFallback: true,
    reason:
      process.platform === 'win32'
        ? 'Send PCM WAV audio for offline Windows System.Speech recognition, or use Web Speech API in-app.'
        : 'Server WAV transcription uses Windows System.Speech on Windows 10/11; browser Web Speech API handles live capture here.',
  };
}
