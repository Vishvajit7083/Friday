import type {
  AssistantSettings,
  CalendarEvent,
  DiagnosticCheckItem,
  DiagnosticsReportPayload,
  MemoryItem,
} from './types';

export function summarizeDiagnostics(checks: DiagnosticCheckItem[]) {
  return checks.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.status] += 1;
      return acc;
    },
    { total: 0, pass: 0, warning: 0, fail: 0, unavailable: 0 }
  );
}

export function determineOptimizationProfile(
  ramTotalGb: number,
  cpuCores: number
): 'standard-16gb' | 'high-spec' | 'low-power' {
  if (ramTotalGb > 0 && ramTotalGb < 8) return 'low-power';
  if (cpuCores > 0 && cpuCores <= 2) return 'low-power';
  if (ramTotalGb >= 24 && cpuCores >= 8) return 'high-spec';
  return 'standard-16gb';
}

export function formatTestReportMarkdown(report: DiagnosticsReportPayload): string {
  const { audit, summary, checks } = report;
  const escapeCell = (val?: string) =>
    String(val ?? '—')
      .replace(/\|/g, '\\|')
      .replace(/\r?\n/g, ' ')
      .trim();

  const headerLines = [
    '# F.R.I.D.A.Y. — Automated Diagnostics & Windows Compatibility Test Report (`TEST_REPORT.md`)',
    '',
    `- **Test Date:** ${report.generatedAt}`,
    `- **Environment:** ${report.environment}`,
    `- **OS / Architecture:** ${audit.osName} ${audit.osVersion} (${audit.arch})`,
    `- **Node.js Version:** ${audit.nodeVersion}`,
    `- **Hardware:** ${audit.cpuModel} (${audit.cpuCores} cores) · ${audit.ramTotalGb} GB RAM · ${audit.gpuName}`,
    `- **Optimization Profile:** ${audit.optimizationProfile}`,
    `- **Summary:** ${summary.pass} Passed · ${summary.warning} Warnings · ${summary.unavailable} Unavailable · ${summary.fail} Failed (Total ${summary.total})`,
    '',
    '## Test Results',
    '',
    '| Test Name | Test Date | Environment | Expected Result | Actual Result | Status | Error Details | Fix Recommendation |',
    '|---|---|---|---|---|---|---|---|',
  ];

  const rows = checks.map((c) =>
    [
      escapeCell(c.name),
      escapeCell(c.checkedAt),
      escapeCell(report.environment),
      escapeCell(c.expected),
      escapeCell(c.actual),
      escapeCell(c.status.toUpperCase()),
      escapeCell(c.error || 'None'),
      escapeCell(c.recommendation || 'None'),
    ]
      .join(' | ')
      .replace(/^/, '| ')
      .concat(' |')
  );

  return [...headerLines, ...rows, ''].join('\n');
}

const VALID_CALENDAR_CATEGORIES = new Set<CalendarEvent['category']>([
  'meeting',
  'reminder',
  'task',
  'focus',
]);

export function sanitizeCalendarPatch(input: unknown): Partial<CalendarEvent> {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const patch: Partial<CalendarEvent> = {};
  if (typeof raw.title === 'string' && raw.title.trim()) patch.title = raw.title.trim().slice(0, 160);
  if (typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) patch.date = raw.date;
  if (typeof raw.time === 'string' && /^\d{2}:\d{2}$/.test(raw.time)) patch.time = raw.time;
  if (typeof raw.category === 'string' && VALID_CALENDAR_CATEGORIES.has(raw.category as CalendarEvent['category'])) {
    patch.category = raw.category as CalendarEvent['category'];
  }
  if (typeof raw.completed === 'boolean') patch.completed = raw.completed;
  if (typeof raw.notes === 'string') patch.notes = raw.notes.trim().slice(0, 500);
  return patch;
}

const VALID_MEMORY_CATEGORIES = new Set<MemoryItem['category']>([
  'profile',
  'preference',
  'project',
  'folder',
  'workflow',
]);

export function sanitizeMemoryPatch(input: unknown): Partial<MemoryItem> {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const patch: Partial<MemoryItem> = {};
  if (typeof raw.category === 'string' && VALID_MEMORY_CATEGORIES.has(raw.category as MemoryItem['category'])) {
    patch.category = raw.category as MemoryItem['category'];
  }
  if (typeof raw.key === 'string' && raw.key.trim()) patch.key = raw.key.trim().slice(0, 120);
  if (typeof raw.value === 'string' && raw.value.trim()) patch.value = raw.value.trim().slice(0, 1000);
  return patch;
}

const VALID_MODELS = new Set<AssistantSettings['aiModel']>([
  'local-auto',
  'ollama',
  'local-core',
  'gemini-4-hydrogen',
  'gemini-4-neon',
  'gemini-3.1-flash-lite',
]);

const VALID_VOICES = new Set<AssistantSettings['voiceName']>([
  'Kore',
  'Puck',
  'Charon',
  'Fenrir',
  'Zephyr',
]);

export function sanitizeSettingsPatch(
  input: unknown,
  current: AssistantSettings
): AssistantSettings {
  if (!input || typeof input !== 'object') return current;
  const raw = input as Record<string, unknown>;
  const next: AssistantSettings = structuredClone(current);

  if (typeof raw.userName === 'string' && raw.userName.trim()) {
    next.userName = raw.userName.trim().slice(0, 60);
  }
  if (typeof raw.wakeWord === 'string' && raw.wakeWord.trim()) {
    next.wakeWord = raw.wakeWord.trim().slice(0, 40);
  }
  if (typeof raw.aiModel === 'string' && VALID_MODELS.has(raw.aiModel as AssistantSettings['aiModel'])) {
    next.aiModel = raw.aiModel as AssistantSettings['aiModel'];
  }
  if (typeof raw.ollamaModel === 'string') {
    const trimmed = raw.ollamaModel.trim();
    if (trimmed === '' || /^[a-zA-Z0-9._:/-]{1,64}$/.test(trimmed)) {
      next.ollamaModel = trimmed;
    }
  }
  if (typeof raw.voiceName === 'string' && VALID_VOICES.has(raw.voiceName as AssistantSettings['voiceName'])) {
    next.voiceName = raw.voiceName as AssistantSettings['voiceName'];
  }
  if (raw.voiceGender === 'female' || raw.voiceGender === 'male') {
    next.voiceGender = raw.voiceGender;
  }
  if (typeof raw.speakingSpeed === 'number' && Number.isFinite(raw.speakingSpeed)) {
    next.speakingSpeed = Math.min(1.6, Math.max(0.65, raw.speakingSpeed));
  }
  if (typeof raw.language === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(raw.language)) {
    next.language = raw.language;
  }
  if (typeof raw.continuousListening === 'boolean') next.continuousListening = raw.continuousListening;
  if (typeof raw.wakeWordEnabled === 'boolean') next.wakeWordEnabled = raw.wakeWordEnabled;
  if (typeof raw.autoSpeakReplies === 'boolean') next.autoSpeakReplies = raw.autoSpeakReplies;
  if (typeof raw.reopenShortcut === 'string' && raw.reopenShortcut.trim()) {
    next.reopenShortcut = raw.reopenShortcut.trim().slice(0, 32);
  }
  if (typeof raw.startFullscreen === 'boolean') next.startFullscreen = raw.startFullscreen;
  if (typeof raw.launchOnStartup === 'boolean') next.launchOnStartup = raw.launchOnStartup;
  if (raw.animationQuality === 'high' || raw.animationQuality === 'balanced' || raw.animationQuality === 'low') {
    next.animationQuality = raw.animationQuality;
  }
  if (typeof raw.weatherLocation === 'string' && raw.weatherLocation.trim()) {
    next.weatherLocation = raw.weatherLocation.trim().slice(0, 80);
  }
  if (Array.isArray(raw.allowedFolders)) {
    const clean = raw.allowedFolders
      .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
      .map((f) => f.trim())
      .slice(0, 20);
    if (clean.length > 0) next.allowedFolders = clean;
  }
  if (typeof raw.pausedIndexing === 'boolean') next.pausedIndexing = raw.pausedIndexing;
  if (typeof raw.screenCaptureConsent === 'boolean') next.screenCaptureConsent = raw.screenCaptureConsent;

  if (raw.wallpaper && typeof raw.wallpaper === 'object') {
    const w = raw.wallpaper as Record<string, unknown>;
    if (
      w.mode === 'aurora-command' ||
      w.mode === 'neural-particles' ||
      w.mode === 'aurora-grid' ||
      w.mode === 'neural-horizon' ||
      w.mode === 'orbital-grid' ||
      w.mode === 'custom-video'
    ) {
      next.wallpaper.mode = w.mode;
    }
    if (typeof w.customVideoUrl === 'string' && /^(blob:|https?:\/\/|\/)/.test(w.customVideoUrl)) {
      next.wallpaper.customVideoUrl = w.customVideoUrl;
    }
    if (typeof w.blurPx === 'number' && Number.isFinite(w.blurPx)) {
      next.wallpaper.blurPx = Math.min(24, Math.max(0, w.blurPx));
    }
    if (typeof w.brightnessPercent === 'number' && Number.isFinite(w.brightnessPercent)) {
      next.wallpaper.brightnessPercent = Math.min(140, Math.max(20, w.brightnessPercent));
    }
    if (typeof w.opacityPercent === 'number' && Number.isFinite(w.opacityPercent)) {
      next.wallpaper.opacityPercent = Math.min(100, Math.max(15, w.opacityPercent));
    }
    if (typeof w.performanceMode === 'boolean') next.wallpaper.performanceMode = w.performanceMode;
  }

  if (raw.hologram && typeof raw.hologram === 'object') {
    const h = raw.hologram as Record<string, unknown>;
    if (
      h.mode === 'orbital' ||
      h.mode === 'neural-matrix' ||
      h.mode === 'telemetry-sphere' ||
      h.mode === 'exploded'
    ) {
      next.hologram.mode = h.mode;
    }
    if (typeof h.projectionBeam === 'boolean') next.hologram.projectionBeam = h.projectionBeam;
    if (typeof h.scanlineIntensity === 'number' && Number.isFinite(h.scanlineIntensity)) {
      next.hologram.scanlineIntensity = Math.min(1, Math.max(0, h.scanlineIntensity));
    }
    if (typeof h.holoOpacity === 'number' && Number.isFinite(h.holoOpacity)) {
      next.hologram.holoOpacity = Math.min(1, Math.max(0.2, h.holoOpacity));
    }
    if (typeof h.autoRotate === 'boolean') next.hologram.autoRotate = h.autoRotate;
  }

  if (raw.enabledAgents && typeof raw.enabledAgents === 'object') {
    const ea = raw.enabledAgents as Record<string, unknown>;
    for (const k of Object.keys(next.enabledAgents) as Array<keyof typeof next.enabledAgents>) {
      if (typeof ea[k] === 'boolean') {
        next.enabledAgents[k] = ea[k] as boolean;
      }
    }
  }

  return next;
}
