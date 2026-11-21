import { useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  ExternalLink,
  Layers,
  Mic,
  MicOff,
  Pin,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Volume2,
  Workflow,
} from 'lucide-react';
import type {
  AgentDescriptor,
  AgentId,
  AssistantSettings,
  AutomationWorkflow,
  DesktopAppItem,
  HologramMode,
  HologramSettings,
  ProcessInfo,
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
  onToggleListening,
  onUpdateSettings,
  onTestSpeech,
}: {
  settings: AssistantSettings;
  voiceState: VoiceState;
  audioLevel: number;
  isListening: boolean;
  onToggleListening: () => void;
  onUpdateSettings: (patch: Partial<AssistantSettings>) => void;
  onTestSpeech: (phrase: string) => void;
}) {
  const [testPhrase, setTestPhrase] = useState(
    'All systems nominal. F.R.I.D.A.Y. holographic core and neural voice pipeline active.'
  );

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
            </p>
          </div>
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
            <span>{isListening ? 'Listening Active (Click to Stop)' : 'Start Microphone Capture'}</span>
          </button>
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
              value={settings.wakeWord}
              onChange={(e) => onUpdateSettings({ wakeWord: e.target.value })}
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
            <span className="text-slate-300 font-medium">Recognition Language</span>
            <select
              value={settings.language}
              onChange={(e) => onUpdateSettings({ language: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
            >
              <option value="en-US">English (US)</option>
              <option value="en-GB">English (UK)</option>
              <option value="en-IN">English (India)</option>
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
            <span>Auto-Speak Replies: {settings.autoSpeakReplies ? 'On' : 'Manual'}</span>
          </button>
        </div>
      </div>

      <div className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-3">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          <span>Gemini Neural Text-to-Speech Test</span>
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
    </div>
  );
}

export function ApplicationsView({
  apps,
  onLaunchApp,
  onTogglePinApp,
  launchNotice,
}: {
  apps: DesktopAppItem[];
  onLaunchApp: (app: DesktopAppItem) => void;
  onTogglePinApp: (id: string) => void;
  launchNotice: string | null;
}) {
  const [filter, setFilter] = useState<'all' | DesktopAppItem['category']>('all');
  const [query, setQuery] = useState('');
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loadingProc, setLoadingProc] = useState(false);

  const loadProcesses = async () => {
    setLoadingProc(true);
    try {
      const res = await fetch('/api/system/processes');
      const data = await res.json();
      setProcesses(data.processes ?? []);
    } finally {
      setLoadingProc(false);
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
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter applications..."
          aria-label="Filter applications"
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 w-56"
        />
      </div>

      {launchNotice && (
        <div className="px-4 py-2.5 rounded-lg bg-cyan-950/70 border border-cyan-500/35 text-xs text-cyan-200">
          {launchNotice}
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
    </div>
  );
}

export function TasksWorkflowsView({
  workflows,
  onRunWorkflow,
  onCreateWorkflow,
  runningId,
}: {
  workflows: AutomationWorkflow[];
  onRunWorkflow: (id: string) => Promise<void>;
  onCreateWorkflow: (payload: { name: string; description: string; triggerPhrase: string }) => Promise<void>;
  runningId: string | null;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerPhrase, setTriggerPhrase] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !triggerPhrase.trim()) return;
    await onCreateWorkflow({ name, description, triggerPhrase });
    setName('');
    setDescription('');
    setTriggerPhrase('');
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-slate-100">Tasks & Multi-Agent Workflows</h2>
        <p className="text-sm text-slate-400">
          Chain specialist agents into repeatable desktop workflows with explicit audit logging.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {workflows.map((wf) => (
          <div
            key={wf.id}
            className="p-4 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 flex flex-col justify-between gap-4"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-sm text-slate-100 flex items-center gap-2">
                  <Workflow className="w-4 h-4 text-cyan-400" aria-hidden="true" />
                  <span>{wf.name}</span>
                </h3>
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
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Plus className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          <span>Create Automation Workflow</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workflow Name (e.g., Evening Project Backup Check)"
            aria-label="Workflow name"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
          />
          <input
            type="text"
            value={triggerPhrase}
            onChange={(e) => setTriggerPhrase(e.target.value)}
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
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400"
        >
          Save Workflow
        </button>
      </form>
    </div>
  );
}
