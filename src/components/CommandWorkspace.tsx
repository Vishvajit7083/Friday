import { useEffect, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  Camera,
  Check,
  Cpu,
  Droplets,
  ExternalLink,
  FileText,
  Gauge,
  HardDrive,
  LayoutGrid,
  MapPin,
  MemoryStick,
  Mic,
  Monitor,
  Send,
  ShieldAlert,
  Sparkles,
  Volume2,
  Wind,
  X,
} from 'lucide-react';
import type {
  AgentId,
  ApiConnectionStatus,
  CalendarEvent,
  ChatMessage,
  DesktopAppItem,
  HologramSettings,
  NavSection,
  SystemTelemetry,
  VoiceState,
  WeatherData,
} from '../core/types';
import { VOICE_STATE_META } from '../core/agentRegistry';
import { formatBytes } from '../core/fileIndex';
import { FridayCore3D } from './FridayCore3D';

interface CommandWorkspaceProps {
  voiceState: VoiceState;
  audioLevel: number;
  animationQuality: 'high' | 'balanced' | 'low';
  activeAgents: AgentId[];
  hologram: HologramSettings;
  messages: ChatMessage[];
  wakeWord: string;
  wakeWordEnabled: boolean;
  autoSpeakReplies: boolean;
  isListening: boolean;
  isRecordingAudio: boolean;
  isSpeaking: boolean;
  liveTranscript: string | null;
  apiStatus: ApiConnectionStatus;
  errorBanner: string | null;
  launchNotice: string | null;
  apps: DesktopAppItem[];
  calendar: CalendarEvent[];
  telemetry: SystemTelemetry | null;
  cpuHistory: number[];
  weather: WeatherData | null;
  weatherError: string | null;
  onSelectSection: (section: NavSection) => void;
  onSubmitCommand: (command: string) => Promise<boolean | void>;
  onConfirmAction: (actionType: string, summary: string, approved: boolean) => Promise<void>;
  onToggleListening: () => void;
  onToggleRecordAudio: () => void;
  onToggleWakeWord: () => void;
  onUpdateHologram: (patch: Partial<HologramSettings>) => void;
  onLaunchApp: (app: DesktopAppItem) => void;
  onToggleEvent: (id: string) => void;
  onSpeakText: (text: string) => void;
  onCheckApiConnection: () => void;
  onDismissError: () => void;
  onDismissLaunchNotice: () => void;
}

const REFERENCE_APPS: Array<{
  id: string;
  label: string;
  command: string;
  category: DesktopAppItem['category'];
}> = [
  { id: 'app-chrome', label: 'Chrome', command: 'google-chrome', category: 'browser' },
  { id: 'app-vscode', label: 'VS Code', command: 'code', category: 'development' },
  { id: 'app-android-studio', label: 'Android Studio', command: 'studio64', category: 'development' },
  { id: 'app-youtube', label: 'YouTube', command: 'youtube', category: 'media' },
  { id: 'app-whatsapp', label: 'WhatsApp', command: 'whatsapp', category: 'communication' },
  { id: 'app-telegram', label: 'Telegram', command: 'telegram', category: 'communication' },
  { id: 'app-notion', label: 'Notion', command: 'notion', category: 'productivity' },
  { id: 'app-github', label: 'GitHub', command: 'github', category: 'development' },
];

const REFERENCE_RECENT_FILES = [
  {
    id: 'ref-file-1',
    name: 'Shashvat_AI_Presentation.pptx',
    type: 'pptx' as const,
    sizeBytes: 4_820_400,
    summary: 'Presentation deck covering F.R.I.D.A.Y. architecture, multi-agent orchestration, and edge intelligence benchmarks.',
  },
  {
    id: 'ref-file-2',
    name: 'Project_Report.pdf',
    type: 'pdf' as const,
    sizeBytes: 2_310_120,
    summary: 'Comprehensive project report detailing system design, diagnostics audit results, and security sandboxing.',
  },
  {
    id: 'ref-file-3',
    name: 'FRIDAY_Code.zip',
    type: 'zip' as const,
    sizeBytes: 18_450_000,
    summary: 'Packaged F.R.I.D.A.Y. Command Center source snapshot including Electron bridge and local AI services.',
  },
  {
    id: 'ref-file-4',
    name: 'AI_Models.docx',
    type: 'docx' as const,
    sizeBytes: 940_210,
    summary: 'Model evaluation matrix comparing local Ollama weights, deterministic command engine, and Gemini routing.',
  },
];

function formatAgendaTime(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time24;
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${meridiem}`;
}

function getCategoryDotClass(category: CalendarEvent['category']): string {
  if (category === 'meeting') return 'bg-purple-400 shadow-[0_0_8px_#c084fc]';
  if (category === 'task') return 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]';
  if (category === 'focus') return 'bg-amber-400 shadow-[0_0_8px_#fbbf24]';
  return 'bg-emerald-400 shadow-[0_0_8px_#34d399]';
}

function formatForecastDayLabel(dateStr: string, index: number): string {
  if (index === 0) return 'Today';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function AppBrandIcon({ id }: { id: string }) {
  if (id === 'app-chrome') {
    return (
      <svg viewBox="0 0 36 36" className="w-8 h-8" aria-hidden="true">
        <circle cx="18" cy="18" r="15" fill="#fff" />
        <path d="M18,3 A15,15 0 0,1 31,10.5 L18,10.5 Z" fill="#EA4335" />
        <path d="M5,10.5 A15,15 0 0,1 18,3 L18,10.5 L11.5,14.2 Z" fill="#EA4335" />
        <path d="M5,10.5 L11.5,21.8 A15,15 0 0,0 18,33 L21.8,24.5 L11.5,14.2 Z" fill="#34A853" />
        <path d="M18,33 A15,15 0 0,0 31,10.5 L18,10.5 L21.8,24.5 Z" fill="#FBBC05" />
        <circle cx="18" cy="18" r="6.8" fill="#fff" />
        <circle cx="18" cy="18" r="5.2" fill="#4285F4" />
      </svg>
    );
  }
  if (id === 'app-vscode') {
    return (
      <div className="w-8 h-8 rounded-lg bg-[#0d192b] border border-sky-500/35 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
          <path d="M17.5 2L7.5 11.2 3.8 8.3 2 9.4 5.9 12 2 14.6l1.8 1.1 3.7-2.9L17.5 22l4.5-2.1V4.1L17.5 2z" fill="#007ACC" />
          <path d="M17.5 6.4v11.2L11.2 12l6.3-5.6z" fill="#1F9CF0" />
        </svg>
      </div>
    );
  }
  if (id === 'app-android-studio') {
    return (
      <div className="w-8 h-8 rounded-lg bg-[#122620] border border-emerald-400/35 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
          <path d="M7.5 6.5L5.8 4.2M16.5 6.5l1.7-2.3" stroke="#3DDC84" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M6 12a6 6 0 0 1 12 0v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 17v-5z" fill="#3DDC84" />
          <circle cx="9.8" cy="10.2" r="0.9" fill="#0f172a" />
          <circle cx="14.2" cy="10.2" r="0.9" fill="#0f172a" />
          <path d="M7 12.5h10" stroke="#0f172a" strokeWidth="1.1" />
        </svg>
      </div>
    );
  }
  if (id === 'app-youtube') {
    return (
      <div className="w-8 h-8 rounded-lg bg-[#FF0000] flex items-center justify-center shadow-sm">
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white" aria-hidden="true">
          <polygon points="8,5 19,12 8,19" />
        </svg>
      </div>
    );
  }
  if (id === 'app-whatsapp') {
    return (
      <div className="w-8 h-8 rounded-lg bg-[#25D366] flex items-center justify-center shadow-sm">
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" aria-hidden="true">
          <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.7-1.2A9 9 0 1 0 12 3zm4.4 12.6c-.2.5-1 .9-1.5 1-.4.1-.9.1-1.5-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.7-4.4-3.9-.1-.2-1-1.4-1-2.6 0-1.2.6-1.8.8-2 .2-.2.5-.3.7-.3h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2.1.4 0 .6l-.3.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.2.1.4.2.4.4.1.2.1.7-.1 1.2z" />
        </svg>
      </div>
    );
  }
  if (id === 'app-telegram') {
    return (
      <div className="w-8 h-8 rounded-lg bg-[#2AABEE] flex items-center justify-center shadow-sm">
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" aria-hidden="true">
          <path d="M20.6 4.4L3.2 11.1c-1.2.5-1.2 1.2-.2 1.5l4.4 1.4 10.3-6.5c.5-.3.9-.1.6.2L10 15.2l-.3 4.6c.5 0 .7-.2 1-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3-14.2c.3-1.2-.5-1.7-1.8-1.2z" />
        </svg>
      </div>
    );
  }
  if (id === 'app-notion') {
    return (
      <div className="w-8 h-8 rounded-lg bg-[#161224] border border-purple-200/35 flex items-center justify-center">
        <span className="font-serif text-base font-bold text-white leading-none">N</span>
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-[#171226] border border-purple-300/30 flex items-center justify-center">
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.54 2.87 8.39 6.84 9.75.5.1.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.38 9.38 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.95-2.34 4.82-4.57 5.07.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.27 10.27 0 0 0 22 12.26C22 6.58 17.52 2 12 2z" />
      </svg>
    </div>
  );
}

function FileTypeBadge({ type }: { type: 'pptx' | 'pdf' | 'zip' | 'docx' }) {
  if (type === 'pptx') {
    return (
      <div className="w-5 h-5 rounded bg-[#d9480f] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
        P
      </div>
    );
  }
  if (type === 'pdf') {
    return (
      <div className="w-5 h-5 rounded bg-[#e03131] text-white text-[7.5px] font-bold flex items-center justify-center shrink-0">
        PDF
      </div>
    );
  }
  if (type === 'zip') {
    return (
      <div className="w-5 h-5 rounded bg-[#f59f00] text-slate-950 text-[8px] font-bold flex items-center justify-center shrink-0">
        zip
      </div>
    );
  }
  return (
    <div className="w-5 h-5 rounded bg-[#1c7ed6] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
      W
    </div>
  );
}

function RingGauge({
  label,
  valueText,
  percent,
  strokeColor,
}: {
  label: string;
  valueText: string;
  percent: number;
  strokeColor: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = 24;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[64px] h-[64px] flex items-center justify-center">
        <svg viewBox="0 0 60 60" className="w-[64px] h-[64px] -rotate-90" aria-hidden="true">
          <circle
            cx="30"
            cy="30"
            r={r}
            fill="none"
            stroke="rgba(59, 7, 100, 0.65)"
            strokeWidth="5.5"
          />
          <circle
            cx="30"
            cy="30"
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth="5.5"
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
            style={{ filter: `drop-shadow(0 0 6px ${strokeColor})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
          <span className="text-[9.5px] text-purple-200/85">{label}</span>
          <span className="text-[12.5px] font-bold font-mono-tabular text-white">{valueText}</span>
        </div>
      </div>
    </div>
  );
}

function SunCloudWeatherSvg({ className = 'w-11 h-11' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`${className} shrink-0`} aria-hidden="true">
      <defs>
        <radialGradient id="sunGold" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="100%" stopColor="#f59e0b" />
        </radialGradient>
        <linearGradient id="cloudSilver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
      </defs>
      <circle cx="29" cy="17" r="8.5" fill="url(#sunGold)" />
      <g stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round">
        <line x1="29" y1="4.5" x2="29" y2="7" />
        <line x1="39.5" y1="17" x2="42" y2="17" />
        <line x1="36.5" y1="9.5" x2="38.2" y2="7.8" />
        <line x1="21.5" y1="9.5" x2="19.8" y2="7.8" />
      </g>
      <path
        d="M14 35h19a6.5 6.5 0 0 0 .8-12.9A8.5 8.5 0 0 0 17.4 20a6.5 6.5 0 0 0-3.4 15z"
        fill="url(#cloudSilver)"
      />
    </svg>
  );
}

function SunOnlySvg({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`${className} shrink-0`} aria-hidden="true">
      <circle cx="16" cy="16" r="6.5" fill="#fbbf24" />
      <g stroke="#fde047" strokeWidth="1.8" strokeLinecap="round">
        <line x1="16" y1="3" x2="16" y2="6" />
        <line x1="16" y1="26" x2="16" y2="29" />
        <line x1="3" y1="16" x2="6" y2="16" />
        <line x1="26" y1="16" x2="29" y2="16" />
        <line x1="6.8" y1="6.8" x2="9" y2="9" />
        <line x1="23" y1="23" x2="25.2" y2="25.2" />
        <line x1="25.2" y1="6.8" x2="23" y2="9" />
        <line x1="9" y1="23" x2="6.8" y2="25.2" />
      </g>
    </svg>
  );
}

export function CommandWorkspace({
  voiceState,
  audioLevel,
  animationQuality,
  activeAgents,
  hologram,
  messages,
  wakeWord,
  wakeWordEnabled,
  isListening,
  isRecordingAudio,
  liveTranscript,
  errorBanner,
  launchNotice,
  apps,
  calendar,
  telemetry,
  cpuHistory,
  weather,
  weatherError,
  onSelectSection,
  onSubmitCommand,
  onConfirmAction,
  onToggleListening,
  onToggleWakeWord,
  onLaunchApp,
  onToggleEvent,
  onSpeakText,
  onDismissError,
  onDismissLaunchNotice,
}: CommandWorkspaceProps) {
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewModal, setPreviewModal] = useState<{
    name: string;
    content: string;
    sizeBytes: number;
  } | null>(null);
  const [showResponseDrawer, setShowResponseDrawer] = useState(false);
  const prevMsgCountRef = useRef(messages.length);
  const hasBootstrappedRef = useRef(false);

  useEffect(() => {
    if (!hasBootstrappedRef.current) {
      if (messages.length > 0) {
        hasBootstrappedRef.current = true;
      }
      prevMsgCountRef.current = messages.length;
      return;
    }
    if (messages.length > prevMsgCountRef.current) {
      setShowResponseDrawer(true);
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]);

  const handleSend = async (textToSend?: string) => {
    const cmd = (textToSend ?? input).trim();
    if (!cmd || submitting) return;
    setSubmitting(true);
    if (!textToSend) setInput('');
    try {
      const ok = await onSubmitCommand(cmd);
      setShowResponseDrawer(ok !== false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenRecentFile = async (refFile: (typeof REFERENCE_RECENT_FILES)[number]) => {
    try {
      const searchRes = await fetch(`/api/files?q=${encodeURIComponent(refFile.name)}`);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const found = searchData?.files?.[0];
        if (found?.path) {
          const readRes = await fetch('/api/files/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: found.path }),
          });
          if (readRes.ok) {
            setPreviewModal(await readRes.json());
            return;
          }
        }
      }
    } catch {
      // Fall through to structured preview
    }
    setPreviewModal({
      name: refFile.name,
      content: `${refFile.name}\n\n${refFile.summary}`,
      sizeBytes: refFile.sizeBytes,
    });
  };

  const latestAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const voiceMeta = VOICE_STATE_META[voiceState];
  const micActive = isListening || isRecordingAudio;

  // Purple/magenta waveform bars matching reference
  const smallBars = [24, 42, 68, 52, 85, 96, 62, 78, 92, 58, 88, 65, 48, 72, 40, 28];
  const leftCenterBars = [18, 22, 28, 36, 52, 40, 74, 88, 64, 96, 56, 82, 46, 70, 86, 54, 78, 62];
  const rightCenterBars = [...leftCenterBars].reverse();

  // Live CPU history sparkline (uses real telemetry samples only)
  const baseCpu = telemetry?.cpuLoad ?? 0;
  const sparkPoints = cpuHistory.length >= 2 ? cpuHistory : [baseCpu, baseCpu];
  const svgW = 148;
  const svgH = 54;
  const sparkLinePath = sparkPoints
    .map((val, idx) => {
      const x = (idx / Math.max(1, sparkPoints.length - 1)) * svgW;
      const y = svgH - (Math.min(100, Math.max(2, val)) / 100) * (svgH - 8) - 4;
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const sparkAreaPath = `${sparkLinePath} L${svgW},${svgH} L0,${svgH} Z`;

  const todayDate = new Date();
  const todayMonth = todayDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const todayDay = String(todayDate.getDate());
  const todayWeekday = todayDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();

  const cpuValueText = telemetry ? `${telemetry.cpuLoad}%` : '--';
  const gpuValueText =
    telemetry && telemetry.gpuUsage !== null ? `${telemetry.gpuUsage}%` : telemetry ? 'N/A' : '--';
  const ramValueText = telemetry ? `${telemetry.ramPercent}%` : '--';
  const storageValueText = telemetry ? `${telemetry.storagePercent}%` : '--';
  const cpuTempText =
    telemetry && telemetry.cpuTemp !== null ? `${telemetry.cpuTemp}°C` : telemetry ? 'N/A' : '--';
  const gpuTempText =
    telemetry && telemetry.gpuTemp !== null ? `${telemetry.gpuTemp}°C` : telemetry ? 'N/A' : '--';
  const ramDetailText = telemetry ? `${telemetry.ramUsedGb} / ${telemetry.ramTotalGb} GB` : '--';
  const diskDetailText = telemetry ? `${telemetry.storageUsedGb} / ${telemetry.storageTotalGb} GB` : '--';

  return (
    <div className="flex-1 h-full overflow-y-auto lg:overflow-hidden px-3 py-1.5 flex flex-col">
      {errorBanner && (
        <div
          role="alert"
          className="mb-2 flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-rose-950/90 border border-rose-500/40 text-xs text-rose-200 shrink-0"
        >
          <span className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
            <span>{errorBanner}</span>
          </span>
          <button
            type="button"
            onClick={onDismissError}
            aria-label="Dismiss error"
            className="text-rose-300 hover:text-white p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3-Column Command Center Grid matching reference proportions */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[312px_minmax(0,1fr)_346px] xl:grid-cols-[324px_minmax(0,1fr)_362px] gap-3 items-stretch">
        {/* LEFT DASHBOARD COLUMN */}
        <div className="flex flex-col gap-2.5 min-h-0 overflow-y-auto pr-0.5">
          {/* 1. AI STATUS CARD */}
          <section className="hud-panel rounded-2xl p-3.5 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold tracking-[0.12em] text-white uppercase">
                AI STATUS
              </h2>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                <span>Online</span>
              </span>
            </div>

            <div className="hud-inset-box flex items-center justify-between gap-2 px-3 py-2 rounded-xl">
              <div className="flex items-center gap-2.5 text-xs min-w-0">
                <Mic className="w-4 h-4 text-fuchsia-400 shrink-0 drop-shadow-[0_0_6px_rgba(232,121,249,0.7)]" aria-hidden="true" />
                <span className="text-purple-200/80 truncate">
                  Wake Word: <strong className="text-white font-semibold">{wakeWord}</strong>
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={wakeWordEnabled}
                aria-label={`Toggle wake word "${wakeWord}"`}
                onClick={onToggleWakeWord}
                className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                  wakeWordEnabled
                    ? 'bg-gradient-to-r from-purple-600 to-fuchsia-500 shadow-[0_0_10px_rgba(217,70,239,0.6)]'
                    : 'bg-purple-950 border border-purple-700/60'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    wakeWordEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-0.5">
              <div className="flex items-center gap-[3px] h-6 flex-1">
                {smallBars.map((h, i) => {
                  const activeBoost = micActive ? Math.min(100, Math.round(h * (0.65 + audioLevel * 0.7))) : h;
                  return (
                    <div
                      key={i}
                      className="w-[2.5px] rounded-full bg-gradient-to-t from-purple-500 via-fuchsia-400 to-pink-300 shadow-[0_0_5px_rgba(217,70,239,0.65)] transition-all duration-150"
                      style={{ height: `${activeBoost}%` }}
                    />
                  );
                })}
                {[1, 2, 3, 4].map((d) => (
                  <span key={d} className="w-1 h-1 rounded-full bg-purple-400/75" />
                ))}
              </div>
              <span className="text-[11px] font-medium text-purple-100 whitespace-nowrap">
                {voiceState === 'standby' ? 'Listening Ready' : voiceMeta.label}
              </span>
            </div>
          </section>

          {/* 2. QUICK LAUNCH APPS CARD */}
          <section className="hud-panel rounded-2xl p-3.5 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-[0.1em] text-white uppercase">
                QUICK LAUNCH APPS
              </h2>
              <button
                type="button"
                onClick={() => onSelectSection('applications')}
                className="text-[11px] font-medium text-purple-200/90 hover:text-white transition-colors"
              >
                View All →
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {REFERENCE_APPS.map((refApp) => {
                const matched = apps.find(
                  (a) =>
                    a.id === refApp.id ||
                    a.name.toLowerCase().includes(refApp.label.toLowerCase())
                ) ?? {
                  id: refApp.id,
                  name: refApp.label,
                  category: refApp.category,
                  command: refApp.command,
                  installed: true,
                  pinned: true,
                  description: refApp.label,
                };
                return (
                  <button
                    key={refApp.id}
                    type="button"
                    onClick={() => onLaunchApp(matched)}
                    title={`Launch ${refApp.label}`}
                    className="hud-inset-box flex flex-col items-center gap-1.5 px-1 py-2 rounded-xl hover:border-fuchsia-400/70 hover:bg-purple-900/35 transition-all"
                  >
                    <AppBrandIcon id={refApp.id} />
                    <span className="text-[8.8px] tracking-tight leading-tight text-purple-50 w-full text-center whitespace-nowrap">
                      {refApp.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {launchNotice && (
              <div
                role="status"
                aria-label="App launch status"
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-purple-500/20 border border-fuchsia-400/45 text-[11px] text-purple-100"
              >
                <span className="truncate">{launchNotice}</span>
                <button
                  type="button"
                  onClick={onDismissLaunchNotice}
                  aria-label="Dismiss app launch notice"
                  className="text-purple-200 hover:text-white shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </section>

          {/* 3. RECENT FILES CARD */}
          <section className="hud-panel rounded-2xl p-3.5 flex-1 min-h-[180px] flex flex-col gap-2.5">
            <div className="flex items-center justify-between shrink-0">
              <h2 className="text-xs font-bold tracking-[0.1em] text-white uppercase">
                RECENT FILES
              </h2>
              <button
                type="button"
                onClick={() => onSelectSection('file-explorer')}
                className="text-[11px] font-medium text-purple-200/90 hover:text-white transition-colors"
              >
                View All →
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 flex flex-col">
              {REFERENCE_RECENT_FILES.map((file) => (
                <div
                  key={file.id}
                  className="hud-inset-box flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileTypeBadge type={file.type} />
                    <span className="text-[11px] text-purple-50 truncate">{file.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenRecentFile(file)}
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#17092b] text-purple-100 border border-purple-500/45 hover:border-fuchsia-400 hover:text-white shrink-0 transition-colors"
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* CENTER HOLOGRAM & VOICE STAGE */}
        <div className="relative flex flex-col items-center justify-between min-h-[480px] lg:min-h-0 py-1">
          {/* Full 3D Holographic Reactor Sphere + 3D Delta Emblem + 3D Concentric HUD Rings + Volumetric Beam + 3D Reactor Platform */}
          <div className="relative flex-1 w-full flex flex-col items-center justify-center min-h-0">
            <div className="relative w-full flex flex-col items-center justify-center">
              <FridayCore3D
                voiceState={voiceState}
                audioLevel={audioLevel}
                animationQuality={animationQuality}
                activeAgents={activeAgents}
                hologram={hologram}
                compact
              />

              {/* Crisp F.R.I.D.A.Y. Title & Subtitle centered cleanly directly below the compact sphere and above the circular reactor platform */}
              <div className="pointer-events-none select-none absolute bottom-[162px] sm:bottom-[170px] inset-x-0 flex flex-col items-center text-center z-10">
                <h1 className="font-display text-[34px] sm:text-[38px] font-bold tracking-[0.2em] text-white drop-shadow-[0_0_20px_rgba(217,70,239,0.85)] leading-none">
                  F.R.I.D.A.Y.
                </h1>
                <p className="text-[11px] text-purple-100/95 tracking-wide mt-1.5 drop-shadow-[0_2px_10px_rgba(5,2,12,0.95)]">
                  Fully Responsive Intelligent Digital Assistant for You
                </p>
              </div>
            </div>

            {/* Live Collapsible Assistant Response Overlay Card (appears only after user sends a command) */}
            {showResponseDrawer && latestAssistant && (
              <div
                aria-label="Latest Assistant Response"
                className="w-full max-w-xl mt-1 rounded-2xl border border-fuchsia-400/50 bg-[#0d041d]/95 p-3.5 shadow-[0_0_26px_rgba(192,38,211,0.35)] z-20 max-h-40 overflow-y-auto space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-fuchsia-300">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      F.R.I.D.A.Y. Response
                      {latestAssistant.timings
                        ? ` · ${latestAssistant.timings.totalMs}ms (${latestAssistant.timings.engine})`
                        : ''}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSpeakText(latestAssistant.content)}
                      aria-label="Speak response aloud"
                      className="text-purple-200 hover:text-white"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectSection('ai-chat')}
                      className="text-fuchsia-300 hover:text-white underline underline-offset-2"
                    >
                      Full Stream
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResponseDrawer(false)}
                      aria-label="Minimize response card"
                      className="text-purple-300 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-purple-50 whitespace-pre-wrap leading-relaxed">
                  {latestAssistant.content}
                </p>

                {latestAssistant.sources && latestAssistant.sources.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-purple-800/60">
                    {latestAssistant.sources.slice(0, 3).map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-fuchsia-300 hover:text-white underline underline-offset-2"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span className="truncate max-w-[180px]">{src.title}</span>
                      </a>
                    ))}
                  </div>
                )}

                {latestAssistant.pendingConfirmation && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        onConfirmAction(
                          latestAssistant.pendingConfirmation!.actionType,
                          latestAssistant.pendingConfirmation!.summary,
                          true
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 hover:bg-emerald-500/30"
                    >
                      <Check className="w-3 h-3" aria-hidden="true" />
                      <span>Confirm Action</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onConfirmAction(
                          latestAssistant.pendingConfirmation!.actionType,
                          latestAssistant.pendingConfirmation!.summary,
                          false
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-purple-950 text-purple-200 border border-purple-700"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                      <span>Cancel</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Synchronized Neon-Purple Waveform + Central Mic Button + Pill Prompt Input */}
          <div className="w-full max-w-[600px] flex flex-col items-center gap-2 shrink-0 pt-1">
            {/* Waveform & Center Mic Trigger */}
            <div className="w-full flex items-center justify-center gap-2.5 px-2">
              <div className="flex-1 flex items-center justify-end gap-[3px] h-8 max-w-[200px]">
                {[1, 2, 3, 4].map((d) => (
                  <span key={d} className="w-1 h-1 rounded-full bg-purple-400/70" />
                ))}
                {leftCenterBars.map((h, i) => {
                  const activeBoost =
                    micActive || voiceState === 'speaking'
                      ? Math.min(100, Math.round(h * (0.65 + audioLevel * 0.75)))
                      : h;
                  return (
                    <div
                      key={i}
                      className="w-[2.5px] rounded-full bg-gradient-to-t from-purple-500 via-fuchsia-400 to-pink-300 shadow-[0_0_6px_rgba(217,70,239,0.7)] transition-all duration-150"
                      style={{ height: `${activeBoost}%` }}
                    />
                  );
                })}
              </div>

              <button
                type="button"
                onClick={onToggleListening}
                aria-label={micActive ? 'Stop voice listening' : 'Start voice listening'}
                className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all shrink-0 ${
                  micActive
                    ? 'bg-gradient-to-b from-fuchsia-400 to-purple-600 text-white border-fuchsia-200 shadow-[0_0_32px_rgba(232,121,249,0.95)]'
                    : 'bg-gradient-to-b from-[#2e0c56] to-[#120426] text-white border-fuchsia-400 shadow-[0_0_26px_rgba(217,70,239,0.75),inset_0_0_14px_rgba(168,85,247,0.45)] hover:border-fuchsia-300'
                }`}
              >
                <Mic className="w-6 h-6 drop-shadow-[0_0_8px_rgba(255,255,255,0.85)]" />
              </button>

              <div className="flex-1 flex items-center justify-start gap-[3px] h-8 max-w-[200px]">
                {rightCenterBars.map((h, i) => {
                  const activeBoost =
                    micActive || voiceState === 'speaking'
                      ? Math.min(100, Math.round(h * (0.65 + audioLevel * 0.75)))
                      : h;
                  return (
                    <div
                      key={i}
                      className="w-[2.5px] rounded-full bg-gradient-to-t from-purple-500 via-fuchsia-400 to-pink-300 shadow-[0_0_6px_rgba(217,70,239,0.7)] transition-all duration-150"
                      style={{ height: `${activeBoost}%` }}
                    />
                  );
                })}
                {[1, 2, 3, 4].map((d) => (
                  <span key={d} className="w-1 h-1 rounded-full bg-purple-400/70" />
                ))}
              </div>
            </div>

            <div className="text-xs font-medium text-purple-100 text-center max-w-full px-2">
              <span className="truncate inline-block max-w-[460px]">
                {liveTranscript
                  ? liveTranscript
                  : isRecordingAudio
                    ? 'Recording audio...'
                    : voiceState === 'standby'
                      ? 'Listening...'
                      : `${voiceMeta.label}...`}
              </span>
            </div>

            {/* Futuristic Command Input Pill */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="w-full hud-input-pill rounded-full px-2.5 py-1.5 flex items-center gap-2"
            >
              <div className="w-7 h-7 rounded-full bg-purple-900/60 border border-fuchsia-400/65 flex items-center justify-center text-fuchsia-300 shrink-0 shadow-[0_0_10px_rgba(217,70,239,0.45)]">
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              </div>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask me anything, or say “${wakeWord}”...`}
                aria-label="Natural language command input"
                className="flex-1 min-w-0 bg-transparent px-1 py-1 text-sm text-white placeholder:text-purple-200/70 focus:outline-none"
              />

              <button
                type="button"
                onClick={onToggleListening}
                aria-label="Voice speech recognition"
                className={`p-1.5 rounded-full transition-colors shrink-0 ${
                  isListening ? 'text-fuchsia-300 bg-fuchsia-500/20' : 'text-purple-100/85 hover:text-white'
                }`}
              >
                <Mic className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onSelectSection('file-explorer')}
                aria-label="Open screen and image intelligence"
                title="Vision & Screen Capture Analyzer"
                className="p-1.5 rounded-full text-purple-100/85 hover:text-white transition-colors shrink-0"
              >
                <Camera className="w-4 h-4" />
              </button>

              <button
                type="submit"
                disabled={submitting}
                aria-label="Send command"
                className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-400 to-purple-600 text-white flex items-center justify-center shadow-[0_0_14px_rgba(217,70,239,0.65)] hover:brightness-110 transition-all shrink-0"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT DASHBOARD COLUMN */}
        <div className="flex flex-col gap-2.5 min-h-0 overflow-y-auto pl-0.5">
          {/* 1. WEATHER CARD (Live Open-Meteo Data) */}
          <section className="hud-panel rounded-2xl p-3.5 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold tracking-[0.1em] text-white uppercase flex items-center gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5 text-purple-300" aria-hidden="true" />
                <span>WEATHER</span>
              </h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-100 truncate max-w-[175px]">
                <MapPin className="w-3.5 h-3.5 text-purple-300 shrink-0" aria-hidden="true" />
                <span>{weather?.location ?? 'Kolhapur, MH'}</span>
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <SunCloudWeatherSvg className="w-12 h-12" />
                <div>
                  <div className="font-display text-[32px] font-bold text-white tabular-nums leading-none">
                    {weather ? `${weather.temperature}°C` : '--'}
                  </div>
                  <div className="text-xs text-purple-100/90 mt-1">
                    {weather?.condition ?? (weatherError ? 'Weather Offline' : 'Syncing...')}
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-[11px] tabular-nums min-w-[138px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-purple-200/80 flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-fuchsia-400" aria-hidden="true" />
                    <span>Humidity</span>
                  </span>
                  <span className="font-semibold text-white">
                    {weather ? `${weather.humidity}%` : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-purple-200/80 flex items-center gap-1.5">
                    <Wind className="w-3.5 h-3.5 text-fuchsia-400" aria-hidden="true" />
                    <span>Wind</span>
                  </span>
                  <span className="font-semibold text-white">
                    {weather ? `${weather.windSpeedKmh} km/h` : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-purple-200/80 flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-fuchsia-400" aria-hidden="true" />
                    <span>Feels</span>
                  </span>
                  <span className="font-semibold text-emerald-400">
                    {weather ? `${weather.feelsLike}°C` : '--'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-0.5">
              {(weather?.forecast?.slice(0, 3) ?? [0, 1, 2]).map((dayItem, idx) => {
                const isForecastObj = typeof dayItem === 'object' && dayItem !== null;
                const label = isForecastObj
                  ? formatForecastDayLabel(dayItem.date, idx)
                  : idx === 0
                    ? 'Today'
                    : `+${idx}d`;
                const rangeText = isForecastObj
                  ? `${dayItem.tempMax}° / ${dayItem.tempMin}°`
                  : '-- / --';
                const isClear = isForecastObj && dayItem.code <= 1;
                return (
                  <div
                    key={isForecastObj ? dayItem.date : idx}
                    className="hud-inset-box px-2 py-1.5 rounded-xl flex items-center justify-center gap-1.5 tabular-nums"
                  >
                    {isClear ? (
                      <SunOnlySvg className="w-6 h-6" />
                    ) : (
                      <SunCloudWeatherSvg className="w-6 h-6" />
                    )}
                    <div className="leading-tight">
                      <div className="text-[10px] font-medium text-purple-200">{label}</div>
                      <div className="text-[11px] font-semibold text-white">{rangeText}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 2. CALENDAR & SCHEDULE CARD */}
          <section className="hud-panel rounded-2xl p-3.5 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold tracking-[0.1em] text-white uppercase flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-purple-300" aria-hidden="true" />
                <span>CALENDAR &amp; SCHEDULE</span>
              </h2>
              <button
                type="button"
                onClick={() => onSelectSection('calendar')}
                className="text-[11px] font-medium text-purple-200/90 hover:text-white"
              >
                View Calendar →
              </button>
            </div>

            <div className="flex items-stretch gap-3">
              {/* Framed Date Card */}
              <div className="w-[68px] shrink-0 rounded-xl bg-gradient-to-b from-[#230a45]/90 to-[#110424]/95 border border-purple-400/55 shadow-[0_0_14px_rgba(168,85,247,0.28)] flex flex-col items-center justify-center py-2 text-center">
                <span className="text-[10px] font-semibold text-purple-200 tracking-wider">
                  {todayMonth}
                </span>
                <span className="font-display text-2xl font-bold text-white leading-tight tabular-nums">
                  {todayDay}
                </span>
                <span className="text-[10px] text-purple-200/80">{todayWeekday}</span>
              </div>

              {/* Today's Agenda List */}
              <div className="flex-1 min-w-0 divide-y divide-purple-500/20">
                {calendar.slice(0, 3).length === 0 ? (
                  <div className="py-3 text-xs text-purple-200/75">
                    No upcoming events scheduled.
                  </div>
                ) : (
                  calendar.slice(0, 3).map((evt) => (
                    <button
                      key={evt.id}
                      type="button"
                      onClick={() => onToggleEvent(evt.id)}
                      className="w-full text-left flex items-start gap-2.5 py-1.5 first:pt-0.5 last:pb-0.5 hover:bg-purple-900/20 rounded transition-colors"
                    >
                      <span
                        className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${getCategoryDotClass(evt.category)}`}
                      />
                      <div className="min-w-0 flex-1 leading-tight">
                        <div
                          className={`text-xs font-medium truncate ${
                            evt.completed ? 'line-through text-purple-300/60' : 'text-white'
                          }`}
                        >
                          {evt.title}
                        </div>
                        <div className="text-[10px] font-mono-tabular text-purple-200/75 mt-0.5">
                          {evt.date} · {formatAgendaTime(evt.time)}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* 3. SYSTEM MONITOR CARD (Real /api/telemetry Hardware Data) */}
          <section className="hud-panel rounded-2xl p-3.5 flex-1 min-h-[195px] flex flex-col justify-center gap-3.5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => onSelectSection('system-monitor')}
                className="text-xs font-bold tracking-[0.1em] text-white uppercase flex items-center gap-1.5 hover:text-fuchsia-200"
              >
                <Monitor className="w-3.5 h-3.5 text-purple-300" aria-hidden="true" />
                <span>SYSTEM MONITOR</span>
              </button>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                <span>{telemetry ? 'Live' : 'Sync'}</span>
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1 py-0.5">
              <RingGauge
                label="CPU"
                valueText={cpuValueText}
                percent={telemetry?.cpuLoad ?? 0}
                strokeColor="#9333ea"
              />
              <RingGauge
                label="GPU"
                valueText={gpuValueText}
                percent={telemetry?.gpuUsage ?? 0}
                strokeColor="#a855f7"
              />
              <RingGauge
                label="RAM"
                valueText={ramValueText}
                percent={telemetry?.ramPercent ?? 0}
                strokeColor="#c026d3"
              />
              <RingGauge
                label="Storage"
                valueText={storageValueText}
                percent={telemetry?.storagePercent ?? 0}
                strokeColor="#e879f9"
              />
            </div>

            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              {/* Live Neon Purple CPU Sparkline Graph */}
              <div className="hud-inset-box rounded-xl px-2 py-2 h-[78px] flex items-center relative">
                <div className="flex flex-col justify-between h-full text-[8px] font-mono-tabular text-purple-300/65 pr-1 select-none">
                  <span>100</span>
                  <span>50</span>
                  <span>0</span>
                </div>
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-12 overflow-visible" aria-hidden="true">
                  <defs>
                    <linearGradient id="cpuPurpleAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d946ef" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#7e22ce" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  <line x1="0" y1={svgH * 0.5} x2={svgW} y2={svgH * 0.5} stroke="rgba(168,85,247,0.18)" strokeWidth="1" />
                  <path d={sparkAreaPath} fill="url(#cpuPurpleAreaGrad)" />
                  <path
                    d={sparkLinePath}
                    fill="none"
                    stroke="#e879f9"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: 'drop-shadow(0 0 4px rgba(232,121,249,0.75))' }}
                  />
                </svg>
              </div>

              {/* Detailed Hardware Readout */}
              <div className="space-y-1 text-[10.5px] font-mono-tabular min-w-[152px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-purple-200/80 flex items-center gap-1.5">
                    <Cpu className="w-3 h-3 text-purple-300" aria-hidden="true" />
                    <span>CPU Temp</span>
                  </span>
                  <span className="text-white font-semibold">{cpuTempText}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-purple-200/80 flex items-center gap-1.5">
                    <Monitor className="w-3 h-3 text-purple-300" aria-hidden="true" />
                    <span>GPU Temp</span>
                  </span>
                  <span className="text-white font-semibold">{gpuTempText}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-purple-200/80 flex items-center gap-1.5">
                    <MemoryStick className="w-3 h-3 text-purple-300" aria-hidden="true" />
                    <span>RAM Used</span>
                  </span>
                  <span className="text-white font-semibold">{ramDetailText}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-purple-200/80 flex items-center gap-1.5">
                    <HardDrive className="w-3 h-3 text-purple-300" aria-hidden="true" />
                    <span>Disk Used</span>
                  </span>
                  <span className="text-white font-semibold">{diskDetailText}</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Quick Recent File Preview Modal */}
      {previewModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewModal.name}`}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div className="hud-panel rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col p-4 space-y-3 bg-[#0c041c]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-fuchsia-400 shrink-0" aria-hidden="true" />
                <span className="text-sm font-semibold text-white truncate">{previewModal.name}</span>
                <span className="text-xs font-mono-tabular text-purple-300 shrink-0">
                  ({formatBytes(previewModal.sizeBytes)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewModal(null);
                    onSelectSection('file-explorer');
                  }}
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-purple-600/30 text-purple-100 border border-fuchsia-400/50"
                >
                  Open in Explorer
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModal(null)}
                  aria-label="Close file preview"
                  className="p-1.5 rounded-md text-purple-200 hover:text-white hover:bg-purple-900/50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-3 rounded-xl bg-[#06020e] border border-purple-500/30 text-xs font-mono-tabular text-purple-100 whitespace-pre-wrap">
              {previewModal.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
