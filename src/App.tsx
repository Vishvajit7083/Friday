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
import {
  beginSpeechEpoch,
  createSpeechEpochTracker,
  invalidateSpeechEpoch,
  isEchoOfAssistantSpeech,
  isSpeechTokenValid,
  resolvePostInterruptState,
  shouldIgnoreDuplicateSubmission,
  type SpeechEpochTracker,
  type SubmissionDedupState,
} from './core/voiceStateMachine';
import { getNewSevereWeatherAlertKey, type TemperatureUnit } from './core/weatherUtils';
import {
  classifyMicrophoneError,
  computeRmsLevel,
  encodeMonoWav16kBase64,
  mergeFloat32Chunks,
  selectPreferredSpeechVoice,
} from './core/voicePipeline';
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
  FridayDesktopBridge,
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
import { WeatherDetailModal } from './components/WeatherDetailModal';
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
    fridayDesktop?: FridayDesktopBridge;
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
  audioInputDeviceId: '',
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
  temperatureUnit: 'celsius',
  favoriteWeatherLocations: ['Kolhapur, MH'],
  weatherNotificationsEnabled: true,
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
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [weatherModalOpen, setWeatherModalOpen] = useState(false);
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
  const [audioInputDevices, setAudioInputDevices] = useState<Array<{ deviceId: string; label: string }>>([]);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const micRafRef = useRef<number>(0);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const captureSampleRateRef = useRef<number>(16000);
  const captureStartedAtRef = useRef<number>(0);
  const lastVoiceAtRef = useRef<number>(0);
  const speechDetectedRef = useRef<boolean>(false);
  const captureModeRef = useRef<'speech' | 'manual'>('speech');
  const captureTimeoutRef = useRef<number | null>(null);
  const wavFinishingRef = useRef<boolean>(false);
  const speechQueueRef = useRef<string[]>([]);
  const speechActiveRef = useRef<boolean>(false);
  const speechTrackerRef = useRef<SpeechEpochTracker>(createSpeechEpochTracker());
  const isSpeakingRef = useRef<boolean>(false);
  const lastSubmissionRef = useRef<SubmissionDedupState | null>(null);
  const lastWeatherAlertKeyRef = useRef<string | null>(null);

  const refreshAudioInputDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter((d) => d.kind === 'audioinput' && d.deviceId)
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${index + 1}`,
        }));
      setAudioInputDevices(inputs);
    } catch {
      // Enumeration unavailable without device access
    }
  }, []);

  useEffect(() => {
    void refreshAudioInputDevices();
    const mediaDevices = navigator.mediaDevices;
    const onDeviceChange = () => {
      void refreshAudioInputDevices();
    };
    mediaDevices?.addEventListener?.('devicechange', onDeviceChange);

    const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    const onVoicesChanged = () => {
      synth?.getVoices();
    };
    synth?.addEventListener?.('voiceschanged', onVoicesChanged);
    synth?.getVoices();

    return () => {
      mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      synth?.removeEventListener?.('voiceschanged', onVoicesChanged);
    };
  }, [refreshAudioInputDevices]);

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
        optionalProviders: data.optionalProviders,
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
      if (data.settings) setSettings({ ...DEFAULT_SETTINGS, speakingPitch: 1.0, ...data.settings });
      if (data.calendar) setCalendar(data.calendar);
      if (data.memory) setMemory(data.memory);
      if (Array.isArray(data.notes)) setNotes(data.notes);
      if (Array.isArray(data.todos)) setTodos(data.todos);
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

  const notifySevereWeatherIfNeeded = useCallback(
    (data: WeatherData) => {
      if (settings.weatherNotificationsEnabled === false) return;
      const key = getNewSevereWeatherAlertKey(data.alerts);
      if (!key || lastWeatherAlertKeyRef.current === key) return;
      lastWeatherAlertKeyRef.current = key;
      const topAlert = data.alerts?.[0];
      if (topAlert && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(`Weather Alert · ${data.location}`, {
            body: `${topAlert.title}: ${topAlert.description}`,
          });
        } catch {
          // Notification unavailable in headless/sandbox context
        }
      }
    },
    [settings.weatherNotificationsEnabled]
  );

  const fetchWeatherData = useCallback(
    async (opts?: { location?: string; lat?: number; lon?: number; label?: string; force?: boolean }) => {
      setLoadingWeather(true);
      setWeatherError(null);
      const targetLoc = opts?.location || settings.weatherLocation;
      try {
        if (backendAvailableRef.current && !isAndroidHost()) {
          try {
            const params = new URLSearchParams();
            if (typeof opts?.lat === 'number' && typeof opts?.lon === 'number') {
              params.set('lat', String(opts.lat));
              params.set('lon', String(opts.lon));
              if (opts.label) params.set('label', opts.label);
            } else {
              params.set('location', targetLoc);
            }
            if (opts?.force) params.set('refresh', '1');
            const res = await fetch(`/api/weather?${params.toString()}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setWeather(data as WeatherData);
            notifySevereWeatherIfNeeded(data as WeatherData);
            return data as WeatherData;
          } catch (err) {
            // Fall through to client Open-Meteo lookup only when location query provided
            if (typeof opts?.lat === 'number') {
              setWeatherError((err as Error).message);
              return null;
            }
          }
        }
        const directWeather = await fetchOpenMeteoClientWeather(targetLoc);
        if (directWeather) {
          setWeather(directWeather);
          notifySevereWeatherIfNeeded(directWeather);
          return directWeather;
        }
        setWeatherError(`Unable to fetch live weather for "${targetLoc}".`);
        return null;
      } finally {
        setLoadingWeather(false);
      }
    },
    [notifySevereWeatherIfNeeded, settings.weatherLocation]
  );

  // Live weather polling & periodic 15-minute refresh
  useEffect(() => {
    void fetchWeatherData({ location: settings.weatherLocation });
    const timer = window.setInterval(() => {
      void fetchWeatherData({ location: settings.weatherLocation });
    }, 15 * 60_000);
    return () => window.clearInterval(timer);
  }, [fetchWeatherData, settings.weatherLocation]);

  const stopSpeaking = useCallback(() => {
    speechTrackerRef.current = invalidateSpeechEpoch(speechTrackerRef.current);
    speechQueueRef.current = [];
    speechActiveRef.current = false;
    isSpeakingRef.current = false;
    window.fridayAndroid?.stopSpeaking?.();
    window.fridayDesktop?.stopWindowsTts?.().catch(() => {});
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = '';
      audioElRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setAudioLevel(0);
    setVoiceState((curr) => (curr === 'speaking' ? 'standby' : curr));
  }, []);

  // ESC key hides F.R.I.D.A.Y. to desktop (and stops speech), Ctrl+Space restores; desktop IPC stop-speech & pagehide clean up
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT';

      if (e.key === 'Escape' && !isInput) {
        e.preventDefault();
        setHiddenToDesktop((prev) => {
          const next = !prev;
          if (next) stopSpeaking();
          return next;
        });
        window.fridayDesktop?.hideToDesktop().catch(() => {});
      } else if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        setHiddenToDesktop(false);
        window.fridayDesktop?.restoreWindow().catch(() => {});
      }
    };
    const unsubStopSpeech = window.fridayDesktop?.onStopSpeech?.(() => {
      stopSpeaking();
    });
    const onPageHide = () => {
      stopSpeaking();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      unsubStopSpeech?.();
    };
  }, [stopSpeaking]);

  const interruptAssistant = useCallback(
    (transcript = 'Stopped speaking.') => {
      abortRef.current?.abort();
      stopSpeaking();
      setActiveAgents([]);
      setLiveTranscript(transcript);
      setVoiceState('interrupted');
      window.setTimeout(() => {
        setVoiceState((curr) =>
          curr === 'interrupted' ? resolvePostInterruptState(settings.continuousListening) : curr
        );
      }, 900);
    },
    [settings.continuousListening, stopSpeaking]
  );

  const selectBestSpeechVoice = useCallback(
    (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null =>
      selectPreferredSpeechVoice(voices, settings.language, settings.voiceGender),
    [settings.language, settings.voiceGender]
  );

  const pumpLocalSpeechQueue = useCallback(
    (expectedToken?: number) => {
      if (expectedToken !== undefined && !isSpeechTokenValid(speechTrackerRef.current, expectedToken)) {
        return;
      }
      if (speechActiveRef.current) return;
      const nextSentence = speechQueueRef.current.shift();
      if (!nextSentence) {
        speechActiveRef.current = false;
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        setAudioLevel(0);
        setVoiceState((curr) => (curr === 'speaking' ? 'standby' : curr));
        setLiveTranscript((curr) => (curr && curr.startsWith('Heard:') ? null : curr));
        return;
      }

      const activeToken = speechTrackerRef.current.epoch;

      if (window.fridayAndroid?.speak) {
        speechActiveRef.current = true;
        isSpeakingRef.current = true;
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

      const voices = 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];
      const matchedVoice = selectBestSpeechVoice(voices);

      if ((!('speechSynthesis' in window) || voices.length === 0) && window.fridayDesktop?.speakWindowsTts) {
        speechActiveRef.current = true;
        isSpeakingRef.current = true;
        setIsSpeaking(true);
        setVoiceState('speaking');
        setAudioLevel(0.6);
        window.fridayDesktop
          .speakWindowsTts({
            text: nextSentence,
            language: settings.language,
            gender: settings.voiceGender,
            rate: settings.speakingSpeed,
            pitch: settings.speakingPitch ?? 1.0,
          })
          .catch(() => {})
          .finally(() => {
            speechActiveRef.current = false;
            if (!isSpeechTokenValid(speechTrackerRef.current, activeToken)) return;
            window.setTimeout(() => {
              pumpLocalSpeechQueue(activeToken);
            }, 60);
          });
        return;
      }

      if (typeof window.speechSynthesis === 'undefined') return;
      speechActiveRef.current = true;
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      setVoiceState('speaking');
      setAudioLevel(0.6);

      const utter = new SpeechSynthesisUtterance(nextSentence);
      utter.rate = settings.speakingSpeed;
      utter.pitch = settings.speakingPitch ?? 1.0;
      utter.lang = settings.language;
      if (matchedVoice) utter.voice = matchedVoice;

      utter.onend = () => {
        speechActiveRef.current = false;
        if (!isSpeechTokenValid(speechTrackerRef.current, activeToken)) return;
        window.setTimeout(() => {
          pumpLocalSpeechQueue(activeToken);
        }, 85);
      };
      utter.onerror = () => {
        speechActiveRef.current = false;
        if (!isSpeechTokenValid(speechTrackerRef.current, activeToken)) return;
        if (window.fridayDesktop?.speakWindowsTts) {
          window.fridayDesktop
            .speakWindowsTts({
              text: nextSentence,
              language: settings.language,
              gender: settings.voiceGender,
              rate: settings.speakingSpeed,
              pitch: settings.speakingPitch ?? 1.0,
            })
            .catch(() => {})
            .finally(() => pumpLocalSpeechQueue(activeToken));
          return;
        }
        pumpLocalSpeechQueue(activeToken);
      };
      window.speechSynthesis.speak(utter);
    },
    [selectBestSpeechVoice, settings.language, settings.speakingPitch, settings.speakingSpeed, settings.voiceGender]
  );

  const enqueueLocalSpeech = useCallback(
    (sentence: string, token?: number) => {
      const clean = sentence.replace(/[*_`#]/g, '').trim();
      if (!clean) return;
      if (
        !window.fridayAndroid?.speak &&
        typeof window.speechSynthesis === 'undefined' &&
        !window.fridayDesktop?.speakWindowsTts
      ) {
        return;
      }
      if (token !== undefined && !isSpeechTokenValid(speechTrackerRef.current, token)) {
        return;
      }
      if (token === undefined) {
        const started = beginSpeechEpoch(speechTrackerRef.current, `stream-${Date.now()}`, clean);
        speechTrackerRef.current = started.next;
        token = started.token;
      } else {
        speechTrackerRef.current = {
          ...speechTrackerRef.current,
          speakingText: `${speechTrackerRef.current.speakingText} ${clean}`.trim(),
        };
      }
      speechQueueRef.current.push(clean);
      pumpLocalSpeechQueue(token);
    },
    [pumpLocalSpeechQueue]
  );

  const speakText = useCallback(
    async (text: string) => {
      stopSpeaking();
      const cleanText = text.replace(/[*_`#]/g, '').trim();
      if (!cleanText) return;

      const { next, token } = beginSpeechEpoch(speechTrackerRef.current, `tts-${Date.now()}`, cleanText);
      speechTrackerRef.current = next;

      if (window.fridayAndroid?.speak) {
        const sentences = cleanText.match(/[^.!?\n]+[.!?\n]*/g) ?? [cleanText];
        for (const s of sentences) {
          if (s.trim()) speechQueueRef.current.push(s.trim());
        }
        pumpLocalSpeechQueue(token);
        return;
      }

      // Fast path: instant local Device/Browser SpeechSynthesis or Windows SAPI unless Gemini TTS is active
      if (
        apiStatus.engine !== 'gemini' &&
        (typeof window.speechSynthesis !== 'undefined' || Boolean(window.fridayDesktop?.speakWindowsTts))
      ) {
        const sentences = cleanText.match(/[^.!?\n]+[.!?\n]*/g) ?? [cleanText];
        for (const s of sentences) {
          if (s.trim()) speechQueueRef.current.push(s.trim());
        }
        pumpLocalSpeechQueue(token);
        return;
      }

      setVoiceState('speaking');
      isSpeakingRef.current = true;
      setIsSpeaking(true);
      try {
        const res = await fetch('/api/voice/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText, voiceName: settings.voiceName }),
        });
        if (!isSpeechTokenValid(speechTrackerRef.current, token)) return;
        const data = await res.json();
        if (!isSpeechTokenValid(speechTrackerRef.current, token)) return;
        if (res.ok && data.audioBase64) {
          const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
          audio.playbackRate = settings.speakingSpeed;
          audioElRef.current = audio;
          audio.onended = () => {
            if (!isSpeechTokenValid(speechTrackerRef.current, token)) return;
            isSpeakingRef.current = false;
            setIsSpeaking(false);
            setAudioLevel(0);
            setVoiceState('completed');
            window.setTimeout(() => {
              setVoiceState((curr) => (curr === 'completed' ? 'standby' : curr));
            }, 1400);
          };
          audio.onerror = () => {
            if (!isSpeechTokenValid(speechTrackerRef.current, token)) return;
            isSpeakingRef.current = false;
            setIsSpeaking(false);
            setVoiceState('standby');
          };
          await audio.play();
          return;
        }
      } catch {
        // Fallback below
      }

      if (!isSpeechTokenValid(speechTrackerRef.current, token)) return;
      if (typeof window.speechSynthesis !== 'undefined' || window.fridayDesktop?.speakWindowsTts) {
        enqueueLocalSpeech(cleanText, token);
      } else {
        isSpeakingRef.current = false;
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
    async (command: string, options?: { fromVoice?: boolean; allowDuplicate?: boolean }): Promise<boolean> => {
      const cleanCmd = command.trim();
      if (!cleanCmd) return false;
      const shouldSpeakReply = Boolean(options?.fromVoice || settings.autoSpeakReplies);

      if (isInterruptionCommand(cleanCmd)) {
        interruptAssistant('Interrupted — standing by.');
        return false;
      }

      const nowMs = Date.now();
      if (!options?.allowDuplicate && shouldIgnoreDuplicateSubmission(lastSubmissionRef.current, cleanCmd, nowMs)) {
        return false;
      }
      lastSubmissionRef.current = { lastText: cleanCmd, lastTimestampMs: nowMs };

      abortRef.current?.abort();
      stopSpeaking();
      setErrorBanner(null);
      if (!options?.fromVoice) {
        setLiveTranscript(null);
      }
      setVoiceState('processing');
      setActiveAgents(['core']);

      const controller = new AbortController();
      abortRef.current = controller;

      const reqEpoch = beginSpeechEpoch(speechTrackerRef.current, `cmd-${nowMs}`, '');
      speechTrackerRef.current = reqEpoch.next;
      const streamSpeechToken = reqEpoch.token;

      const tempUserId = `msg-temp-u-${nowMs}`;
      const tempAssistantId = `msg-temp-a-${nowMs}`;
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
          void speakText(result.speakText);
        } else if (shouldSpeakReply && result.assistantMessage.content) {
          void speakText(result.assistantMessage.content);
        } else {
          setVoiceState('completed');
          window.setTimeout(() => {
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

              if (shouldSpeakReply && isSpeechTokenValid(speechTrackerRef.current, streamSpeechToken)) {
                speechBuffer += tok;
                const match = speechBuffer.match(/^([\s\S]*?[.!?](?:\s+|$)|\S[\s\S]{18,}?\n)/);
                if (match && match[1].trim().length >= 12) {
                  enqueueLocalSpeech(match[1], streamSpeechToken);
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

              if (finalAssistant.intent === 'read_aloud' && finalAssistant.content && !streamedAnyText) {
                void speakText(finalAssistant.content);
              } else if (shouldSpeakReply && isSpeechTokenValid(speechTrackerRef.current, streamSpeechToken)) {
                if (speechBuffer.trim()) {
                  enqueueLocalSpeech(speechBuffer, streamSpeechToken);
                  speechBuffer = '';
                } else if (!streamedAnyText && finalAssistant.content) {
                  void speakText(finalAssistant.content);
                }
              } else {
                setVoiceState('completed');
                window.setTimeout(() => {
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
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAssistantId && !m.content.trim()
                ? { ...m, content: 'Command cancelled before completion.' }
                : m
            )
          );
          setVoiceState(resolvePostInterruptState(settings.continuousListening));
          return false;
        }
        // Network disconnect fallback (works offline and inside Android APK)
        backendAvailableRef.current = false;
        return await runClientFallback();
      } finally {
        abortRef.current = null;
      }
    },
    [
      enqueueLocalSpeech,
      interruptAssistant,
      refreshBootstrap,
      settings.autoSpeakReplies,
      settings.continuousListening,
      snapshotLocalState,
      speakText,
      stopSpeaking,
    ]
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

  const cleanupWavNodes = useCallback(() => {
    if (captureTimeoutRef.current !== null) {
      window.clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }
    cancelAnimationFrame(micRafRef.current);
    try {
      micProcessorRef.current?.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    try {
      micSourceRef.current?.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    try {
      micGainRef.current?.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    micProcessorRef.current = null;
    micSourceRef.current = null;
    micGainRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
  }, []);

  const stopMicCapture = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore already-stopped instance
    }
    recognitionRef.current = null;
    cleanupWavNodes();
    pcmChunksRef.current = [];
    wavFinishingRef.current = false;
    setIsRecordingAudio(false);
    setIsListening(false);
    setAudioLevel(0);
    setVoiceState((curr) => (curr === 'listening' ? 'standby' : curr));
  }, [cleanupWavNodes]);

  useEffect(() => {
    return () => {
      stopMicCapture();
      stopSpeaking();
    };
  }, [stopMicCapture, stopSpeaking]);

  const finishWavVoiceCapture = useCallback(async () => {
    if (wavFinishingRef.current) return;
    wavFinishingRef.current = true;
    const chunks = pcmChunksRef.current.slice();
    const sampleRate = captureSampleRateRef.current || 16000;
    pcmChunksRef.current = [];

    cleanupWavNodes();
    setIsRecordingAudio(false);
    setIsListening(false);
    setAudioLevel(0);

    try {
      const merged = mergeFloat32Chunks(chunks);
      const minSamples = Math.floor(sampleRate * 0.25);
      if (merged.length < minSamples) {
        setLiveTranscript('No audio captured — speak clearly for 1–2 seconds and try again.');
        setVoiceState('standby');
        return;
      }

      const wavBase64 = encodeMonoWav16kBase64(merged, sampleRate);
      if (!wavBase64) {
        setLiveTranscript('Could not encode captured audio.');
        setVoiceState('standby');
        return;
      }

      setVoiceState('processing');
      setLiveTranscript('Recognizing your voice...');

      let recognizedText = '';
      let sttErrorReason = '';

      if (window.fridayDesktop?.recognizeSpeechWav) {
        try {
          const sttRes = await window.fridayDesktop.recognizeSpeechWav({
            wavBase64,
            language: settings.language,
          });
          if (sttRes.ok && sttRes.text.trim()) {
            recognizedText = sttRes.text.trim();
          } else if (sttRes.error) {
            sttErrorReason = sttRes.error;
          }
        } catch (err) {
          sttErrorReason = (err as Error).message;
        }
      }

      if (!recognizedText && backendAvailableRef.current) {
        try {
          const res = await fetch('/api/voice/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              base64Data: wavBase64,
              mimeType: 'audio/wav',
              language: settings.language,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Voice transcription failed');
          }
          if (data.text && String(data.text).trim()) {
            recognizedText = String(data.text).trim();
          } else if (data.reason && !sttErrorReason) {
            sttErrorReason = String(data.reason);
          }
        } catch (err) {
          if (!sttErrorReason) {
            sttErrorReason = (err as Error).message;
          }
        }
      }

      if (recognizedText) {
        if (isInterruptionCommand(recognizedText)) {
          interruptAssistant('Stopped speaking.');
          return;
        }
        if (
          isEchoOfAssistantSpeech(
            recognizedText,
            speechTrackerRef.current.speakingText,
            isSpeakingRef.current
          )
        ) {
          setLiveTranscript(null);
          setVoiceState('standby');
          return;
        }
        const parsedVoice = extractVoiceCommand(recognizedText, settings.wakeWord, false);
        setLiveTranscript(`Heard: "${parsedVoice.command}"`);
        await handleSubmitCommand(parsedVoice.command, { fromVoice: true });
        return;
      }

      setLiveTranscript(
        sttErrorReason ||
          'No speech detected — verify Windows Microphone access & Windows Speech language pack, or type your command.'
      );
      setVoiceState('standby');
    } catch (err) {
      setVoiceState('error');
      setLiveTranscript(null);
      setErrorBanner((err as Error).message);
    } finally {
      wavFinishingRef.current = false;
    }
  }, [cleanupWavNodes, handleSubmitCommand, interruptAssistant, settings.language, settings.wakeWord]);

  const startWavVoiceCapture = useCallback(
    async (mode: 'speech' | 'manual') => {
      stopSpeaking();
      stopMicCapture();
      setErrorBanner(null);

      if (window.fridayDesktop?.requestMicPermission) {
        try {
          const perm = await window.fridayDesktop.requestMicPermission();
          if (!perm.granted) {
            setVoiceState('error');
            setErrorBanner(perm.detail);
            return;
          }
        } catch {
          // Continue to browser getUserMedia check
        }
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        const classified = classifyMicrophoneError(new Error('getUserMedia not supported'));
        setVoiceState('error');
        setErrorBanner(classified.message);
        return;
      }

      const audioBaseConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      let stream: MediaStream;
      try {
        if (settings.audioInputDeviceId) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { ...audioBaseConstraints, deviceId: { exact: settings.audioInputDeviceId } },
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({ audio: audioBaseConstraints });
          }
        } else {
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioBaseConstraints });
        }
      } catch (err) {
        const classified = classifyMicrophoneError(err);
        setVoiceState('error');
        setErrorBanner(classified.message);
        setIsListening(false);
        setIsRecordingAudio(false);
        return;
      }

      micStreamRef.current = stream;
      void refreshAudioInputDevices();

      try {
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {});
        }
        captureSampleRateRef.current = audioCtx.sampleRate || 16000;
        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        const silentGain = audioCtx.createGain();
        silentGain.gain.value = 0;

        micSourceRef.current = source;
        micProcessorRef.current = processor;
        micGainRef.current = silentGain;

        pcmChunksRef.current = [];
        wavFinishingRef.current = false;
        captureModeRef.current = mode;
        captureStartedAtRef.current = Date.now();
        lastVoiceAtRef.current = Date.now();
        speechDetectedRef.current = false;

        processor.onaudioprocess = (ev) => {
          if (wavFinishingRef.current) return;
          const input = ev.inputBuffer.getChannelData(0);
          pcmChunksRef.current.push(new Float32Array(input));
          const rms = computeRmsLevel(input);
          const normalizedLevel = Math.min(1, rms * 8.5);
          setAudioLevel(normalizedLevel);

          if (mode === 'speech') {
            const now = Date.now();
            if (rms > 0.015) {
              if (!speechDetectedRef.current) {
                speechDetectedRef.current = true;
                setLiveTranscript('Listening — speech detected...');
              }
              lastVoiceAtRef.current = now;
            } else if (
              speechDetectedRef.current &&
              now - lastVoiceAtRef.current > 1350 &&
              now - captureStartedAtRef.current > 750
            ) {
              void finishWavVoiceCapture();
            }
          }
        };

        source.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(audioCtx.destination);

        setIsListening(true);
        setIsRecordingAudio(mode === 'manual');
        setVoiceState('listening');
        setLiveTranscript(
          mode === 'manual'
            ? 'Recording voice command — speak now, then click Mic to send.'
            : `Listening (${settings.language}) — speak your command...`
        );

        const maxDurationMs = mode === 'manual' ? 20000 : 12000;
        captureTimeoutRef.current = window.setTimeout(() => {
          void finishWavVoiceCapture();
        }, maxDurationMs);
      } catch (err) {
        cleanupWavNodes();
        const classified = classifyMicrophoneError(err);
        setVoiceState('error');
        setErrorBanner(classified.message);
      }
    },
    [
      cleanupWavNodes,
      finishWavVoiceCapture,
      refreshAudioInputDevices,
      settings.audioInputDeviceId,
      settings.language,
      stopMicCapture,
      stopSpeaking,
    ]
  );

  const toggleRecordAudio = useCallback(async () => {
    if (isRecordingAudio || micProcessorRef.current) {
      await finishWavVoiceCapture();
      return;
    }
    await startWavVoiceCapture('manual');
  }, [finishWavVoiceCapture, isRecordingAudio, startWavVoiceCapture]);

  const toggleListening = useCallback(async () => {
    if (isRecordingAudio || micProcessorRef.current) {
      await finishWavVoiceCapture();
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

    // Electron desktop builds lack Chromium's private Google Speech key, so use reliable WAV + VAD capture
    if (window.fridayDesktop?.isDesktopShell) {
      await startWavVoiceCapture('speech');
      return;
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      await startWavVoiceCapture('speech');
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
        if (isInterruptionCommand(interim)) {
          interruptAssistant('Stopped speaking.');
          return;
        }
        if (isEchoOfAssistantSpeech(interim, speechTrackerRef.current.speakingText, isSpeakingRef.current)) {
          return;
        }
        setAudioLevel(0.8);
        setLiveTranscript(`Hearing: "${interim}"`);
      }

      if (finalText) {
        if (isInterruptionCommand(finalText)) {
          interruptAssistant('Stopped speaking.');
          if (!settings.continuousListening) stopMicCapture();
          return;
        }
        if (isEchoOfAssistantSpeech(finalText, speechTrackerRef.current.speakingText, isSpeakingRef.current)) {
          return;
        }
        const parsedVoice = extractVoiceCommand(finalText, settings.wakeWord, false);
        if (parsedVoice.matched && parsedVoice.command) {
          setLiveTranscript(`Heard: "${parsedVoice.command}"`);
          if (!settings.continuousListening) {
            stopMicCapture();
          }
          void handleSubmitCommand(parsedVoice.command, { fromVoice: true });
        }
      }
    };

    rec.onerror = (ev) => {
      if (
        ev.error === 'network' ||
        ev.error === 'service-not-allowed' ||
        ev.error === 'audio-capture' ||
        ev.error === 'language-not-supported'
      ) {
        stopMicCapture();
        void startWavVoiceCapture('speech');
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
      const classified = classifyMicrophoneError(new Error(ev.error));
      setErrorBanner(classified.message);
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
      await startWavVoiceCapture('speech');
    }
  }, [
    finishWavVoiceCapture,
    handleSubmitCommand,
    interruptAssistant,
    isListening,
    isRecordingAudio,
    settings.continuousListening,
    settings.language,
    settings.wakeWord,
    startWavVoiceCapture,
    stopMicCapture,
    stopSpeaking,
  ]);

  const handleStopExecution = useCallback(() => {
    interruptAssistant('Execution stopped.');
    stopMicCapture();
  }, [interruptAssistant, stopMicCapture]);

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
          void handleSubmitCommand(parsedVoice.command, { fromVoice: true });
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

  const handleUpdateEvent = useCallback(
    async (
      id: string,
      patch: Partial<Pick<CalendarEvent, 'title' | 'date' | 'time' | 'category' | 'notes' | 'completed'>>
    ) => {
      const nextCal = calendar.map((e) => (e.id === id ? { ...e, ...patch } : e));
      setCalendar(nextCal);
      saveLocalClientState(snapshotLocalState({ calendar: nextCal }));
      if (backendAvailableRef.current && !isAndroidHost()) {
        try {
          const res = await fetch(`/api/calendar/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
          if (res.ok) {
            const updated = await res.json();
            setCalendar((prev) => prev.map((e) => (e.id === id ? updated : e)));
          }
        } catch {
          // Local copy preserved
        }
      }
    },
    [calendar, snapshotLocalState]
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
    async (note: { title: string; content: string; pinned?: boolean }) => {
      if (backendAvailableRef.current && !isAndroidHost()) {
        try {
          const res = await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(note),
          });
          if (res.ok) {
            const created = (await res.json()) as NoteItem;
            setNotes((prev) => [created, ...prev]);
            return;
          }
        } catch {
          // Fallback to local state
        }
      }
      const nowIso = new Date().toISOString();
      const created: NoteItem = {
        id: `note-${Date.now()}`,
        title: note.title,
        content: note.content,
        pinned: Boolean(note.pinned),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const nextNotes = [created, ...notes];
      setNotes(nextNotes);
      saveLocalClientState(snapshotLocalState({ notes: nextNotes }));
    },
    [notes, snapshotLocalState]
  );

  const handleUpdateNote = useCallback(
    async (id: string, patch: Partial<Pick<NoteItem, 'title' | 'content' | 'pinned'>>) => {
      const nowIso = new Date().toISOString();
      const nextNotes = notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: nowIso } : n));
      setNotes(nextNotes);
      saveLocalClientState(snapshotLocalState({ notes: nextNotes }));
      if (backendAvailableRef.current && !isAndroidHost()) {
        try {
          const res = await fetch(`/api/notes/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
          if (res.ok) {
            const updated = (await res.json()) as NoteItem;
            setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
          }
        } catch {
          // Local state preserved
        }
      }
    },
    [notes, snapshotLocalState]
  );

  const handleDeleteNote = useCallback(
    async (id: string) => {
      const nextNotes = notes.filter((n) => n.id !== id);
      setNotes(nextNotes);
      saveLocalClientState(snapshotLocalState({ notes: nextNotes }));
      if (backendAvailableRef.current && !isAndroidHost()) {
        await fetch(`/api/notes/${id}`, { method: 'DELETE' }).catch(() => {});
      }
    },
    [notes, snapshotLocalState]
  );

  const handleAddTodo = useCallback(
    async (payload: string | { title: string; priority?: TodoItem['priority']; dueDate?: string }) => {
      const normalized =
        typeof payload === 'string' ? { title: payload, priority: 'normal' as const } : payload;
      if (backendAvailableRef.current && !isAndroidHost()) {
        try {
          const res = await fetch('/api/todos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(normalized),
          });
          if (res.ok) {
            const created = (await res.json()) as TodoItem;
            setTodos((prev) => [created, ...prev]);
            return;
          }
        } catch {
          // Fallback to local state
        }
      }
      const created: TodoItem = {
        id: `todo-${Date.now()}`,
        title: normalized.title,
        completed: false,
        priority: normalized.priority ?? 'normal',
        dueDate: normalized.dueDate,
        createdAt: new Date().toISOString(),
      };
      const nextTodos = [created, ...todos];
      setTodos(nextTodos);
      saveLocalClientState(snapshotLocalState({ todos: nextTodos }));
    },
    [snapshotLocalState, todos]
  );

  const handleToggleTodo = useCallback(
    async (id: string) => {
      const target = todos.find((t) => t.id === id);
      if (!target) return;
      const nextCompleted = !target.completed;
      const nextTodos = todos.map((t) => (t.id === id ? { ...t, completed: nextCompleted } : t));
      setTodos(nextTodos);
      saveLocalClientState(snapshotLocalState({ todos: nextTodos }));
      if (backendAvailableRef.current && !isAndroidHost()) {
        await fetch(`/api/todos/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: nextCompleted }),
        }).catch(() => {});
      }
    },
    [snapshotLocalState, todos]
  );

  const handleUpdateTodo = useCallback(
    async (id: string, patch: Partial<Pick<TodoItem, 'title' | 'priority' | 'dueDate' | 'completed'>>) => {
      const nextTodos = todos.map((t) => (t.id === id ? { ...t, ...patch } : t));
      setTodos(nextTodos);
      saveLocalClientState(snapshotLocalState({ todos: nextTodos }));
      if (backendAvailableRef.current && !isAndroidHost()) {
        try {
          const res = await fetch(`/api/todos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
          if (res.ok) {
            const updated = (await res.json()) as TodoItem;
            setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
          }
        } catch {
          // Local state preserved
        }
      }
    },
    [snapshotLocalState, todos]
  );

  const handleDeleteTodo = useCallback(
    async (id: string) => {
      const nextTodos = todos.filter((t) => t.id !== id);
      setTodos(nextTodos);
      saveLocalClientState(snapshotLocalState({ todos: nextTodos }));
      if (backendAvailableRef.current && !isAndroidHost()) {
        await fetch(`/api/todos/${id}`, { method: 'DELETE' }).catch(() => {});
      }
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
        if (window.fridayDesktop?.launchApp) {
          try {
            const ipcRes = await window.fridayDesktop.launchApp(app.command || app.name);
            setLaunchNotice(ipcRes.message);
            return;
          } catch (err) {
            setLaunchNotice(`Failed to launch ${app.name}: ${(err as Error).message}`);
            return;
          }
        }
        setLaunchNotice(`Prepared launch action for ${app.name} (desktop shell or backend required to spawn process).`);
        return;
      }
      try {
        const res = await fetch(`/api/apps/${app.id}/launch`, { method: 'POST' });
        const data = await res.json();
        if (!data.ok && window.fridayDesktop?.launchApp) {
          const ipcRes = await window.fridayDesktop.launchApp(app.command || app.name);
          setLaunchNotice(ipcRes.message);
          return;
        }
        setLaunchNotice(data.message || `Triggered ${app.name}`);
        refreshBootstrap();
      } catch {
        if (window.fridayDesktop?.launchApp) {
          try {
            const ipcRes = await window.fridayDesktop.launchApp(app.command || app.name);
            setLaunchNotice(ipcRes.message);
            return;
          } catch {
            // Fall through
          }
        }
        setLaunchNotice(`Launch failed for ${app.name}`);
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

  const handleRefreshApps = useCallback(async () => {
    if (isAndroidHost() || !backendAvailableRef.current) return;
    try {
      const res = await fetch('/api/apps/refresh', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'App refresh failed');
      if (Array.isArray(data.apps)) {
        setApps(data.apps);
        setLaunchNotice('Application catalog refreshed.');
      }
    } catch (err) {
      setLaunchNotice(`Failed to refresh apps: ${(err as Error).message}`);
    }
  }, []);

  const handleDeleteMessage = useCallback(
    async (id: string) => {
      const nextMsgs = messages.filter((m) => m.id !== id);
      setMessages(nextMsgs);
      saveLocalClientState(snapshotLocalState({ chatHistory: nextMsgs }));
      if (backendAvailableRef.current && !isAndroidHost()) {
        await fetch(`/api/chat/${id}`, { method: 'DELETE' }).catch(() => {});
      }
    },
    [messages, snapshotLocalState]
  );

  const handleClearHistory = useCallback(async () => {
    setMessages([]);
    saveLocalClientState(snapshotLocalState({ chatHistory: [] }));
    if (backendAvailableRef.current && !isAndroidHost()) {
      await fetch('/api/chat', { method: 'DELETE' }).catch(() => {});
    }
  }, [snapshotLocalState]);

  const handleSelectWeatherLocation = useCallback(
    async (locationQuery: string, force = true) => {
      const fetched = await fetchWeatherData({ location: locationQuery, force });
      if (fetched) {
        void updateSettings({ weatherLocation: fetched.location });
      }
    },
    [fetchWeatherData, updateSettings]
  );

  const handleSelectWeatherCoordinates = useCallback(
    async (lat: number, lon: number, label?: string) => {
      const fetched = await fetchWeatherData({ lat, lon, label, force: true });
      if (fetched) {
        void updateSettings({ weatherLocation: fetched.location });
      }
    },
    [fetchWeatherData, updateSettings]
  );

  const handleToggleFavoriteWeatherLocation = useCallback(
    (location: string) => {
      const trimmed = location.trim();
      if (!trimmed) return;
      const existing = settings.favoriteWeatherLocations ?? [];
      const exists = existing.some((f) => f.toLowerCase() === trimmed.toLowerCase());
      const nextFavs = exists
        ? existing.filter((f) => f.toLowerCase() !== trimmed.toLowerCase())
        : [trimmed, ...existing].slice(0, 8);
      void updateSettings({ favoriteWeatherLocations: nextFavs });
    },
    [settings.favoriteWeatherLocations, updateSettings]
  );

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
              temperatureUnit={(settings.temperatureUnit || 'celsius') as TemperatureUnit}
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
              onStopSpeaking={stopSpeaking}
              onOpenWeatherDetails={() => setWeatherModalOpen(true)}
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
              isSpeaking={isSpeaking}
              audioInputDevices={audioInputDevices}
              liveTranscript={liveTranscript}
              onToggleListening={toggleListening}
              onStopSpeaking={stopSpeaking}
              onUpdateSettings={updateSettings}
              onTestSpeech={speakText}
              onRefreshAudioDevices={refreshAudioInputDevices}
            />
          )}

          {activeSection === 'applications' && (
            <ApplicationsView
              apps={apps}
              onLaunchApp={handleLaunchApp}
              onTogglePinApp={handleTogglePinApp}
              onRefreshApps={handleRefreshApps}
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
              todos={todos}
              notes={notes}
              onRunWorkflow={handleRunWorkflow}
              onCreateWorkflow={handleCreateWorkflow}
              onAddTodo={handleAddTodo}
              onToggleTodo={handleToggleTodo}
              onUpdateTodo={handleUpdateTodo}
              onDeleteTodo={handleDeleteTodo}
              onAddNote={handleAddNote}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
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
              onUpdateEvent={handleUpdateEvent}
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
            <ChatHistoryView
              messages={messages}
              onDeleteMessage={handleDeleteMessage}
              onClearHistory={handleClearHistory}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsView
              settings={settings}
              apiStatus={apiStatus}
              onUpdateSettings={updateSettings}
              onCheckApiConnection={() => checkApiConnection(true)}
            />
          )}
        </main>
      </div>

      {/* Weather Detail & 7-Day Forecast Modal */}
      <WeatherDetailModal
        open={weatherModalOpen}
        onClose={() => setWeatherModalOpen(false)}
        weather={weather}
        weatherError={weatherError}
        loadingWeather={loadingWeather}
        unit={(settings.temperatureUnit || 'celsius') as TemperatureUnit}
        favorites={settings.favoriteWeatherLocations ?? []}
        onToggleUnit={(unit) => void updateSettings({ temperatureUnit: unit })}
        onSelectLocation={handleSelectWeatherLocation}
        onSelectCoordinates={handleSelectWeatherCoordinates}
        onToggleFavorite={handleToggleFavoriteWeatherLocation}
        onRefresh={async () => {
          await fetchWeatherData({ location: weather?.location || settings.weatherLocation, force: true });
        }}
      />

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
