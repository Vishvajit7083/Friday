import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AudioLines,
  Calendar as CalendarIcon,
  Camera,
  Check,
  Cloud,
  CloudRain,
  CloudSun,
  Code2,
  Cpu,
  Droplets,
  ExternalLink,
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Globe,
  HardDrive,
  Layers,
  MessageSquare,
  Mic,
  MicOff,
  Music,
  Send,
  ShieldAlert,
  Sparkles,
  Sun,
  Terminal,
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
  HologramMode,
  HologramSettings,
  IndexedFileItem,
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

const HOLOGRAM_MODES: Array<{ id: HologramMode; label: string }> = [
  { id: 'orbital', label: 'Orbital Core' },
  { id: 'neural-matrix', label: 'Neural Matrix' },
  { id: 'telemetry-sphere', label: 'Telemetry' },
  { id: 'exploded', label: 'Exploded' },
];

function AppTileVisual({ app }: { app: DesktopAppItem }) {
  const n = app.name.toLowerCase();
  if (n.includes('chrome')) {
    return (
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 via-emerald-400 to-sky-500 flex items-center justify-center text-slate-950 shadow-md">
        <Globe className="w-4 h-4" />
      </div>
    );
  }
  if (n.includes('code') || n.includes('studio')) {
    return (
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white shadow-md">
        <Code2 className="w-4 h-4" />
      </div>
    );
  }
  if (n.includes('whatsapp')) {
    return (
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center text-white shadow-md">
        <MessageSquare className="w-4 h-4" />
      </div>
    );
  }
  if (n.includes('media') || n.includes('spotify')) {
    return (
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white shadow-md">
        <Music className="w-4 h-4" />
      </div>
    );
  }
  if (n.includes('terminal')) {
    return (
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-md">
        <Terminal className="w-4 h-4" />
      </div>
    );
  }
  if (n.includes('explorer')) {
    return (
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-slate-950 shadow-md">
        <FolderOpen className="w-4 h-4" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md">
      <FileText className="w-4 h-4" />
    </div>
  );
}

function FileTypeBadge({ category, ext }: { category: IndexedFileItem['category']; ext: string }) {
  if (category === 'code' || ext === '.ts' || ext === '.tsx' || ext === '.json') {
    return <FileCode2 className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />;
  }
  if (category === 'spreadsheet') {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />;
  }
  if (ext === '.zip' || ext === '.tar' || ext === '.gz') {
    return <FileArchive className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />;
  }
  return <FileText className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />;
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
  const r = 21;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-14 h-14 flex items-center justify-center">
        <svg viewBox="0 0 54 54" className="w-14 h-14 -rotate-90" aria-hidden="true">
          <circle
            cx="27"
            cy="27"
            r={r}
            fill="none"
            stroke="rgba(30, 41, 59, 0.9)"
            strokeWidth="5"
          />
          <circle
            cx="27"
            cy="27"
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth="5"
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
          <span className="text-[9px] text-slate-400 uppercase">{label}</span>
          <span className="text-[11px] font-bold font-mono-tabular text-slate-100">{valueText}</span>
        </div>
      </div>
    </div>
  );
}

function WeatherConditionIcon({ condition }: { condition?: string }) {
  const c = (condition || '').toLowerCase();
  if (c.includes('rain') || c.includes('drizzle') || c.includes('storm')) {
    return <CloudRain className="w-10 h-10 text-sky-300 shrink-0" aria-hidden="true" />;
  }
  if (c.includes('clear') || c.includes('sunny')) {
    return <Sun className="w-10 h-10 text-amber-300 shrink-0" aria-hidden="true" />;
  }
  if (c.includes('overcast') || c.includes('fog')) {
    return <Cloud className="w-10 h-10 text-slate-300 shrink-0" aria-hidden="true" />;
  }
  return <CloudSun className="w-10 h-10 text-amber-300 shrink-0" aria-hidden="true" />;
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
  apiStatus,
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
  onToggleRecordAudio,
  onToggleWakeWord,
  onUpdateHologram,
  onLaunchApp,
  onToggleEvent,
  onSpeakText,
  onCheckApiConnection,
  onDismissError,
  onDismissLaunchNotice,
}: CommandWorkspaceProps) {
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recentFiles, setRecentFiles] = useState<IndexedFileItem[]>([]);
  const [previewModal, setPreviewModal] = useState<{
    name: string;
    content: string;
    sizeBytes: number;
  } | null>(null);
  const [showResponseDrawer, setShowResponseDrawer] = useState(false);
  const prevMsgCountRef = useRef(messages.length);

  // Load real recent indexed files from workspace
  useEffect(() => {
    let mounted = true;
    fetch('/api/files')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted || !data?.files) return;
        setRecentFiles((data.files as IndexedFileItem[]).slice(0, 4));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Reveal compact AI response drawer when a new reply arrives after initial bootstrap
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

  const handleOpenRecentFile = async (file: IndexedFileItem) => {
    try {
      const res = await fetch('/api/files/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: file.path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to read file');
      setPreviewModal(data);
    } catch (err) {
      setPreviewModal({
        name: file.name,
        content: (err as Error).message,
        sizeBytes: file.sizeBytes,
      });
    }
  };

  const latestAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const voiceMeta = VOICE_STATE_META[voiceState];

  const micActive = isListening || isRecordingAudio;

  // Waveform bars for AI Status & Bottom Mic Stage
  const smallBars = Array.from({ length: 18 }, (_, i) => {
    const wave = Math.abs(Math.sin(i * 0.65 + (micActive ? audioLevel * 10 : 0.7)));
    const h = micActive
      ? Math.max(20, Math.round((0.3 + audioLevel * 0.8) * wave * 100))
      : Math.max(18, Math.round(wave * 68));
    return h;
  });

  const centerBars = Array.from({ length: 24 }, (_, i) => {
    const distanceFromEdge = Math.min(i, 23 - i) / 11;
    const wave = Math.abs(Math.sin(i * 0.55 + (micActive || voiceState === 'speaking' ? audioLevel * 12 : 1.1)));
    const h =
      micActive || voiceState === 'speaking'
        ? Math.max(18, Math.round((0.35 + audioLevel * 0.75) * wave * 100))
        : Math.max(16, Math.round(distanceFromEdge * wave * 82));
    return h;
  });

  // Real CPU sparkline
  const sparkPoints = cpuHistory.length > 1 ? cpuHistory : [12, 16, 14, 18];
  const svgW = 148;
  const svgH = 44;
  const sparkLinePath = sparkPoints
    .map((val, idx) => {
      const x = (idx / Math.max(1, sparkPoints.length - 1)) * svgW;
      const y = svgH - (Math.min(100, Math.max(0, val)) / 100) * (svgH - 8) - 4;
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const sparkAreaPath = `${sparkLinePath} L${svgW},${svgH} L0,${svgH} Z`;

  // Real Today Date & Schedule
  const now = new Date();
  const monthShort = now.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
  const dayNum = now.getDate();
  const weekdayShort = now.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
  const todayIso = now.toISOString().slice(0, 10);
  const upcomingEvents = calendar.filter((e) => e.date >= todayIso).slice(0, 3);

  const dotColorMap: Record<CalendarEvent['category'], string> = {
    meeting: 'bg-violet-400',
    task: 'bg-cyan-400',
    reminder: 'bg-amber-400',
    focus: 'bg-emerald-400',
  };

  return (
    <div className="flex-1 h-full overflow-y-auto lg:overflow-hidden px-3 py-2 flex flex-col">
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

      {/* 3-Column Command Center Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[276px_minmax(0,1fr)_316px] xl:grid-cols-[292px_minmax(0,1fr)_336px] gap-3 items-stretch">
        {/* LEFT DASHBOARD COLUMN */}
        <div className="flex flex-col gap-2.5 min-h-0 overflow-y-auto pr-0.5">
          {/* 1. AI STATUS CARD */}
          <section className="hud-panel rounded-2xl p-3.5 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold tracking-[0.14em] text-slate-100 uppercase">
                AI Status
              </h2>
              <button
                type="button"
                onClick={onCheckApiConnection}
                title={
                  apiStatus.checking
                    ? 'Checking built-in Local AI & live web engine...'
                    : apiStatus.connected
                      ? `${apiStatus.provider} · ${apiStatus.model}${apiStatus.latencyMs ? ` (${apiStatus.latencyMs}ms)` : ''}${apiStatus.freeWebReady ? ' · Free Web Ready' : ''} — Click to re-check`
                      : `${apiStatus.error || 'AI engine offline'} — Click to retry`
                }
                aria-label="AI Engine connection status"
                className={`inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-85 ${
                  apiStatus.checking
                    ? 'text-amber-300'
                    : apiStatus.connected
                      ? 'text-emerald-300'
                      : 'text-rose-300'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    apiStatus.checking
                      ? 'bg-amber-400 animate-pulse shadow-[0_0_8px_#fbbf24]'
                      : apiStatus.connected
                        ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                        : 'bg-rose-400 shadow-[0_0_8px_#fb7185]'
                  }`}
                />
                <span>
                  {apiStatus.checking
                    ? 'Checking API...'
                    : apiStatus.connected
                      ? 'API Connected'
                      : 'API Offline · Retry'}
                </span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-slate-950/60 border border-cyan-500/20">
              <div className="flex items-center gap-2 text-xs min-w-0">
                <Mic className="w-4 h-4 text-cyan-300 shrink-0" aria-hidden="true" />
                <span className="text-slate-300 truncate">
                  Wake Word: <strong className="text-slate-100">{wakeWord}</strong>
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={wakeWordEnabled}
                aria-label={`Toggle wake word "${wakeWord}"`}
                onClick={onToggleWakeWord}
                className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
                  wakeWordEnabled ? 'bg-cyan-400' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-slate-950 transition-transform ${
                    wakeWordEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-0.5">
              <div className="flex items-center gap-0.5 h-6 flex-1">
                {smallBars.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-full bg-cyan-400/85 transition-all duration-150"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <span className="text-[11px] font-medium text-slate-200 whitespace-nowrap">
                {voiceState === 'standby' ? 'Listening Ready' : voiceMeta.label}
              </span>
            </div>
          </section>

          {/* 2. QUICK LAUNCH APPS CARD */}
          <section className="hud-panel rounded-2xl p-3.5 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold tracking-[0.12em] text-slate-100 uppercase">
                Quick Launch Apps
              </h2>
              <button
                type="button"
                onClick={() => onSelectSection('applications')}
                className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
              >
                View All →
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {apps.slice(0, 8).map((app) => {
                const shortLabel = app.name
                  .replace('Visual Studio Code', 'VS Code')
                  .replace('Google Chrome', 'Chrome')
                  .replace('Windows Terminal', 'Terminal')
                  .replace('File Explorer', 'Explorer')
                  .replace('WhatsApp Desktop', 'WhatsApp')
                  .replace('Android Studio', 'Android')
                  .replace('Media Player', 'Media')
                  .replace('Notes & Scratchpad', 'Notes');
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => onLaunchApp(app)}
                    title={`Launch ${app.name}`}
                    className="flex flex-col items-center gap-1 px-0.5 py-1.5 rounded-xl bg-slate-950/60 border border-cyan-500/15 hover:border-cyan-400/55 hover:bg-cyan-500/10 transition-all"
                  >
                    <AppTileVisual app={app} />
                    <span className="text-[9.5px] leading-tight text-slate-200 w-full text-center whitespace-nowrap overflow-hidden text-ellipsis">
                      {shortLabel}
                    </span>
                  </button>
                );
              })}
            </div>

            {launchNotice && (
              <div
                role="status"
                aria-label="App launch status"
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-400/35 text-[11px] text-cyan-100"
              >
                <span className="truncate">{launchNotice}</span>
                <button
                  type="button"
                  onClick={onDismissLaunchNotice}
                  aria-label="Dismiss app launch notice"
                  className="text-cyan-300 hover:text-white shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </section>

          {/* 3. RECENT FILES CARD */}
          <section className="hud-panel rounded-2xl p-3.5 flex-1 min-h-[170px] flex flex-col gap-2">
            <div className="flex items-center justify-between shrink-0">
              <h2 className="text-xs font-bold tracking-[0.12em] text-slate-100 uppercase">
                Recent Files
              </h2>
              <button
                type="button"
                onClick={() => onSelectSection('file-explorer')}
                className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
              >
                View All →
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
              {recentFiles.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  Loading permitted workspace files...
                </div>
              ) : (
                recentFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-slate-950/60 border border-cyan-500/15"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileTypeBadge category={file.category} ext={file.extension} />
                      <span className="text-xs text-slate-200 truncate">{file.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenRecentFile(file)}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-900 text-cyan-200 border border-cyan-500/25 hover:border-cyan-400/60 shrink-0"
                    >
                      Open
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* CENTER HOLOGRAM & VOICE STAGE */}
        <div className="relative flex flex-col items-center justify-between min-h-[460px] lg:min-h-0 py-1">
          {/* Compact Hologram Projection Selector */}
          <div
            aria-label="Hologram Projection Modes"
            className="flex flex-wrap items-center justify-center gap-1.5 z-10"
          >
            {HOLOGRAM_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onUpdateHologram({ mode: m.id })}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  hologram.mode === m.id
                    ? 'hud-panel-active text-cyan-100'
                    : 'bg-slate-950/65 text-slate-400 border-cyan-500/20 hover:text-cyan-200'
                }`}
              >
                {m.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onUpdateHologram({ projectionBeam: !hologram.projectionBeam })}
              aria-label="Toggle holographic emitter beam"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
                hologram.projectionBeam
                  ? 'bg-indigo-500/25 text-indigo-100 border-indigo-400/50'
                  : 'bg-slate-950/65 text-slate-400 border-cyan-500/20'
              }`}
            >
              <Layers className="w-3 h-3" aria-hidden="true" />
              <span>Beam {hologram.projectionBeam ? 'On' : 'Off'}</span>
            </button>
          </div>

          {/* Holographic Neural Orb + Triangular Crest + Emitter Pedestal */}
          <div className="relative flex-1 w-full flex flex-col items-center justify-center min-h-0">
            <div className="relative flex flex-col items-center justify-center">
              <div className="relative flex items-center justify-center">
                <FridayCore3D
                  voiceState={voiceState}
                  audioLevel={audioLevel}
                  animationQuality={animationQuality}
                  activeAgents={activeAgents}
                  hologram={hologram}
                  compact
                />
                {/* Crisp Triangular Core Emblem centered inside the Hologram Sphere */}
                <svg
                  viewBox="0 0 64 56"
                  className="pointer-events-none absolute w-12 h-11 drop-shadow-[0_0_12px_rgba(34,211,238,0.9)]"
                  aria-hidden="true"
                >
                  <polygon
                    points="32,50 8,10 56,10"
                    fill="rgba(6, 182, 212, 0.16)"
                    stroke="#a5f3fc"
                    strokeWidth="2.4"
                    strokeLinejoin="round"
                  />
                  <polygon points="32,37 21,18 43,18" fill="#67e8f9" opacity="0.9" />
                </svg>
              </div>

              <div className="mt-1 flex flex-col items-center text-center pointer-events-none select-none z-10">
                <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-[0.22em] text-slate-50 drop-shadow-[0_0_16px_rgba(34,211,238,0.45)]">
                  F.R.I.D.A.Y.
                </h1>
                <p className="text-[11px] sm:text-xs text-cyan-200/85 tracking-wide mt-0.5">
                  Fully Responsive Intelligent Digital Assistant for You
                </p>
              </div>

              {/* Glowing Holographic Pedestal Rings */}
              <div className="relative w-64 sm:w-80 h-10 mt-1.5 flex items-center justify-center pointer-events-none hud-pedestal-glow">
                <div className="absolute inset-x-4 h-7 rounded-[100%] border-2 border-cyan-400/75 shadow-[0_0_28px_rgba(34,211,238,0.55),inset_0_0_16px_rgba(34,211,238,0.35)]" />
                <div className="absolute inset-x-12 h-4 rounded-[100%] border border-sky-300/80 bg-cyan-400/15" />
                <div className="w-32 h-2 rounded-full bg-cyan-300/60 blur-[6px]" />
              </div>
            </div>

            {/* Live Collapsible Assistant Response Overlay Card */}
            {showResponseDrawer && latestAssistant && (
              <div
                aria-label="Latest Assistant Response"
                className="w-full max-w-xl mt-2 rounded-2xl border border-cyan-400/40 bg-[#050d20]/94 p-3.5 shadow-[0_0_26px_rgba(14,165,233,0.22)] z-20 max-h-44 overflow-y-auto space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] text-cyan-300">
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
                      className="text-slate-300 hover:text-cyan-200"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectSection('ai-chat')}
                      className="text-cyan-300 hover:text-cyan-100 underline underline-offset-2"
                    >
                      Full Stream
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowResponseDrawer(false)}
                      aria-label="Minimize response card"
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-100 whitespace-pre-wrap leading-relaxed">
                  {latestAssistant.content}
                </p>

                {latestAssistant.sources && latestAssistant.sources.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-800">
                    {latestAssistant.sources.slice(0, 3).map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-100 underline underline-offset-2"
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
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-slate-800 text-slate-300 border border-slate-700"
                    >
                      <X className="w-3 h-3" aria-hidden="true" />
                      <span>Cancel</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Synchronized Waveform + Central Mic Button + Pill Prompt Input */}
          <div className="w-full max-w-2xl flex flex-col items-center gap-2.5 shrink-0 pt-1">
            {/* Waveform & Center Mic Trigger */}
            <div className="w-full flex items-center justify-center gap-3 px-4">
              <div className="flex-1 flex items-center justify-end gap-1 h-7 max-w-[170px]">
                {centerBars.slice(0, 12).map((h, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-cyan-400/85 transition-all duration-150"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={onToggleListening}
                aria-label={micActive ? 'Stop voice listening' : 'Start voice listening'}
                className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all shrink-0 ${
                  micActive
                    ? 'bg-cyan-400 text-slate-950 border-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.85)]'
                    : 'bg-[#081734] text-cyan-200 border-cyan-400/75 shadow-[0_0_18px_rgba(34,211,238,0.45)] hover:border-cyan-300'
                }`}
              >
                <Mic className="w-5 h-5" />
              </button>

              <div className="flex-1 flex items-center justify-start gap-1 h-7 max-w-[170px]">
                {centerBars.slice(12).map((h, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full bg-cyan-400/85 transition-all duration-150"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-cyan-200 text-center max-w-full px-2">
              <span className="truncate max-w-[460px]">
                {liveTranscript
                  ? liveTranscript
                  : isRecordingAudio
                    ? 'Recording audio... Click Mic to transcribe'
                    : voiceState === 'standby'
                      ? 'Listening Ready...'
                      : `${voiceMeta.label}...`}
              </span>
              {latestAssistant && !showResponseDrawer && (
                <button
                  type="button"
                  onClick={() => setShowResponseDrawer(true)}
                  className="text-[11px] text-cyan-300/85 underline underline-offset-2 hover:text-cyan-100 shrink-0"
                >
                  Show Last Reply
                </button>
              )}
            </div>

            {/* Futuristic Command Input Pill */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="w-full hud-input-pill rounded-full px-3 py-1.5 flex items-center gap-2"
            >
              <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shrink-0">
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              </div>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Ask me anything, or say "${wakeWord}"...`}
                aria-label="Natural language command input"
                className="flex-1 min-w-0 bg-transparent px-1 py-1 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none"
              />

              <button
                type="button"
                onClick={onToggleListening}
                aria-label="Voice speech recognition"
                className={`p-1.5 rounded-full transition-colors shrink-0 ${
                  isListening ? 'text-cyan-300 bg-cyan-500/20' : 'text-slate-300 hover:text-cyan-200'
                }`}
              >
                {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={onToggleRecordAudio}
                aria-label={isRecordingAudio ? 'Stop audio recording' : 'Record voice memo'}
                title="Record audio memo for Gemini transcription"
                className={`p-1.5 rounded-full transition-colors shrink-0 ${
                  isRecordingAudio ? 'text-rose-300 bg-rose-500/20' : 'text-slate-300 hover:text-cyan-200'
                }`}
              >
                <AudioLines className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onSelectSection('file-explorer')}
                aria-label="Open screen and image intelligence"
                title="Vision & Screen Capture Analyzer"
                className="p-1.5 rounded-full text-slate-300 hover:text-cyan-200 transition-colors shrink-0"
              >
                <Camera className="w-4 h-4" />
              </button>

              <button
                type="submit"
                disabled={submitting || !input.trim()}
                aria-label="Send command"
                className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 text-slate-950 flex items-center justify-center hover:brightness-110 disabled:opacity-45 transition-all shrink-0"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT DASHBOARD COLUMN */}
        <div className="flex flex-col gap-2.5 min-h-0 overflow-y-auto pl-0.5">
          {/* 1. WEATHER CARD */}
          <section className="hud-panel rounded-2xl p-3.5 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold tracking-[0.14em] text-slate-100 uppercase">
                Weather
              </h2>
              <span className="text-[11px] text-cyan-200 truncate max-w-[170px]">
                {weather?.location ?? 'Locating...'}
              </span>
            </div>

            {weatherError ? (
              <p className="text-xs text-amber-300">{weatherError}</p>
            ) : weather ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <WeatherConditionIcon condition={weather.condition} />
                    <div>
                      <div className="font-display text-3xl font-bold text-slate-50 tabular-nums leading-none">
                        {weather.temperature}°C
                      </div>
                      <div className="text-xs text-slate-300 mt-0.5">{weather.condition}</div>
                    </div>
                  </div>

                  <div className="space-y-1 text-[11px] tabular-nums text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Droplets className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                        Humidity
                      </span>
                      <span className="font-semibold text-slate-100">{weather.humidity}%</span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Wind className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                        Wind
                      </span>
                      <span className="font-semibold text-slate-100">{weather.windSpeedKmh} km/h</span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-slate-400">Feels</span>
                      <span className="font-semibold text-emerald-300">{weather.feelsLike}°C</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-0.5">
                  {weather.forecast.slice(0, 3).map((day, idx) => (
                    <div
                      key={day.date}
                      className="px-2 py-1.5 rounded-xl bg-slate-950/65 border border-cyan-500/20 text-center tabular-nums"
                    >
                      <div className="text-[10px] font-medium text-slate-300">
                        {idx === 0
                          ? 'Today'
                          : new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, {
                              weekday: 'short',
                            })}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-100 mt-0.5">
                        {day.tempMax}° / {day.tempMin}°
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400">Loading live atmospheric data...</p>
            )}
          </section>

          {/* 2. CALENDAR & SCHEDULE CARD */}
          <section className="hud-panel rounded-2xl p-3.5 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold tracking-[0.12em] text-slate-100 uppercase flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5 text-cyan-300" aria-hidden="true" />
                <span>Calendar & Schedule</span>
              </h2>
              <button
                type="button"
                onClick={() => onSelectSection('calendar')}
                className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200"
              >
                View Calendar →
              </button>
            </div>

            <div className="flex items-stretch gap-3">
              {/* Framed Date Card */}
              <div className="w-16 shrink-0 rounded-xl bg-slate-950/70 border border-cyan-500/30 flex flex-col items-center justify-center py-2 text-center">
                <span className="text-[10px] font-semibold text-cyan-300 tracking-wider">{monthShort}</span>
                <span className="font-display text-2xl font-bold text-slate-50 leading-tight tabular-nums">
                  {dayNum}
                </span>
                <span className="text-[10px] text-slate-400">{weekdayShort}</span>
              </div>

              {/* Today's Agenda List */}
              <div className="flex-1 min-w-0 space-y-1.5">
                {upcomingEvents.length === 0 ? (
                  <p className="text-xs text-slate-400 py-3">No upcoming events.</p>
                ) : (
                  upcomingEvents.map((evt) => (
                    <button
                      key={evt.id}
                      type="button"
                      onClick={() => onToggleEvent(evt.id)}
                      className="w-full text-left flex items-start gap-2 px-2 py-1 rounded-lg hover:bg-slate-900/70 transition-colors"
                    >
                      <span
                        className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          dotColorMap[evt.category] || 'bg-cyan-400'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-xs font-medium truncate ${
                            evt.completed ? 'line-through text-slate-500' : 'text-slate-100'
                          }`}
                        >
                          {evt.title}
                        </div>
                        <div className="text-[10px] font-mono-tabular text-slate-400">
                          {evt.date} · {evt.time}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* 3. SYSTEM MONITOR CARD */}
          <section className="hud-panel rounded-2xl p-3.5 flex-1 min-h-[195px] flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => onSelectSection('system-monitor')}
                className="text-xs font-bold tracking-[0.12em] text-slate-100 uppercase flex items-center gap-1.5 hover:text-cyan-200"
              >
                <Activity className="w-3.5 h-3.5 text-cyan-300" aria-hidden="true" />
                <span>System Monitor</span>
              </button>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                <span>Live</span>
              </span>
            </div>

            {telemetry ? (
              <>
                <div className="grid grid-cols-4 gap-1 pt-0.5">
                  <RingGauge
                    label="CPU"
                    valueText={`${telemetry.cpuLoad}%`}
                    percent={telemetry.cpuLoad}
                    strokeColor="#22d3ee"
                  />
                  <RingGauge
                    label="GPU"
                    valueText={telemetry.gpuUsage !== null ? `${telemetry.gpuUsage}%` : '--'}
                    percent={telemetry.gpuUsage ?? 0}
                    strokeColor="#818cf8"
                  />
                  <RingGauge
                    label="RAM"
                    valueText={`${telemetry.ramPercent}%`}
                    percent={telemetry.ramPercent}
                    strokeColor="#38bdf8"
                  />
                  <RingGauge
                    label="Disk"
                    valueText={`${telemetry.storagePercent}%`}
                    percent={telemetry.storagePercent}
                    strokeColor="#34d399"
                  />
                </div>

                <div className="grid grid-cols-[1fr_auto] items-center gap-3 pt-1">
                  {/* Live CPU Sparkline Graph */}
                  <div className="rounded-xl bg-slate-950/65 border border-cyan-500/20 p-1.5 h-14 flex items-center">
                    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-11 overflow-visible" aria-hidden="true">
                      <defs>
                        <linearGradient id="cpuAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
                          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={sparkAreaPath} fill="url(#cpuAreaGrad)" />
                      <path
                        d={sparkLinePath}
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  {/* Detailed Hardware Readout */}
                  <div className="space-y-1 text-[11px] font-mono-tabular">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                        CPU Temp
                      </span>
                      <span className="text-slate-100">
                        {telemetry.cpuTemp !== null ? `${telemetry.cpuTemp}°C` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400">GPU Temp</span>
                      <span className="text-slate-100">
                        {telemetry.gpuTemp !== null ? `${telemetry.gpuTemp}°C` : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400">RAM Used</span>
                      <span className="text-slate-100">
                        {telemetry.ramUsedGb} / {telemetry.ramTotalGb} GB
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400 flex items-center gap-1">
                        <HardDrive className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                        Disk Used
                      </span>
                      <span className="text-slate-100">
                        {telemetry.storageUsedGb} / {telemetry.storageTotalGb} GB
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">Connecting to hardware sensors...</p>
            )}
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
          <div className="hud-panel rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col p-4 space-y-3 bg-[#060f24]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                <span className="text-sm font-semibold text-slate-100 truncate">{previewModal.name}</span>
                <span className="text-xs font-mono-tabular text-slate-400 shrink-0">
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
                  className="px-2.5 py-1 rounded-md text-xs font-medium bg-cyan-500/20 text-cyan-200 border border-cyan-400/40"
                >
                  Open in Explorer
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModal(null)}
                  aria-label="Close file preview"
                  className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-xs font-mono-tabular text-slate-200 whitespace-pre-wrap">
              {previewModal.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
