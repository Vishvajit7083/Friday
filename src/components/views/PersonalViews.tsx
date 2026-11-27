import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  Circle,
  CloudSun,
  Database,
  Download,
  FolderOpen,
  History,
  Image as ImageIcon,
  Layers,
  MapPin,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  ApiConnectionStatus,
  AssistantSettings,
  CalendarEvent,
  ChatMessage,
  HologramMode,
  MemoryItem,
  NoteItem,
  TodoItem,
} from '../../core/types';

export function CalendarView({
  events,
  notes = [],
  todos = [],
  onCreateEvent,
  onToggleEvent,
  onUpdateEvent,
  onDeleteEvent,
  onAddNote,
  onDeleteNote,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
}: {
  events: CalendarEvent[];
  notes?: NoteItem[];
  todos?: TodoItem[];
  onCreateEvent: (evt: {
    title: string;
    date: string;
    time: string;
    category: CalendarEvent['category'];
  }) => Promise<void>;
  onToggleEvent: (id: string) => void;
  onUpdateEvent?: (id: string, patch: Partial<CalendarEvent>) => Promise<void> | void;
  onDeleteEvent: (id: string) => void;
  onAddNote?: (note: { title: string; content: string }) => void;
  onDeleteNote?: (id: string) => void;
  onAddTodo?: (title: string) => void;
  onToggleTodo?: (id: string) => void;
  onDeleteTodo?: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('15:00');
  const [category, setCategory] = useState<CalendarEvent['category']>('meeting');
  const [formError, setFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editCategory, setEditCategory] = useState<CalendarEvent['category']>('meeting');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [todoTitle, setTodoTitle] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Enter an event or task title first.');
      return;
    }
    setFormError(null);
    await onCreateEvent({ title: title.trim(), date, time, category });
    setTitle('');
  };

  const filteredEvents = events.filter((evt) => {
    const matchText =
      !searchQuery.trim() ||
      evt.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      evt.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchDate = !dateFilter || evt.date === dateFilter;
    return matchText && matchDate;
  });

  const handleGenerateBriefing = async () => {
    setLoadingBriefing(true);
    try {
      const res = await fetch('/api/calendar/briefing', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate daily briefing');
      setBriefing(data.briefing);
    } catch {
      const upcoming = events.filter((e) => !e.completed).slice(0, 5);
      const openTodos = todos.filter((t) => !t.completed).slice(0, 5);
      setBriefing(
        `Offline Daily Briefing (${new Date().toLocaleDateString()}):\n` +
          `• Pending Calendar Items: ${upcoming.length}\n` +
          (upcoming.map((e) => `  - ${e.date} ${e.time}: ${e.title}`).join('\n') || '  - None') +
          `\n• Open To-Do Tasks: ${openTodos.length}\n` +
          (openTodos.map((t) => `  - ${t.title}`).join('\n') || '  - None')
      );
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
        className="p-4 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-2"
      >
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (formError) setFormError(null);
            }}
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
        </div>
        {formError && <p className="text-xs text-rose-300">{formError}</p>}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter calendar events..."
            aria-label="Filter calendar events"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
          />
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          aria-label="Filter by date"
          className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
        />
        {(searchQuery || dateFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setDateFilter('');
            }}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300"
          >
            Clear Filter
          </button>
        )}
      </div>

      <div className="space-y-2">
        {filteredEvents.length === 0 ? (
          <p className="text-sm text-slate-400">No events match your view.</p>
        ) : (
          filteredEvents.map((evt) => (
            <div
              key={evt.id}
              className="p-3.5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 flex items-center justify-between gap-3"
            >
              {editingId === evt.id ? (
                <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-2">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    aria-label="Edit event title"
                    className="md:col-span-2 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                  />
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    aria-label="Edit event date"
                    className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                  />
                  <input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    aria-label="Edit event time"
                    className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                  />
                  <div className="flex items-center gap-1.5">
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as CalendarEvent['category'])}
                      aria-label="Edit event category"
                      className="flex-1 px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100"
                    >
                      <option value="meeting">Meeting</option>
                      <option value="task">Task</option>
                      <option value="reminder">Reminder</option>
                      <option value="focus">Focus</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (editTitle.trim()) {
                          void onUpdateEvent?.(evt.id, {
                            title: editTitle.trim(),
                            date: editDate,
                            time: editTime,
                            category: editCategory,
                          });
                        }
                        setEditingId(null);
                      }}
                      aria-label={`Save event "${evt.title}"`}
                      className="p-1.5 rounded bg-cyan-500 text-slate-950"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      aria-label="Cancel event edit"
                      className="p-1.5 rounded bg-slate-800 text-slate-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
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
                  <div className="flex items-center gap-1 shrink-0">
                    {onUpdateEvent && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(evt.id);
                          setEditTitle(evt.title);
                          setEditDate(evt.date);
                          setEditTime(evt.time);
                          setEditCategory(evt.category);
                        }}
                        aria-label={`Edit event "${evt.title}"`}
                        className="p-2 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-slate-800"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {confirmDeleteId === evt.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteEvent(evt.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1 rounded text-[11px] font-semibold bg-rose-500/25 border border-rose-400/50 text-rose-100"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 rounded text-[11px] bg-slate-800 text-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(evt.id)}
                        aria-label={`Delete event "${evt.title}"`}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Quick To-Do Checklist & Offline Notes */}
      {(onAddTodo || onAddNote) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
          {onAddTodo && (
            <section className="p-4 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-3">
              <h3 className="text-sm font-semibold text-slate-200">
                To-Do Checklist ({todos.filter((t) => !t.completed).length} Open)
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!todoTitle.trim()) return;
                  onAddTodo(todoTitle.trim());
                  setTodoTitle('');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={todoTitle}
                  onChange={(e) => setTodoTitle(e.target.value)}
                  placeholder="Add To-Do task..."
                  aria-label="New To-Do task"
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add Task</span>
                </button>
              </form>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {todos.length === 0 ? (
                  <p className="text-xs text-slate-400">No tasks in checklist.</p>
                ) : (
                  todos.map((todo) => (
                    <div
                      key={todo.id}
                      className="px-3 py-2 rounded-lg bg-slate-900/75 border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleTodo?.(todo.id)}
                        className="flex items-center gap-2 text-left min-w-0 flex-1"
                      >
                        {todo.completed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        )}
                        <span
                          className={`text-xs truncate ${
                            todo.completed ? 'line-through text-slate-500' : 'text-slate-100'
                          }`}
                        >
                          {todo.title}
                        </span>
                      </button>
                      {onDeleteTodo && (
                        <button
                          type="button"
                          onClick={() => onDeleteTodo(todo.id)}
                          aria-label={`Delete task "${todo.title}"`}
                          className="p-1 text-slate-400 hover:text-rose-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {onAddNote && (
            <section className="p-4 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-3">
              <h3 className="text-sm font-semibold text-slate-200">
                Quick Notes ({notes.length})
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!noteContent.trim() && !noteTitle.trim()) return;
                  onAddNote({
                    title: noteTitle.trim() || noteContent.trim().slice(0, 40),
                    content: noteContent.trim() || noteTitle.trim(),
                  });
                  setNoteTitle('');
                  setNoteContent('');
                }}
                className="space-y-2"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Note title..."
                    aria-label="New note title"
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
                  onChange={(e) => setNoteContent(e.target.value)}
                  rows={2}
                  placeholder="Write note details..."
                  aria-label="New note content"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
                />
              </form>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {notes.length === 0 ? (
                  <p className="text-xs text-slate-400">No notes saved yet.</p>
                ) : (
                  notes.map((n) => (
                    <div
                      key={n.id}
                      className="p-2.5 rounded-lg bg-slate-900/75 border border-slate-800 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-100 truncate">{n.title}</div>
                        <div className="text-[11px] text-slate-300 whitespace-pre-wrap">{n.content}</div>
                      </div>
                      {onDeleteNote && (
                        <button
                          type="button"
                          onClick={() => onDeleteNote(n.id)}
                          aria-label={`Delete note "${n.title}"`}
                          className="p-1 text-slate-400 hover:text-rose-300 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </div>
      )}
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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | MemoryItem['category']>('all');
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<MemoryItem['category']>('preference');
  const [editKey, setEditKey] = useState('');
  const [editValue, setEditValue] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !value.trim()) {
      setFormError('Enter both a memory label and detail.');
      return;
    }
    setFormError(null);
    await onAddMemory({ category, key: key.trim(), value: value.trim() });
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

  const filteredMemory = memory.filter((item) => {
    const matchCat = filterCategory === 'all' || item.category === filterCategory;
    const matchText =
      !searchQuery.trim() ||
      item.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.value.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchText;
  });

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
        className="p-4 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-2"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
            onChange={(e) => {
              setKey(e.target.value);
              if (formError) setFormError(null);
            }}
            placeholder="Memory Label (e.g., Active Thesis)"
            aria-label="Memory label"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (formError) setFormError(null);
            }}
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
        </div>
        {formError && <p className="text-xs text-rose-300">{formError}</p>}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search saved memories..."
            aria-label="Search saved memories"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as 'all' | MemoryItem['category'])}
          aria-label="Filter memories by category"
          className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
        >
          <option value="all">All Categories</option>
          <option value="preference">Preference</option>
          <option value="project">Project</option>
          <option value="profile">Profile</option>
          <option value="folder">Favorite Folder</option>
          <option value="workflow">Workflow</option>
        </select>
      </div>

      <div className="space-y-2.5">
        {filteredMemory.length === 0 ? (
          <p className="text-sm text-slate-400">No memory entries match your filter.</p>
        ) : (
          filteredMemory.map((item) => (
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
                    {confirmDeleteId === item.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteMemory(item.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1 rounded text-[11px] font-semibold bg-rose-500/25 border border-rose-400/50 text-rose-100"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 rounded text-[11px] bg-slate-800 text-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(item.id)}
                        aria-label={`Delete memory "${item.key}"`}
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-slate-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* 6-Layer SQLite Cognitive Memory Inspector */}
      <CognitiveMemoryInspector />
    </div>
  );
}

interface CognitiveMemoryRow {
  id: string;
  layer: 'working' | 'short_term' | 'long_term' | 'episodic' | 'semantic' | 'procedural';
  category: string;
  key: string;
  value: string;
  importance: number;
  confidence: number;
  source: string;
  accessCount: number;
  updatedAt: string;
}

function CognitiveMemoryInspector() {
  const layers: Array<'all' | CognitiveMemoryRow['layer']> = [
    'all',
    'working',
    'short_term',
    'long_term',
    'episodic',
    'semantic',
    'procedural',
  ];
  const [selectedLayer, setSelectedLayer] = useState<'all' | CognitiveMemoryRow['layer']>('all');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CognitiveMemoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [newLayer, setNewLayer] = useState<CognitiveMemoryRow['layer']>('long_term');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const fetchCognitiveMemories = async (layer = selectedLayer, q = query) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (layer !== 'all') params.set('layer', layer);
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/cognitive/memory?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRows(Array.isArray(data.memories) ? data.memories : []);
      }
    } catch {
      // Standalone client fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCognitiveMemories(selectedLayer, query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLayer]);

  const handleAddCognitiveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    const res = await fetch('/api/cognitive/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        layer: newLayer,
        category: 'user',
        key: newKey.trim(),
        value: newValue.trim(),
      }),
    });
    if (res.ok) {
      setNewKey('');
      setNewValue('');
      setNotice('Saved to 6-Layer SQLite Cognitive Memory.');
      await fetchCognitiveMemories();
    }
  };

  const handleDeleteRow = async (id: string) => {
    const res = await fetch(`/api/cognitive/memory/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch('/api/cognitive/memory/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (res.ok) {
        const data = await res.json();
        setNotice(`Imported ${data.imported ?? 0} cognitive memory record(s).`);
        await fetchCognitiveMemories();
      }
    } catch {
      setNotice('Invalid cognitive memory JSON file.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <section className="p-5 rounded-xl border border-cyan-500/20 bg-[#070c1a]/90 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>6-Layer SQLite Cognitive Memory ({rows.length})</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Working, Short-Term, Long-Term, Episodic, Semantic, and Procedural memory persisted locally in SQLite.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/cognitive/memory/export"
            download="friday-cognitive-memory.json"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400/50"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            <span>Export JSON</span>
          </a>
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400/50 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
            <span>Import JSON</span>
            <input type="file" accept="application/json" onChange={handleImportJson} className="hidden" />
          </label>
          <button
            type="button"
            onClick={() => void fetchCognitiveMemories()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-700 text-cyan-200 hover:border-cyan-400/50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {notice && <p className="text-xs text-cyan-300">{notice}</p>}

      <div className="flex flex-wrap gap-1.5">
        {layers.map((layer) => (
          <button
            key={layer}
            type="button"
            onClick={() => setSelectedLayer(layer)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border capitalize transition-colors ${
              selectedLayer === layer
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {layer.replace('_', ' ')}
          </button>
        ))}
      </div>

      <form onSubmit={handleAddCognitiveMemory} className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <select
          value={newLayer}
          onChange={(e) => setNewLayer(e.target.value as CognitiveMemoryRow['layer'])}
          aria-label="Cognitive memory layer"
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
        >
          <option value="working">Working</option>
          <option value="short_term">Short-Term</option>
          <option value="long_term">Long-Term</option>
          <option value="episodic">Episodic</option>
          <option value="semantic">Semantic</option>
          <option value="procedural">Procedural</option>
        </select>
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="Concept / Key..."
          aria-label="Cognitive memory key"
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
        />
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="Fact, context, or habit..."
          aria-label="Cognitive memory value"
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
        />
        <button
          type="submit"
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400"
        >
          Add Cognitive Entry
        </button>
      </form>

      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 6-layer cognitive memory..."
          aria-label="Search cognitive memory"
          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100"
        />
        <button
          type="button"
          onClick={() => void fetchCognitiveMemories(selectedLayer, query)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-200 hover:border-cyan-400/50"
        >
          Search
        </button>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <p className="text-xs text-slate-400">No entries in this cognitive memory layer yet.</p>
        ) : (
          rows.slice(0, 40).map((row) => (
            <div
              key={row.id}
              className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 flex items-start justify-between gap-3 text-xs"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono-tabular text-[11px] uppercase text-cyan-300">
                    {row.layer.replace('_', ' ')}
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-400">{row.source}</span>
                  <span className="text-slate-500">·</span>
                  <span className="font-mono-tabular text-slate-400">
                    imp {Math.round(row.importance * 100)}%
                  </span>
                </div>
                <div className="font-semibold text-slate-100 mt-0.5 truncate">{row.key}</div>
                <div className="text-slate-300 mt-0.5 whitespace-pre-wrap">{row.value}</div>
              </div>
              <button
                type="button"
                onClick={() => void handleDeleteRow(row.id)}
                aria-label={`Delete cognitive memory ${row.key}`}
                className="p-1.5 rounded text-slate-400 hover:text-rose-300 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function ChatHistoryView({
  messages,
  onDeleteMessage,
  onClearHistory,
}: {
  messages: ChatMessage[];
  onDeleteMessage?: (id: string) => void;
  onClearHistory: () => void;
}) {
  const [search, setSearch] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
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
          {confirmClear ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onClearHistory();
                  setConfirmClear(false);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/25 text-rose-100 border border-rose-400/50"
              >
                Confirm Clear All
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-2.5 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-300 border border-slate-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/15 text-rose-200 border border-rose-500/35 hover:bg-rose-500/25"
            >
              Clear History
            </button>
          )}
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
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                <span className="font-semibold text-cyan-300">
                  {msg.role === 'user' ? 'User' : 'F.R.I.D.A.Y.'}
                  {msg.intent ? ` · ${msg.intent}` : ''}
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono-tabular">
                    {new Date(msg.timestamp).toLocaleString()}
                  </span>
                  {onDeleteMessage && (
                    <button
                      type="button"
                      onClick={() => onDeleteMessage(msg.id)}
                      aria-label={`Delete message ${msg.id}`}
                      className="p-1 rounded text-slate-400 hover:text-rose-300 hover:bg-slate-800"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
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
  apiStatus,
  onUpdateSettings,
  onCheckApiConnection,
}: {
  settings: AssistantSettings;
  apiStatus?: ApiConnectionStatus;
  onUpdateSettings: (patch: Partial<AssistantSettings>) => void;
  onCheckApiConnection?: () => void;
}) {
  const [newFolder, setNewFolder] = useState('');
  const [folderFeedback, setFolderFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [newFavoriteCity, setNewFavoriteCity] = useState('');
  const [userNameDraft, setUserNameDraft] = useState(settings.userName);
  const [weatherLocationDraft, setWeatherLocationDraft] = useState(settings.weatherLocation);
  const [reopenShortcutDraft, setReopenShortcutDraft] = useState(settings.reopenShortcut);
  const debounceTimersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    setUserNameDraft(settings.userName);
  }, [settings.userName]);

  useEffect(() => {
    setWeatherLocationDraft(settings.weatherLocation);
  }, [settings.weatherLocation]);

  useEffect(() => {
    setReopenShortcutDraft(settings.reopenShortcut);
  }, [settings.reopenShortcut]);

  useEffect(() => {
    return () => {
      Object.values(debounceTimersRef.current).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const scheduleDebouncedUpdate = (key: string, patch: Partial<AssistantSettings>) => {
    if (debounceTimersRef.current[key]) {
      window.clearTimeout(debounceTimersRef.current[key]);
    }
    debounceTimersRef.current[key] = window.setTimeout(() => {
      delete debounceTimersRef.current[key];
      onUpdateSettings(patch);
    }, 350);
  };

  const flushDebouncedUpdate = (key: string, patch: Partial<AssistantSettings>) => {
    if (debounceTimersRef.current[key]) {
      window.clearTimeout(debounceTimersRef.current[key]);
      delete debounceTimersRef.current[key];
    }
    onUpdateSettings(patch);
  };

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
            value={userNameDraft}
            onChange={(e) => {
              const v = e.target.value;
              setUserNameDraft(v);
              scheduleDebouncedUpdate('userName', { userName: v });
            }}
            onBlur={() => flushDebouncedUpdate('userName', { userName: userNameDraft })}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-slate-300 font-medium">Default Weather Location</span>
          <input
            type="text"
            value={weatherLocationDraft}
            onChange={(e) => {
              const v = e.target.value;
              setWeatherLocationDraft(v);
              scheduleDebouncedUpdate('weatherLocation', { weatherLocation: v });
            }}
            onBlur={() =>
              flushDebouncedUpdate('weatherLocation', { weatherLocation: weatherLocationDraft })
            }
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
            <option value="friday-cognitive">F.R.I.D.A.Y. Cognitive Engine (Self-Owned Offline-First)</option>
            <option value="openjarvis-local-core">OpenJarvis Multi-Agent Local Core (Zero Download)</option>
            <option value="openjarvis-gguf">OpenJarvis GGUF / llama.cpp (Local Engine)</option>
            <option value="friday-language-core">F.R.I.D.A.Y. Language Core Adapter (Future Self-Trained Model)</option>
            <option value="local-auto">Auto Cognitive + Live Public Web Research</option>
            <option value="local-core">Deterministic Fast Local Core</option>
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-slate-300 font-medium">Response Language &amp; Style</span>
          <select
            value={settings.responseLanguagePreference || 'auto'}
            onChange={(e) =>
              onUpdateSettings({
                responseLanguagePreference: e.target.value as AssistantSettings['responseLanguagePreference'],
              })
            }
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
          >
            <option value="auto">Auto (Match User Language: English / Hinglish / Hindi)</option>
            <option value="hinglish">Hinglish Conversational</option>
            <option value="hindi_simple">Simple Hindi (Romanized)</option>
            <option value="english">English</option>
          </select>
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
            value={reopenShortcutDraft}
            onChange={(e) => {
              const v = e.target.value;
              setReopenShortcutDraft(v);
              scheduleDebouncedUpdate('reopenShortcut', { reopenShortcut: v });
            }}
            onBlur={() =>
              flushDebouncedUpdate('reopenShortcut', { reopenShortcut: reopenShortcutDraft })
            }
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
          />
        </label>

        <div className="flex flex-col justify-end gap-2 md:col-span-2">
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
              checked={settings.optInDatasetCollection ?? false}
              onChange={(e) => onUpdateSettings({ optInDatasetCollection: e.target.checked })}
              className="accent-cyan-400"
            />
            <span>Opt-In: Collect Sanitized Local Interaction Pairs for Future Language Core Training</span>
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
          <div className="pt-1">
            <a
              href="/api/cognitive/learning/dataset.jsonl"
              download="friday-training-dataset.jsonl"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-cyan-200 hover:border-cyan-400/50"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
              <span>Export Local Training Dataset (.JSONL · {apiStatus?.cognitiveStats?.datasetSamples ?? 0} samples)</span>
            </a>
          </div>
        </div>
      </section>

      {/* Weather Preferences */}
      <section className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <CloudSun className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>Weather Preferences &amp; Saved Locations</span>
          </h3>
          <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
            <button
              type="button"
              onClick={() => onUpdateSettings({ temperatureUnit: 'celsius' })}
              className={`px-3 py-1 font-medium ${
                (settings.temperatureUnit || 'celsius') === 'celsius'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-slate-900 text-slate-300'
              }`}
            >
              °C Celsius
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ temperatureUnit: 'fahrenheit' })}
              className={`px-3 py-1 font-medium ${
                settings.temperatureUnit === 'fahrenheit'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-slate-900 text-slate-300'
              }`}
            >
              °F Fahrenheit
            </button>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.weatherNotificationsEnabled ?? true}
            onChange={(e) => onUpdateSettings({ weatherNotificationsEnabled: e.target.checked })}
            className="accent-cyan-400"
          />
          <span>Notify inside activity feed when active severe weather advisories appear</span>
        </label>

        <div className="space-y-2">
          <div className="text-slate-300 font-medium">Favorite Cities</div>
          <div className="flex flex-wrap gap-2">
            {(settings.favoriteWeatherLocations ?? []).length === 0 ? (
              <span className="text-slate-400">No favorite cities added yet.</span>
            ) : (
              (settings.favoriteWeatherLocations ?? []).map((city) => (
                <span
                  key={city}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200"
                >
                  <MapPin className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                  <span>{city}</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        favoriteWeatherLocations: (settings.favoriteWeatherLocations ?? []).filter(
                          (f) => f !== city
                        ),
                      })
                    }
                    aria-label={`Remove favorite city ${city}`}
                    className="text-slate-400 hover:text-rose-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = newFavoriteCity.trim();
              if (!clean) return;
              const existing = settings.favoriteWeatherLocations ?? [];
              if (!existing.some((c) => c.toLowerCase() === clean.toLowerCase())) {
                onUpdateSettings({ favoriteWeatherLocations: [...existing, clean].slice(0, 8) });
              }
              setNewFavoriteCity('');
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={newFavoriteCity}
              onChange={(e) => setNewFavoriteCity(e.target.value)}
              placeholder="Add favorite city (e.g., Tokyo, London, Mumbai)..."
              aria-label="Add favorite weather city"
              className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400"
            >
              Add City
            </button>
          </form>
        </div>
      </section>

      {/* Read-Only Cognitive Brain & Connectivity Status */}
      <section className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400" aria-hidden="true" />
              <span>F.R.I.D.A.Y. Cognitive Brain &amp; Connectivity Status (Read-Only)</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Self-owned 15-module cognitive architecture running locally in SQLite with zero external AI APIs or mandatory keys.
            </p>
          </div>
          {onCheckApiConnection && (
            <button
              type="button"
              onClick={onCheckApiConnection}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-cyan-200 hover:border-cyan-400/50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${apiStatus?.checking ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>Re-Check Status</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
            <div className="text-slate-400">Cognitive Engine</div>
            <div className="font-semibold text-emerald-300">Active · Zero External APIs</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
            <div className="text-slate-400">Web Research &amp; Weather</div>
            <div className={`font-semibold ${apiStatus?.freeWebReady === false ? 'text-amber-300' : 'text-emerald-300'}`}>
              {apiStatus?.freeWebReady === false ? 'Offline Mode' : 'Active (Free Public Web)'}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
            <div className="text-slate-400">6-Layer SQLite Memory</div>
            <div className="font-semibold text-cyan-300">
              {apiStatus?.cognitiveStats?.memoryCount ?? 0} memories · {apiStatus?.cognitiveStats?.knowledgeChunks ?? 0} chunks
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 space-y-1">
            <div className="text-slate-400">Language Core Adapter</div>
            <div className={`font-semibold ${apiStatus?.cognitiveStats?.languageCoreReady ? 'text-emerald-300' : 'text-slate-300'}`}>
              {apiStatus?.cognitiveStats?.languageCoreReady ? 'Checkpoint Loaded' : 'Scaffold Ready (L6 Trainer)'}
            </div>
          </div>
        </div>
      </section>

      {/* OpenJarvis 5-Primitive & 9-Agent Architecture */}
      <section className="p-5 rounded-xl border border-purple-500/20 bg-[#090415]/90 space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-purple-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-fuchsia-400" aria-hidden="true" />
              <span>OpenJarvis Local-First Multi-Agent Architecture</span>
            </h3>
            <p className="text-[11px] text-purple-300/80 mt-0.5">
              5 Core Primitives (Intelligence · Engine · Agents · Tools &amp; Memory · Learning) with 9 Autonomous Agents.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 border border-emerald-400/40 text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            9 Agents Active
          </span>
        </div>

        {/* Hardware & Inference Profile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-800/40 space-y-1">
            <div className="text-purple-300/70">Hardware Detection</div>
            <div className="font-semibold text-white truncate">
              {apiStatus?.openJarvis?.hardwareProfile?.cpuModel || 'Multi-Core CPU'}
            </div>
            <div className="text-[10px] text-purple-300/60">
              {apiStatus?.openJarvis?.hardwareProfile?.logicalCores || 4} Cores · AVX2 {apiStatus?.openJarvis?.hardwareProfile?.hasAvx2 ? 'Supported' : 'Standard'}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-800/40 space-y-1">
            <div className="text-purple-300/70">Memory &amp; GPU</div>
            <div className="font-semibold text-white">
              {apiStatus?.openJarvis?.hardwareProfile?.totalRamMb ? `${Math.round(apiStatus.openJarvis.hardwareProfile.totalRamMb / 1024)} GB RAM` : 'System RAM'}
            </div>
            <div className="text-[10px] text-purple-300/60 truncate">
              {apiStatus?.openJarvis?.hardwareProfile?.gpuName || 'DirectX Acceleration'}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-800/40 space-y-1">
            <div className="text-purple-300/70">Active Inference Layer</div>
            <div className="font-semibold text-emerald-300">
              Built-in Fast LocalCore
            </div>
            <div className="text-[10px] text-purple-300/60">
              0 MB Download · Zero API Keys
            </div>
          </div>

          <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-800/40 space-y-1">
            <div className="text-purple-300/70">Autonomous Coding &amp; DAG</div>
            <div className="font-semibold text-fuchsia-300">
              Coding Agent Ready
            </div>
            <div className="text-[10px] text-purple-300/60">
              Scaffold, Verify &amp; VS Code Launch
            </div>
          </div>
        </div>

        {/* 9 Specialized Agents Grid */}
        <div className="space-y-1.5 pt-1">
          <div className="text-[11px] font-semibold text-purple-200 uppercase tracking-wider">
            Specialized OpenJarvis Agents
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {[
              { id: 'core', name: 'Core Agent', role: 'Decomposition & Gating' },
              { id: 'computer', name: 'Computer Agent', role: 'Windows Apps & Media' },
              { id: 'file', name: 'File Agent', role: 'Index & Explorer Reveal' },
              { id: 'coding', name: 'Coding Agent', role: 'Autonomous Projects & Tests' },
              { id: 'browser', name: 'Browser Agent', role: 'Live Search & YouTube' },
              { id: 'voice', name: 'Voice Agent', role: 'Hinglish NLP & Barge-In' },
              { id: 'system', name: 'System Agent', role: 'Telemetry & Processes' },
              { id: 'memory', name: 'Memory Agent', role: '6-Layer SQLite Facts' },
              { id: 'workflow', name: 'Workflow Agent', role: 'Multi-Step DAG & Retries' },
            ].map((ag) => (
              <div
                key={ag.id}
                className="p-2.5 rounded-lg bg-[#110624] border border-purple-800/30 flex flex-col justify-between gap-1"
              >
                <div className="font-medium text-white flex items-center justify-between">
                  <span>{ag.name}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                </div>
                <div className="text-[10px] text-purple-300/70 leading-tight">{ag.role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Permitted Folders & Least-Privilege Security */}
      <section className="p-5 rounded-xl border border-cyan-500/15 bg-[#070c1a]/90 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            <span>Authorized Local Folders (Least-Privilege Index)</span>
          </h3>
          {window.fridayDesktop?.selectFolder && (
            <button
              type="button"
              disabled={folderBusy}
              onClick={async () => {
                setFolderFeedback(null);
                const pick = await window.fridayDesktop?.selectFolder?.();
                if (!pick || pick.canceled || !pick.folderPath) {
                  if (pick?.error) setFolderFeedback({ ok: false, text: pick.error });
                  return;
                }
                setFolderBusy(true);
                try {
                  const res = await fetch('/api/files/folders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ folderPath: pick.folderPath }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || 'Unable to authorize folder.');
                  if (Array.isArray(data.allowedFolders)) {
                    onUpdateSettings({ allowedFolders: data.allowedFolders });
                  }
                  setFolderFeedback({
                    ok: true,
                    text: data.added
                      ? `Authorized folder: ${data.folder}`
                      : `Folder already authorized: ${data.folder}`,
                  });
                } catch (err) {
                  setFolderFeedback({ ok: false, text: (err as Error).message });
                } finally {
                  setFolderBusy(false);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 text-cyan-200 hover:border-cyan-400/50 disabled:opacity-50"
            >
              <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Select Folder...</span>
            </button>
          )}
        </div>

        <ul className="space-y-1.5 text-xs">
          {settings.allowedFolders.length === 0 ? (
            <li className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-amber-300">
              No local folders authorized yet. Grant access below to allow file search and previews.
            </li>
          ) : (
            settings.allowedFolders.map((folder) => (
              <li
                key={folder}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800"
              >
                <span className="font-mono-tabular text-slate-200 truncate">{folder}</span>
                <button
                  type="button"
                  disabled={folderBusy}
                  onClick={async () => {
                    setFolderBusy(true);
                    setFolderFeedback(null);
                    try {
                      const res = await fetch('/api/files/folders', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ folderPath: folder }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Failed to revoke folder access.');
                      if (Array.isArray(data.allowedFolders)) {
                        onUpdateSettings({ allowedFolders: data.allowedFolders });
                      }
                      setFolderFeedback({ ok: true, text: `Revoked folder access: ${folder}` });
                    } catch (err) {
                      setFolderFeedback({ ok: false, text: (err as Error).message });
                    } finally {
                      setFolderBusy(false);
                    }
                  }}
                  className="text-rose-300 hover:text-rose-200 text-xs shrink-0 disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))
          )}
        </ul>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const candidate = newFolder.trim();
            if (!candidate) return;
            setFolderBusy(true);
            setFolderFeedback(null);
            try {
              const res = await fetch('/api/files/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderPath: candidate }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Selected folder is invalid or inaccessible.');
              if (Array.isArray(data.allowedFolders)) {
                onUpdateSettings({ allowedFolders: data.allowedFolders });
              }
              setNewFolder('');
              setFolderFeedback({
                ok: true,
                text: data.added
                  ? `Authorized folder: ${data.folder}`
                  : `Folder already authorized: ${data.folder}`,
              });
            } catch (err) {
              setFolderFeedback({ ok: false, text: (err as Error).message });
            } finally {
              setFolderBusy(false);
            }
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
            disabled={folderBusy || !newFolder.trim()}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            {folderBusy ? 'Validating...' : 'Grant Folder Access'}
          </button>
        </form>
        {folderFeedback && (
          <p className={`text-xs ${folderFeedback.ok ? 'text-cyan-300' : 'text-rose-300'}`}>
            {folderFeedback.text}
          </p>
        )}
      </section>
    </div>
  );
}
