import { analyzeUserCommand, isKnowledgeQuestion, tryEvaluateSafeMath } from './intentEngine';
import {
  parseProductivityCommand,
  summarizeTextExtractive,
  type NoteItem,
  type ReminderItem,
  type TodoItem,
} from './productivityTools';
import { tryTranslateCommand } from './translator';
import { tryConvertUnits } from './unitConverter';
import type {
  ActionLogEntry,
  AgentId,
  AssistantSettings,
  AutomationWorkflow,
  CalendarEvent,
  ChatMessage,
  DesktopAppItem,
  FridayAndroidBridge,
  GroundingSource,
  MemoryItem,
  SystemTelemetry,
  WeatherData,
} from './types';

export interface LocalClientState {
  settings: AssistantSettings;
  calendar: CalendarEvent[];
  memory: MemoryItem[];
  notes: NoteItem[];
  todos: TodoItem[];
  reminders: ReminderItem[];
  chatHistory: ChatMessage[];
  actionLogs: ActionLogEntry[];
  workflows: AutomationWorkflow[];
  apps: DesktopAppItem[];
}

const STORAGE_KEY = 'friday_android_local_db_v1';

function getAndroidBridge(): FridayAndroidBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { fridayAndroid?: FridayAndroidBridge };
  return w.fridayAndroid ?? null;
}

export function isAndroidHost(): boolean {
  const bridge = getAndroidBridge();
  try {
    return Boolean(bridge && (typeof bridge.isAndroid === 'function' ? bridge.isAndroid() : true));
  } catch {
    return false;
  }
}

export function buildDefaultLocalState(seedSettings: AssistantSettings): LocalClientState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    settings: { ...seedSettings },
    calendar: [
      {
        id: 'evt-local-1',
        title: 'Daily Planning & Focus Session',
        date: today,
        time: '10:00',
        category: 'focus',
        completed: false,
        notes: 'Stored locally on device for offline access.',
        createdAt: new Date().toISOString(),
      },
    ],
    memory: [
      {
        id: 'mem-local-1',
        category: 'preference',
        key: 'Voice Persona',
        value: 'Natural female assistant voice with adjustable pitch and offline-ready commands.',
        approved: true,
        updatedAt: new Date().toISOString(),
      },
    ],
    notes: [
      {
        id: 'note-local-1',
        title: 'Welcome to F.R.I.D.A.Y. Notes',
        content: 'Say "take a note: finish Android presentation" anytime to save notes offline.',
        pinned: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    todos: [
      {
        id: 'todo-local-1',
        title: 'Test offline voice, math, and Marathi/Hindi translations',
        completed: false,
        priority: 'normal',
        dueDate: today,
        createdAt: new Date().toISOString(),
      },
    ],
    reminders: [],
    chatHistory: [
      {
        id: 'msg-welcome-local',
        role: 'assistant',
        content:
          'F.R.I.D.A.Y. is ready in local-first mode. I can compute math, convert units, translate English/Hindi/Marathi, save notes & reminders, read text aloud, and control device apps & settings.',
        timestamp: new Date().toISOString(),
        intent: 'system_boot',
      },
    ],
    actionLogs: [
      {
        id: 'log-local-1',
        timestamp: new Date().toISOString(),
        agent: 'core',
        action: 'Initialize Local Client Core',
        target: isAndroidHost() ? 'Android Bridge + SQLite' : 'Browser Local Store',
        status: 'completed',
      },
    ],
    workflows: [
      {
        id: 'wf-local-brief',
        name: 'Morning Device Briefing',
        description: 'Summarizes today’s reminders, tasks, and live device telemetry offline.',
        triggerPhrase: 'Run morning briefing',
        steps: [
          { agent: 'system', action: 'Check device battery and memory status' },
          { agent: 'calendar', action: 'List upcoming tasks and reminders' },
        ],
        enabled: true,
        runCount: 0,
      },
    ],
    apps: [
      { id: 'app-chrome', name: 'Google Chrome', category: 'browser', command: 'chrome', installed: true, pinned: true, description: 'Mobile & desktop web browser' },
      { id: 'app-youtube', name: 'YouTube', category: 'media', command: 'youtube', installed: true, pinned: true, description: 'Video search and playback' },
      { id: 'app-camera', name: 'Camera', category: 'media', command: 'camera', installed: true, pinned: true, description: 'Capture photos and video' },
      { id: 'app-gallery', name: 'Gallery & Photos', category: 'media', command: 'gallery', installed: true, pinned: true, description: 'Browse saved device photos' },
      { id: 'app-maps', name: 'Google Maps', category: 'system', command: 'maps', installed: true, pinned: true, description: 'Navigation and place search' },
      { id: 'app-contacts', name: 'Contacts & Dialer', category: 'communication', command: 'contacts', installed: true, pinned: false, description: 'Device contacts and call dialer' },
      { id: 'app-wifi', name: 'Wi-Fi Settings', category: 'system', command: 'settings:wifi', installed: true, pinned: false, description: 'Network & wireless controls' },
      { id: 'app-bluetooth', name: 'Bluetooth Settings', category: 'system', command: 'settings:bluetooth', installed: true, pinned: false, description: 'Paired audio & device connections' },
    ],
  };
}

export function loadLocalClientState(seedSettings: AssistantSettings): LocalClientState {
  const defaults = buildDefaultLocalState(seedSettings);
  try {
    const bridge = getAndroidBridge();
    if (bridge?.readMemoryRecords) {
      const rawBridge = bridge.readMemoryRecords('friday_state');
      if (rawBridge) {
        const parsed = JSON.parse(rawBridge) as Partial<LocalClientState>;
        return mergeLocalState(defaults, parsed);
      }
    }
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LocalClientState>;
        return mergeLocalState(defaults, parsed);
      }
    }
  } catch {
    // Fallback to defaults
  }
  return defaults;
}

function mergeLocalState(defaults: LocalClientState, parsed: Partial<LocalClientState>): LocalClientState {
  return {
    settings: {
      ...defaults.settings,
      ...(parsed.settings || {}),
      wallpaper: { ...defaults.settings.wallpaper, ...(parsed.settings?.wallpaper || {}) },
      hologram: { ...defaults.settings.hologram, ...(parsed.settings?.hologram || {}) },
      enabledAgents: { ...defaults.settings.enabledAgents, ...(parsed.settings?.enabledAgents || {}) },
    },
    calendar: Array.isArray(parsed.calendar) ? parsed.calendar : defaults.calendar,
    memory: Array.isArray(parsed.memory) ? parsed.memory : defaults.memory,
    notes: Array.isArray(parsed.notes) ? parsed.notes : defaults.notes,
    todos: Array.isArray(parsed.todos) ? parsed.todos : defaults.todos,
    reminders: Array.isArray(parsed.reminders) ? parsed.reminders : defaults.reminders,
    chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory : defaults.chatHistory,
    actionLogs: Array.isArray(parsed.actionLogs) ? parsed.actionLogs : defaults.actionLogs,
    workflows: Array.isArray(parsed.workflows) ? parsed.workflows : defaults.workflows,
    apps: Array.isArray(parsed.apps) && parsed.apps.length > 0 ? parsed.apps : defaults.apps,
  };
}

export function saveLocalClientState(state: LocalClientState): void {
  try {
    const serialized = JSON.stringify({
      ...state,
      chatHistory: state.chatHistory.slice(-80),
      actionLogs: state.actionLogs.slice(0, 60),
    });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, serialized);
    }
    const bridge = getAndroidBridge();
    bridge?.saveMemoryRecord?.('friday_state', serialized);
  } catch {
    // Ignore storage quota issues cleanly
  }
}

export async function readDeviceTelemetryFallback(): Promise<SystemTelemetry> {
  const bridge = getAndroidBridge();
  if (bridge?.getDeviceTelemetry) {
    try {
      const raw = bridge.getDeviceTelemetry();
      const parsed = JSON.parse(raw) as Partial<SystemTelemetry>;
      return {
        timestamp: new Date().toISOString(),
        cpuLoad: typeof parsed.cpuLoad === 'number' ? parsed.cpuLoad : 18,
        cpuTemp: typeof parsed.cpuTemp === 'number' ? parsed.cpuTemp : null,
        cpuCores: typeof parsed.cpuCores === 'number' ? parsed.cpuCores : (navigator.hardwareConcurrency || 8),
        cpuModel: parsed.cpuModel || 'Android ARM64 SoC',
        gpuName: parsed.gpuName || 'Mobile Adreno / Mali GPU',
        gpuUsage: typeof parsed.gpuUsage === 'number' ? parsed.gpuUsage : null,
        gpuTemp: typeof parsed.gpuTemp === 'number' ? parsed.gpuTemp : null,
        ramUsedGb: typeof parsed.ramUsedGb === 'number' ? parsed.ramUsedGb : 0,
        ramTotalGb: typeof parsed.ramTotalGb === 'number' ? parsed.ramTotalGb : 0,
        ramPercent: typeof parsed.ramPercent === 'number' ? parsed.ramPercent : 0,
        storageUsedGb: typeof parsed.storageUsedGb === 'number' ? parsed.storageUsedGb : 0,
        storageTotalGb: typeof parsed.storageTotalGb === 'number' ? parsed.storageTotalGb : 0,
        storagePercent: typeof parsed.storagePercent === 'number' ? parsed.storagePercent : 0,
        networkRxKbps: typeof parsed.networkRxKbps === 'number' ? parsed.networkRxKbps : 0,
        networkTxKbps: typeof parsed.networkTxKbps === 'number' ? parsed.networkTxKbps : 0,
        batteryPercent: typeof parsed.batteryPercent === 'number' ? parsed.batteryPercent : null,
        batteryCharging: typeof parsed.batteryCharging === 'boolean' ? parsed.batteryCharging : null,
        uptimeSeconds: typeof parsed.uptimeSeconds === 'number' ? parsed.uptimeSeconds : 0,
        platform: parsed.platform || 'android',
        hostname: parsed.hostname || 'Android Smartphone',
      };
    } catch {
      // Fallback below
    }
  }

  let batteryPercent: number | null = null;
  let batteryCharging: boolean | null = null;
  try {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
    };
    if (nav.getBattery) {
      const batt = await nav.getBattery();
      batteryPercent = Math.round(batt.level * 100);
      batteryCharging = Boolean(batt.charging);
    }
  } catch {
    // Battery API unavailable
  }

  return {
    timestamp: new Date().toISOString(),
    cpuLoad: 0,
    cpuTemp: null,
    cpuCores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4,
    cpuModel: typeof navigator !== 'undefined' ? navigator.platform || 'Local Device' : 'Local Core',
    gpuName: 'WebView / Local Runtime',
    gpuUsage: null,
    gpuTemp: null,
    ramUsedGb: 0,
    ramTotalGb: 0,
    ramPercent: 0,
    storageUsedGb: 0,
    storageTotalGb: 0,
    storagePercent: 0,
    networkRxKbps: 0,
    networkTxKbps: 0,
    batteryPercent,
    batteryCharging,
    uptimeSeconds: 0,
    platform: typeof navigator !== 'undefined' ? navigator.platform || 'mobile-web' : 'offline',
    hostname: 'F.R.I.D.A.Y. Local Node',
  };
}

export async function fetchOpenMeteoClientWeather(locationQuery: string): Promise<WeatherData | null> {
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationQuery)}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!geoRes.ok) return null;
    const geo = (await geoRes.json()) as {
      results?: Array<{ name: string; country?: string; latitude: number; longitude: number }>;
    };
    const place = geo.results?.[0];
    if (!place) return null;

    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!wRes.ok) return null;
    const wData = (await wRes.json()) as {
      current?: {
        temperature_2m: number;
        relative_humidity_2m: number;
        apparent_temperature: number;
        wind_speed_10m: number;
        weather_code: number;
      };
      daily?: {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        weather_code: number[];
      };
    };
    if (!wData.current) return null;
    const codeLabel = (code: number) => {
      if (code === 0) return 'Clear Sky';
      if (code <= 3) return 'Partly Cloudy';
      if (code <= 48) return 'Fog';
      if (code <= 67) return 'Rain';
      if (code <= 77) return 'Snow';
      return 'Showers';
    };

    return {
      location: `${place.name}${place.country ? `, ${place.country}` : ''}`,
      latitude: place.latitude,
      longitude: place.longitude,
      temperature: Math.round(wData.current.temperature_2m),
      condition: codeLabel(wData.current.weather_code),
      humidity: Math.round(wData.current.relative_humidity_2m),
      windSpeedKmh: Math.round(wData.current.wind_speed_10m),
      feelsLike: Math.round(wData.current.apparent_temperature),
      updatedAt: new Date().toISOString(),
      forecast: (wData.daily?.time ?? []).map((date, idx) => ({
        date,
        tempMax: Math.round(wData.daily?.temperature_2m_max[idx] ?? 0),
        tempMin: Math.round(wData.daily?.temperature_2m_min[idx] ?? 0),
        condition: codeLabel(wData.daily?.weather_code[idx] ?? 0),
        code: wData.daily?.weather_code[idx] ?? 0,
      })),
      source: 'Open-Meteo Live Public API',
    };
  } catch {
    return null;
  }
}

async function fetchPublicWikipediaKnowledge(
  query: string
): Promise<{ text: string; sources: GroundingSource[] } | null> {
  const bridge = getAndroidBridge();
  if (bridge?.searchWebPublic) {
    try {
      const raw = bridge.searchWebPublic(query);
      const parsed = JSON.parse(raw) as { summary?: string; sources?: GroundingSource[] };
      if (parsed.summary) {
        return {
          text: parsed.summary,
          sources: Array.isArray(parsed.sources) ? parsed.sources : [],
        };
      }
    } catch {
      // Fall back to direct browser-safe Wikipedia CORS fetch
    }
  }

  try {
    const cleanQuery = query
      .replace(/^(what is|who is|explain|define|tell me about|search google for|search online for|search)\s+/i, '')
      .replace(/[?]+$/g, '')
      .trim();
    if (!cleanQuery) return null;

    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&utf8=&format=json&origin=*`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      query?: { search?: Array<{ title: string; snippet: string }> };
    };
    const first = json.query?.search?.[0];
    if (!first) return null;

    const sumRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(first.title)}`,
      { signal: AbortSignal.timeout(4500) }
    );
    if (sumRes.ok) {
      const sumJson = (await sumRes.json()) as {
        title?: string;
        extract?: string;
        content_urls?: { desktop?: { page?: string } };
      };
      if (sumJson.extract) {
        const uri = sumJson.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(first.title)}`;
        return {
          text: `${sumJson.title || first.title}: ${sumJson.extract}`,
          sources: [{ title: sumJson.title || first.title, uri }],
        };
      }
    }
  } catch {
    // Offline or blocked
  }
  return null;
}

function unwrapAndroidBridgeReply(raw: string | undefined, fallback: string): string {
  if (!raw || !raw.trim()) return fallback;
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { ok?: boolean; message?: string; error?: string };
      if (typeof parsed.message === 'string' && parsed.message.trim()) {
        return parsed.message.trim();
      }
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        return parsed.error.trim();
      }
    } catch {
      // Fall back to trimmed string
    }
  }
  return trimmed;
}

function handleAndroidPhoneControl(
  command: string,
  bridge: FridayAndroidBridge | null
): { handled: boolean; reply: string } {
  const lower = command.trim().toLowerCase();

  // Flashlight / torch
  if (/\b(flashlight|torch)\b/.test(lower)) {
    const enable = !/\b(off|disable)\b/.test(lower);
    if (bridge?.setFlashlight) {
      return {
        handled: true,
        reply: unwrapAndroidBridgeReply(
          bridge.setFlashlight(enable),
          `Flashlight turned ${enable ? 'on' : 'off'}.`
        ),
      };
    }
    return {
      handled: true,
      reply: `Torch ${enable ? 'ON' : 'OFF'} intent is ready for the Android device bridge (available when running inside the Android APK).`,
    };
  }

  // Device settings shortcuts
  const settingMap: Array<[RegExp, string, string]> = [
    [/\bwi-?fi\b/, 'wifi', 'Wi-Fi settings'],
    [/\bbluetooth\b/, 'bluetooth', 'Bluetooth settings'],
    [/\bdisplay|brightness\b/, 'display', 'Display settings'],
    [/\bsound|volume\b/, 'sound', 'Sound settings'],
    [/\bnotification\b/, 'notifications', 'Notification settings'],
    [/\bapp|application\b/, 'apps', 'App settings'],
    [/\bbattery\b/, 'battery', 'Battery settings'],
  ];

  if (/\b(open|go\s+to|show)\b/.test(lower) && /\bsettings?\b/.test(lower)) {
    for (const [rx, key, label] of settingMap) {
      if (rx.test(lower)) {
        if (bridge?.openSettings) {
          return {
            handled: true,
            reply: unwrapAndroidBridgeReply(bridge.openSettings(key), `Opened ${label}.`),
          };
        }
        return {
          handled: true,
          reply: `Android ${label} launcher is wired via the native bridge (install the Android APK to open Android system panels directly).`,
        };
      }
    }
  }

  // Camera & Gallery
  if (/\b(open|launch)\s+camera\b/.test(lower)) {
    if (bridge?.openCamera) {
      return {
        handled: true,
        reply: unwrapAndroidBridgeReply(bridge.openCamera(), 'Opened Camera.'),
      };
    }
    return { handled: true, reply: 'Camera intent ready via Android bridge.' };
  }
  if (/\b(open|launch)\s+(gallery|photos)\b/.test(lower)) {
    if (bridge?.openGallery) {
      return {
        handled: true,
        reply: unwrapAndroidBridgeReply(bridge.openGallery(), 'Opened Gallery / Photos.'),
      };
    }
    return { handled: true, reply: 'Gallery / Photos viewer ready via Android bridge.' };
  }

  // Maps navigation
  const mapsMatch = command.match(/(?:navigate\s+to|directions\s+to|search\s+maps\s+for|open\s+maps\s+for)\s+(.+)/i);
  if (mapsMatch || /\b(open|launch)\s+maps\b/.test(lower)) {
    const query = mapsMatch?.[1]?.trim() || '';
    if (bridge?.openMapsSearch) {
      return {
        handled: true,
        reply: unwrapAndroidBridgeReply(
          bridge.openMapsSearch(query),
          query ? `Opened Google Maps for "${query}".` : 'Opened Google Maps.'
        ),
      };
    }
    if (query && typeof window !== 'undefined') {
      return {
        handled: true,
        reply: `Map route prepared for "${query}". Inside the Android APK, F.R.I.D.A.Y. opens Google Maps directly.`,
      };
    }
  }

  // Clipboard / Share
  const copyMatch = command.match(/^copy\s+to\s+clipboard[\s:]+(.+)$/i);
  if (copyMatch) {
    const text = copyMatch[1].trim();
    if (bridge?.copyToClipboard) {
      return {
        handled: true,
        reply: unwrapAndroidBridgeReply(bridge.copyToClipboard(text), `Copied to clipboard: "${text}".`),
      };
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => {});
      return { handled: true, reply: `Copied to clipboard: "${text}".` };
    }
  }

  // Direct App Launch (YouTube, Chrome, Contacts, Dialer, etc.)
  const appMatch = command.match(/(?:open|launch|start)\s+([a-zA-Z0-9 ._-]+)/i);
  if (appMatch) {
    const appTarget = appMatch[1].trim();
    if (bridge?.openApp) {
      return {
        handled: true,
        reply: unwrapAndroidBridgeReply(bridge.openApp(appTarget), `Opened ${appTarget}.`),
      };
    }
    return {
      handled: true,
      reply: `Prepared launch request for "${appTarget}". When running inside the Android APK, F.R.I.D.A.Y. opens "${appTarget}" natively via Android Intent.`,
    };
  }

  return { handled: false, reply: '' };
}

export async function executeClientOfflineCommand(
  command: string,
  state: LocalClientState
): Promise<{
  nextState: LocalClientState;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  activeAgents: AgentId[];
  speakText?: string;
}> {
  const started = Date.now();
  const parsed = analyzeUserCommand(command);
  const bridge = getAndroidBridge();
  const draftState: LocalClientState = structuredClone(state);
  const nowIso = new Date().toISOString();

  const userMessage: ChatMessage = {
    id: `msg-${Date.now()}-u`,
    role: 'user',
    content: command,
    timestamp: nowIso,
    intent: parsed.category,
  };

  if (parsed.requiresConfirmation) {
    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}-a`,
      role: 'assistant',
      content: `${parsed.confirmationReason ?? 'This action requires confirmation.'} Confirm below to proceed.`,
      timestamp: new Date().toISOString(),
      intent: parsed.category,
      steps: parsed.steps,
      pendingConfirmation: {
        actionId: `act-${Date.now()}`,
        summary: command,
        actionType: parsed.category,
        payload: { command },
      },
      timings: {
        engine: isAndroidHost() ? 'android-local-core' : 'offline-local-core',
        intentMs: Date.now() - started,
        toolMs: 0,
        firstTokenMs: Date.now() - started,
        modelMs: 0,
        totalMs: Date.now() - started,
      },
    };
    draftState.chatHistory = [...draftState.chatHistory, userMessage, assistantMessage].slice(-80);
    saveLocalClientState(draftState);
    return {
      nextState: draftState,
      userMessage,
      assistantMessage,
      activeAgents: parsed.agents,
    };
  }

  let reply = '';
  let sources: GroundingSource[] = [];
  let speakOverride: string | undefined;

  // 1. Unit Conversion
  const conv = tryConvertUnits(command);
  if (conv) {
    reply = conv.explanation;
  }

  // 2. Translation (English / Hindi / Marathi)
  if (!reply) {
    const tr = tryTranslateCommand(command);
    if (tr) reply = tr.explanation;
  }

  // 3. Productivity: Notes, To-Do, Reminders, Alarm, Summarize, Read Aloud
  if (!reply) {
    const prod = parseProductivityCommand(command);
    if (prod) {
      if (prod.kind === 'read_aloud' && prod.detail) {
        reply = prod.detail;
        speakOverride = prod.detail;
      } else if (prod.kind === 'summarize' && prod.detail) {
        reply = `Summary:\n${summarizeTextExtractive(prod.detail, 3)}`;
      } else if (prod.kind === 'note_add') {
        const note: NoteItem = {
          id: `note-${Date.now()}`,
          title: prod.title,
          content: prod.detail || prod.title,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        draftState.notes = [note, ...draftState.notes];
        reply = `Saved note: "${note.title}".`;
      } else if (prod.kind === 'list_notes') {
        reply =
          draftState.notes.length === 0
            ? 'You have no saved notes yet.'
            : `Saved Notes (${draftState.notes.length}):\n` +
              draftState.notes.slice(0, 6).map((n, i) => `${i + 1}. ${n.title}: ${n.content}`).join('\n');
      } else if (prod.kind === 'todo_add') {
        const todo: TodoItem = {
          id: `todo-${Date.now()}`,
          title: prod.title,
          completed: false,
          priority: 'normal',
          createdAt: nowIso,
        };
        draftState.todos = [todo, ...draftState.todos];
        reply = `Added to your To-Do list: "${todo.title}".`;
      } else if (prod.kind === 'list_todos') {
        const open = draftState.todos.filter((t) => !t.completed);
        reply =
          open.length === 0
            ? 'All To-Do tasks are complete.'
            : `Open Tasks (${open.length}):\n` + open.slice(0, 6).map((t, i) => `${i + 1}. ${t.title}`).join('\n');
      } else if (prod.kind === 'reminder_add') {
        const date = prod.date || nowIso.slice(0, 10);
        const time = prod.time || '09:00';
        draftState.reminders = [
          {
            id: `rem-${Date.now()}`,
            title: prod.title,
            triggerDate: date,
            triggerTime: time,
            completed: false,
            createdAt: nowIso,
          },
          ...draftState.reminders,
        ];
        draftState.calendar = [
          {
            id: `evt-${Date.now()}`,
            title: prod.title,
            date,
            time,
            category: 'reminder',
            completed: false,
            createdAt: nowIso,
          },
          ...draftState.calendar,
        ];
        reply = `Reminder set: "${prod.title}" for ${date} at ${time}.`;
      } else if (prod.kind === 'alarm_set') {
        const hour = prod.hour ?? 7;
        const minute = prod.minute ?? 0;
        const timeStr = prod.time ?? '07:00';
        if (bridge?.setAlarm) {
          reply = unwrapAndroidBridgeReply(
            bridge.setAlarm(hour, minute, prod.title),
            `Alarm set for ${timeStr}.`
          );
        } else {
          reply = `Alarm prepared for ${timeStr}. On Android APK, this opens the system Alarm Clock automatically.`;
        }
      }
    }
  }

  // 4. Math Evaluation
  if (!reply) {
    const mathVal = tryEvaluateSafeMath(command);
    if (mathVal !== null) {
      reply = `The result is ${mathVal}.`;
    }
  }

  // 5. Phone / App / Media Controls
  if (!reply && parsed.category === 'media_control') {
    const lower = command.toLowerCase();
    const action = /\b(next|skip)\b/.test(lower)
      ? 'next'
      : /\b(previous|back)\b/.test(lower)
        ? 'previous'
        : /\b(pause|stop)\b/.test(lower)
          ? 'pause'
          : /\b(up|increase|raise)\b/.test(lower)
            ? 'volume_up'
            : /\b(down|decrease|lower)\b/.test(lower)
              ? 'volume_down'
              : /\bmute\b/.test(lower)
                ? 'mute'
                : 'play_pause';
    reply = bridge?.mediaControl
      ? unwrapAndroidBridgeReply(bridge.mediaControl(action), `Media command "${action}" processed.`)
      : `Media command "${action}" processed.`;
  }

  if (!reply && (parsed.category === 'phone_control' || parsed.category === 'app_control')) {
    const ctrl = handleAndroidPhoneControl(command, bridge);
    if (ctrl.handled) reply = ctrl.reply;
  }

  // 6. System & Battery Telemetry
  if (!reply && parsed.category === 'system_telemetry') {
    const tel = await readDeviceTelemetryFallback();
    const battText =
      tel.batteryPercent !== null
        ? `Battery is at ${tel.batteryPercent}%${tel.batteryCharging ? ' (charging)' : ''}.`
        : 'Battery telemetry is available on supported Android/mobile devices.';
    const ramText = tel.ramTotalGb > 0 ? ` RAM: ${tel.ramUsedGb}/${tel.ramTotalGb} GB (${tel.ramPercent}%).` : '';
    const storeText = tel.storageTotalGb > 0 ? ` Storage: ${tel.storageUsedGb}/${tel.storageTotalGb} GB.` : '';
    reply = `${tel.hostname} (${tel.platform}, ${tel.cpuCores} cores): ${battText}${ramText}${storeText}`;
  }

  // 7. Memory save / recall
  if (!reply && parsed.category === 'memory_manage') {
    const rememberMatch = command.match(/remember\s+(?:that\s+)?(.+)/i);
    if (rememberMatch?.[1] && !/what\s+do\s+you\s+remember/i.test(command)) {
      const val = rememberMatch[1].trim();
      draftState.memory = [
        {
          id: `mem-${Date.now()}`,
          category: 'preference',
          key: 'User Note',
          value: val,
          approved: true,
          updatedAt: nowIso,
        },
        ...draftState.memory,
      ];
      reply = `Saved to local memory: "${val}".`;
    } else {
      const items = draftState.memory.slice(0, 5);
      reply =
        items.length === 0
          ? `No custom memory saved yet for ${draftState.settings.userName}.`
          : `Saved Memory:\n${items.map((m) => `- ${m.key}: ${m.value}`).join('\n')}`;
    }
  }

  // 8. Calendar inspection
  if (!reply && parsed.category === 'calendar_schedule') {
    const today = nowIso.slice(0, 10);
    const items = draftState.calendar.filter((e) => e.date >= today).slice(0, 5);
    reply =
      items.length === 0
        ? 'No upcoming calendar items.'
        : `Upcoming Schedule:\n${items.map((e) => `- ${e.date} ${e.time}: ${e.title}`).join('\n')}`;
  }

  // 9. Time / Date / Greeting / Identity
  const lower = command.trim().toLowerCase();
  if (!reply && /\b(time|date|day is it)\b/.test(lower)) {
    const now = new Date();
    reply = `It is ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`;
  }
  if (!reply && /^(hi|hello|hey|good morning|good afternoon|good evening|namaste|namaskar)\b/i.test(lower)) {
    reply = `Hello ${draftState.settings.userName}. F.R.I.D.A.Y. is ready offline and on Android—ask me to calculate, convert units, translate English/Hindi/Marathi, save notes or reminders, open apps, or check battery status.`;
  }
  if (!reply && /\b(who are you|what can you do|help)\b/i.test(lower)) {
    reply = `I am F.R.I.D.A.Y., your offline-capable personal AI assistant. I support math calculations, unit conversions, English/Hindi/Marathi translation, notes, to-do lists, reminders, alarms, device controls (YouTube, Camera, Wi-Fi, Bluetooth, Flashlight, Battery), and live public Wikipedia search when online.`;
  }

  // 10. Weather or Live Public Knowledge Search (only if online)
  if (!reply && /\bweather|temperature|forecast\b/i.test(lower)) {
    const w = await fetchOpenMeteoClientWeather(draftState.settings.weatherLocation);
    if (w) {
      reply = `Weather in ${w.location}: ${w.temperature}°C (${w.condition}), feels like ${w.feelsLike}°C, humidity ${w.humidity}%.`;
    } else {
      reply = 'Weather requires an active internet connection. Offline tools remain ready.';
    }
  }

  if (!reply && (parsed.category === 'web_search' || isKnowledgeQuestion(command))) {
    const onlineOk =
      typeof bridge?.getNetworkOnline === 'function'
        ? bridge.getNetworkOnline()
        : typeof navigator !== 'undefined'
          ? navigator.onLine
          : false;

    if (onlineOk) {
      const wiki = await fetchPublicWikipediaKnowledge(command);
      if (wiki) {
        reply = wiki.text;
        sources = wiki.sources;
      } else {
        reply = `I checked online public knowledge for "${command}" but could not retrieve a match. Check your query or internet connection.`;
      }
    } else {
      reply = `You are currently offline. Live web lookup for "${command}" is unavailable without internet, while math, unit conversions, notes, reminders, translations, and phone controls work offline.`;
    }
  }

  if (!reply) {
    reply = `Processed "${command}" in F.R.I.D.A.Y. Local Core. Try math ("calculate 250 multiplied by 35"), units ("10 km to miles"), translations ("translate hello into Marathi"), reminders ("remind me to study tomorrow"), or phone actions ("open youtube").`;
  }

  const totalMs = Math.max(1, Date.now() - started);
  const assistantMessage: ChatMessage = {
    id: `msg-${Date.now()}-a`,
    role: 'assistant',
    content: reply,
    timestamp: new Date().toISOString(),
    intent: parsed.category,
    sources: sources.length > 0 ? sources : undefined,
    steps: parsed.steps.map((s) => ({ ...s, status: 'completed' })),
    timings: {
      engine: isAndroidHost() ? 'android-local-core' : 'offline-local-core',
      intentMs: 1,
      toolMs: totalMs,
      firstTokenMs: totalMs,
      modelMs: 0,
      totalMs,
    },
  };

  draftState.chatHistory = [...draftState.chatHistory, userMessage, assistantMessage].slice(-80);
  const newActionLog: ActionLogEntry = {
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString(),
    agent: parsed.agents[0] ?? 'core',
    action: `Local Action (${parsed.category})`,
    target: command.slice(0, 48),
    status: 'completed',
  };
  draftState.actionLogs = [newActionLog, ...draftState.actionLogs].slice(0, 60);

  saveLocalClientState(draftState);

  return {
    nextState: draftState,
    userMessage,
    assistantMessage,
    activeAgents: parsed.agents,
    speakText: speakOverride,
  };
}

export function executeClientConfirmAction(
  actionType: string,
  summary: string,
  approved: boolean,
  state: LocalClientState
): { nextState: LocalClientState; confirmationMessage: ChatMessage } {
  const draftState: LocalClientState = structuredClone(state);
  const bridge = getAndroidBridge();
  const clearPending = draftState.chatHistory.map((m) =>
    m.pendingConfirmation ? { ...m, pendingConfirmation: undefined } : m
  );

  let detail = '';
  if (!approved) {
    detail = `Action cancelled as requested: "${summary}".`;
  } else if (/\b(?:call|dial|phone)\s+(.+)/i.test(summary)) {
    const match = summary.match(/\b(?:call|dial|phone)\s+(.+)/i);
    const target = match?.[1]?.trim() || summary;
    if (bridge?.prepareCallDialer) {
      detail = unwrapAndroidBridgeReply(
        bridge.prepareCallDialer(target, true),
        `Opened system dialer for ${target}.`
      );
    } else {
      detail = `Call confirmation approved for "${target}". On Android APK, F.R.I.D.A.Y. opens the system Dialer with this target pre-filled for safety.`;
    }
  } else if (actionType === 'calendar_schedule') {
    draftState.calendar = [
      {
        id: `evt-${Date.now()}`,
        title: summary.replace(/^(friday[,\s]+)?(schedule|add|create|book)\s+/i, '').trim() || summary,
        date: new Date().toISOString().slice(0, 10),
        time: '10:00',
        category: 'meeting',
        completed: false,
        createdAt: new Date().toISOString(),
      },
      ...draftState.calendar,
    ];
    detail = `Confirmed and added to your local schedule: "${summary}".`;
  } else {
    detail = `Confirmed in local sandbox: "${summary}".`;
  }

  const confirmationMessage: ChatMessage = {
    id: `msg-${Date.now()}-conf`,
    role: 'assistant',
    content: detail,
    timestamp: new Date().toISOString(),
    intent: actionType,
  };

  draftState.chatHistory = [...clearPending, confirmationMessage].slice(-80);
  saveLocalClientState(draftState);

  return { nextState: draftState, confirmationMessage };
}
