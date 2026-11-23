import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { buildAgentList } from './core/agentRegistry';
import { extractVoiceCommand, isInterruptionCommand } from './core/intentEngine';
import type {
  ActionLogEntry,
  AgentId,
  ApiConnectionStatus,
  AssistantSettings,
  AutomationWorkflow,
  CalendarEvent,
  ChatMessage,
  DesktopAppItem,
  HologramSettings,
  MemoryItem,
  NavSection,
  SystemTelemetry,
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
  userName: 'Vishvajit',
  wakeWord: 'Hey Friday',
  aiModel: 'local-auto',
  ollamaModel: '',
  voiceName: 'Kore',
  voiceGender: 'female',
  speakingSpeed: 1.0,
  language: 'en-US',
  continuousListening: false,
  wakeWordEnabled: true,
  autoSpeakReplies: false,
  pushToTalkKey: 'Space',
  reopenShortcut: 'Ctrl+Shift+Space',
  startFullscreen: true,
  launchOnStartup: false,
  themeAccent: 'cyan',
  animationQuality: 'high',
  weatherLocation: 'San Francisco, US',
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLogEntry[]>([]);
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [apps, setApps] = useState<DesktopAppItem[]>([]);
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

  const checkApiConnection = useCallback(async (force = false) => {
    setApiStatus((prev) => ({ ...prev, checking: true }));
    try {
      const res = await fetch(`/api/health/ai${force ? '?refresh=1' : ''}`);
      const data = await res.json();
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
    } catch (err) {
      setApiStatus((prev) => ({
        ...prev,
        connected: false,
        checking: false,
        error: (err as Error).message,
      }));
    }
  }, []);

  const refreshBootstrap = useCallback(async () => {
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) return;
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
      if (data.calendar) setCalendar(data.calendar);
      if (data.memory) setMemory(data.memory);
      if (data.chatHistory) setMessages(data.chatHistory);
      if (data.actionLogs) setActionLogs(data.actionLogs);
      if (data.workflows) setWorkflows(data.workflows);
      if (data.apps) setApps(data.apps);
    } catch (err) {
      setErrorBanner(`Unable to load command center state: ${(err as Error).message}`);
    }
  }, []);

  useEffect(() => {
    refreshBootstrap();
    checkApiConnection(false);
  }, [refreshBootstrap, checkApiConnection]);

  // Real system telemetry polling
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/telemetry');
        if (!res.ok) return;
        const data = (await res.json()) as SystemTelemetry;
        if (!mounted) return;
        setTelemetry(data);
        setCpuHistory((prev) => [...prev.slice(-23), data.cpuLoad]);
      } catch {
        // Ignore transient polling interruptions
      }
    };
    poll();
    const timer = setInterval(poll, 2500);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  // Live weather polling
  useEffect(() => {
    let mounted = true;
    const loadWeather = async () => {
      try {
        setWeatherError(null);
        const res = await fetch(`/api/weather?location=${encodeURIComponent(settings.weatherLocation)}`);
        const data = await res.json();
        if (!mounted) return;
        if (!res.ok) {
          setWeatherError(data.error || 'Weather unavailable');
        } else {
          setWeather(data);
        }
      } catch (err) {
        if (mounted) setWeatherError((err as Error).message);
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

  const pumpLocalSpeechQueue = useCallback(() => {
    if (!('speechSynthesis' in window) || speechActiveRef.current) return;
    const nextSentence = speechQueueRef.current.shift();
    if (!nextSentence) {
      setIsSpeaking(false);
      setAudioLevel(0);
      setVoiceState((curr) => (curr === 'speaking' ? 'standby' : curr));
      return;
    }
    speechActiveRef.current = true;
    setIsSpeaking(true);
    setVoiceState('speaking');
    setAudioLevel(0.6);

    const utter = new SpeechSynthesisUtterance(nextSentence);
    utter.rate = settings.speakingSpeed;
    utter.lang = settings.language;
    utter.onend = () => {
      speechActiveRef.current = false;
      pumpLocalSpeechQueue();
    };
    utter.onerror = () => {
      speechActiveRef.current = false;
      pumpLocalSpeechQueue();
    };
    window.speechSynthesis.speak(utter);
  }, [settings.language, settings.speakingSpeed]);

  const enqueueLocalSpeech = useCallback(
    (sentence: string) => {
      const clean = sentence.replace(/[*_`#]/g, '').trim();
      if (!clean || !('speechSynthesis' in window)) return;
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

      // Fast path: instant local Windows/Browser SpeechSynthesis unless Gemini TTS is active
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

      try {
        const res = await fetch('/api/assistant/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cleanCmd }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || 'Command execution failed');
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

              if (settings.autoSpeakReplies) {
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
        setMessages((prev) => prev.filter((m) => m.id !== tempAssistantId));
        setVoiceState('error');
        setErrorBanner((err as Error).message);
        return false;
      } finally {
        abortRef.current = null;
      }
    },
    [enqueueLocalSpeech, refreshBootstrap, settings.autoSpeakReplies, speakText, stopSpeaking]
  );

  const handleConfirmAction = useCallback(
    async (actionType: string, summary: string, approved: boolean) => {
      setVoiceState('executing');
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
      } catch (err) {
        setVoiceState('error');
        setErrorBanner((err as Error).message);
      }
    },
    [refreshBootstrap]
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

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      if (apiStatus.engine === 'gemini') {
        await toggleRecordAudio();
      } else {
        setLiveTranscript('Browser SpeechRecognition is unavailable in this window — use Chrome/Edge/Electron or type your command below.');
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

  const updateSettings = useCallback(
    async (patch: Partial<AssistantSettings>) => {
      setSettings((prev) => ({
        ...prev,
        ...patch,
        wallpaper: { ...prev.wallpaper, ...(patch.wallpaper || {}) },
        hologram: { ...prev.hologram, ...(patch.hologram || {}) },
        enabledAgents: { ...prev.enabledAgents, ...(patch.enabledAgents || {}) },
      }));

      if (patch.launchOnStartup !== undefined) {
        window.fridayDesktop?.setStartupLaunch?.(patch.launchOnStartup).catch(() => {});
      }
      if (patch.startFullscreen !== undefined) {
        window.fridayDesktop?.setFullscreen?.(patch.startFullscreen).catch(() => {});
      }
      if (patch.reopenShortcut !== undefined) {
        window.fridayDesktop?.updateReopenShortcut?.(patch.reopenShortcut).catch(() => {});
      }

      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = await res.json();
        setSettings(updated);
        if (patch.aiModel !== undefined || patch.ollamaModel !== undefined) {
          void checkApiConnection(true);
        }
      }
    },
    [checkApiConnection]
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

  const handleToggleEvent = useCallback(async (id: string) => {
    const target = calendar.find((e) => e.id === id);
    if (!target) return;
    const next = !target.completed;
    setCalendar((prev) => prev.map((e) => (e.id === id ? { ...e, completed: next } : e)));
    await fetch(`/api/calendar/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: next }),
    });
  }, [calendar]);

  const handleCreateEvent = useCallback(
    async (evt: { title: string; date: string; time: string; category: CalendarEvent['category'] }) => {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evt),
      });
      if (res.ok) {
        const created = await res.json();
        setCalendar((prev) => [created, ...prev]);
        refreshBootstrap();
      }
    },
    [refreshBootstrap]
  );

  const handleDeleteEvent = useCallback(async (id: string) => {
    setCalendar((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/calendar/${id}`, { method: 'DELETE' });
    refreshBootstrap();
  }, [refreshBootstrap]);

  const handleAddMemory = useCallback(
    async (item: { category: MemoryItem['category']; key: string; value: string }) => {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (res.ok) {
        const created = await res.json();
        setMemory((prev) => [created, ...prev]);
        refreshBootstrap();
      }
    },
    [refreshBootstrap]
  );

  const handleEditMemory = useCallback(
    async (id: string, patch: { category: MemoryItem['category']; key: string; value: string }) => {
      const res = await fetch(`/api/memory/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = await res.json();
        setMemory((prev) => prev.map((m) => (m.id === id ? updated : m)));
        refreshBootstrap();
      }
    },
    [refreshBootstrap]
  );

  const handleDeleteMemory = useCallback(async (id: string) => {
    setMemory((prev) => prev.filter((m) => m.id !== id));
    await fetch(`/api/memory/${id}`, { method: 'DELETE' });
    refreshBootstrap();
  }, [refreshBootstrap]);

  const handleLaunchApp = useCallback(async (app: DesktopAppItem) => {
    const res = await fetch(`/api/apps/${app.id}/launch`, { method: 'POST' });
    const data = await res.json();
    setLaunchNotice(data.message || `Triggered ${app.name}`);
    refreshBootstrap();
  }, [refreshBootstrap]);

  const handleTogglePinApp = useCallback(async (id: string) => {
    const res = await fetch(`/api/apps/${id}/pin`, { method: 'POST' });
    if (res.ok) {
      const updated = await res.json();
      setApps((prev) => prev.map((a) => (a.id === id ? updated : a)));
    }
  }, []);

  const handleRunWorkflow = useCallback(
    async (id: string) => {
      setRunningWorkflowId(id);
      setVoiceState('executing');
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
    [refreshBootstrap]
  );

  const handleCreateWorkflow = useCallback(
    async (payload: { name: string; description: string; triggerPhrase: string }) => {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        setWorkflows((prev) => [created, ...prev]);
      }
    },
    []
  );

  const handleClearHistory = useCallback(async () => {
    await fetch('/api/chat', { method: 'DELETE' });
    setMessages([]);
  }, []);

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
    <div className="relative w-screen h-screen overflow-hidden flex flex-col bg-[#040814] text-slate-100">
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
            <div className="relative z-50 h-full bg-[#040814]/95">
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
              onCreateEvent={handleCreateEvent}
              onToggleEvent={handleToggleEvent}
              onDeleteEvent={handleDeleteEvent}
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
