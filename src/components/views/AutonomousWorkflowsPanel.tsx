import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderCog,
  Loader2,
  Pause,
  Play,
  Plus,
  Plug,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
  XCircle,
} from 'lucide-react';
import type {
  AutomationPluginDescriptor,
  BackgroundTaskRecord,
  WorkflowPreferenceItem,
} from '../../core/automation/types';

const GOAL_PRESETS: Array<{ label: string; goal: string }> = [
  { label: 'Excel Expense Sheet', goal: 'Create an Excel expense sheet with formulas and summary' },
  { label: 'HTML Login Page', goal: 'Create a responsive HTML CSS JS login page project and verify preview' },
  { label: 'Word AI Report', goal: 'Create a Word report document on Artificial Intelligence' },
  { label: 'PowerPoint Deck', goal: 'Create a 5-slide PowerPoint presentation on Quantum Computing' },
  { label: 'Screen UIA Inspect', goal: 'Read screen text and active window elements' },
];

const STATE_BADGE: Record<BackgroundTaskRecord['state'], string> = {
  pending: 'bg-slate-800 text-slate-300 border-slate-700',
  planning: 'bg-purple-500/15 text-purple-200 border-purple-400/35',
  waiting_for_user: 'bg-amber-500/15 text-amber-200 border-amber-400/40',
  running: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40',
  paused: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
  retrying: 'bg-amber-500/20 text-amber-200 border-amber-400/40',
  verifying: 'bg-purple-500/20 text-purple-200 border-purple-400/40',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  failed: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
  cancelled: 'bg-slate-800/80 text-slate-400 border-slate-700',
};

export function AutonomousWorkflowsPanel() {
  const [goalInput, setGoalInput] = useState('');
  const [executingGoal, setExecutingGoal] = useState(false);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [tasks, setTasks] = useState<BackgroundTaskRecord[]>([]);
  const [preferences, setPreferences] = useState<WorkflowPreferenceItem[]>([]);
  const [plugins, setPlugins] = useState<AutomationPluginDescriptor[]>([]);
  const [pluginsExpanded, setPluginsExpanded] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const [prefKey, setPrefKey] = useState('preferred_web_folder');
  const [prefLabel, setPrefLabel] = useState('Preferred Website Projects Folder');
  const [prefValue, setPrefValue] = useState('');
  const [prefCategory, setPrefCategory] = useState<WorkflowPreferenceItem['category']>('folder');
  const [prefError, setPrefError] = useState<string | null>(null);

  const loadAutomationState = useCallback(async () => {
    try {
      const [tasksRes, prefsRes, pluginsRes] = await Promise.all([
        fetch('/api/automation/tasks'),
        fetch('/api/automation/preferences'),
        fetch('/api/automation/plugins'),
      ]);
      if (tasksRes.ok) {
        const d = await tasksRes.json();
        setTasks(Array.isArray(d.tasks) ? d.tasks : []);
      }
      if (prefsRes.ok) {
        const d = await prefsRes.json();
        setPreferences(Array.isArray(d.preferences) ? d.preferences : []);
      }
      if (pluginsRes.ok) {
        const d = await pluginsRes.json();
        setPlugins(Array.isArray(d.plugins) ? d.plugins : []);
      }
    } catch {
      // Ignore standalone fallback
    }
  }, []);

  useEffect(() => {
    void loadAutomationState();
  }, [loadAutomationState]);

  const hasActiveTask = tasks.some(
    (t) =>
      t.state === 'pending' ||
      t.state === 'planning' ||
      t.state === 'running' ||
      t.state === 'retrying' ||
      t.state === 'verifying'
  );

  useEffect(() => {
    if (!hasActiveTask) return;
    const timer = window.setInterval(() => {
      void loadAutomationState();
    }, 1200);
    return () => window.clearInterval(timer);
  }, [hasActiveTask, loadAutomationState]);

  const handleExecuteGoal = async (goalText: string, confirmed = false) => {
    const clean = goalText.trim();
    if (!clean) {
      setGoalError('Enter a multi-step desktop, office, browser, or coding goal to execute.');
      return;
    }
    setGoalError(null);
    setStatusNotice(null);
    setExecutingGoal(true);
    try {
      const res = await fetch('/api/automation/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: clean, confirmed, wait: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Workflow execution failed');
      }
      if (data.task) {
        setExpandedTaskId(data.task.id);
        setStatusNotice(
          data.task.state === 'waiting_for_user'
            ? `Confirmation needed for "${data.task.scenarioKey}": review and approve in the queue below.`
            : `Workflow "${data.task.scenarioKey}" ${data.task.state} (${data.task.progressPercent}%).`
        );
      }
      setGoalInput('');
      await loadAutomationState();
    } catch (err) {
      setGoalError((err as Error).message);
    } finally {
      setExecutingGoal(false);
    }
  };

  const handleTaskAction = async (
    taskId: string,
    action: 'pause' | 'resume' | 'cancel',
    confirmed = false
  ) => {
    try {
      const res = await fetch(`/api/automation/tasks/${encodeURIComponent(taskId)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed }),
      });
      if (res.ok) {
        await loadAutomationState();
        if (action === 'resume') {
          window.setTimeout(() => {
            void loadAutomationState();
          }, 450);
        }
      }
    } catch {
      // Ignore transient error
    }
  };

  const handleSavePreference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefKey.trim() || !prefValue.trim()) {
      setPrefError('Both preference key and value are required.');
      return;
    }
    setPrefError(null);
    try {
      const res = await fetch('/api/automation/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: prefKey.trim(),
          label: prefLabel.trim() || prefKey.trim(),
          value: prefValue.trim(),
          category: prefCategory,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save preference');
      setPrefValue('');
      setStatusNotice(`Saved workflow memory preference "${data.preference?.key || prefKey}".`);
      await loadAutomationState();
    } catch (err) {
      setPrefError((err as Error).message);
    }
  };

  const handleDeletePreference = async (key: string) => {
    try {
      const res = await fetch(`/api/automation/preferences/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPreferences((prev) => prev.filter((p) => p.key !== key));
      }
    } catch {
      // Ignore error
    }
  };

  const handleTogglePlugin = async (plugin: AutomationPluginDescriptor) => {
    try {
      const res = await fetch(`/api/automation/plugins/${encodeURIComponent(plugin.id)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !plugin.enabled }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.plugin) {
          setPlugins((prev) => prev.map((p) => (p.id === plugin.id ? data.plugin : p)));
        }
      }
    } catch {
      // Ignore error
    }
  };

  return (
    <div className="space-y-5">
      {/* Autonomous Desktop Goal Runner */}
      <section className="p-5 rounded-xl border border-cyan-500/20 bg-[#070c1a]/90 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Bot className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              <span>Autonomous Desktop Workflow Orchestrator</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Plan, verify, recover, and run multi-step Office (.docx/.xlsx/.pptx), VS Code, Browser, File, and Terminal workflows.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAutomationState()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-700 text-cyan-200 hover:border-cyan-400/40"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Refresh Queue</span>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleExecuteGoal(goalInput);
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            value={goalInput}
            onChange={(e) => {
              setGoalInput(e.target.value);
              if (goalError) setGoalError(null);
            }}
            placeholder='Goal in English or Hinglish (e.g. "Create an Excel expense sheet with formulas")'
            aria-label="Autonomous workflow goal"
            className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
          />
          <button
            type="submit"
            disabled={executingGoal}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50 shrink-0"
          >
            {executingGoal ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{executingGoal ? 'Running Goal...' : 'Execute Goal'}</span>
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {GOAL_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={executingGoal}
              onClick={() => void handleExecuteGoal(preset.goal)}
              className="px-2.5 py-1 rounded-md text-[11px] bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:border-cyan-400/45 hover:text-cyan-200 disabled:opacity-50"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {goalError && <p className="text-xs text-rose-300">{goalError}</p>}
        {statusNotice && <p className="text-xs text-cyan-300">{statusNotice}</p>}
      </section>

      {/* Live Background Task Queue & Workflow Memory */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Background Task Queue */}
        <section className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              <span>Background Task Queue ({tasks.length})</span>
            </h3>
            <span className="text-[11px] font-mono-tabular text-slate-400">
              {tasks.filter((t) => t.state === 'completed').length} Verified
            </span>
          </div>

          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {tasks.length === 0 ? (
              <p className="text-xs text-slate-400">
                No autonomous workflow runs recorded yet. Execute a goal above or via AI Chat.
              </p>
            ) : (
              tasks.map((task) => {
                const isExpanded = expandedTaskId === task.id;
                const canPause = task.state === 'running' || task.state === 'pending' || task.state === 'retrying';
                const canResume = task.state === 'paused';
                const needsConfirm = task.state === 'waiting_for_user';
                const canCancel =
                  task.state !== 'completed' && task.state !== 'cancelled' && task.state !== 'failed';

                return (
                  <div
                    key={task.id}
                    className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-100 truncate">{task.goal}</div>
                        <div className="text-[11px] font-mono-tabular text-slate-400 mt-0.5">
                          {task.scenarioKey} · {task.progressPercent}% · {task.steps.length} step(s)
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-semibold uppercase shrink-0 ${STATE_BADGE[task.state]}`}
                      >
                        {task.state.replace(/_/g, ' ')}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                      <div
                        className={`h-full transition-all duration-300 ${
                          task.state === 'failed'
                            ? 'bg-rose-400'
                            : task.state === 'completed'
                              ? 'bg-emerald-400'
                              : 'bg-cyan-400'
                        }`}
                        style={{ width: `${Math.max(4, task.progressPercent)}%` }}
                      />
                    </div>

                    {task.confirmationSummary && needsConfirm && (
                      <div className="p-2 rounded bg-amber-950/40 border border-amber-500/35 text-amber-200 text-[11px] flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{task.confirmationSummary}</span>
                      </div>
                    )}

                    {task.artifacts.length > 0 && (
                      <div className="text-[11px] text-emerald-300 font-mono-tabular break-all">
                        Artifacts: {task.artifacts.join(' · ')}
                      </div>
                    )}

                    {task.error && (
                      <div className="text-[11px] text-rose-300 flex items-start gap-1">
                        <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{task.error}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {needsConfirm && (
                          <button
                            type="button"
                            onClick={() => void handleTaskAction(task.id, 'resume', true)}
                            className="px-2.5 py-1 rounded bg-cyan-500 text-slate-950 font-semibold"
                          >
                            Confirm &amp; Run
                          </button>
                        )}
                        {canPause && (
                          <button
                            type="button"
                            onClick={() => void handleTaskAction(task.id, 'pause')}
                            aria-label={`Pause task ${task.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200"
                          >
                            <Pause className="w-3 h-3" aria-hidden="true" />
                            <span>Pause</span>
                          </button>
                        )}
                        {canResume && (
                          <button
                            type="button"
                            onClick={() => void handleTaskAction(task.id, 'resume')}
                            aria-label={`Resume task ${task.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-200"
                          >
                            <Play className="w-3 h-3" aria-hidden="true" />
                            <span>Resume</span>
                          </button>
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => void handleTaskAction(task.id, 'cancel')}
                            aria-label={`Cancel task ${task.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-500/15 border border-rose-500/35 text-rose-200"
                          >
                            <Square className="w-3 h-3" aria-hidden="true" />
                            <span>Cancel</span>
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                        className="text-[11px] text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1"
                      >
                        <span>{isExpanded ? 'Hide Steps' : 'Inspect Steps'}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="w-3 h-3" aria-hidden="true" />
                        )}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="pt-2 border-t border-slate-800 space-y-1.5">
                        {task.steps.map((s) => (
                          <div
                            key={s.stepId}
                            className="p-2 rounded bg-slate-950/75 border border-slate-800/80 flex items-start justify-between gap-2 text-[11px]"
                          >
                            <div className="min-w-0">
                              <div className="text-slate-200 font-medium">{s.title}</div>
                              <div className="text-slate-400 mt-0.5">
                                {s.verificationDetail || s.output || s.error || s.status}
                              </div>
                            </div>
                            {s.verified ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                            ) : (
                              <span className="text-slate-500 uppercase shrink-0">{s.status}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Workflow Memory Preferences */}
        <section className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-3">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <FolderCog className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>Workflow Memory &amp; User Defaults ({preferences.length})</span>
          </h3>
          <p className="text-xs text-slate-400">
            Store default project folders, preferred browsers, and editors remembered across autonomous workflows.
          </p>

          <form onSubmit={handleSavePreference} className="space-y-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={prefKey}
                onChange={(e) => setPrefKey(e.target.value)}
                placeholder="Key (e.g. preferred_web_folder)"
                aria-label="Workflow preference key"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
              />
              <select
                value={prefCategory}
                onChange={(e) =>
                  setPrefCategory(e.target.value as WorkflowPreferenceItem['category'])
                }
                aria-label="Workflow preference category"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
              >
                <option value="folder">Folder</option>
                <option value="browser">Browser</option>
                <option value="editor">Editor</option>
                <option value="office">Office</option>
                <option value="workflow">Workflow</option>
              </select>
            </div>
            <input
              type="text"
              value={prefLabel}
              onChange={(e) => setPrefLabel(e.target.value)}
              placeholder="Description label..."
              aria-label="Workflow preference label"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={prefValue}
                onChange={(e) => {
                  setPrefValue(e.target.value);
                  if (prefError) setPrefError(null);
                }}
                placeholder="Value (e.g. D:\\WebProjects or chrome)"
                aria-label="Workflow preference value"
                className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Save Default</span>
              </button>
            </div>
            {prefError && <p className="text-xs text-rose-300">{prefError}</p>}
          </form>

          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {preferences.length === 0 ? (
              <p className="text-xs text-slate-400">No workflow preferences saved yet.</p>
            ) : (
              preferences.map((pref) => (
                <div
                  key={pref.key}
                  className="p-2.5 rounded-lg bg-slate-900/75 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-100 truncate">
                      {pref.label}{' '}
                      <span className="font-mono-tabular text-[11px] text-cyan-300">
                        ({pref.key})
                      </span>
                    </div>
                    <div className="text-slate-300 font-mono-tabular text-[11px] truncate">
                      {pref.category}: {pref.value}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeletePreference(pref.key)}
                    aria-label={`Delete preference ${pref.key}`}
                    className="p-1.5 rounded text-slate-400 hover:text-rose-300 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Registered Automation Plugins */}
      <section className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Plug className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>
              Registered Automation Plugins ({plugins.filter((p) => p.enabled).length}/{plugins.length} Active)
            </span>
          </h3>
          <button
            type="button"
            onClick={() => setPluginsExpanded((v) => !v)}
            aria-expanded={pluginsExpanded}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-700 text-cyan-200 hover:border-cyan-400/40"
          >
            <span>{pluginsExpanded ? 'Hide Plugins' : 'Inspect All 11 Plugins'}</span>
            {pluginsExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {pluginsExpanded && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {plugins.map((plugin) => (
              <div
                key={plugin.id}
                className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex flex-col justify-between gap-2 text-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-100">{plugin.name}</span>
                    <button
                      type="button"
                      onClick={() => void handleTogglePlugin(plugin)}
                      aria-label={`${plugin.enabled ? 'Disable' : 'Enable'} ${plugin.name}`}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        plugin.enabled
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {plugin.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>
                  <p className="text-slate-400 mt-1 text-[11px]">{plugin.description}</p>
                </div>
                <div className="text-[10px] font-mono-tabular text-cyan-300/80">
                  {plugin.supportedWorkflows.join(' · ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
