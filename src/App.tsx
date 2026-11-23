import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { buildAgentList } from './core/agentRegistry';
import { extractVoiceCommand, isInterruptionCommand } from './core/intentEngine';
import {
  executeClientConfirmAction,
  executeClientOfflineCommand,
  fetchOpenMeteoClientWeather,
  isAndroidHost,
  loadLocalClientState,
  readDeviceTelemetryFallback,
  saveLocalClientState,
  unwrapAndroidBridgeReply,
  type LocalClientState,
} from './core/localClientEngine';
import type {
  ActionLogEntry,
  AgentId,
  ApiConnectionStatus,
  AssistantSettings,
  AutomationWorkflow,
  CalendarEvent,
  ChatMessage,
  DesktopAppItem,
  FridayAndroidBridge,
  HologramSettings,
  MemoryItem,
  NavSection,
  NoteItem,
  SystemTelemetry,
  TodoItem,
  VoiceState,
  WeatherData,
} from './core/types';
import { LiveWallpaper } from './components/LiveWallpaper';
import { LeftSidebar } from './components/LeftSidebar';
import { TopHudBar } from './components/TopHudBar';
import { BottomQuickActions } from './components/BottomQuickActions';
import { CommandWorkspace } from './components/CommandWorkspace';
import {
  AIChatFullView,
  SystemMonitorFullView,
} from './components/views/DashboardDetailViews';
import {
  AICoreView,
  ApplicationsView,
  TasksWorkflowsView,
  VoiceAssistantView,
} from './components/views/CoreAndVoiceViews';
import {
  BrowserIntelligenceView,
  FileExplorerView,
} from './components/views/IntelligenceViews';
import {
  CalendarView,
  ChatHistoryView,
  MemoryView,
  SettingsView,
} from './components/views/PersonalViews';

declare global {
  interface Window {
    fridayDesktop?: {
      hideToDesktop: () => Promise<{ hidden: boolean }>;
      restoreWindow: () => Promise<{ visible: boolean }>;
      minimizeWindow?: () => Promise<{ minimized: boolean }>;
      toggleMaximize?: () => Promise<{ maximized: boolean }>;
      setFullscreen?: (enabled: boolean) => Promise<unknown>;
      setFloatingMode?: (enabled: boolean) => Promise<unknown>;
      setStartupLaunch?: (enabled: boolean) => Promise<unknown>;
      updateReopenShortcut?: (shortcut: string) => Promise<{ registered: boolean; shortcut: string }>;
      getDesktopState?: () => Promise<{
        fullscreen: boolean;
        maximized: boolean;
        floatingMode: boolean;
        reopenShortcut: string;
        openAtLogin: boolean;
      }>;
      quitApp?: () => Promise<{ quitting: boolean }>;
      isDesktopShell: boolean;
    };
    fridayAndroid?: FridayAndroidBridge;
    __fridayAndroidEvents?: {
      onInterimText?: (text: string) => void;
      onRecognizedText?: (text: string) => void;
      onListeningState?: (active: boolean, status?: string) => void;
      onSpeechState?: (speaking: boolean) => void;
    };
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

interface SpeechRecognitionResultEvent {
  resultIndex?: number;
  results: ArrayLike<{
    isFinal?: boolean;
    0?: { transcript: string };
  }>;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const DEFAULT_SETTINGS: AssistantSettings = {
  assistantName: 'F.R.I.D.A.Y.',
  userName: 'Siddesh',
  wakeWord: 'Hey Friday',
  aiModel: 'local-auto',
  ollamaModel: '',
  voiceName: 'Kore',
  voiceGender: 'female',
  speakingSpeed: 1.0,
  speakingPitch: 1.0,
  language: 'en-US',
  continuousListening: false,
  wakeWordEnabled: true,
  autoSpeakReplies: false,
  pushToTalkKey: 'Space',
  reopenShortcut: 'Ctrl+Shift+Space',
  startFullscreen: true,
  launchOnStartup: false,
  themeAccent: 'violet',
  animationQuality: 'high',
  weatherLocation: 'Kolhapur, MH',
  allowedFolders: ['.'],
  pausedIndexing: false,
  screenCaptureConsent: false,
  wallpaper: {
    mode: 'aurora-command',
    blurPx: 0,
    brightnessPercent: 95,
    opacityPercent: 92,
    performanceMode: false,
  },
  hologram: {
    mode: 'orbital',
    projectionBeam: true,
    scanlineIntensity: 0.55,
    holoOpacity: 0.85,
    autoRotate: true,
  },
  enabledAgents: {
    core: true,
    voice: true,
    system: true,
    file: true,
    browser: true,
    application: true,
    vision: true,
    media: true,
    calendar: true,
    memory: true,
    automation: true,
  },
};

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('command-center');
  const [voiceState, setVoiceState] = useState<VoiceState>('standby');
  const [audioLevel, setAudioLevel] = useState(0);
  const [settings, setSettings] = useState<AssistantSettings>(DEFAULT_SETTINGS);
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>(() => loadLocalClientState(DEFAULT_SETTINGS).notes);
  const [todos, setTodos] = useState<TodoItem[]>(() => loadLocalClientState(DEFAULT_SETTINGS).todos);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLogEntry[]>([]);
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [apps, setApps] = useState<DesktopAppItem[]>([]);
  const backendAvailableRef = useRef<boolean>(true);
  const [telemetry, setTelemetry] = useState<SystemTelemetry | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [activeAgents, setActiveAgents] = useState<AgentId[]>([]);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [launchNotice, setLaunchNotice] = useState<string | null>(null);
  const [runningWorkflowId, setRunningWorkflowId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiConnectionStatus>({
    connected: true,
    checking: true,
    provider: 'F.R.I.D.A.Y. Local Core + Free Web',
    model: 'local-auto',
    engine: 'local-core',
    freeWebReady: true,
    requiresPaidKey: false,
  });
  const [hiddenToDesktop, setHiddenToDesktop] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micRafRef = useRef<number>(0);
  const speechQueueRef = useRef<string[]>([]);
  const speechActiveRef = useRef<boolean>(false);

  const snapshotLocalState = useCallback(
    (overrides?: Partial<LocalClientState>): LocalClientState => {
      const existing = loadLocalClientState(settings);
      return {
        ...existing,
        settings,
        calendar,
        memory,
        notes,
        todos,
        chatHistory: messages,
        actionLogs,
        workflows,
        apps,
        ...overrides,
      };
    },
    [actionLogs, apps, calendar, memory, messages, notes, settings, todos, workflows]
  );

  const checkApiConnection = useCallback(async (force = false) => {
    setApiStatus((prev) => ({ ...prev, checking: true }));
    if (isAndroidHost()) {
      backendAvailableRef.current = false;
      setApiStatus({
        connected: true,
        checking: false,
        provider: 'F.R.I.D.A.Y. Android Local Core',
        model: 'offline-local-v2',
        engine: 'local-core',
        freeWebReady: typeof navigator !== 'undefined' ? navigator.onLine : true,
        requiresPaidKey: false,
        latencyMs: 1,
      });
      return;
    }
    try {
      const res = await fetch(`/api/health/ai${force ? '?refresh=1' : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      backendAvailableRef.current = true;
      setApiStatus({
        connected: Boolean(data.connected),
        checking: false,
        provider: data.provider || 'F.R.I.D.A.Y. Local Core + Free Web',
        model: data.model || 'local-core-v2',
        engine: data.engine || 'local-core',
        freeWebReady: data.freeWebReady ?? true,
        requiresPaidKey: data.requiresPaidKey ?? false,
        latencyMs: data.latencyMs,
        error: data.error,
      });
    } catch {
      backendAvailableRef.current = false;
      setApiStatus({
        connected: true,
        checking: false,
        provider: 'F.R.I.D.A.Y. Standalone Local Core',
        model: 'offline-local-v2',
        engine: 'local-core',
        freeWebReady: typeof navigator !== 'undefined' ? navigator.onLine : false,
        requiresPaidKey: false,
        latencyMs: 1,
      });
    }
  }, []);

  const refreshBootstrap = useCallback(async () => {
    if (isAndroidHost()) {
      backendAvailableRef.current = false;
      const local = loadLocalClientState(DEFAULT_SETTINGS);
      setSettings(local.settings);
      setCalendar(local.calendar);
      setMemory(local.memory);
      setNotes(local.notes);
      setTodos(local.todos);
      setMessages(local.chatHistory);
      setActionLogs(local.actionLogs);
      setWorkflows(local.workflows);
      setApps(local.apps);
      return;
    }
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      backendAvailableRef.current = true;
      if (data.settings) setSettings({ speakingPitch: 1.0, ...data.settings });
      if (data.calendar) setCalendar(data.calendar);
      if (data.memory) setMemory(data.memory);
      if (data.chatHistory) setMessages(data.chatHistory);
      if (data.actionLogs) setActionLogs(data.actionLogs);
      if (data.workflows) setWorkflows(data.workflows);
      if (data.apps) setApps(data.apps);
    } catch {
      backendAvailableRef.current = false;
      const local = loadLocalClientState(DEFAULT_SETTINGS);
      setSettings(local.settings);
      setCalendar(local.calendar);
      setMemory(local.memory);
      setNotes(local.notes);
      setTodos(local.todos);
      setMessages(local.chatHistory);
      setActionLogs(local.actionLogs);
      setWorkflows(local.workflows);
      setApps(local.apps);
    }
  }, []);

  useEffect(() => {
    refreshBootstrap();
    checkApiConnection(false);
  }, [refreshBootstrap, checkApiConnection]);

  // Real system telemetry polling (falls back to native Android / Web Battery API when standalone)
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (backendAvailableRef.current && !isAndroidHost()) {
        try {
          const res = await fetch('/api/telemetry');
          if (res.ok) {
            const data = (await res.json()) as SystemTelemetry;
            if (!mounted) return;
            setTelemetry(data);
            setCpuHistory((prev) => [...prev.slice(-23), data.cpuLoad]);
            return;
          }
        } catch {
          // Fall through to client telemetry fallback
        }
      }
      const fallbackTel = await readDeviceTelemetryFallback();
      if (!mounted) return;
      setTelemetry(fallbackTel);
      setCpuHistory((prev) => [...prev.slice(-23), fallbackTel.cpuLoad]);
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  // Live weather polling (falls back to CORS-safe Open-Meteo when running offline/APK)
  useEffect(() => {
    let mounted = true;
    const loadWeather = async () => {
      setWeatherError(null);
      if (backendAvailableRef.current && !isAndroidHost()) {
        try {
          const res = await fetch(`/api/weather?location=${encodeURIComponent(settings.weatherLocation)}`);
          if (res.ok) {
            const data = await res.json();
            if (mounted) setWeather(data);
            return;
          }
        } catch {
          // Fall through to client Open-Meteo lookup
        }
      }
      const directWeather = await fetchOpenMeteoClientWeather(settings.weatherLocation);
      if (!mounted) return;
      if (directWeather) {
        setWeather(directWeather);
      } else {
        setWeatherError('Weather unavailable offline');
      }
    };
    loadWeather();
    return () => {
      mounted = false;
    };
  }, [settings.weatherLocation]);

  // ESC key hides F.R.I.D.A.Y. to desktop, Ctrl+Shift+Space / Ctrl+Space restores
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';

      if (e.key === 'Escape' && !isInput) {
        e.preventDefault();
        setHiddenToDesktop((prev) => !prev);
        window.fridayDesktop?.hideToDesktop().catch(() => {});
      } else if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        setHiddenToDesktop(false);
        window.fridayDesktop?.restoreWindow().catch(() => {});
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const stopSpeaking = useCallback(() => {
    speechQueueRef.current = [];
    speechActiveRef.current = false;
    window.fridayAndroid?.stopSpeaking?.();
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setAudioLevel(0);
    setVoiceState((curr) => (curr === 'speaking' ? 'standby' : curr));
  }, []);

  const selectBestSpeechVoice = useCallback(
    (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
      if (!voices.length) return null;
      const targetLang = settings.language.toLowerCase();
      const baseLang = targetLang.split('-')[0];
      const preferFemale = settings.voiceGender !== 'male';
      const femaleHints = ['zira', 'aria', 'jenny', 'samantha', 'victoria', 'karen', 'swara', 'lekha', 'heera', 'kalpana', 'female', 'woman'];
      const maleHints = ['david', 'mark', 'guy', 'rishi', 'prabhat', 'daniel', 'george', 'male', 'man'];

      let best: SpeechSynthesisVoice | null = null;
      let bestScore = -1;
      for (const v of voices) {
        let score = 0;
        const vLang = v.lang.toLowerCase();
        const vName = v.name.toLowerCase();
        if (vLang === targetLang) score += 50;
        else if (vLang.startsWith(baseLang)) score += 30;
        if (v.localService) score += 8;
        if (vName.includes('natural') || vName.includes('neural') || vName.includes('online')) score += 10;
        const isFemaleName = femaleHints.some((h) => vName.includes(h));
        const isMaleName = maleHints.some((h) => vName.includes(h));
        if (preferFemale && isFemaleName) score += 20;
        if (!preferFemale && isMaleName) score += 20;
        if (preferFemale && isMaleName) score -= 12;
        if (!preferFemale && isFemaleName) score -= 12;
        if (score > bestScore) {
          bestScore = score;
          best = v;
        }
      }
      return best;
    },
    [settings.language, settings.voiceGender]
  );

  const pumpLocalSpeechQueue = useCallback(() => {
    if (speechActiveRef.current) return;
    const nextSentence = speechQueueRef.current.shift();
    if (!nextSentence) {
      setIsSpeaking(false);
      setAudioLevel(0);
      setVoiceState((curr) => (curr === 'speaking' ? 'standby' : curr));
      return;
    }

    if (window.fridayAndroid?.speak) {
      speechActiveRef.current = true;
      setIsSpeaking(true);
      setVoiceState('speaking');
      setAudioLevel(0.6);
      window.fridayAndroid.speak(
        nextSentence,
        settings.language,
        settings.voiceGender,
        settings.speakingSpeed,
        settings.speakingPitch ?? 1.0
      );
      return;
    }

    if (!('speechSynthesis' in window)) return;
    speechActiveRef.current = true;
    setIsSpeaking(true);
    setVoiceState('speaking');
    setAudioLevel(0.6);

    const utter = new SpeechSynthesisUtterance(nextSentence);
    utter.rate = settings.speakingSpeed;
    utter.pitch = settings.speakingPitch ?? 1.0;
    utter.lang = settings.language;
    const matchedVoice = selectBestSpeechVoice(window.speechSynthesis.getVoices());
    if (matchedVoice) utter.voice = matchedVoice;

    utter.onend = () => {
      speechActiveRef.current = false;
      setTimeout(() => {
        pumpLocalSpeechQueue();
      }, 85);
    };
    utter.onerror = () => {
      speechActiveRef.current = false;
      pumpLocalSpeechQueue();
    };
    window.speechSynthesis.speak(utter);
  }, [selectBestSpeechVoice, settings.language, settings.speakingPitch, settings.speakingSpeed, settings.voiceGender]);

  const enqueueLocalSpeech = useCallback(
    (sentence: string) => {
      const clean = sentence.replace(/[*_`#]/g, '').trim();
      if (!clean) return;
      if (!window.fridayAndroid?.speak && !('speechSynthesis' in window)) return;
      speechQueueRef.current.push(clean);
      pumpLocalSpeechQueue();
    },
    [pumpLocalSpeechQueue]
  );

  const speakText = useCallback(
    async (text: string) => {
      stopSpeaking();
      const cleanText = text.replace(/[*_`#]/g, '').trim();
      if (!cleanText) return;

      if (window.fridayAndroid?.speak) {
        const sentences = cleanText.match(/[^.!?\n]+[.!?\n]*/g) ?? [cleanText];
        for (const s of sentences) {
          if (s.trim()) speechQueueRef.current.push(s.trim());
        }
        pumpLocalSpeechQueue();
        return;
      }

      // Fast path: instant local Device/Browser SpeechSynthesis unless Gemini TTS is active
      if (apiStatus.engine !== 'gemini' && 'speechSynthesis' in window) {
        const sentences = cleanText.match(/[^.!?\n]+[.!?\n]*/g) ?? [cleanText];
        for (const s of sentences) {
          if (s.trim()) speechQueueRef.current.push(s.trim());
        }
        pumpLocalSpeechQueue();
        return;
      }

      setVoiceState('speaking');
      setIsSpeaking(true);
      try {
        const res = await fetch('/api/voice/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText, voiceName: settings.voiceName }),
        });
        const data = await res.json();
        if (res.ok && data.audioBase64) {
          const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
          audio.playbackRate = settings.speakingSpeed;
          audioElRef.current = audio;
          audio.onended = () => {
            setIsSpeaking(false);
            setAudioLevel(0);
            setVoiceState('completed');
            setTimeout(() => setVoiceState('standby'), 1400);
          };
          audio.onerror = () => {
            setIsSpeaking(false);
            setVoiceState('standby');
          };
          await audio.play();
          return;
        }
      } catch {
        // Fallback below
      }

      if ('speechSynthesis' in window) {
        enqueueLocalSpeech(cleanText);
      } else {
        setIsSpeaking(false);
        setVoiceState('standby');
      }
    },
    [
      apiStatus.engine,
      enqueueLocalSpeech,
      pumpLocalSpeechQueue,
      settings.speakingSpeed,
      settings.voiceName,
      stopSpeaking,
    ]
  );

  const handleSubmitCommand = useCallback(
    async (command: string): Promise<boolean> => {
      const cleanCmd = command.trim();
      if (!cleanCmd) return false;

      if (isInterruptionCommand(cleanCmd)) {
        abortRef.current?.abort();
        stopSpeaking();
        setActiveAgents([]);
        setVoiceState('standby');
        setLiveTranscript('Interrupted — standing by.');
        return false;
      }

      abortRef.current?.abort();
      stopSpeaking();
      setErrorBanner(null);
      setVoiceState('processing');
      setActiveAgents(['core']);

      const controller = new AbortController();
      abortRef.current = controller;

      const tempUserId = `msg-temp-u-${Date.now()}`;
      const tempAssistantId = `msg-temp-a-${Date.now()}`;
      const optimisticUser: ChatMessage = {
        id: tempUserId,
        role: 'user',
        content: cleanCmd,
        timestamp: new Date().toISOString(),
      };
      const optimisticAssistant: ChatMessage = {
        id: tempAssistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticUser, optimisticAssistant]);

      let speechBuffer = '';
      let streamedAnyText = false;

      const runClientFallback = async (): Promise<boolean> => {
        const result = await executeClientOfflineCommand(cleanCmd, snapshotLocalState());
        setCalendar(result.nextState.calendar);
        setMemory(result.nextState.memory);
        setNotes(result.nextState.notes);
        setTodos(result.nextState.todos);
        setActionLogs(result.nextState.actionLogs);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempUserId
              ? result.userMessage
              : m.id === tempAssistantId
                ? result.assistantMessage
                : m
          )
        );
        setActiveAgents(result.activeAgents);
        if (result.speakText) {
          speakText(result.speakText);
        } else if (settings.autoSpeakReplies && result.assistantMessage.content) {
          speakText(result.assistantMessage.content);
        } else {
          setVoiceState('completed');
          setTimeout(() => {
            setVoiceState((curr) => (curr === 'completed' ? 'standby' : curr));
            setActiveAgents([]);
          }, 1400);
        }
        return true;
      };

      if (isAndroidHost() || !backendAvailableRef.current) {
        try {
          return await runClientFallback();
        } finally {
          abortRef.current = null;
        }
      }

      try {
        const res = await fetch('/api/assistant/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cleanCmd }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          backendAvailableRef.current = false;
          return await runClientFallback();
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          const frames = sseBuffer.split('\n\n');
          sseBuffer = frames.pop() ?? '';

          for (const frame of frames) {
            const line = frame
              .split('\n')
              .find((l) => l.startsWith('data:'));
            if (!line) continue;
            const rawJson = line.slice(5).trim();
            if (!rawJson) continue;
            let ev: {
              type?: string;
              phase?: string;
              agents?: AgentId[];
              token?: string;
              userMessage?: ChatMessage;
              assistantMessage?: ChatMessage;
              activeAgents?: AgentId[];
              error?: string;
            };
            try {
              ev = JSON.parse(rawJson);
            } catch {
              continue;
            }

            if (ev.type === 'status') {
              if (ev.agents) setActiveAgents(ev.agents);
              setVoiceState(ev.phase === 'searching' ? 'searching' : 'executing');
            } else if (ev.type === 'token' && ev.token) {
              streamedAnyText = true;
              const tok = ev.token;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId ? { ...m, content: m.content + tok } : m
                )
              );

              if (settings.autoSpeakReplies) {
                speechBuffer += tok;
                const match = speechBuffer.match(/^([\s\S]*?[.!?](?:\s+|$)|\S[\s\S]{18,}?\n)/);
                if (match && match[1].trim().length >= 12) {
                  enqueueLocalSpeech(match[1]);
                  speechBuffer = speechBuffer.slice(match[1].length);
                }
              }
            } else if (ev.type === 'done' && ev.userMessage && ev.assistantMessage) {
              const finalUser = ev.userMessage;
              const finalAssistant = ev.assistantMessage;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempUserId
                    ? finalUser
                    : m.id === tempAssistantId
                      ? finalAssistant
                      : m
                )
              );
              setActiveAgents(ev.activeAgents ?? ['core']);

              if (finalAssistant.intent === 'read_aloud' && finalAssistant.content) {
                speakText(finalAssistant.content);
              } else if (settings.autoSpeakReplies) {
                if (speechBuffer.trim()) {
                  enqueueLocalSpeech(speechBuffer);
                  speechBuffer = '';
                } else if (!streamedAnyText && finalAssistant.content) {
                  speakText(finalAssistant.content);
                }
              } else {
                setVoiceState('completed');
                setTimeout(() => {
                  setVoiceState((curr) => (curr === 'completed' ? 'standby' : curr));
                  setActiveAgents([]);
                }, 1400);
              }

              // Refresh full state in background only if persistent lists mutated
              if (
                finalAssistant.intent === 'memory_manage' ||
                finalAssistant.intent === 'calendar_schedule' ||
                finalAssistant.intent === 'alarm_reminder' ||
                finalAssistant.intent === 'note_todo' ||
                finalAssistant.intent === 'workflow_run'
              ) {
                void refreshBootstrap();
              }
            } else if (ev.type === 'error') {
              throw new Error(ev.error || 'Command stream error');
            }
          }
        }
        return true;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setVoiceState('standby');
          return false;
        }
        // Network disconnect fallback (works offline and inside Android APK)
        backendAvailableRef.current = false;
        return await runClientFallback();
      } finally {
        abortRef.current = null;
      }
    },
    [enqueueLocalSpeech, refreshBootstrap, settings.autoSpeakReplies, snapshotLocalState, speakText, stopSpeaking]
  );

  const handleConfirmAction = useCallback(
    async (actionType: string, summary: string, approved: boolean) => {
      setVoiceState('executing');
      if (isAndroidHost() || !backendAvailableRef.current) {
        const res = executeClientConfirmAction(actionType, summary, approved, snapshotLocalState());
        setCalendar(res.nextState.calendar);
        setMessages(res.nextState.chatHistory);
        setVoiceState('completed');
        setTimeout(() => setVoiceState('standby'), 1500);
        return;
      }
      try {
        const res = await fetch('/api/assistant/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionType, summary, approved }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Confirmation failed');
        if (data.message) {
          setMessages((prev) => [...prev, data.message]);
        }
        await refreshBootstrap();
        setVoiceState('completed');
        setTimeout(() => setVoiceState('standby'), 1500);
      } catch {
        const res = executeClientConfirmAction(actionType, summary, approved, snapshotLocalState());
        setCalendar(res.nextState.calendar);
        setMessages(res.nextState.chatHistory);
        setVoiceState('completed');
        setTimeout(() => setVoiceState('standby'), 1500);
      }
    },
    [refreshBootstrap, snapshotLocalState]
  );

  const stopMicCapture = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore already-stopped instance
    }
    recognitionRef.current = null;
    cancelAnimationFrame(micRafRef.current);
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    setIsListening(false);
    setAudioLevel(0);
    setVoiceState((curr) => (curr === 'listening' ? 'standby' : curr));
  }, []);

  const toggleRecordAudio = useCallback(async () => {
    if (isRecordingAudio) {
      mediaRecorderRef.current?.stop();
      setIsRecordingAudio(false);
      return;
    }

    stopSpeaking();
    stopMicCapture();
    setErrorBanner(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorBanner('Microphone recording is unavailable or blocked in this browser window. Check site microphone permission or use text input.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      try {
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (!micStreamRef.current) return;
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(Math.min(1, avg / 96));
          micRafRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      } catch {
        setAudioLevel(0.45);
      }

      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        cancelAnimationFrame(micRafRef.current);
        stream.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          audioCtxRef.current.close().catch(() => {});
        }
        audioCtxRef.current = null;
        setAudioLevel(0);
        setIsListening(false);

        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 200) {
          setLiveTranscript('No audio captured — hold or speak for 1-2 seconds before stopping.');
          setVoiceState('standby');
          return;
        }
        setVoiceState('processing');
        setLiveTranscript('Transcribing your voice with Gemini...');
        try {
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          const res = await fetch('/api/voice/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64Data, mimeType: blob.type || 'audio/webm' }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Voice transcription failed');
          if (data.localFallback && !data.text) {
            setLiveTranscript(
              data.reason || 'Audio recording transcription requires Gemini key; use live Microphone speech recognition or text command.'
            );
            setVoiceState('standby');
            return;
          }
          const rawText = String(data.text || '').trim();
          if (rawText) {
            const parsedVoice = extractVoiceCommand(rawText, settings.wakeWord, false);
            setLiveTranscript(`Heard: "${parsedVoice.command}"`);
            await handleSubmitCommand(parsedVoice.command);
          } else {
            setLiveTranscript('Could not detect speech — try speaking a little louder.');
            setVoiceState('standby');
          }
        } catch (err) {
          setVoiceState('error');
          setLiveTranscript(null);
          setErrorBanner((err as Error).message);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingAudio(true);
      setIsListening(true);
      setVoiceState('listening');
      setLiveTranscript('Recording voice memo — speak now, then click Mic to send.');
    } catch (err) {
      setErrorBanner(`Microphone permission denied or unavailable: ${(err as Error).message}`);
      setIsRecordingAudio(false);
      setIsListening(false);
    }
  }, [handleSubmitCommand, isRecordingAudio, settings.wakeWord, stopMicCapture, stopSpeaking]);

  const toggleListening = useCallback(async () => {
    if (isRecordingAudio) {
      await toggleRecordAudio();
      return;
    }
    if (isListening) {
      stopMicCapture();
      setLiveTranscript(null);
      return;
    }

    stopSpeaking();
    setErrorBanner(null);

    if (window.fridayAndroid?.startListening) {
      setIsListening(true);
      setVoiceState('listening');
      setAudioLevel(0.45);
      setLiveTranscript(`Listening (${settings.language}) via Android Voice...`);
      window.fridayAndroid.startListening(settings.language, true);
      return;
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      if (apiStatus.engine === 'gemini') {
        await toggleRecordAudio();
      } else {
        setLiveTranscript('Voice recognition is ready on Android APK and Chrome/Edge; you can also type your command below.');
      }
      return;
    }

    const rec = new SpeechRec();
    rec.continuous = settings.continuousListening;
    rec.interimResults = true;
    rec.lang = settings.language;

    rec.onaudiostart = () => {
      setAudioLevel(0.35);
      setLiveTranscript(`Listening (${settings.language}) — speak your command...`);
    };

    rec.onspeechstart = () => {
      setAudioLevel(0.75);
    };

    rec.onresult = (event) => {
      const startIdx = event.resultIndex ?? 0;
      let interim = '';
      let finalText = '';
      for (let i = startIdx; i < event.results.length; i += 1) {
        const resItem = event.results[i];
        const piece = resItem?.[0]?.transcript?.trim() || '';
        if (!piece) continue;
        if (resItem?.isFinal) {
          finalText = `${finalText} ${piece}`.trim();
        } else {
          interim = `${interim} ${piece}`.trim();
        }
      }

      if (interim) {
        setAudioLevel(0.8);
        setLiveTranscript(`Hearing: "${interim}"`);
        if (isInterruptionCommand(interim)) {
          abortRef.current?.abort();
          stopSpeaking();
        }
      }

      if (finalText) {
        if (isInterruptionCommand(finalText)) {
          abortRef.current?.abort();
          stopSpeaking();
          setLiveTranscript('Stopped speaking.');
          if (!settings.continuousListening) stopMicCapture();
          return;
        }
        const parsedVoice = extractVoiceCommand(finalText, settings.wakeWord, false);
        if (parsedVoice.matched && parsedVoice.command) {
          setLiveTranscript(`Heard: "${parsedVoice.command}"`);
          if (!settings.continuousListening) {
            stopMicCapture();
          }
          handleSubmitCommand(parsedVoice.command);
        }
      }
    };

    rec.onerror = (ev) => {
      if (
        (ev.error === 'network' ||
          ev.error === 'service-not-allowed' ||
          ev.error === 'audio-capture' ||
          ev.error === 'language-not-supported') &&
        apiStatus.engine === 'gemini'
      ) {
        stopMicCapture();
        toggleRecordAudio();
        return;
      }
      if (ev.error === 'no-speech') {
        setLiveTranscript('No speech heard — click Mic and try again.');
        stopMicCapture();
        return;
      }
      if (ev.error === 'aborted') {
        stopMicCapture();
        return;
      }
      setLiveTranscript(`Voice input status (${ev.error}). Ensure microphone permission is allowed or type your command.`);
      stopMicCapture();
    };

    rec.onend = () => {
      if (!settings.continuousListening) {
        stopMicCapture();
      }
    };

    try {
      recognitionRef.current = rec;
      setIsListening(true);
      setVoiceState('listening');
      setLiveTranscript(`Listening (${settings.language}) — speak your command...`);
      rec.start();
    } catch {
      stopMicCapture();
      if (apiStatus.engine === 'gemini') {
        await toggleRecordAudio();
      }
    }
  }, [
    apiStatus.engine,
    handleSubmitCommand,
    isListening,
    isRecordingAudio,
    settings.continuousListening,
    settings.language,
    settings.wakeWord,
    stopMicCapture,
    stopSpeaking,
    toggleRecordAudio,
  ]);

  const handleStopExecution = useCallback(() => {
    abortRef.current?.abort();
    if (isRecordingAudio) {
      mediaRecorderRef.current?.stop();
      setIsRecordingAudio(false);
    }
    stopSpeaking();
    stopMicCapture();
    setActiveAgents([]);
    setVoiceState('standby');
  }, [isRecordingAudio, stopMicCapture, stopSpeaking]);

  // Register Android native voice & speech event hooks
  useEffect(() => {
    window.__fridayAndroidEvents = {
      onInterimText: (text: string) => {
        setAudioLevel(0.75);
        setLiveTranscript(`Hearing: "${text}"`);
        if (isInterruptionCommand(text)) {
          abortRef.current?.abort();
          stopSpeaking();
        }
      },
      onRecognizedText: (text: string) => {
        setIsListening(false);
        setAudioLevel(0);
        if (isInterruptionCommand(text)) {
          abortRef.current?.abort();
          stopSpeaking();
          setLiveTranscript('Stopped speaking.');
          return;
        }
        const parsedVoice = extractVoiceCommand(text, settings.wakeWord, false);
        if (parsedVoice.matched && parsedVoice.command) {
          setLiveTranscript(`Heard: "${parsedVoice.command}"`);
          void handleSubmitCommand(parsedVoice.command);
        }
      },
      onListeningState: (active: boolean, status?: string) => {
        setIsListening(active);
        setAudioLevel(active ? 0.55 : 0);
        setVoiceState(active ? 'listening' : 'standby');
        if (status) setLiveTranscript(status);
      },
      onSpeechState: (speaking: boolean) => {
        speechActiveRef.current = speaking;
        if (!speaking) {
          setTimeout(() => pumpLocalSpeechQueue(), 85);
        }
      },
    };
    return () => {
      delete window.__fridayAndroidEvents;
    };
  }, [handleSubmitCommand, pumpLocalSpeechQueue, settings.wakeWord, stopSpeaking]);

  const updateSettings = useCallback(
    async (patch: Partial<AssistantSettings>) => {
      let nextMerged: AssistantSettings | null = null;
      setSettings((prev) => {
        nextMerged = {
          ...prev,
          ...patch,
          wallpaper: { ...prev.wallpaper, ...(patch.wallpaper || {}) },
          hologram: { ...prev.hologram, ...(patch.hologram || {}) },
          enabledAgents: { ...prev.enabledAgents, ...(patch.enabledAgents || {}) },
        };
        return nextMerged;
      });

      if (patch.launchOnStartup !== undefined) {
        window.fridayDesktop?.setStartupLaunch?.(patch.launchOnStartup).catch(() => {});
      }
      if (patch.startFullscreen !== undefined) {
        window.fridayDesktop?.setFullscreen?.(patch.startFullscreen).catch(() => {});
      }
      if (patch.reopenShortcut !== undefined) {
        window.fridayDesktop?.updateReopenShortcut?.(patch.reopenShortcut).catch(() => {});
      }

      if (nextMerged) {
        saveLocalClientState(snapshotLocalState({ settings: nextMerged }));
      }

      if (isAndroidHost() || !backendAvailableRef.current) return;

      try {
        const res = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const updated = await res.json();
          setSettings({ speakingPitch: 1.0, ...updated });
          if (patch.aiModel !== undefined || patch.ollamaModel !== undefined) {
            void checkApiConnection(true);
          }
        }
      } catch {
        // Local persistence already updated above
      }
    },
    [checkApiConnection, snapshotLocalState]
  );

  const handleUpdateHologram = useCallback(
    (patch: Partial<HologramSettings>) => {
      updateSettings({
        hologram: {
          ...settings.hologram,
          ...patch,
        },
      });
    },
    [settings.hologram, updateSettings]
  );

  const handleToggleAgent = useCallback(
    (id: AgentId) => {
      const current = settings.enabledAgents[id] ?? true;
      updateSettings({
        enabledAgents: {
          ...settings.enabledAgents,
          [id]: !current,
        },
      });
    },
    [settings.enabledAgents, updateSettings]
  );

  const handleToggleEvent = useCallback(
    async (id: string) => {
      const target = calendar.find((e) => e.id === id);
      if (!target) return;
      const next = !target.completed;
      const nextCal = calendar.map((e) => (e.id === id ? { ...e, completed: next } : e));
      setCalendar(nextCal);
      saveLocalClientState(snapshotLocalState({ calendar: nextCal }));
      if (backendAvailableRef.current && !isAndroidHost()) {
        await fetch(`/api/calendar/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: next }),
        }).catch(() => {});
      }
    },
    [calendar, snapshotLocalState]
  );

  const handleCreateEvent = useCallback(
    async (evt: { title: string; date: string; time: string; category: CalendarEvent['category'] }) => {
      if (backendAvailableRef.current && !isAndroidHost()) {
        try {
          const res = await fetch('/api/calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(evt),
          });
          if (res.ok) {
            const created = await res.json();
            setCalendar((prev) => [created, ...prev]);
            refreshBootstrap();
            return;
          }
        } catch {
          // Fall through to local persistence
        }
      }
      const created: CalendarEvent = {
        id: `evt-${Date.now()}`,
        ...evt,
        completed: false,
        createdAt: new Date().toISOString(),
      };
      const nextCal = [created, ...calendar];
      setCalendar(nextCal);
      saveLocalClientState(snapshotLocalState({ calendar: nextCal }));
    },
    [calendar, refreshBootstrap, snapshotLocalState]
  );

  const handleDeleteEvent = useCallback(
    async (id: string) => {
      const nextCal = calendar.filter((e) => e.id !== id);
      setCalendar(nextCal);
      saveLocalClientState(snapshotLocalState({ calendar: nextCal }));
      if (backendAvailableRef.current && !isAndroidHost()) {
        await fetch(`/api/calendar/${id}`, { method: 'DELETE' }).catch(() => {});
        refreshBootstrap();
      }
    },
    [calendar, refreshBootstrap, snapshotLocalState]
  );

  const handleAddNote = useCallback(
    (note: { title: string; content: string }) => {
      const nowIso = new Date().toISOString();
      const created: NoteItem = {
        id: `note-${Date.now()}`,
        title: note.title,
        content: note.content,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const nextNotes = [created, ...notes];
      setNotes(nextNotes);
      saveLocalClientState(snapshotLocalState({ notes: nextNotes }));
    },
    [notes, snapshotLocalState]
  );

  const handleDeleteNote = useCallback(
    (id: string) => {
      const nextNotes = notes.filter((n) => n.id !== id);
      setNotes(nextNotes);
      saveLocalClientState(snapshotLocalState({ notes: nextNotes }));
    },
    [notes, snapshotLocalState]
  );

  const handleAddTodo = useCallback(
    (title: string) => {
      const created: TodoItem = {
        id: `todo-${Date.now()}`,
        title,
        completed: false,
        priority: 'normal',
        createdAt: new Date().toISOString(),
      };
      const nextTodos = [created, ...todos];
      setTodos(nextTodos);
      saveLocalClientState(snapshotLocalState({ todos: nextTodos }));
    },
    [snapshotLocalState, todos]
  );

  const handleToggleTodo = useCallback(
    (id: string) => {
      const nextTodos = todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
      setTodos(nextTodos);
      saveLocalClientState(snapshotLocalState({ todos: nextTodos }));
    },
    [snapshotLocalState, todos]
  );

  const handleDeleteTodo = useCallback(
    (id: string) => {
      const nextTodos = todos.filter((t) => t.id !== id);
      setTodos(nextTodos);
      saveLocalClientState(snapshotLocalState({ todos: nextTodos }));
    },
    [snapshotLocalState, todos]
  );

  const handleAddMemory = useCallback(
    async (item: { category: MemoryItem['category']; key: string; value: string }) => {
      if (backendAvailableRef.current && !isAndroidHost()) {
        try {
          const res = await fetch('/api/memory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          });
          if (res.ok) {
            const created = await res.json();
            setMemory((prev) => [created, ...prev]);
            refreshBootstrap();
            return;
          }
        } catch {
          // Fallback
        }
      }
      const created: MemoryItem = {
        id: `mem-${Date.now()}`,
        ...item,
        approved: true,
        updatedAt: new Date().toISOString(),
      };
      const nextMem = [created, ...memory];
      setMemory(nextMem);
      saveLocalClientState(snapshotLocalState({ memory: nextMem }));
    },
    [memory, refreshBootstrap, snapshotLocalState]
  );

  const handleEditMemory = useCallback(
    async (id: string, patch: { category: MemoryItem['category']; key: string; value: string }) => {
      if (backendAvailableRef.current && !isAndroidHost()) {
        try {
          const res = await fetch(`/api/memory/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
          if (res.ok) {
            const updated = await res.json();
            setMemory((prev) => prev.map((m) => (m.id === id ? updated : m)));
            refreshBootstrap();
            return;
          }
        } catch {
          // Fallback
        }
      }
      const nextMem = memory.map((m) =>
        m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m
      );
      setMemory(nextMem);
      saveLocalClientState(snapshotLocalState({ memory: nextMem }));
    },
    [memory, refreshBootstrap, snapshotLocalState]
  );

  const handleDeleteMemory = useCallback(
    async (id: string) => {
      const nextMem = memory.filter((m) => m.id !== id);
      setMemory(nextMem);
      saveLocalClientState(snapshotLocalState({ memory: nextMem }));
      if (backendAvailableRef.current && !isAndroidHost()) {
        await fetch(`/api/memory/${id}`, { method: 'DELETE' }).catch(() => {});
        refreshBootstrap();
      }
    },
    [memory, refreshBootstrap, snapshotLocalState]
  );

  const handleLaunchApp = useCallback(
    async (app: DesktopAppItem) => {
      if (window.fridayAndroid?.openApp) {
        const msg = unwrapAndroidBridgeReply(
          window.fridayAndroid.openApp(app.command || app.name),
          `Opened ${app.name}.`
        );
        setLaunchNotice(msg);
        return;
      }
      if (!backendAvailableRef.current) {
        setLaunchNotice(`Prepared launch action for ${app.name} (install Android APK for direct launch).`);
        return;
      }
      try {
        const res = await fetch(`/api/apps/${app.id}/launch`, { method: 'POST' });
        const data = await res.json();
        setLaunchNotice(data.message || `Triggered ${app.name}`);
        refreshBootstrap();
      } catch {
        setLaunchNotice(`Launch queued for ${app.name}`);
      }
    },
    [refreshBootstrap]
  );

  const handleTogglePinApp = useCallback(
    async (id: string) => {
      if (backendAvailableRef.current && !isAndroidHost()) {
        try {
          const res = await fetch(`/api/apps/${id}/pin`, { method: 'POST' });
          if (res.ok) {
            const updated = await res.json();
            setApps((prev) => prev.map((a) => (a.id === id ? updated : a)));
            return;
          }
        } catch {
          // Fallback
        }
      }
      const nextApps = apps.map((a) => (a.id === id ? { ...a, pinned: !a.pinned } : a));
      setApps(nextApps);
      saveLocalClientState(snapshotLocalState({ apps: nextApps }));
    },
    [apps, snapshotLocalState]
  );

  const handleRunWorkflow = useCallback(
    async (id: string) => {
      setRunningWorkflowId(id);
      setVoiceState('executing');
      if (isAndroidHost() || !backendAvailableRef.current) {
        const wf = workflows.find((w) => w.id === id);
        if (wf) {
          await handleSubmitCommand(wf.triggerPhrase);
        }
        setRunningWorkflowId(null);
        setActiveSection('command-center');
        return;
      }
      try {
        const res = await fetch(`/api/workflows/${id}/run`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Workflow execution failed');
        await refreshBootstrap();
        setActiveSection('command-center');
        setVoiceState('completed');
        setTimeout(() => setVoiceState('standby'), 1600);
      } catch (err) {
        setVoiceState('error');
        setErrorBanner((err as Error).message);
      } finally {
        setRunningWorkflowId(null);
      }
    },
    [handleSubmitCommand, refreshBootstrap, workflows]
  );

  const handleCreateWorkflow = useCallback(
    async (payload: { name: string; description: string; triggerPhrase: string }) => {
      if (backendAvailableRef.current && !isAndroidHost()) {
        try {
          const res = await fetch('/api/workflows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            const created = await res.json();
            setWorkflows((prev) => [created, ...prev]);
            return;
          }
        } catch {
          // Fallback
        }
      }
      const created: AutomationWorkflow = {
        id: `wf-${Date.now()}`,
        ...payload,
        steps: [{ agent: 'core', action: payload.triggerPhrase }],
        enabled: true,
        runCount: 0,
      };
      const nextWf = [created, ...workflows];
      setWorkflows(nextWf);
      saveLocalClientState(snapshotLocalState({ workflows: nextWf }));
    },
    [snapshotLocalState, workflows]
  );

  const handleClearHistory = useCallback(async () => {
    setMessages([]);
    saveLocalClientState(snapshotLocalState({ chatHistory: [] }));
    if (backendAvailableRef.current && !isAndroidHost()) {
      await fetch('/api/chat', { method: 'DELETE' }).catch(() => {});
    }
  }, [snapshotLocalState]);

  const agentList = useMemo(
    () => buildAgentList(settings.enabledAgents, activeAgents),
    [settings.enabledAgents, activeAgents]
  );

  // ESC Desktop Stealth / Minimized View
  if (hiddenToDesktop) {
    return (
      <div className="relative w-screen h-screen overflow-hidden bg-[#0b1322] text-slate-100 flex flex-col justify-between p-6">
        <LiveWallpaper settings={settings.wallpaper} themeAccent={settings.themeAccent} />
        <div className="relative z-10 max-w-xl mx-auto mt-16 p-6 rounded-2xl border border-cyan-500/25 bg-[#070c1a]/92 text-center space-y-4">
          <div className="font-display text-lg font-semibold tracking-[0.2em] text-cyan-300">
            F.R.I.D.A.Y. BACKGROUND MODE
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            Desktop workspace revealed. Background telemetry, wake-word standby (&ldquo;{settings.wakeWord}&rdquo;), and
            scheduled reminders remain active.
          </p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setHiddenToDesktop(false);
                window.fridayDesktop?.restoreWindow().catch(() => {});
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400"
            >
              <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Restore F.R.I.D.A.Y. ({settings.reopenShortcut})</span>
            </button>
          </div>
        </div>
        <div className="relative z-10 text-center text-xs text-slate-400">
          Press Escape or {settings.reopenShortcut} to toggle visibility
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden flex flex-col bg-[#05020c] text-purple-50">
      <LiveWallpaper settings={settings.wallpaper} themeAccent={settings.themeAccent} />

      {/* Top HUD Command Header */}
      <TopHudBar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        userName={settings.userName}
        telemetry={telemetry}
        autoSpeakReplies={settings.autoSpeakReplies}
        isSpeaking={isSpeaking}
        onToggleAutoSpeak={() => updateSettings({ autoSpeakReplies: !settings.autoSpeakReplies })}
        onStopSpeaking={stopSpeaking}
        onHideToDesktop={() => setHiddenToDesktop(true)}
        onOpenMobileMenu={() => setMobileNavOpen((v) => !v)}
      />

      {/* Middle Interactive Area: Left Rail + Main Viewport */}
      <div className="relative z-10 flex-1 min-h-0 flex overflow-hidden">
        {/* Desktop Left Sidebar */}
        <div className="hidden md:flex h-full">
          <LeftSidebar
            activeSection={activeSection}
            onSelectSection={setActiveSection}
            voiceState={voiceState}
            onHideToDesktop={() => setHiddenToDesktop(true)}
            onStopExecution={handleStopExecution}
          />
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 md:hidden flex">
            <div className="relative z-50 h-full bg-[#06020e]/95">
              <LeftSidebar
                activeSection={activeSection}
                onSelectSection={(sec) => {
                  setActiveSection(sec);
                  setMobileNavOpen(false);
                }}
                voiceState={voiceState}
                onHideToDesktop={() => {
                  setMobileNavOpen(false);
                  setHiddenToDesktop(true);
                }}
                onStopExecution={handleStopExecution}
              />
            </div>
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setMobileNavOpen(false)}
              className="flex-1 bg-black/60"
            />
          </div>
        )}

        {/* Main Center Viewport */}
        <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
          {activeSection === 'command-center' && (
            <CommandWorkspace
              voiceState={voiceState}
              audioLevel={audioLevel}
              animationQuality={settings.animationQuality}
              activeAgents={activeAgents}
              hologram={settings.hologram}
              messages={messages}
              wakeWord={settings.wakeWord}
              wakeWordEnabled={settings.wakeWordEnabled}
              autoSpeakReplies={settings.autoSpeakReplies}
              isListening={isListening}
              isRecordingAudio={isRecordingAudio}
              isSpeaking={isSpeaking}
              liveTranscript={liveTranscript}
              apiStatus={apiStatus}
              errorBanner={errorBanner}
              launchNotice={launchNotice}
              apps={apps}
              calendar={calendar}
              telemetry={telemetry}
              cpuHistory={cpuHistory}
              weather={weather}
              weatherError={weatherError}
              onSelectSection={setActiveSection}
              onSubmitCommand={handleSubmitCommand}
              onConfirmAction={handleConfirmAction}
              onToggleListening={toggleListening}
              onToggleRecordAudio={toggleRecordAudio}
              onToggleWakeWord={() =>
                updateSettings({ wakeWordEnabled: !settings.wakeWordEnabled })
              }
              onUpdateHologram={handleUpdateHologram}
              onLaunchApp={handleLaunchApp}
              onToggleEvent={handleToggleEvent}
              onSpeakText={speakText}
              onCheckApiConnection={() => checkApiConnection(true)}
              onDismissError={() => setErrorBanner(null)}
              onDismissLaunchNotice={() => setLaunchNotice(null)}
            />
          )}

          {activeSection === 'ai-chat' && (
            <AIChatFullView
              voiceState={voiceState}
              messages={messages}
              wakeWord={settings.wakeWord}
              wakeWordEnabled={settings.wakeWordEnabled}
              autoSpeakReplies={settings.autoSpeakReplies}
              isListening={isListening}
              isRecordingAudio={isRecordingAudio}
              isSpeaking={isSpeaking}
              onSubmitCommand={handleSubmitCommand}
              onConfirmAction={handleConfirmAction}
              onToggleListening={toggleListening}
              onToggleRecordAudio={toggleRecordAudio}
              onToggleWakeWord={() =>
                updateSettings({ wakeWordEnabled: !settings.wakeWordEnabled })
              }
              onToggleAutoSpeak={() =>
                updateSettings({ autoSpeakReplies: !settings.autoSpeakReplies })
              }
              onStopSpeaking={stopSpeaking}
              onSpeakText={speakText}
            />
          )}

          {(activeSection === 'ai-core' || activeSection === 'agents') && (
            <AICoreView
              voiceState={voiceState}
              onSetVoiceState={setVoiceState}
              audioLevel={audioLevel}
              agents={agentList}
              activeAgents={activeAgents}
              onToggleAgent={handleToggleAgent}
              animationQuality={settings.animationQuality}
              hologram={settings.hologram}
              onUpdateHologram={handleUpdateHologram}
              focusAgents={activeSection === 'agents'}
            />
          )}

          {activeSection === 'voice-assistant' && (
            <VoiceAssistantView
              settings={settings}
              voiceState={voiceState}
              audioLevel={audioLevel}
              isListening={isListening}
              onToggleListening={toggleListening}
              onUpdateSettings={updateSettings}
              onTestSpeech={speakText}
            />
          )}

          {activeSection === 'applications' && (
            <ApplicationsView
              apps={apps}
              onLaunchApp={handleLaunchApp}
              onTogglePinApp={handleTogglePinApp}
              launchNotice={launchNotice}
            />
          )}

          {activeSection === 'file-explorer' && (
            <FileExplorerView settings={settings} onUpdateSettings={updateSettings} />
          )}

          {activeSection === 'browser-intelligence' && <BrowserIntelligenceView />}

          {activeSection === 'tasks-workflows' && (
            <TasksWorkflowsView
              workflows={workflows}
              onRunWorkflow={handleRunWorkflow}
              onCreateWorkflow={handleCreateWorkflow}
              runningId={runningWorkflowId}
            />
          )}

          {activeSection === 'system-monitor' && (
            <SystemMonitorFullView
              telemetry={telemetry}
              cpuHistory={cpuHistory}
              actionLogs={actionLogs}
            />
          )}

          {activeSection === 'calendar' && (
            <CalendarView
              events={calendar}
              notes={notes}
              todos={todos}
              onCreateEvent={handleCreateEvent}
              onToggleEvent={handleToggleEvent}
              onDeleteEvent={handleDeleteEvent}
              onAddNote={handleAddNote}
              onDeleteNote={handleDeleteNote}
              onAddTodo={handleAddTodo}
              onToggleTodo={handleToggleTodo}
              onDeleteTodo={handleDeleteTodo}
            />
          )}

          {activeSection === 'memory' && (
            <MemoryView
              memory={memory}
              onAddMemory={handleAddMemory}
              onEditMemory={handleEditMemory}
              onDeleteMemory={handleDeleteMemory}
              onOpenChatHistory={() => setActiveSection('chat-history')}
            />
          )}

          {activeSection === 'chat-history' && (
            <ChatHistoryView messages={messages} onClearHistory={handleClearHistory} />
          )}

          {activeSection === 'settings' && (
            <SettingsView settings={settings} onUpdateSettings={updateSettings} />
          )}
        </main>
      </div>

      {/* Bottom Quick Actions Bar */}
      <BottomQuickActions
        onSelectSection={setActiveSection}
        onRunQuickCommand={(cmd) => {
          if (activeSection !== 'command-center' && activeSection !== 'ai-chat') {
            setActiveSection('command-center');
          }
          handleSubmitCommand(cmd);
        }}
      />
    </div>
  );
}
