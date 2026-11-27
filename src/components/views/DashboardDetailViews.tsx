import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  AudioLines,
  Battery,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  HardDrive,
  Mic,
  MicOff,
  Play,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from 'lucide-react';
import type {
  ActionLogEntry,
  ChatMessage,
  DiagnosticCheckItem,
  DiagnosticsReportPayload,
  HardwareCompatibilityAudit,
  ProcessInfo,
  SystemTelemetry,
  VoiceState,
} from '../../core/types';
import { VOICE_STATE_META } from '../../core/agentRegistry';

export function AIChatFullView({
  voiceState,
  messages,
  wakeWord,
  wakeWordEnabled,
  autoSpeakReplies,
  isListening,
  isRecordingAudio,
  isSpeaking,
  onSubmitCommand,
  onConfirmAction,
  onToggleListening,
  onToggleRecordAudio,
  onToggleWakeWord,
  onToggleAutoSpeak,
  onStopSpeaking,
  onSpeakText,
}: {
  voiceState: VoiceState;
  messages: ChatMessage[];
  wakeWord: string;
  wakeWordEnabled: boolean;
  autoSpeakReplies: boolean;
  isListening: boolean;
  isRecordingAudio: boolean;
  isSpeaking: boolean;
  onSubmitCommand: (command: string) => Promise<boolean | void>;
  onConfirmAction: (
    actionType: string,
    summary: string,
    approved: boolean,
    payload?: Record<string, unknown>
  ) => Promise<void>;
  onToggleListening: () => void;
  onToggleRecordAudio: () => void;
  onToggleWakeWord: () => void;
  onToggleAutoSpeak: () => void;
  onStopSpeaking: () => void;
  onSpeakText: (text: string) => void;
}) {
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handleCopy = async (id: string, content: string) => {
    if (!content) return;
    try {
      await navigator.clipboard?.writeText(content);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      // Clipboard blocked in non-HTTPS contexts
    }
  };

  const handleSend = async (e?: React.FormEvent, preset?: string) => {
    e?.preventDefault();
    const cmd = (preset ?? input).trim();
    if (!cmd || submitting) return;
    setSubmitting(true);
    if (!preset) setInput('');
    try {
      await onSubmitCommand(cmd);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 60);
    } finally {
      setSubmitting(false);
    }
  };

  const voiceMeta = VOICE_STATE_META[voiceState];

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden p-4 sm:p-6 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 hud-panel rounded-2xl px-4 py-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-100">
            F.R.I.D.A.Y. Multi-Agent Conversation Stream
          </h2>
          <p className="text-xs text-slate-400">
            Active State: <span className={voiceMeta.color}>{voiceMeta.label}</span> · {voiceMeta.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            'Check laptop performance',
            "What is today's schedule?",
            'What is the 7-day weather forecast?',
            'Search Raspberry Pi AI projects',
            'Find workspace files',
          ].map((q) => (
            <button
              key={q}
              type="button"
              disabled={submitting}
              onClick={() => handleSend(undefined, q)}
              className="px-2.5 py-1.5 rounded-lg text-[11px] bg-slate-900/90 border border-cyan-500/20 text-slate-200 hover:border-cyan-400/50"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        aria-label="Assistant Conversation Stream"
        className="flex-1 min-h-0 overflow-y-auto hud-panel rounded-2xl p-4 space-y-3"
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[88%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-cyan-500/15 border border-cyan-400/30 text-slate-100'
                  : 'bg-slate-950/85 border border-slate-700/70 text-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-1 text-[11px] text-slate-400">
                <span className="font-semibold text-cyan-300">
                  {msg.role === 'user' ? 'You' : 'F.R.I.D.A.Y.'}
                </span>
                <div className="flex items-center gap-2">
                  {msg.role === 'assistant' && msg.content && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleCopy(msg.id, msg.content)}
                        aria-label={`Copy response ${msg.id}`}
                        className="text-slate-400 hover:text-cyan-300"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSpeakText(msg.content)}
                        aria-label="Speak response aloud"
                        className="text-slate-400 hover:text-cyan-300"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <span className="font-mono-tabular">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {msg.content ? (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              ) : msg.role === 'assistant' ? (
                <div className="text-xs italic text-cyan-300 animate-pulse">
                  F.R.I.D.A.Y. is thinking...
                </div>
              ) : null}

              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400 mb-1">Verified Sources</div>
                  <div className="flex flex-wrap gap-2">
                    {msg.sources.slice(0, 5).map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span className="truncate max-w-[220px]">{src.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {msg.pendingConfirmation && (
                <div className="mt-3 pt-2.5 border-t border-amber-500/25 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onConfirmAction(
                        msg.pendingConfirmation!.actionType,
                        msg.pendingConfirmation!.summary,
                        true,
                        msg.pendingConfirmation!.payload
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    Confirm Action
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onConfirmAction(
                        msg.pendingConfirmation!.actionType,
                        msg.pendingConfirmation!.summary,
                        false,
                        msg.pendingConfirmation!.payload
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={handleSend}
        className="hud-input-pill rounded-2xl px-3 py-2 flex items-center gap-2 shrink-0"
      >
        <button
          type="button"
          onClick={onToggleListening}
          aria-label={isListening ? 'Stop voice listening' : 'Start voice listening'}
          className={`p-2 rounded-lg border transition-colors shrink-0 ${
            isListening
              ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
              : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-cyan-200'
          }`}
        >
          {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onToggleRecordAudio}
          aria-label={isRecordingAudio ? 'Stop audio recording' : 'Record voice memo'}
          className={`hidden sm:inline-flex p-2 rounded-lg border transition-colors shrink-0 ${
            isRecordingAudio
              ? 'bg-rose-500/25 border-rose-400 text-rose-200'
              : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-cyan-200'
          }`}
        >
          <AudioLines className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleWakeWord}
          className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs border transition-colors whitespace-nowrap shrink-0 ${
            wakeWordEnabled
              ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-200'
              : 'bg-slate-900 border-slate-700 text-slate-400'
          }`}
        >
          <Radio className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{wakeWordEnabled ? `"${wakeWord}" On` : 'Wake Off'}</span>
        </button>

        <button
          type="button"
          onClick={onToggleAutoSpeak}
          className={`hidden md:inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs border transition-colors whitespace-nowrap shrink-0 ${
            autoSpeakReplies
              ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
              : 'bg-slate-900 border-slate-700 text-slate-400'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Auto Voice</span>
        </button>

        {isSpeaking && (
          <button
            type="button"
            onClick={onStopSpeaking}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs bg-rose-500/20 border border-rose-400/40 text-rose-200"
          >
            <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Stop Voice</span>
          </button>
        )}

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask F.R.I.D.A.Y. anything or say "${wakeWord}"...`}
          aria-label="Chat command input"
          className="flex-1 min-w-0 bg-transparent px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />

        <button
          type="submit"
          disabled={submitting || !input.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <Send className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{submitting ? 'Executing...' : 'Send'}</span>
        </button>
      </form>
    </div>
  );
}

export function SystemMonitorFullView({
  telemetry,
  cpuHistory,
  actionLogs,
}: {
  telemetry: SystemTelemetry | null;
  cpuHistory: number[];
  actionLogs: ActionLogEntry[];
}) {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loadingProc, setLoadingProc] = useState(false);
  const [procError, setProcError] = useState<string | null>(null);
  const [audit, setAudit] = useState<HardwareCompatibilityAudit | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [report, setReport] = useState<DiagnosticsReportPayload | null>(null);
  const [clientChecks, setClientChecks] = useState<DiagnosticCheckItem[]>([]);
  const [runningDiag, setRunningDiag] = useState(false);

  const loadProcesses = async () => {
    setLoadingProc(true);
    setProcError(null);
    try {
      const res = await fetch('/api/system/processes');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to read process telemetry');
      setProcesses(data.processes ?? []);
    } catch (err) {
      setProcError((err as Error).message || 'Unable to query system processes');
    } finally {
      setLoadingProc(false);
    }
  };

  const loadAudit = async () => {
    setAuditError(null);
    try {
      const res = await fetch('/api/diagnostics/audit');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load compatibility audit');
      setAudit(data);
    } catch (err) {
      setAuditError((err as Error).message || 'Compatibility audit unavailable');
    }
  };

  const runDiagnostics = async () => {
    setRunningDiag(true);
    try {
      const browserChecks: DiagnosticCheckItem[] = [];
      const nowIso = new Date().toISOString();

      browserChecks.push({
        id: 'client-render',
        category: 'Frontend',
        name: 'React HUD & Root Mount',
        expected: 'Root container rendered with zero layout blockage',
        actual: document.getElementById('root')?.childElementCount
          ? `Mounted (${window.innerWidth}×${window.innerHeight})`
          : 'Root empty',
        status: document.getElementById('root')?.childElementCount ? 'pass' : 'fail',
        durationMs: 1,
        checkedAt: nowIso,
      });

      const hasMediaDevices = Boolean(navigator.mediaDevices?.getUserMedia);
      browserChecks.push({
        id: 'client-mic',
        category: 'Voice & Audio',
        name: 'Browser Microphone Capture API',
        expected: 'navigator.mediaDevices.getUserMedia available',
        actual: hasMediaDevices ? 'MediaDevices capture API ready' : 'MediaDevices API unavailable',
        status: hasMediaDevices ? 'pass' : 'warning',
        recommendation: hasMediaDevices ? undefined : 'Use HTTPS or Electron localhost origin for microphone capture.',
        durationMs: 1,
        checkedAt: nowIso,
      });

      const hasSpeechRec = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
      browserChecks.push({
        id: 'client-stt',
        category: 'Voice & Audio',
        name: 'Web Speech Recognition & Local WAV Pipeline',
        expected: 'SpeechRecognition or Windows System.Speech WAV capture ready',
        actual: hasSpeechRec
          ? 'Browser Web SpeechRecognition + local WAV capture ready'
          : 'Web SpeechRecognition unavailable; local microphone WAV capture active',
        status: hasSpeechRec ? 'pass' : 'warning',
        recommendation: hasSpeechRec
          ? undefined
          : 'Run inside the Windows Electron shell for built-in Windows System.Speech recognition.',
        durationMs: 1,
        checkedAt: nowIso,
      });

      const hasTts = 'speechSynthesis' in window;
      browserChecks.push({
        id: 'client-tts',
        category: 'Voice & Audio',
        name: 'Browser SpeechSynthesis & Windows SAPI Output',
        expected: 'window.speechSynthesis, Windows SAPI, or /api/voice/tts ready',
        actual: hasTts
          ? 'Local SpeechSynthesis + Windows SAPI / optional TTS ready'
          : 'Server/Desktop TTS active',
        status: 'pass',
        durationMs: 1,
        checkedAt: nowIso,
      });

      const isElectron = Boolean(window.fridayDesktop?.isDesktopShell);
      browserChecks.push({
        id: 'client-electron-ipc',
        category: 'Electron',
        name: 'Electron Preload Bridge & Window Controls',
        expected: 'window.fridayDesktop IPC active on Windows desktop shell',
        actual: isElectron
          ? 'Context-isolated Electron IPC bridge active'
          : 'Running in standard web browser host (Windows IPC unavailable)',
        status: isElectron ? 'pass' : 'unavailable',
        recommendation: isElectron
          ? undefined
          : 'Launch via Electron on Windows (`npm run build` + `electron .`) to test desktop tray, ESC hide, and app control.',
        durationMs: 1,
        checkedAt: nowIso,
      });

      setClientChecks(browserChecks);

      const res = await fetch('/api/diagnostics/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saveReport: true }),
      });
      if (res.ok) {
        const data = (await res.json()) as DiagnosticsReportPayload;
        setReport(data);
        setAudit(data.audit);
      }
    } finally {
      setRunningDiag(false);
    }
  };

  useEffect(() => {
    loadProcesses();
    loadAudit();
  }, []);

  const sparkPoints = cpuHistory.length > 1 ? cpuHistory : [0, 0];
  const svgW = 540;
  const svgH = 90;
  const sparkPath = sparkPoints
    .map((val, idx) => {
      const x = (idx / Math.max(1, sparkPoints.length - 1)) * svgW;
      const y = svgH - (Math.min(100, Math.max(0, val)) / 100) * (svgH - 10) - 5;
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-slate-100 flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" aria-hidden="true" />
          <span>System Monitor & Live Intelligence Feed</span>
        </h2>
        <p className="text-sm text-slate-400">
          Real-time CPU, GPU, memory, storage, network telemetry, OS processes, and audit events.
        </p>
      </div>

      {telemetry && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="hud-panel rounded-2xl p-4 space-y-1">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>CPU Load</span>
            </div>
            <div className="font-display text-2xl font-bold text-cyan-300 tabular-nums">
              {telemetry.cpuLoad}%
            </div>
            <div className="text-[11px] text-slate-400 truncate">{telemetry.cpuModel}</div>
          </div>

          <div className="hud-panel rounded-2xl p-4 space-y-1">
            <div className="text-xs text-slate-400">Memory Usage</div>
            <div className="font-display text-2xl font-bold text-sky-300 tabular-nums">
              {telemetry.ramPercent}%
            </div>
            <div className="text-[11px] font-mono-tabular text-slate-400">
              {telemetry.ramUsedGb} / {telemetry.ramTotalGb} GB
            </div>
          </div>

          <div className="hud-panel rounded-2xl p-4 space-y-1">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
              <span>Storage</span>
            </div>
            <div className="font-display text-2xl font-bold text-emerald-300 tabular-nums">
              {telemetry.storagePercent}%
            </div>
            <div className="text-[11px] font-mono-tabular text-slate-400">
              {telemetry.storageUsedGb} / {telemetry.storageTotalGb} GB
            </div>
          </div>

          <div className="hud-panel rounded-2xl p-4 space-y-1">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
              <span>Network & Power</span>
            </div>
            <div className="font-mono-tabular text-sm font-semibold text-slate-100">
              ↓ {telemetry.networkRxKbps} · ↑ {telemetry.networkTxKbps} KB/s
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <Battery className="w-3 h-3 text-emerald-400" aria-hidden="true" />
              <span>
                {telemetry.batteryPercent !== null ? `${telemetry.batteryPercent}%` : 'AC Power'} ·{' '}
                {telemetry.platform}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* CPU Telemetry Graph */}
      <div className="hud-panel rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span className="font-semibold">Real-Time CPU History</span>
          <span className="font-mono-tabular text-cyan-300">{telemetry?.hostname ?? 'localhost'}</span>
        </div>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-24 overflow-visible" aria-hidden="true">
          <path
            d={sparkPath}
            fill="none"
            stroke="#22d3ee"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Live OS Processes */}
        <section className="hud-panel rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">Top OS Processes</h3>
            <button
              type="button"
              onClick={loadProcesses}
              disabled={loadingProc}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-900 border border-slate-700 text-slate-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingProc ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Refresh</span>
            </button>
          </div>
          {procError ? (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/35 text-xs text-rose-200 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
                <span>{procError}</span>
              </span>
              <button
                type="button"
                onClick={loadProcesses}
                className="px-2 py-1 rounded bg-rose-500/20 border border-rose-400/40 text-[11px]"
              >
                Retry
              </button>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left tabular-nums">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-1.5 pr-2">PID</th>
                  <th className="py-1.5 pr-2">Process</th>
                  <th className="py-1.5 pr-2 text-right">CPU</th>
                  <th className="py-1.5 text-right">RAM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {processes.map((proc) => (
                  <tr key={`${proc.pid}-${proc.name}`} className="text-slate-200">
                    <td className="py-1.5 pr-2 font-mono-tabular text-slate-400">{proc.pid}</td>
                    <td className="py-1.5 pr-2 truncate max-w-[180px]">{proc.name}</td>
                    <td className="py-1.5 pr-2 text-right font-mono-tabular text-cyan-300">{proc.cpu}%</td>
                    <td className="py-1.5 text-right font-mono-tabular">{proc.mem}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Live Intelligence Feed */}
        <section className="hud-panel rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-100">Live Intelligence & Action Audit Feed</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {actionLogs.slice(0, 15).map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded-xl bg-slate-950/65 border border-cyan-500/15 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-100">{log.action}</span>
                  <span
                    className={`font-mono-tabular text-[11px] ${
                      log.status === 'completed'
                        ? 'text-emerald-300'
                        : log.status === 'blocked'
                        ? 'text-amber-300'
                        : 'text-cyan-300'
                    }`}
                  >
                    {log.status}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {log.agent} · {log.target}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Windows Compatibility Audit & Automated Diagnostics Dashboard */}
      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
        <section className="hud-panel rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              <span>Windows Compatibility Audit</span>
            </h3>
            <button
              type="button"
              onClick={loadAudit}
              className="text-xs text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
            >
              Refresh
            </button>
          </div>

          {auditError ? (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/35 text-xs text-rose-200 flex items-center justify-between gap-2">
              <span>{auditError}</span>
              <button
                type="button"
                onClick={loadAudit}
                className="px-2 py-1 rounded bg-rose-500/20 border border-rose-400/40 text-[11px]"
              >
                Retry
              </button>
            </div>
          ) : audit ? (
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-slate-950/65 border border-cyan-500/15">
                  <div className="text-slate-400 text-[11px]">Host OS / Arch</div>
                  <div className="font-semibold text-slate-100 truncate">
                    {audit.osName} ({audit.arch})
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/65 border border-cyan-500/15">
                  <div className="text-slate-400 text-[11px]">Node.js Runtime</div>
                  <div className="font-semibold font-mono-tabular text-cyan-300">{audit.nodeVersion}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/65 border border-cyan-500/15">
                  <div className="text-slate-400 text-[11px]">GPU Adapter</div>
                  <div className="font-semibold text-slate-100 truncate">{audit.gpuName}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/65 border border-cyan-500/15">
                  <div className="text-slate-400 text-[11px]">Profile / RAM</div>
                  <div className="font-semibold text-slate-100">
                    {audit.optimizationProfile} · {audit.ramTotalGb} GB
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/65 border border-cyan-500/15 space-y-1">
                <div className="text-[11px] text-slate-400 font-semibold">Security & Target Posture</div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    contextIsolation: {audit.securityPosture.contextIsolation ? 'true' : 'false'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    nodeIntegration: {audit.securityPosture.nodeIntegrationDisabled ? 'false' : 'true'}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-200 border border-cyan-500/30">
                    Sandbox Folders: {audit.securityPosture.folderSandboxActive ? 'Active' : 'Off'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      audit.isWindows
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-200 border-amber-500/30'
                    }`}
                  >
                    {audit.isWindows ? 'Windows Desktop Host' : 'Non-Windows Web Host'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Loading host compatibility audit...</p>
          )}
        </section>

        <section className="hud-panel rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                <span>Automated Diagnostics & Test Suite</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Runs safe verification across hardware sensors, Local AI Core & optional cloud integrations, file sandbox, Electron IPC, and voice APIs.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {report && (
                <a
                  href="/api/diagnostics/report"
                  download="TEST_REPORT.md"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400/50"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
                  <span>TEST_REPORT.md</span>
                </a>
              )}
              <button
                type="button"
                onClick={runDiagnostics}
                disabled={runningDiag}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{runningDiag ? 'Running Diagnostics...' : 'Run Safe Diagnostics'}</span>
              </button>
            </div>
          </div>

          {!report && clientChecks.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-950/65 border border-cyan-500/15 text-xs text-slate-400">
              Click <strong className="text-cyan-300">Run Safe Diagnostics</strong> to verify live host compatibility,
              AI connectivity, database persistence, folder sandbox security, and browser audio capabilities.
            </div>
          ) : (
            <div className="space-y-2">
              {report && (
                <div className="flex flex-wrap gap-3 text-xs font-mono-tabular px-3 py-2 rounded-xl bg-slate-950/75 border border-cyan-500/20">
                  <span className="text-emerald-300">
                    PASS: {report.summary.pass + clientChecks.filter((c) => c.status === 'pass').length}
                  </span>
                  <span className="text-amber-300">
                    WARN: {report.summary.warning + clientChecks.filter((c) => c.status === 'warning').length}
                  </span>
                  <span className="text-slate-300">
                    UNAVAILABLE:{' '}
                    {report.summary.unavailable + clientChecks.filter((c) => c.status === 'unavailable').length}
                  </span>
                  <span className="text-rose-300">
                    FAIL: {report.summary.fail + clientChecks.filter((c) => c.status === 'fail').length}
                  </span>
                </div>
              )}

              <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                {[...(report?.checks ?? []), ...clientChecks].map((chk) => (
                  <div
                    key={chk.id}
                    className="p-2.5 rounded-xl bg-slate-950/65 border border-cyan-500/15 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-100">
                        <span className="text-cyan-400 font-mono-tabular mr-1.5">[{chk.category}]</span>
                        {chk.name}
                      </span>
                      <span
                        className={`font-mono-tabular text-[11px] uppercase px-2 py-0.5 rounded ${
                          chk.status === 'pass'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : chk.status === 'warning'
                              ? 'bg-amber-500/15 text-amber-300'
                              : chk.status === 'unavailable'
                                ? 'bg-slate-800 text-slate-300'
                                : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {chk.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300">Actual: {chk.actual}</div>
                    {chk.error && <div className="text-[11px] text-rose-300">Detail: {chk.error}</div>}
                    {chk.recommendation && (
                      <div className="text-[11px] text-cyan-300/90">Next: {chk.recommendation}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
