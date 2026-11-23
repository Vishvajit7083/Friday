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
} from '../src/core/types.ts';
import { getDefaultPermittedFolders } from './fileService.ts';

export interface FridayDatabase {
  settings: AssistantSettings;
  calendar: CalendarEvent[];
  memory: MemoryItem[];
  chatHistory: ChatMessage[];
  actionLogs: ActionLogEntry[];
  workflows: AutomationWorkflow[];
  apps: DesktopAppItem[];
}

const DATA_DIR = path.resolve(process.cwd(), '.friday-data');
const DB_PATH = path.join(DATA_DIR, 'friday-db.json');

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
    aiModel: 'local-auto',
    ollamaModel: '',
    voiceName: 'Kore',
    voiceGender: 'female',
    speakingSpeed: 1.0,
    speakingPitch: 1.0,
    language: 'en-US',
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
      notes: 'Inspect multi-agent execution graph and latency metrics.',
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
      value: 'Concise, proactive, technical clarity without unnecessary filler.',
      approved: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'mem-2',
      category: 'project',
      key: 'Primary Engineering Workspace',
      value: 'F.R.I.D.A.Y. Desktop AI Companion & Multi-Agent Command Center',
      approved: true,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'mem-3',
      category: 'workflow',
      key: 'Privacy Guardrail',
      value: 'Always confirm before deleting files, modifying schedules, or capturing screen.',
      approved: true,
      updatedAt: new Date().toISOString(),
    },
  ],
  chatHistory: [
    {
      id: 'msg-welcome',
      role: 'assistant',
      content:
        'F.R.I.D.A.Y. Command Center initialized. All eleven specialist agents are standing by. Ask me to inspect system performance, search permitted files, research the web with citations, or manage your schedule.',
      timestamp: new Date().toISOString(),
      intent: 'system_boot',
    },
  ],
  actionLogs: [
    {
      id: 'log-1',
      timestamp: new Date().toISOString(),
      agent: 'core',
      action: 'Initialize Multi-Agent Bus',
      target: '11 Specialist Agents',
      status: 'completed',
      detail: 'Command orchestrator ready',
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
  ],
};

function ensureDbDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadDb(): FridayDatabase {
  ensureDbDir();
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
    return structuredClone(DEFAULT_DB);
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<FridayDatabase>;
    const hasGemKey = Boolean(
      process.env.GEMINI_API_KEY?.trim() && process.env.GEMINI_API_KEY.trim() !== 'MY_GEMINI_API_KEY'
    );
    const mergedSettings: AssistantSettings = {
      ...DEFAULT_DB.settings,
      ...parsed.settings,
      wallpaper: { ...DEFAULT_DB.settings.wallpaper, ...(parsed.settings?.wallpaper || {}) },
      hologram: { ...DEFAULT_DB.settings.hologram, ...(parsed.settings?.hologram || {}) },
      enabledAgents: { ...DEFAULT_DB.settings.enabledAgents, ...(parsed.settings?.enabledAgents || {}) },
    };

    if (!hasGemKey && mergedSettings.aiModel?.startsWith('gemini-')) {
      mergedSettings.aiModel = 'local-auto';
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

    return {
      settings: mergedSettings,
      calendar: Array.isArray(parsed.calendar) ? parsed.calendar : DEFAULT_DB.calendar,
      memory: Array.isArray(parsed.memory) ? parsed.memory : DEFAULT_DB.memory,
      chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory : DEFAULT_DB.chatHistory,
      actionLogs: Array.isArray(parsed.actionLogs) ? parsed.actionLogs : DEFAULT_DB.actionLogs,
      workflows: Array.isArray(parsed.workflows) ? parsed.workflows : DEFAULT_DB.workflows,
      apps: Array.isArray(parsed.apps) ? parsed.apps : DEFAULT_DB.apps,
    };
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

export function saveDb(db: FridayDatabase): void {
  ensureDbDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
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
