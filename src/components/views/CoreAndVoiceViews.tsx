import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Check,
  CheckCircle2,
  Circle,
  Cpu,
  ExternalLink,
  Layers,
  Mic,
  MicOff,
  Pencil,
  Pin,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  Volume2,
  VolumeX,
  Workflow,
  X,
} from 'lucide-react';
import type {
  AgentDescriptor,
  AgentId,
  AssistantSettings,
  AutomationWorkflow,
  DesktopAppItem,
  HologramMode,
  HologramSettings,
  NoteItem,
  ProcessInfo,
  RunningWindowInfo,
  TodoItem,
  VoiceState,
} from '../../core/types';
import { VOICE_STATE_META } from '../../core/agentRegistry';
import { FridayCore3D } from '../FridayCore3D';

export function AICoreView({
  voiceState,
  onSetVoiceState,
  audioLevel,
  agents,
  activeAgents,
  onToggleAgent,
  animationQuality,
  hologram,
  onUpdateHologram,
  focusAgents = false,
}: {
  voiceState: VoiceState;
  onSetVoiceState: (state: VoiceState) => void;
  audioLevel: number;
  agents: AgentDescriptor[];
  activeAgents: AgentId[];
  onToggleAgent: (id: AgentId) => void;
  animationQuality: 'high' | 'balanced' | 'low';
  hologram: HologramSettings;
  onUpdateHologram: (patch: Partial<HologramSettings>) => void;
  focusAgents?: boolean;
}) {
  const states: VoiceState[] = [
    'standby',
    'listening',
    'processing',
    'searching',
    'executing',
    'speaking',
    'completed',
    'error',
  ];

  const holoModes: Array<{ id: HologramMode; label: string }> = [
    { id: 'orbital', label: 'Orbital Core' },
    { id: 'neural-matrix', label: 'Neural Matrix' },
    { id: 'telemetry-sphere', label: 'Telemetry Sphere' },
    { id: 'exploded', label: 'Exploded Projection' },
  ];

  const agentMatrixSection = (
    <div id="agent-matrix">
      <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
        <Cpu className="w-4 h-4 text-cyan-400" aria-hidden="true" />
        <span>Specialist Agent Matrix ({agents.filter((a) => a.enabled).length} / {agents.length} Active)</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="p-4 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 flex flex-col justify-between gap-3"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-slate-100">{agent.name}</span>
                <button
                  type="button"
                  onClick={() => onToggleAgent(agent.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    agent.enabled
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {agent.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">{agent.role}</p>
            </div>
            <div className="text-[11px] text-slate-400">{agent.capabilities.join(' · ')}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6">
      {focusAgents && agentMatrixSection}
      <div className="flex flex-col lg:flex-row items-center gap-6 p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90">
        <FridayCore3D
          voiceState={voiceState}
          audioLevel={audioLevel}
          animationQuality={animationQuality}
          activeAgents={activeAgents}
          hologram={hologram}
        />
        <div className="flex-1 space-y-4 w-full">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-100">
              Holographic Neural Core & Multi-Agent Orchestrator
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Calibrate 3D volumetric hologram shaders, projection modes, and the eleven specialist agents.
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-400 mb-2">Interactive Core State Preview</div>
            <div className="flex flex-wrap gap-2">
              {states.map((st) => {
                const active = voiceState === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => onSetVoiceState(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                        : 'bg-slate-900/80 text-slate-300 border border-slate-700/70 hover:border-cyan-400/30'
                    }`}
                  >
                    {VOICE_STATE_META[st].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hologram Calibration Controls */}
          <div className="pt-2 border-t border-slate-800 space-y-3">
            <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>Hologram Projection Calibration</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {holoModes.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onUpdateHologram({ mode: m.id })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    hologram.mode === m.id
                      ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200'
                      : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="block space-y-1">
                <span className="text-slate-300">
                  Scanline Intensity ({Math.round(hologram.scanlineIntensity * 100)}%)
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={hologram.scanlineIntensity}
                  onChange={(e) => onUpdateHologram({ scanlineIntensity: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-300">
                  Hologram Opacity ({Math.round(hologram.holoOpacity * 100)}%)
                </span>
                <input
                  type="range"
                  min="0.3"
                  max="1"
                  step="0.05"
                  value={hologram.holoOpacity}
                  onChange={(e) => onUpdateHologram({ holoOpacity: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-300">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hologram.projectionBeam}
                  onChange={(e) => onUpdateHologram({ projectionBeam: e.target.checked })}
                  className="accent-cyan-400"
                />
                <span>Volumetric Emitter Beam</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hologram.autoRotate}
                  onChange={(e) => onUpdateHologram({ autoRotate: e.target.checked })}
                  className="accent-cyan-400"
                />
                <span>Auto-Rotate Orbital Rings</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {!focusAgents && agentMatrixSection}
    </div>
  );
}

export function VoiceAssistantView({
  settings,
  voiceState,
  audioLevel,
  isListening,
  isSpeaking = false,
  audioInputDevices = [],
  liveTranscript,
  onToggleListening,
  onStopSpeaking,
  onUpdateSettings,
  onTestSpeech,
  onRefreshAudioDevices,
}: {
  settings: AssistantSettings;
  voiceState: VoiceState;
  audioLevel: number;
  isListening: boolean;
  isSpeaking?: boolean;
  audioInputDevices?: Array<{ deviceId: string; label: string }>;
  liveTranscript?: string | null;
  onToggleListening: () => void;
  onStopSpeaking?: () => void;
  onUpdateSettings: (patch: Partial<AssistantSettings>) => void;
  onTestSpeech: (phrase: string) => void;
  onRefreshAudioDevices?: () => Promise<void>;
}) {
  const [testPhrase, setTestPhrase] = useState(
    'All systems nominal. F.R.I.D.A.Y. holographic core and local voice pipeline active.'
  );
  const [wakeWordDraft, setWakeWordDraft] = useState(settings.wakeWord);
  const wakeTimerRef = useRef<number | null>(null);
  const [voiceDiagRunning, setVoiceDiagRunning] = useState(false);
  const [voiceDiagResults, setVoiceDiagResults] = useState<
    Array<{ id: string; label: string; status: 'pass' | 'warning' | 'fail'; detail: string }>
  >([]);

  useEffect(() => {
    setWakeWordDraft(settings.wakeWord);
  }, [settings.wakeWord]);

  useEffect(() => {
    return () => {
      if (wakeTimerRef.current) window.clearTimeout(wakeTimerRef.current);
    };
  }, []);

  const flushWakeWord = (nextVal: string) => {
    if (wakeTimerRef.current) {
      window.clearTimeout(wakeTimerRef.current);
      wakeTimerRef.current = null;
    }
    const clean = nextVal.trim();
    if (clean && clean !== settings.wakeWord) {
      onUpdateSettings({ wakeWord: clean });
    }
  };

  const runVoiceDiagnostics = async () => {
    setVoiceDiagRunning(true);
    const items: Array<{ id: string; label: string; status: 'pass' | 'warning' | 'fail'; detail: string }> = [];

    try {
      const desktop = (window as Window & {
        fridayDesktop?: {
          isDesktopShell?: boolean;
          requestMicPermission?: () => Promise<{ granted: boolean; status: string; detail: string }>;
          getVoiceCapabilities?: () => Promise<{
            platform: string;
            offlineSttReady: boolean;
            recognizers: string[];
            ttsVoices: string[];
            micAccessStatus: string;
          }>;
        };
      }).fridayDesktop;

      items.push({
        id: 'ipc',
        label: 'Electron Desktop Preload Bridge',
        status: desktop?.isDesktopShell ? 'pass' : 'warning',
        detail: desktop?.isDesktopShell
          ? 'Active (window.fridayDesktop contextBridge loaded)'
          : 'Web browser mode (run Windows Electron app for native desktop IPC)',
      });

      const hasGetUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);
      items.push({
        id: 'media-api',
        label: 'Microphone Audio Capture API',
        status: hasGetUserMedia ? 'pass' : 'fail',
        detail: hasGetUserMedia
          ? `${audioInputDevices.length} audio input device(s) enumerated`
          : 'navigator.mediaDevices.getUserMedia is unavailable in this window context',
      });

      if (desktop?.requestMicPermission) {
        const micPerm = await desktop.requestMicPermission();
        items.push({
          id: 'mic-perm',
          label: 'Windows Microphone Privacy Permission',
          status: micPerm.granted ? 'pass' : 'fail',
          detail: micPerm.detail,
        });
      }

      if (onRefreshAudioDevices) {
        await onRefreshAudioDevices();
      }

      const voiceRes = await fetch('/api/diagnostics/voice').catch(() => null);
      const voiceCaps = voiceRes?.ok ? await voiceRes.json() : null;
      const speechRecSupported =
        typeof window !== 'undefined' &&
        Boolean(
          (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
            .SpeechRecognition ||
            (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
              .webkitSpeechRecognition
        );

      const sttDetail = voiceCaps?.offlineSttReady
        ? `Windows System.Speech ready (${(voiceCaps.recognizers || []).join(', ')})`
        : speechRecSupported
          ? 'Browser Web SpeechRecognition active (Windows System.Speech ready inside Desktop App)'
          : voiceCaps?.geminiSpeechAvailable
            ? 'Optional cloud speech transcription active'
            : 'Ready inside Electron on Windows (System.Speech) or Web Speech browsers';

      items.push({
        id: 'stt',
        label: 'Speech Recognition (STT) Engine',
        status: voiceCaps?.offlineSttReady || voiceCaps?.geminiSpeechAvailable || speechRecSupported ? 'pass' : 'warning',
        detail: sttDetail,
      });

      const browserVoices =
        typeof window !== 'undefined' && 'speechSynthesis' in window
          ? window.speechSynthesis.getVoices().length
          : 0;
      const sapiVoices = Array.isArray(voiceCaps?.ttsVoices) ? voiceCaps.ttsVoices.length : 0;

      items.push({
        id: 'tts',
        label: 'Text-to-Speech (TTS) Output Voices',
        status: browserVoices > 0 || sapiVoices > 0 ? 'pass' : 'warning',
        detail: `Browser voices: ${browserVoices} · Windows SAPI voices: ${sapiVoices}`,
      });

      const aiRes = await fetch('/api/health/ai').catch(() => null);
      const aiHealth = aiRes?.ok ? await aiRes.json() : null;
      items.push({
        id: 'ai',
        label: 'AI Response Pipeline',
        status: aiHealth?.connected ? 'pass' : 'warning',
        detail: aiHealth ? `${aiHealth.provider} (${aiHealth.model})` : 'Standalone local client fallback',
      });
    } catch (err) {
      items.push({
        id: 'diag-err',
        label: 'Diagnostic Runner',
        status: 'fail',
        detail: (err as Error).message,
      });
    } finally {
      setVoiceDiagResults(items);
      setVoiceDiagRunning(false);
    }
  };

  const bars = Array.from({ length: 24 }, (_, idx) => {
    const wave = Math.abs(Math.sin(idx * 0.45 + (isListening ? audioLevel * 12 : 1)));
    const heightPct = isListening
      ? Math.max(14, Math.min(100, Math.round((0.25 + audioLevel * 0.9) * wave * 100)))
      : 14;
    return heightPct;
  });

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6">
      <div className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-semibold text-slate-100">Voice Assistant Studio</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              State: {VOICE_STATE_META[voiceState].label} · Wake Word: &ldquo;{settings.wakeWord}&rdquo;
              {liveTranscript ? ` · ${liveTranscript}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSpeaking && onStopSpeaking && (
              <button
                type="button"
                onClick={onStopSpeaking}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-200 border border-rose-400/50 hover:bg-rose-500/30"
              >
                <VolumeX className="w-4 h-4" />
                <span>Stop Speaking</span>
              </button>
            )}
            <button
              type="button"
              onClick={onToggleListening}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                isListening
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                  : 'bg-slate-900 text-cyan-200 border-cyan-500/40 hover:bg-cyan-500/15'
              }`}
            >
              {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              <span>{isListening ? 'Listening Active (Click to Send/Stop)' : 'Start Microphone Capture'}</span>
            </button>
          </div>
        </div>

        <div className="h-24 rounded-lg bg-slate-950/80 border border-slate-800 px-4 flex items-center justify-between gap-1.5">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-full bg-cyan-400/80 transition-all duration-100"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <label className="block space-y-1.5 text-xs">
            <span className="text-slate-300 font-medium">Wake Word</span>
            <input
              type="text"
              value={wakeWordDraft}
              onChange={(e) => {
                const v = e.target.value;
                setWakeWordDraft(v);
                if (wakeTimerRef.current) window.clearTimeout(wakeTimerRef.current);
                wakeTimerRef.current = window.setTimeout(() => flushWakeWord(v), 350);
              }}
              onBlur={() => flushWakeWord(wakeWordDraft)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
            />
          </label>

          <label className="block space-y-1.5 text-xs">
            <span className="text-slate-300 font-medium">Neural Voice Persona</span>
            <select
              value={settings.voiceName}
              onChange={(e) =>
                onUpdateSettings({
                  voiceName: e.target.value as AssistantSettings['voiceName'],
                  voiceGender: e.target.value === 'Charon' || e.target.value === 'Fenrir' ? 'male' : 'female',
                })
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
            >
              <option value="Kore">Kore (Female · Balanced Assistant)</option>
              <option value="Zephyr">Zephyr (Female · Warm Conversational)</option>
              <option value="Puck">Puck (Neutral · Crisp Energetic)</option>
              <option value="Charon">Charon (Male · Deep Composed)</option>
              <option value="Fenrir">Fenrir (Male · Direct Executive)</option>
            </select>
          </label>

          <label className="block space-y-1.5 text-xs md:col-span-2">
            <span className="text-slate-300 font-medium flex items-center justify-between gap-2">
              <span>Microphone Input Device</span>
              {onRefreshAudioDevices && (
                <button
                  type="button"
                  onClick={() => void onRefreshAudioDevices()}
                  className="text-[11px] text-cyan-300 hover:text-cyan-200 underline"
                >
                  Refresh Microphones
                </button>
              )}
            </span>
            <select
              value={settings.audioInputDeviceId || ''}
              onChange={(e) => onUpdateSettings({ audioInputDeviceId: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
            >
              <option value="">System Default Microphone</option>
              {audioInputDevices.map((dev, idx) => (
                <option key={dev.deviceId || `mic-${idx}`} value={dev.deviceId}>
                  {dev.label || `Microphone Input ${idx + 1}`}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1.5 text-xs">
            <span className="text-slate-300 font-medium">
              Speaking Speed ({settings.speakingSpeed.toFixed(2)}x)
            </span>
            <input
              type="range"
              min="0.75"
              max="1.4"
              step="0.05"
              value={settings.speakingSpeed}
              onChange={(e) => onUpdateSettings({ speakingSpeed: Number(e.target.value) })}
              className="w-full accent-cyan-400"
            />
          </label>

          <label className="block space-y-1.5 text-xs">
            <span className="text-slate-300 font-medium">
              Speaking Pitch ({(settings.speakingPitch ?? 1.0).toFixed(2)}x)
            </span>
            <input
              type="range"
              min="0.6"
              max="1.5"
              step="0.05"
              value={settings.speakingPitch ?? 1.0}
              onChange={(e) => onUpdateSettings({ speakingPitch: Number(e.target.value) })}
              className="w-full accent-cyan-400"
            />
          </label>

          <label className="block space-y-1.5 text-xs md:col-span-2">
            <span className="text-slate-300 font-medium">Recognition & Voice Language</span>
            <select
              value={settings.language}
              onChange={(e) => onUpdateSettings({ language: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
            >
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">Hindi (हिन्दी · India)</option>
              <option value="mr-IN">Marathi (मराठी · India)</option>
              <option value="es-ES">Spanish</option>
              <option value="fr-FR">French</option>
              <option value="de-DE">German</option>
              <option value="ja-JP">Japanese</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => onUpdateSettings({ wakeWordEnabled: !settings.wakeWordEnabled })}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
              settings.wakeWordEnabled
                ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            <Radio className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Background Wake Word: {settings.wakeWordEnabled ? 'Active' : 'Paused'}</span>
          </button>

          <button
            type="button"
            onClick={() => onUpdateSettings({ continuousListening: !settings.continuousListening })}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
              settings.continuousListening
                ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            <span>Continuous Conversation: {settings.continuousListening ? 'On' : 'Push-to-Talk'}</span>
          </button>

          <button
            type="button"
            onClick={() => onUpdateSettings({ autoSpeakReplies: !settings.autoSpeakReplies })}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
              settings.autoSpeakReplies
                ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            <span>Auto-Speak Typed Replies: {settings.autoSpeakReplies ? 'On' : 'Manual'}</span>
          </button>
        </div>
      </div>

      <div className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-3">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          <span>Local Device / Neural Text-to-Speech Test</span>
        </h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={testPhrase}
            onChange={(e) => setTestPhrase(e.target.value)}
            aria-label="Test speech phrase"
            className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100"
          />
          <button
            type="button"
            onClick={() => onTestSpeech(testPhrase)}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 whitespace-nowrap shrink-0"
          >
            Synthesize & Speak
          </button>
        </div>
      </div>

      <div className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-200">Voice & Desktop Pipeline Diagnostics</h3>
          <button
            type="button"
            disabled={voiceDiagRunning}
            onClick={() => void runVoiceDiagnostics()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 border border-cyan-500/35 text-cyan-200 hover:bg-cyan-500/15 disabled:opacity-50"
          >
            {voiceDiagRunning ? 'Checking...' : 'Run Voice Diagnostics'}
          </button>
        </div>
        {voiceDiagResults.length > 0 && (
          <div className="space-y-2">
            {voiceDiagResults.map((item) => (
              <div
                key={item.id}
                className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-100">{item.label}</div>
                  <div className="text-slate-400 truncate">{item.detail}</div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase shrink-0 ${
                    item.status === 'pass'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : item.status === 'warning'
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ApplicationsView({
  apps,
  onLaunchApp,
  onTogglePinApp,
  onRefreshApps,
  launchNotice,
}: {
  apps: DesktopAppItem[];
  onLaunchApp: (app: DesktopAppItem) => void;
  onTogglePinApp: (id: string) => void;
  onRefreshApps?: () => Promise<void>;
  launchNotice: string | null;
}) {
  const [filter, setFilter] = useState<'all' | DesktopAppItem['category']>('all');
  const [query, setQuery] = useState('');
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [windowsList, setWindowsList] = useState<RunningWindowInfo[]>([]);
  const [windowActionMsg, setWindowActionMsg] = useState<string | null>(null);
  const [procError, setProcError] = useState<string | null>(null);
  const [pendingCloseTarget, setPendingCloseTarget] = useState<string | null>(null);
  const [loadingProc, setLoadingProc] = useState(false);
  const [refreshingApps, setRefreshingApps] = useState(false);

  const loadProcesses = async () => {
    setLoadingProc(true);
    setProcError(null);
    try {
      const [procRes, winRes] = await Promise.all([
        fetch('/api/system/processes'),
        fetch('/api/apps/windows'),
      ]);
      if (procRes.ok) {
        const procData = await procRes.json();
        setProcesses(procData.processes ?? []);
      } else {
        setProcError('Unable to fetch live OS process list.');
      }
      if (winRes.ok) {
        const winData = await winRes.json();
        setWindowsList(winData.windows ?? []);
      }
    } catch (err) {
      setProcError((err as Error).message || 'Process inspector offline.');
    } finally {
      setLoadingProc(false);
    }
  };

  const handleRefreshCatalog = async () => {
    if (!onRefreshApps) return;
    setRefreshingApps(true);
    try {
      await onRefreshApps();
    } finally {
      setRefreshingApps(false);
    }
  };

  const handleWindowAction = async (
    processName: string,
    action: 'focus' | 'minimize' | 'maximize' | 'close',
    confirmed = false
  ) => {
    if (action === 'close' && !confirmed) {
      setPendingCloseTarget(processName);
      return;
    }
    setPendingCloseTarget(null);
    try {
      const res = await fetch('/api/apps/window-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processName, action, confirmed }),
      });
      const data = await res.json();
      setWindowActionMsg(data.detail || data.error || 'Action completed');
      if (action === 'close') void loadProcesses();
    } catch (err) {
      setWindowActionMsg((err as Error).message || 'Window action failed');
    }
  };

  useEffect(() => {
    loadProcesses();
  }, []);

  const filtered = apps.filter((a) => {
    const matchCat = filter === 'all' || a.category === filter;
    const matchQuery =
      !query.trim() ||
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.description.toLowerCase().includes(query.toLowerCase());
    return matchCat && matchQuery;
  });

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">
            Applications, Processes & Desktop Control
          </h2>
          <p className="text-sm text-slate-400">
            Launch installed tools, pin favorites, and inspect live OS process utilization.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onRefreshApps && (
            <button
              type="button"
              onClick={handleRefreshCatalog}
              disabled={refreshingApps}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 border border-cyan-500/35 text-cyan-200 hover:bg-cyan-500/15 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingApps ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{refreshingApps ? 'Scanning...' : 'Refresh Installed Apps'}</span>
            </button>
          )}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter applications..."
            aria-label="Filter applications"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 w-56"
          />
        </div>
      </div>

      {launchNotice && (
        <div className="px-4 py-2.5 rounded-lg bg-cyan-950/70 border border-cyan-500/35 text-xs text-cyan-200">
          {launchNotice}
        </div>
      )}
      {procError && (
        <div className="px-4 py-2.5 rounded-lg bg-amber-950/60 border border-amber-500/35 text-xs text-amber-200">
          {procError}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(['all', 'development', 'browser', 'system', 'communication', 'media', 'productivity'] as const).map(
          (cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                filter === cat
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30'
                  : 'bg-slate-900/70 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          )
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((app) => (
          <div
            key={app.id}
            className="p-4 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="font-semibold text-sm text-slate-100 truncate">{app.name}</div>
              <div className="text-xs text-slate-400 truncate">{app.description}</div>
              <div className="text-[11px] font-mono-tabular text-slate-500 mt-1">
                {app.command} · {app.installed ? 'Detected on host' : 'Windows Desktop target'}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onTogglePinApp(app.id)}
                aria-label={app.pinned ? `Unpin ${app.name}` : `Pin ${app.name}`}
                className={`p-2 rounded-lg border ${
                  app.pinned
                    ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-300'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                }`}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onLaunchApp(app)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              >
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Launch</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Live Running Processes Table */}
      <section className="rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>Live Running Processes (Top CPU)</span>
          </h3>
          <button
            type="button"
            onClick={loadProcesses}
            disabled={loadingProc}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-700 text-slate-300 hover:border-cyan-400/40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingProc ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left tabular-nums">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-2 pr-3 font-medium">PID</th>
                <th className="py-2 pr-3 font-medium">Process Name</th>
                <th className="py-2 pr-3 font-medium text-right">CPU %</th>
                <th className="py-2 pr-3 font-medium text-right">RAM %</th>
                <th className="py-2 font-medium text-right">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {processes.map((proc) => (
                <tr key={`${proc.pid}-${proc.name}`} className="text-slate-200">
                  <td className="py-2 pr-3 font-mono-tabular text-slate-400">{proc.pid}</td>
                  <td className="py-2 pr-3 font-medium truncate max-w-[240px]">{proc.name}</td>
                  <td className="py-2 pr-3 font-mono-tabular text-right text-cyan-300">{proc.cpu}%</td>
                  <td className="py-2 pr-3 font-mono-tabular text-right">{proc.mem}%</td>
                  <td className="py-2 text-right text-slate-400">{proc.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Active Desktop Windows (Windows 10/11) */}
      <section className="rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-200">
            Active Desktop Windows ({windowsList.length})
          </h3>
          {windowActionMsg && (
            <span className="text-xs text-cyan-300 truncate">{windowActionMsg}</span>
          )}
        </div>

        {pendingCloseTarget && (
          <div className="p-3 rounded-lg bg-amber-950/50 border border-amber-500/40 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
            <span>Confirm closing window &ldquo;{pendingCloseTarget}&rdquo;? Unsaved work may be lost.</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleWindowAction(pendingCloseTarget, 'close', true)}
                className="px-2.5 py-1 rounded bg-rose-500/25 border border-rose-400/50 text-rose-100 font-semibold"
              >
                Confirm Close
              </button>
              <button
                type="button"
                onClick={() => setPendingCloseTarget(null)}
                className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {windowsList.length === 0 ? (
          <p className="text-xs text-slate-400">
            No active Windows GUI windows detected in this environment (live on Windows 10/11 desktop).
          </p>
        ) : (
          <div className="space-y-1.5">
            {windowsList.slice(0, 12).map((w) => (
              <div
                key={`${w.id}-${w.name}`}
                className="p-2.5 rounded-lg bg-slate-900/75 border border-slate-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-100 truncate">{w.title}</div>
                  <div className="text-[11px] font-mono-tabular text-slate-400">{w.name} · PID {w.id}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleWindowAction(w.name, 'focus')}
                    className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-cyan-200 hover:border-cyan-400/50"
                  >
                    Focus
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWindowAction(w.name, 'minimize')}
                    className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300"
                  >
                    Min
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWindowAction(w.name, 'maximize')}
                    className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300"
                  >
                    Max
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWindowAction(w.name, 'close', false)}
                    className="px-2 py-1 rounded bg-rose-500/15 border border-rose-500/35 text-rose-200"
                  >
                    Close
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function TasksWorkflowsView({
  workflows,
  todos = [],
  notes = [],
  onRunWorkflow,
  onCreateWorkflow,
  onAddTodo,
  onToggleTodo,
  onUpdateTodo,
  onDeleteTodo,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  runningId,
}: {
  workflows: AutomationWorkflow[];
  todos?: TodoItem[];
  notes?: NoteItem[];
  onRunWorkflow: (id: string) => Promise<void>;
  onCreateWorkflow: (payload: { name: string; description: string; triggerPhrase: string }) => Promise<void>;
  onAddTodo?: (payload: string | { title: string; priority?: 'low' | 'normal' | 'high'; dueDate?: string }) => Promise<void> | void;
  onToggleTodo?: (id: string) => Promise<void> | void;
  onUpdateTodo?: (id: string, patch: Partial<TodoItem>) => Promise<void> | void;
  onDeleteTodo?: (id: string) => Promise<void> | void;
  onAddNote?: (payload: { title: string; content: string; pinned?: boolean }) => Promise<void> | void;
  onUpdateNote?: (id: string, patch: Partial<NoteItem>) => Promise<void> | void;
  onDeleteNote?: (id: string) => Promise<void> | void;
  runningId: string | null;
}) {
  const [todoTitle, setTodoTitle] = useState('');
  const [todoPriority, setTodoPriority] = useState<TodoItem['priority']>('normal');
  const [todoDueDate, setTodoDueDate] = useState('');
  const [todoFilter, setTodoFilter] = useState<'all' | 'open' | 'completed'>('all');
  const [todoError, setTodoError] = useState<string | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editTodoTitle, setEditTodoTitle] = useState('');

  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteTitle, setEditNoteTitle] = useState('');
  const [editNoteContent, setEditNoteContent] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerPhrase, setTriggerPhrase] = useState('');
  const [wfError, setWfError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !triggerPhrase.trim()) {
      setWfError('Please enter both a workflow name and a command trigger phrase.');
      return;
    }
    setWfError(null);
    await onCreateWorkflow({ name: name.trim(), description: description.trim(), triggerPhrase: triggerPhrase.trim() });
    setName('');
    setDescription('');
    setTriggerPhrase('');
  };

  const handleTodoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!todoTitle.trim()) {
      setTodoError('Enter a task description before adding.');
      return;
    }
    setTodoError(null);
    await onAddTodo?.({
      title: todoTitle.trim(),
      priority: todoPriority,
      dueDate: todoDueDate || undefined,
    });
    setTodoTitle('');
    setTodoDueDate('');
  };

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() && !noteContent.trim()) {
      setNoteError('Enter a note title or content before saving.');
      return;
    }
    setNoteError(null);
    await onAddNote?.({
      title: noteTitle.trim() || noteContent.trim().slice(0, 48),
      content: noteContent.trim() || noteTitle.trim(),
    });
    setNoteTitle('');
    setNoteContent('');
  };

  const visibleTodos = todos.filter((t) =>
    todoFilter === 'all' ? true : todoFilter === 'open' ? !t.completed : t.completed
  );
  const sortedNotes = [...notes].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-slate-100">
          Tasks, Notes &amp; Automation Workflows
        </h2>
        <p className="text-sm text-slate-400">
          Manage your personal to-do tasks, pinned notes, and repeatable desktop workflows with persistent storage.
        </p>
      </div>

      {/* Tasks & Notes Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* To-Do Tasks Section */}
        <section className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100">
              To-Do Tasks ({todos.filter((t) => !t.completed).length} Open)
            </h3>
            <div className="flex items-center gap-1 text-[11px]">
              {(['all', 'open', 'completed'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTodoFilter(mode)}
                  className={`px-2.5 py-1 rounded-md capitalize border ${
                    todoFilter === mode
                      ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleTodoSubmit} className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={todoTitle}
                onChange={(e) => {
                  setTodoTitle(e.target.value);
                  if (todoError) setTodoError(null);
                }}
                placeholder="Add new task..."
                aria-label="New task title"
                className="flex-1 min-w-[160px] px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
              />
              <select
                value={todoPriority}
                onChange={(e) => setTodoPriority(e.target.value as TodoItem['priority'])}
                aria-label="Task priority"
                className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
              <input
                type="date"
                value={todoDueDate}
                onChange={(e) => setTodoDueDate(e.target.value)}
                aria-label="Task due date"
                className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Task</span>
              </button>
            </div>
            {todoError && <p className="text-xs text-rose-300">{todoError}</p>}
          </form>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {visibleTodos.length === 0 ? (
              <p className="text-xs text-slate-400">No tasks in this view.</p>
            ) : (
              visibleTodos.map((todo) => (
                <div
                  key={todo.id}
                  className="p-2.5 rounded-lg bg-slate-900/75 border border-slate-800 flex items-center justify-between gap-2"
                >
                  {editingTodoId === todo.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editTodoTitle}
                        onChange={(e) => setEditTodoTitle(e.target.value)}
                        aria-label="Edit task title"
                        className="flex-1 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (editTodoTitle.trim()) {
                            void onUpdateTodo?.(todo.id, { title: editTodoTitle.trim() });
                          }
                          setEditingTodoId(null);
                        }}
                        aria-label={`Save task "${todo.title}"`}
                        className="p-1.5 rounded bg-cyan-500 text-slate-950"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTodoId(null)}
                        aria-label="Cancel task edit"
                        className="p-1.5 rounded bg-slate-800 text-slate-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onToggleTodo?.(todo.id)}
                        className="flex items-center gap-2.5 text-left min-w-0 flex-1"
                      >
                        {todo.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-cyan-400 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-xs font-medium truncate ${
                              todo.completed ? 'line-through text-slate-500' : 'text-slate-100'
                            }`}
                          >
                            {todo.title}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono-tabular">
                            {todo.priority}
                            {todo.dueDate ? ` · Due ${todo.dueDate}` : ''}
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        {onUpdateTodo && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTodoId(todo.id);
                              setEditTodoTitle(todo.title);
                            }}
                            aria-label={`Edit task "${todo.title}"`}
                            className="p-1.5 rounded text-slate-400 hover:text-cyan-300"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDeleteTodo && (
                          <button
                            type="button"
                            onClick={() => onDeleteTodo(todo.id)}
                            aria-label={`Delete task "${todo.title}"`}
                            className="p-1.5 rounded text-slate-400 hover:text-rose-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Notes Section */}
        <section className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-4">
          <h3 className="text-sm font-semibold text-slate-100">
            Personal Notes ({notes.length})
          </h3>

          <form onSubmit={handleNoteSubmit} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={noteTitle}
                onChange={(e) => {
                  setNoteTitle(e.target.value);
                  if (noteError) setNoteError(null);
                }}
                placeholder="Note title..."
                aria-label="Note title"
                className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Save Note</span>
              </button>
            </div>
            <textarea
              value={noteContent}
              onChange={(e) => {
                setNoteContent(e.target.value);
                if (noteError) setNoteError(null);
              }}
              rows={2}
              placeholder="Write detailed note..."
              aria-label="Note content"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
            />
            {noteError && <p className="text-xs text-rose-300">{noteError}</p>}
          </form>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {sortedNotes.length === 0 ? (
              <p className="text-xs text-slate-400">No notes saved yet.</p>
            ) : (
              sortedNotes.map((n) => (
                <div
                  key={n.id}
                  className="p-3 rounded-lg bg-slate-900/75 border border-slate-800 space-y-1.5"
                >
                  {editingNoteId === n.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editNoteTitle}
                        onChange={(e) => setEditNoteTitle(e.target.value)}
                        aria-label="Edit note title"
                        className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100"
                      />
                      <textarea
                        value={editNoteContent}
                        onChange={(e) => setEditNoteContent(e.target.value)}
                        rows={2}
                        aria-label="Edit note content"
                        className="w-full px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void onUpdateNote?.(n.id, {
                              title: editNoteTitle.trim() || n.title,
                              content: editNoteContent.trim() || n.content,
                            });
                            setEditingNoteId(null);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500 text-slate-950 text-xs font-semibold"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingNoteId(null)}
                          className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {n.pinned ? '📌 ' : ''}
                          {n.title}
                        </div>
                        <div className="text-xs text-slate-300 whitespace-pre-wrap mt-0.5">{n.content}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {onUpdateNote && (
                          <button
                            type="button"
                            onClick={() => void onUpdateNote(n.id, { pinned: !n.pinned })}
                            aria-label={n.pinned ? `Unpin note "${n.title}"` : `Pin note "${n.title}"`}
                            className={`p-1 rounded ${n.pinned ? 'text-cyan-300' : 'text-slate-400 hover:text-cyan-300'}`}
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onUpdateNote && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteId(n.id);
                              setEditNoteTitle(n.title);
                              setEditNoteContent(n.content);
                            }}
                            aria-label={`Edit note "${n.title}"`}
                            className="p-1 rounded text-slate-400 hover:text-cyan-300"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDeleteNote && (
                          <button
                            type="button"
                            onClick={() => onDeleteNote(n.id)}
                            aria-label={`Delete note "${n.title}"`}
                            className="p-1 rounded text-slate-400 hover:text-rose-300"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Multi-Agent Workflows Section */}
      <div className="space-y-4 pt-2">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Workflow className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          <span>Multi-Agent Automation Workflows</span>
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className="p-4 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-sm text-slate-100 flex items-center gap-2">
                    <Workflow className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                    <span>{wf.name}</span>
                  </h4>
                  <span className="text-[11px] font-mono-tabular text-slate-400">
                    Runs: {wf.runCount}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{wf.description}</p>
                <div className="mt-3 space-y-1">
                  {wf.steps.map((s, idx) => (
                    <div key={idx} className="text-xs text-slate-300 flex items-center gap-2">
                      <span className="font-mono-tabular text-cyan-400 uppercase">{s.agent}</span>
                      <span aria-hidden="true">·</span>
                      <span>{s.action}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={runningId === wf.id}
                onClick={() => onRunWorkflow(wf.id)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{runningId === wf.id ? 'Executing Pipeline...' : 'Run Workflow'}</span>
              </button>
            </div>
          ))}
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-3"
        >
          <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Plus className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>Create Automation Workflow</span>
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (wfError) setWfError(null);
              }}
              placeholder="Workflow Name (e.g., Evening Project Backup Check)"
              aria-label="Workflow name"
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
            />
            <input
              type="text"
              value={triggerPhrase}
              onChange={(e) => {
                setTriggerPhrase(e.target.value);
                if (wfError) setWfError(null);
              }}
              placeholder="Command Trigger (e.g., Check system performance and schedule)"
              aria-label="Workflow trigger phrase"
              className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
            />
          </div>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description..."
            aria-label="Workflow description"
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
          />
          {wfError && <p className="text-xs text-rose-300">{wfError}</p>}
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400"
          >
            Save Workflow
          </button>
        </form>
      </div>
    </div>
  );
}
