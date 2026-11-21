import { useState } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  Circle,
  Download,
  History,
  Image as ImageIcon,
  Layers,
  Pencil,
  Plus,
  Power,
  Search,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AssistantSettings,
  CalendarEvent,
  ChatMessage,
  HologramMode,
  MemoryItem,
} from '../../core/types';

export function CalendarView({
  events,
  onCreateEvent,
  onToggleEvent,
  onDeleteEvent,
}: {
  events: CalendarEvent[];
  onCreateEvent: (evt: {
    title: string;
    date: string;
    time: string;
    category: CalendarEvent['category'];
  }) => Promise<void>;
  onToggleEvent: (id: string) => void;
  onDeleteEvent: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('15:00');
  const [category, setCategory] = useState<CalendarEvent['category']>('meeting');
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onCreateEvent({ title, date, time, category });
    setTitle('');
  };

  const handleGenerateBriefing = async () => {
    setLoadingBriefing(true);
    try {
      const res = await fetch('/api/calendar/briefing', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate daily briefing');
      setBriefing(data.briefing);
    } catch (err) {
      setBriefing(`Briefing unavailable: ${(err as Error).message}`);
    } finally {
      setLoadingBriefing(false);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100">Calendar & Daily Productivity</h2>
          <p className="text-sm text-slate-400">
            Manage meetings, reminders, and tasks with persistent local storage.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGenerateBriefing}
          disabled={loadingBriefing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-500/20 text-indigo-200 border border-indigo-400/40 hover:bg-indigo-500/30 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{loadingBriefing ? 'Preparing Briefing...' : 'Generate Daily Briefing'}</span>
        </button>
      </div>

      {briefing && (
        <div className="p-4 rounded-xl border border-indigo-400/30 bg-[#0b1329]/90 space-y-1.5">
          <div className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Executive Daily Briefing</span>
          </div>
          <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">{briefing}</p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="p-4 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 grid grid-cols-1 md:grid-cols-5 gap-3"
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Event or task title..."
          aria-label="New calendar event title"
          className="md:col-span-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Event date"
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Event time"
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
        />
        <div className="flex gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CalendarEvent['category'])}
            aria-label="Event category"
            className="flex-1 px-2 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
          >
            <option value="meeting">Meeting</option>
            <option value="task">Task</option>
            <option value="reminder">Reminder</option>
            <option value="focus">Focus</option>
          </select>
          <button
            type="submit"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add</span>
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {events.length === 0 ? (
          <p className="text-sm text-slate-400">No events scheduled yet.</p>
        ) : (
          events.map((evt) => (
            <div
              key={evt.id}
              className="p-3.5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 flex items-center justify-between gap-3"
            >
              <button
                type="button"
                onClick={() => onToggleEvent(evt.id)}
                className="flex items-center gap-3 text-left min-w-0 flex-1"
              >
                {evt.completed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-cyan-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${evt.completed ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                    {evt.title}
                  </div>
                  <div className="text-xs font-mono-tabular text-slate-400">
                    {evt.date} · {evt.time} · {evt.category}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onDeleteEvent(evt.id)}
                aria-label={`Delete event "${evt.title}"`}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function MemoryView({
  memory,
  onAddMemory,
  onEditMemory,
  onDeleteMemory,
  onOpenChatHistory,
}: {
  memory: MemoryItem[];
  onAddMemory: (item: { category: MemoryItem['category']; key: string; value: string }) => Promise<void>;
  onEditMemory: (id: string, patch: { category: MemoryItem['category']; key: string; value: string }) => Promise<void>;
  onDeleteMemory: (id: string) => void;
  onOpenChatHistory?: () => void;
}) {
  const [category, setCategory] = useState<MemoryItem['category']>('preference');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<MemoryItem['category']>('preference');
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !value.trim()) return;
    await onAddMemory({ category, key, value });
    setKey('');
    setValue('');
  };

  const startEditing = (item: MemoryItem) => {
    setEditingId(item.id);
    setEditCategory(item.category);
    setEditKey(item.key);
    setEditValue(item.value);
  };

  const saveEdit = async (id: string) => {
    if (!editKey.trim() || !editValue.trim()) return;
    await onEditMemory(id, {
      category: editCategory,
      key: editKey.trim(),
      value: editValue.trim(),
    });
    setEditingId(null);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100 flex items-center gap-2">
            <Bot className="w-5 h-5 text-cyan-400" aria-hidden="true" />
            <span>Personal AI Memory</span>
          </h2>
          <p className="text-sm text-slate-400">
            User-approved long-term context remembered by F.R.I.D.A.Y. Edit or delete entries at any time.
          </p>
        </div>

        {onOpenChatHistory && (
          <button
            type="button"
            onClick={onOpenChatHistory}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-900 border border-cyan-500/30 text-cyan-200 hover:border-cyan-400/60"
          >
            <History className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Open Searchable Chat History</span>
          </button>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-4 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 grid grid-cols-1 md:grid-cols-4 gap-3"
      >
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as MemoryItem['category'])}
          aria-label="Memory category"
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
        >
          <option value="preference">Preference</option>
          <option value="project">Project</option>
          <option value="profile">Profile</option>
          <option value="folder">Favorite Folder</option>
          <option value="workflow">Workflow</option>
        </select>
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Memory Label (e.g., Active Thesis)"
          aria-label="Memory label"
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Detail to remember..."
          aria-label="Memory detail"
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400"
        >
          Save Memory
        </button>
      </form>

      <div className="space-y-2.5">
        {memory.map((item) => (
          <div
            key={item.id}
            className="p-4 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 flex items-start justify-between gap-3"
          >
            {editingId === item.id ? (
              <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2">
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as MemoryItem['category'])}
                  aria-label="Edit memory category"
                  className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                >
                  <option value="preference">Preference</option>
                  <option value="project">Project</option>
                  <option value="profile">Profile</option>
                  <option value="folder">Favorite Folder</option>
                  <option value="workflow">Workflow</option>
                </select>
                <input
                  type="text"
                  value={editKey}
                  onChange={(e) => setEditKey(e.target.value)}
                  aria-label="Edit memory label"
                  className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                />
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  aria-label="Edit memory detail"
                  className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => saveEdit(item.id)}
                    aria-label="Save edited memory"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    aria-label="Cancel editing memory"
                    className="p-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="text-xs font-mono-tabular text-cyan-300 uppercase">{item.category}</div>
                  <div className="text-sm font-semibold text-slate-100 mt-0.5">{item.key}</div>
                  <div className="text-xs text-slate-300 mt-1">{item.value}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEditing(item)}
                    aria-label={`Edit memory "${item.key}"`}
                    className="p-2 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteMemory(item.id)}
                    aria-label={`Delete memory "${item.key}"`}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatHistoryView({
  messages,
  onClearHistory,
}: {
  messages: ChatMessage[];
  onClearHistory: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = messages.filter(
    (m) =>
      !search.trim() ||
      m.content.toLowerCase().includes(search.toLowerCase()) ||
      (m.intent ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100 flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" aria-hidden="true" />
            <span>Searchable Chat History</span>
          </h2>
          <p className="text-sm text-slate-400">{messages.length} persisted conversation turns</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search history..."
              aria-label="Search chat history"
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
            />
          </div>
          <button
            type="button"
            onClick={onClearHistory}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/15 text-rose-200 border border-rose-500/35 hover:bg-rose-500/25"
          >
            Clear History
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400">No matching conversation entries.</p>
        ) : (
          filtered.map((msg) => (
            <div
              key={msg.id}
              className="p-4 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-1.5"
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-cyan-300">
                  {msg.role === 'user' ? 'User' : 'F.R.I.D.A.Y.'}
                  {msg.intent ? ` · ${msg.intent}` : ''}
                </span>
                <span className="font-mono-tabular">
                  {new Date(msg.timestamp).toLocaleString()}
                </span>
              </div>
              <div className="text-sm text-slate-200 whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function SettingsView({
  settings,
  onUpdateSettings,
}: {
  settings: AssistantSettings;
  onUpdateSettings: (patch: Partial<AssistantSettings>) => void;
}) {
  const [newFolder, setNewFolder] = useState('');

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    onUpdateSettings({
      wallpaper: {
        ...settings.wallpaper,
        mode: 'custom-video',
        customVideoUrl: objectUrl,
      },
    });
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-slate-100 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-cyan-400" aria-hidden="true" />
            <span>System, Hologram, Wallpaper & Privacy Settings</span>
          </h2>
          <p className="text-sm text-slate-400">
            Customize live wallpapers, 3D hologram projection, AI model selection, folder permissions, and shortcuts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/api/settings/export"
            download="friday-settings-backup.json"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400/50"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            <span>Export Settings JSON</span>
          </a>
          {window.fridayDesktop?.quitApp && (
            <button
              type="button"
              onClick={() => window.fridayDesktop?.quitApp?.()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-rose-500/20 text-rose-200 border border-rose-500/40 hover:bg-rose-500/30"
            >
              <Power className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Quit F.R.I.D.A.Y.</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Wallpaper & Visual Customization */}
      <section className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          <span>Live Desktop Wallpaper</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {(
            [
              ['aurora-command', 'Aurora Command'],
              ['neural-particles', 'Neural Particles'],
              ['aurora-grid', 'Aurora Wave Grid'],
              ['neural-horizon', 'Neural Horizon'],
              ['orbital-grid', 'Orbital Grid'],
            ] as const
          ).map(([modeId, label]) => (
            <button
              key={modeId}
              type="button"
              onClick={() =>
                onUpdateSettings({
                  wallpaper: { ...settings.wallpaper, mode: modeId },
                })
              }
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                settings.wallpaper.mode === modeId
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-slate-900 border-slate-700 text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400/50 cursor-pointer">
            <span>Load Local Video Wallpaper (MP4 / WebM)</span>
            <input type="file" accept="video/mp4,video/webm" onChange={handleVideoUpload} className="hidden" />
          </label>

          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.wallpaper.performanceMode}
              onChange={(e) =>
                onUpdateSettings({
                  wallpaper: { ...settings.wallpaper, performanceMode: e.target.checked },
                })
              }
              className="accent-cyan-400"
            />
            <span>Performance-Friendly Mode (Low CPU/GPU)</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <label className="block space-y-1">
            <span className="text-slate-300">Blur ({settings.wallpaper.blurPx}px)</span>
            <input
              type="range"
              min="0"
              max="16"
              value={settings.wallpaper.blurPx}
              onChange={(e) =>
                onUpdateSettings({
                  wallpaper: { ...settings.wallpaper, blurPx: Number(e.target.value) },
                })
              }
              className="w-full accent-cyan-400"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-slate-300">Brightness ({settings.wallpaper.brightnessPercent}%)</span>
            <input
              type="range"
              min="30"
              max="120"
              value={settings.wallpaper.brightnessPercent}
              onChange={(e) =>
                onUpdateSettings({
                  wallpaper: { ...settings.wallpaper, brightnessPercent: Number(e.target.value) },
                })
              }
              className="w-full accent-cyan-400"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-slate-300">Opacity ({settings.wallpaper.opacityPercent}%)</span>
            <input
              type="range"
              min="25"
              max="100"
              value={settings.wallpaper.opacityPercent}
              onChange={(e) =>
                onUpdateSettings({
                  wallpaper: { ...settings.wallpaper, opacityPercent: Number(e.target.value) },
                })
              }
              className="w-full accent-cyan-400"
            />
          </label>
        </div>
      </section>

      {/* Hologram Projection Settings */}
      <section className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          <span>3D Hologram Projection Settings</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(
            [
              ['orbital', 'Orbital Core'],
              ['neural-matrix', 'Neural Matrix'],
              ['telemetry-sphere', 'Telemetry Sphere'],
              ['exploded', 'Exploded Projection'],
            ] as Array<[HologramMode, string]>
          ).map(([modeId, label]) => (
            <button
              key={modeId}
              type="button"
              onClick={() =>
                onUpdateSettings({
                  hologram: { ...settings.hologram, mode: modeId },
                })
              }
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                settings.hologram.mode === modeId
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                  : 'bg-slate-900 border-slate-700 text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <label className="block space-y-1">
            <span className="text-slate-300">
              Scanline Intensity ({Math.round(settings.hologram.scanlineIntensity * 100)}%)
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.hologram.scanlineIntensity}
              onChange={(e) =>
                onUpdateSettings({
                  hologram: { ...settings.hologram, scanlineIntensity: Number(e.target.value) },
                })
              }
              className="w-full accent-cyan-400"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-slate-300">
              Hologram Opacity ({Math.round(settings.hologram.holoOpacity * 100)}%)
            </span>
            <input
              type="range"
              min="0.3"
              max="1"
              step="0.05"
              value={settings.hologram.holoOpacity}
              onChange={(e) =>
                onUpdateSettings({
                  hologram: { ...settings.hologram, holoOpacity: Number(e.target.value) },
                })
              }
              className="w-full accent-cyan-400"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-slate-300">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.hologram.projectionBeam}
              onChange={(e) =>
                onUpdateSettings({
                  hologram: { ...settings.hologram, projectionBeam: e.target.checked },
                })
              }
              className="accent-cyan-400"
            />
            <span>Volumetric Emitter Beam</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.hologram.autoRotate}
              onChange={(e) =>
                onUpdateSettings({
                  hologram: { ...settings.hologram, autoRotate: e.target.checked },
                })
              }
              className="accent-cyan-400"
            />
            <span>Auto-Rotate Hologram Rings</span>
          </label>
        </div>
      </section>

      {/* AI Model, Profile, Weather & Desktop Behavior */}
      <section className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <label className="block space-y-1.5">
          <span className="text-slate-300 font-medium">User Name</span>
          <input
            type="text"
            value={settings.userName}
            onChange={(e) => onUpdateSettings({ userName: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-slate-300 font-medium">Weather Location</span>
          <input
            type="text"
            value={settings.weatherLocation}
            onChange={(e) => onUpdateSettings({ weatherLocation: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-slate-300 font-medium">Primary AI Engine</span>
          <select
            value={settings.aiModel}
            onChange={(e) =>
              onUpdateSettings({ aiModel: e.target.value as AssistantSettings['aiModel'] })
            }
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
          >
            <option value="local-auto">Local-First Auto (Ollama + Instant Local Core · Free)</option>
            <option value="ollama">Local Ollama LLM (Streaming)</option>
            <option value="local-core">Local Deterministic Core (Zero-Key Instant)</option>
            <option value="gemini-4-hydrogen">Gemini 4 Hydrogen (Optional Cloud Key)</option>
            <option value="gemini-4-neon">Gemini 4 Neon (Optional Cloud Key)</option>
            <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Optional Cloud Key)</option>
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-slate-300 font-medium">Local Ollama Model (Optional)</span>
          <input
            type="text"
            value={settings.ollamaModel || ''}
            onChange={(e) => onUpdateSettings({ ollamaModel: e.target.value })}
            placeholder="Auto-detect (e.g., llama3.2, qwen2.5, mistral)"
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-slate-300 font-medium">3D Animation Quality</span>
          <select
            value={settings.animationQuality}
            onChange={(e) =>
              onUpdateSettings({
                animationQuality: e.target.value as AssistantSettings['animationQuality'],
              })
            }
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
          >
            <option value="high">High (Full 3D Core & Particle Links)</option>
            <option value="balanced">Balanced</option>
            <option value="low">Low-Power Mode</option>
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-slate-300 font-medium">Reopen Desktop Shortcut</span>
          <input
            type="text"
            value={settings.reopenShortcut}
            onChange={(e) => onUpdateSettings({ reopenShortcut: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
          />
        </label>

        <div className="flex flex-col justify-end gap-2">
          <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoSpeakReplies}
              onChange={(e) => onUpdateSettings({ autoSpeakReplies: e.target.checked })}
              className="accent-cyan-400"
            />
            <span>Auto-Speak Assistant Replies Aloud</span>
          </label>
          <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.launchOnStartup}
              onChange={(e) => onUpdateSettings({ launchOnStartup: e.target.checked })}
              className="accent-cyan-400"
            />
            <span>Launch F.R.I.D.A.Y. on Windows Startup</span>
          </label>
          <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.startFullscreen}
              onChange={(e) => onUpdateSettings({ startFullscreen: e.target.checked })}
              className="accent-cyan-400"
            />
            <span>Start in Fullscreen Borderless Mode</span>
          </label>
        </div>
      </section>

      {/* Permitted Folders & Least-Privilege Security */}
      <section className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-3">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          <span>Authorized Local Folders (Least-Privilege Index)</span>
        </h3>
        <ul className="space-y-1.5 text-xs">
          {settings.allowedFolders.map((folder) => (
            <li
              key={folder}
              className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900 border border-slate-800"
            >
              <span className="font-mono-tabular text-slate-200 truncate">{folder}</span>
              {settings.allowedFolders.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({
                      allowedFolders: settings.allowedFolders.filter((f) => f !== folder),
                    })
                  }
                  className="text-rose-300 hover:text-rose-200 text-xs"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newFolder.trim()) return;
            if (!settings.allowedFolders.includes(newFolder.trim())) {
              onUpdateSettings({ allowedFolders: [...settings.allowedFolders, newFolder.trim()] });
            }
            setNewFolder('');
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            placeholder="Add permitted folder path..."
            aria-label="Add permitted folder path"
            className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400"
          >
            Grant Folder Access
          </button>
        </form>
      </section>
    </div>
  );
}
