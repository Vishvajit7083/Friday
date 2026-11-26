import fs from 'fs';
import path from 'path';
import type {
  ActionLogEntry,
  AssistantSettings,
  AutomationWorkflow,
  CalendarEvent,
  ChatMessage,
  DesktopAppItem,
  MemoryItem,
  NoteItem,
  TodoItem,
} from '../src/core/types.ts';
import { getDefaultPermittedFolders } from './fileService.ts';
import {
  getAppCollection,
  getCognitiveSqlite,
  setAppCollection,
} from './cognitiveDb.ts';

export interface FridayDatabase {
  settings: AssistantSettings;
  calendar: CalendarEvent[];
  memory: MemoryItem[];
  notes: NoteItem[];
  todos: TodoItem[];
  chatHistory: ChatMessage[];
  actionLogs: ActionLogEntry[];
  workflows: AutomationWorkflow[];
  apps: DesktopAppItem[];
}

function getDataDir(): string {
  return process.env.FRIDAY_DATA_DIR
    ? path.resolve(process.env.FRIDAY_DATA_DIR)
    : path.resolve(process.cwd(), '.friday-data');
}

function getLegacyJsonPath(): string {
  return path.join(getDataDir(), 'friday-db.json');
}

function getTodayIsoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const DEFAULT_DB: FridayDatabase = {
  settings: {
    assistantName: 'F.R.I.D.A.Y.',
    userName: 'Siddesh',
    wakeWord: 'Hey Friday',
    aiModel: 'friday-cognitive',
    ollamaModel: '',
    responseLanguagePreference: 'auto',
    optInDatasetCollection: false,
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
    allowedFolders: getDefaultPermittedFolders(),
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
      scanlineIntensity: 0.65,
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
  },
  calendar: [
    {
      id: 'evt-1',
      title: 'F.R.I.D.A.Y. Architecture & Telemetry Review',
      date: getTodayIsoDate(0),
      time: '10:30',
      category: 'meeting',
      completed: false,
      notes: 'Inspect multi-agent execution graph and Cognitive Engine latency metrics.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'evt-2',
      title: 'Index Project Documents & Verify File Permissions',
      date: getTodayIsoDate(0),
      time: '14:00',
      category: 'task',
      completed: false,
      notes: 'Ensure only explicitly permitted directories are indexed.',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'evt-3',
      title: 'Deep Focus: Edge AI & Embedded Prototype',
      date: getTodayIsoDate(1),
      time: '09:00',
      category: 'focus',
      completed: false,
      notes: 'Review Raspberry Pi hardware benchmarks.',
      createdAt: new Date().toISOString(),
    },
  ],
  memory: [
    {
      id: 'mem-1',
      category: 'profile',
      key: 'Preferred Assistant Persona',
      value: 'Concise, proactive, technical & Hinglish clarity without unnecessary filler.',
      approved: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'mem-2',
      category: 'project',
      key: 'Primary Engineering Workspace',
      value: 'F.R.I.D.A.Y. Autonomous Cognitive Engine & Desktop Command Center',
      approved: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'mem-3',
      category: 'workflow',
      key: 'Privacy Guardrail',
      value: 'Always confirm before deleting files, modifying schedules, or organizing directories.',
      approved: true,
      updatedAt: new Date().toISOString(),
    },
  ],
  notes: [
    {
      id: 'note-1',
      title: 'Workspace Quick Guide',
      content: 'Ask F.R.I.D.A.Y. "take a note: ..." or create notes here to persist across desktop sessions.',
      pinned: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  todos: [
    {
      id: 'todo-1',
      title: 'Review daily schedule and permitted workspace folders',
      completed: false,
      priority: 'normal',
      dueDate: getTodayIsoDate(0),
      createdAt: new Date().toISOString(),
    },
  ],
  chatHistory: [
    {
      id: 'msg-welcome',
      role: 'assistant',
      content:
        'F.R.I.D.A.Y. Cognitive Engine initialized offline-first. Speak or type in English, Hindi, or Hinglish to control local apps, search permitted files, inspect telemetry, or manage your 6-layer SQLite memory.',
      timestamp: new Date().toISOString(),
      intent: 'system_boot',
    },
  ],
  actionLogs: [
    {
      id: 'log-1',
      timestamp: new Date().toISOString(),
      agent: 'core',
      action: 'Initialize Cognitive Engine',
      target: '15 Brain Modules + 11 Specialist Agents',
      status: 'completed',
      detail: 'Self-owned offline cognitive orchestrator ready',
    },
    {
      id: 'log-2',
      timestamp: new Date().toISOString(),
      agent: 'file',
      action: 'Enforce Folder Sandbox',
      target: path.basename(process.cwd()) || 'workspace',
      status: 'completed',
      detail: 'Least-privilege directory permissions verified',
    },
  ],
  workflows: [
    {
      id: 'wf-morning-brief',
      name: 'Morning Executive Briefing',
      description: 'Checks live system health, today’s calendar schedule, and local weather forecast.',
      triggerPhrase: 'Run morning briefing workflow',
      steps: [
        { agent: 'system', action: 'Sample CPU, memory, storage & battery diagnostics' },
        { agent: 'calendar', action: 'Retrieve today’s meetings and priority tasks' },
        { agent: 'core', action: 'Synthesize concise spoken & visual daily summary' },
      ],
      enabled: true,
      runCount: 1,
      lastRunAt: new Date().toISOString(),
    },
    {
      id: 'wf-workspace-audit',
      name: 'Workspace File & Duplicate Audit',
      description: 'Scans permitted folders for recent files and potential duplicates without modifying anything.',
      triggerPhrase: 'Run workspace file audit',
      steps: [
        { agent: 'file', action: 'Index permitted directory tree' },
        { agent: 'file', action: 'Identify duplicate candidates by name and size' },
        { agent: 'core', action: 'Report findings for user review' },
      ],
      enabled: true,
      runCount: 0,
    },
  ],
  apps: [
    {
      id: 'app-vscode',
      name: 'Visual Studio Code',
      category: 'development',
      command: 'code',
      installed: true,
      pinned: true,
      description: 'Source code editor and workspace IDE',
    },
    {
      id: 'app-chrome',
      name: 'Google Chrome',
      category: 'browser',
      command: 'google-chrome',
      installed: true,
      pinned: true,
      description: 'Web browser and developer inspector',
    },
    {
      id: 'app-terminal',
      name: 'Windows Terminal',
      category: 'system',
      command: 'wt',
      installed: true,
      pinned: true,
      description: 'PowerShell, CMD, and WSL command shell',
    },
    {
      id: 'app-explorer',
      name: 'File Explorer',
      category: 'system',
      command: 'explorer',
      installed: true,
      pinned: true,
      description: 'Local desktop file manager',
    },
    {
      id: 'app-whatsapp',
      name: 'WhatsApp Desktop',
      category: 'communication',
      command: 'whatsapp',
      installed: false,
      pinned: false,
      description: 'Desktop messaging client',
    },
    {
      id: 'app-android-studio',
      name: 'Android Studio',
      category: 'development',
      command: 'studio64',
      installed: false,
      pinned: false,
      description: 'Mobile SDK & emulator environment',
    },
    {
      id: 'app-spotify',
      name: 'Media Player',
      category: 'media',
      command: 'spotify',
      installed: false,
      pinned: false,
      description: 'Audio playback & playlists',
    },
    {
      id: 'app-notes',
      name: 'Notes & Scratchpad',
      category: 'productivity',
      command: 'notepad',
      installed: true,
      pinned: false,
      description: 'Quick plain-text note capture',
    },
    {
      id: 'app-edge',
      name: 'Microsoft Edge',
      category: 'browser',
      command: 'msedge',
      installed: true,
      pinned: false,
      description: 'Microsoft Edge web browser',
    },
    {
      id: 'app-calculator',
      name: 'Calculator',
      category: 'productivity',
      command: 'calc',
      installed: true,
      pinned: false,
      description: 'Windows desktop calculator',
    },
    {
      id: 'app-cmd',
      name: 'Command Prompt',
      category: 'system',
      command: 'cmd',
      installed: true,
      pinned: false,
      description: 'Windows Command Prompt shell',
    },
    {
      id: 'app-powershell',
      name: 'Windows PowerShell',
      category: 'system',
      command: 'powershell',
      installed: true,
      pinned: false,
      description: 'Windows PowerShell automation shell',
    },
    {
      id: 'app-settings',
      name: 'Windows Settings',
      category: 'system',
      command: 'windows settings',
      installed: true,
      pinned: false,
      description: 'Windows System Settings control panel',
    },
    {
      id: 'app-taskmgr',
      name: 'Task Manager',
      category: 'system',
      command: 'taskmgr',
      installed: true,
      pinned: false,
      description: 'Windows process & performance manager',
    },
  ],
};

function normalizeLoadedDb(parsed: Partial<FridayDatabase>): FridayDatabase {
  const mergedSettings: AssistantSettings = {
    ...DEFAULT_DB.settings,
    ...parsed.settings,
    wallpaper: { ...DEFAULT_DB.settings.wallpaper, ...(parsed.settings?.wallpaper || {}) },
    hologram: { ...DEFAULT_DB.settings.hologram, ...(parsed.settings?.hologram || {}) },
    enabledAgents: { ...DEFAULT_DB.settings.enabledAgents, ...(parsed.settings?.enabledAgents || {}) },
  };

  // Migrate any legacy Gemini / Ollama model setting cleanly to self-owned F.R.I.D.A.Y. Cognitive Engine
  const legacyModel = String(mergedSettings.aiModel || '');
  if (
    legacyModel.startsWith('gemini-') ||
    legacyModel === 'ollama' ||
    (legacyModel !== 'friday-cognitive' &&
      legacyModel !== 'friday-language-core' &&
      legacyModel !== 'local-auto' &&
      legacyModel !== 'local-core')
  ) {
    mergedSettings.aiModel = 'friday-cognitive';
  }
  if (mergedSettings.userName === 'Vishvajit Pawar' || mergedSettings.userName === 'Vishvajit') {
    mergedSettings.userName = 'Siddesh';
  }
  if (mergedSettings.reopenShortcut === 'Ctrl+Space') {
    mergedSettings.reopenShortcut = 'Ctrl+Shift+Space';
  }
  if (
    !Array.isArray(mergedSettings.allowedFolders) ||
    mergedSettings.allowedFolders.length === 0 ||
    (process.platform === 'win32' &&
      mergedSettings.allowedFolders.length === 1 &&
      path.resolve(mergedSettings.allowedFolders[0]) === path.resolve(process.cwd()))
  ) {
    mergedSettings.allowedFolders = getDefaultPermittedFolders();
  }

  const parsedApps = Array.isArray(parsed.apps) ? parsed.apps : DEFAULT_DB.apps;
  const mergedApps = [...parsedApps];
  for (const defApp of DEFAULT_DB.apps) {
    if (!mergedApps.some((a) => a.id === defApp.id)) {
      mergedApps.push(defApp);
    }
  }

  return {
    settings: mergedSettings,
    calendar: Array.isArray(parsed.calendar) ? parsed.calendar : DEFAULT_DB.calendar,
    memory: Array.isArray(parsed.memory) ? parsed.memory : DEFAULT_DB.memory,
    notes: Array.isArray(parsed.notes) ? parsed.notes : DEFAULT_DB.notes,
    todos: Array.isArray(parsed.todos) ? parsed.todos : DEFAULT_DB.todos,
    chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory : DEFAULT_DB.chatHistory,
    actionLogs: Array.isArray(parsed.actionLogs) ? parsed.actionLogs : DEFAULT_DB.actionLogs,
    workflows: Array.isArray(parsed.workflows) ? parsed.workflows : DEFAULT_DB.workflows,
    apps: mergedApps,
  };
}

export function loadDb(): FridayDatabase {
  const sqlite = getCognitiveSqlite();
  const settingsRow = sqlite.prepare('SELECT value_json FROM settings WHERE key = ?').get('app_settings') as
    | { value_json: string }
    | undefined;

  if (!settingsRow) {
    // Check if legacy friday-db.json exists and migrate once into SQLite
    const legacyPath = getLegacyJsonPath();
    let seed = structuredClone(DEFAULT_DB);
    if (fs.existsSync(legacyPath)) {
      try {
        const raw = fs.readFileSync(legacyPath, 'utf-8');
        seed = normalizeLoadedDb(JSON.parse(raw) as Partial<FridayDatabase>);
      } catch {
        seed = structuredClone(DEFAULT_DB);
      }
    }
    saveDb(seed);
    return seed;
  }

  try {
    const parsedSettings = JSON.parse(settingsRow.value_json) as AssistantSettings;
    const calendarRows = sqlite
      .prepare('SELECT id, title, event_date, event_time, category, completed, notes, created_at FROM calendar_events ORDER BY event_date ASC, event_time ASC')
      .all() as Array<Record<string, unknown>>;
    const memoryRows = sqlite
      .prepare('SELECT id, category, memory_key, memory_value, approved, updated_at FROM user_memory ORDER BY updated_at DESC')
      .all() as Array<Record<string, unknown>>;
    const chatRows = sqlite
      .prepare('SELECT id, role, content, intent, metadata_json, timestamp FROM chat_history ORDER BY rowid ASC')
      .all() as Array<Record<string, unknown>>;
    const logRows = sqlite
      .prepare('SELECT id, timestamp, agent, action, target, status, detail FROM action_logs ORDER BY rowid ASC')
      .all() as Array<Record<string, unknown>>;

    const notes = getAppCollection<NoteItem[]>('notes') || DEFAULT_DB.notes;
    const todos = getAppCollection<TodoItem[]>('todos') || DEFAULT_DB.todos;
    const workflows = getAppCollection<AutomationWorkflow[]>('workflows') || DEFAULT_DB.workflows;
    const apps = getAppCollection<DesktopAppItem[]>('apps') || DEFAULT_DB.apps;

    return normalizeLoadedDb({
      settings: parsedSettings,
      calendar: calendarRows.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        date: String(r.event_date),
        time: String(r.event_time),
        category: String(r.category) as CalendarEvent['category'],
        completed: Number(r.completed) === 1,
        notes: r.notes ? String(r.notes) : undefined,
        createdAt: String(r.created_at),
      })),
      memory: memoryRows.map((r) => ({
        id: String(r.id),
        category: String(r.category) as MemoryItem['category'],
        key: String(r.memory_key),
        value: String(r.memory_value),
        approved: Number(r.approved) === 1,
        updatedAt: String(r.updated_at),
      })),
      notes,
      todos,
      workflows,
      apps,
      chatHistory: chatRows.map((r) => {
        let meta: Record<string, unknown> = {};
        if (r.metadata_json) {
          try {
            meta = JSON.parse(String(r.metadata_json)) as Record<string, unknown>;
          } catch {
            meta = {};
          }
        }
        return {
          id: String(r.id),
          role: String(r.role) as ChatMessage['role'],
          content: String(r.content),
          intent: r.intent ? String(r.intent) : undefined,
          timestamp: String(r.timestamp),
          ...(meta as Partial<ChatMessage>),
        };
      }),
      actionLogs: logRows.map((r) => ({
        id: String(r.id),
        timestamp: String(r.timestamp),
        agent: String(r.agent) as ActionLogEntry['agent'],
        action: String(r.action),
        target: String(r.target),
        status: String(r.status) as ActionLogEntry['status'],
        detail: r.detail ? String(r.detail) : undefined,
      })),
    });
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

export function saveDb(db: FridayDatabase): void {
  const sqlite = getCognitiveSqlite();
  const now = new Date().toISOString();

  sqlite.exec('BEGIN IMMEDIATE;');
  try {
    sqlite
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .run('app_settings', JSON.stringify(db.settings), now);

    sqlite.exec('DELETE FROM calendar_events;');
    const insCal = sqlite.prepare(
      `INSERT INTO calendar_events (id, title, event_date, event_time, category, completed, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const ev of db.calendar) {
      insCal.run(ev.id, ev.title, ev.date, ev.time, ev.category, ev.completed ? 1 : 0, ev.notes ?? null, ev.createdAt);
    }

    sqlite.exec('DELETE FROM user_memory;');
    const insMem = sqlite.prepare(
      `INSERT INTO user_memory (id, category, memory_key, memory_value, approved, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const m of db.memory) {
      insMem.run(m.id, m.category, m.key, m.value, m.approved ? 1 : 0, m.updatedAt);
    }

    sqlite.exec('DELETE FROM chat_history;');
    const insChat = sqlite.prepare(
      `INSERT INTO chat_history (id, role, content, intent, metadata_json, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const c of db.chatHistory.slice(-120)) {
      const meta = {
        steps: c.steps,
        sources: c.sources,
        timings: c.timings,
        pendingConfirmation: c.pendingConfirmation,
      };
      insChat.run(c.id, c.role, c.content, c.intent ?? null, JSON.stringify(meta), c.timestamp);
    }

    sqlite.exec('DELETE FROM action_logs;');
    const insLog = sqlite.prepare(
      `INSERT INTO action_logs (id, timestamp, agent, action, target, status, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const l of db.actionLogs.slice(0, 80)) {
      insLog.run(l.id, l.timestamp, l.agent, l.action, l.target, l.status, l.detail ?? null);
    }

    sqlite.exec('COMMIT;');
  } catch (err) {
    sqlite.exec('ROLLBACK;');
    throw err;
  }

  setAppCollection('notes', db.notes);
  setAppCollection('todos', db.todos);
  setAppCollection('workflows', db.workflows);
  setAppCollection('apps', db.apps);
}

export function appendActionLog(
  db: FridayDatabase,
  entry: Omit<ActionLogEntry, 'id' | 'timestamp'>
): ActionLogEntry {
  const log: ActionLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  db.actionLogs = [log, ...db.actionLogs].slice(0, 80);
  saveDb(db);
  return log;
}
