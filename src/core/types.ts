export type VoiceState =
  | 'standby'
  | 'wake_word_detected'
  | 'listening'
  | 'transcribing'
  | 'processing'
  | 'searching'
  | 'executing'
  | 'speaking'
  | 'interrupted'
  | 'completed'
  | 'error';

export type NavSection =
  | 'command-center'
  | 'ai-chat'
  | 'ai-core'
  | 'agents'
  | 'voice-assistant'
  | 'applications'
  | 'file-explorer'
  | 'browser-intelligence'
  | 'tasks-workflows'
  | 'system-monitor'
  | 'calendar'
  | 'memory'
  | 'chat-history'
  | 'settings';

export type AgentId =
  | 'core'
  | 'voice'
  | 'system'
  | 'file'
  | 'browser'
  | 'application'
  | 'vision'
  | 'media'
  | 'calendar'
  | 'memory'
  | 'automation';

export type AgentRunStatus = 'idle' | 'active' | 'completed' | 'disabled' | 'error';

export interface AgentDescriptor {
  id: AgentId;
  name: string;
  role: string;
  capabilities: string[];
  enabled: boolean;
  status: AgentRunStatus;
  lastAction?: string;
}

export interface SystemTelemetry {
  timestamp: string;
  cpuLoad: number;
  cpuTemp: number | null;
  cpuCores: number;
  cpuModel: string;
  gpuName: string;
  gpuUsage: number | null;
  gpuTemp: number | null;
  ramUsedGb: number;
  ramTotalGb: number;
  ramPercent: number;
  storageUsedGb: number;
  storageTotalGb: number;
  storagePercent: number;
  networkRxKbps: number;
  networkTxKbps: number;
  batteryPercent: number | null;
  batteryCharging: boolean | null;
  uptimeSeconds: number;
  platform: string;
  hostname: string;
}

export interface WeatherForecastDay {
  date: string;
  tempMax: number;
  tempMin: number;
  condition: string;
  code: number;
  precipProbMax?: number;
  uvMax?: number;
  sunrise?: string;
  sunset?: string;
  windSpeedMaxKmh?: number;
}

export interface WeatherHourlyPoint {
  time: string;
  temp: number;
  feelsLike: number;
  precipProb: number;
  windSpeedKmh: number;
  code: number;
  condition: string;
}

export interface WeatherAlertItem {
  id: string;
  title: string;
  severity: 'advisory' | 'watch' | 'warning';
  description: string;
  source: string;
  effective?: string;
  expires?: string;
}

export interface WeatherLocationMatch {
  name: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  label: string;
}

export interface WeatherData {
  location: string;
  latitude: number;
  longitude: number;
  temperature: number;
  condition: string;
  conditionCode?: number;
  humidity: number;
  windSpeedKmh: number;
  windDirectionDeg?: number;
  windDirectionLabel?: string;
  pressureHpa?: number;
  visibilityKm?: number;
  uvIndex?: number;
  precipitationMm?: number;
  cloudCover?: number;
  sunrise?: string;
  sunset?: string;
  feelsLike: number;
  updatedAt: string;
  forecast: WeatherForecastDay[];
  hourly?: WeatherHourlyPoint[];
  alerts?: WeatherAlertItem[];
  source: string;
  isCached?: boolean;
  cacheAgeMinutes?: number;
  unit?: 'celsius' | 'fahrenheit';
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  category: 'meeting' | 'reminder' | 'task' | 'focus';
  completed: boolean;
  notes?: string;
  createdAt: string;
}

export interface MemoryItem {
  id: string;
  category: 'profile' | 'preference' | 'project' | 'folder' | 'workflow';
  key: string;
  value: string;
  approved: boolean;
  updatedAt: string;
}

export interface ExecutionStep {
  id: string;
  agent: AgentId;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'requires_confirmation' | 'failed';
  detail?: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface PipelineTimings {
  engine: string;
  intentMs: number;
  toolMs: number;
  firstTokenMs: number;
  modelMs: number;
  totalMs: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  intent?: string;
  steps?: ExecutionStep[];
  sources?: GroundingSource[];
  timings?: PipelineTimings;
  pendingConfirmation?: {
    actionId: string;
    summary: string;
    actionType: string;
    payload: Record<string, unknown>;
  };
}

export interface ActionLogEntry {
  id: string;
  timestamp: string;
  agent: AgentId;
  action: string;
  target: string;
  status: 'completed' | 'blocked' | 'pending_confirmation' | 'failed';
  detail?: string;
}

export interface DesktopAppItem {
  id: string;
  name: string;
  category: 'browser' | 'development' | 'communication' | 'media' | 'productivity' | 'system';
  command: string;
  installed: boolean;
  pinned: boolean;
  lastUsed?: string;
  description: string;
}

export interface IndexedFileItem {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  extension: string;
  category: 'document' | 'code' | 'image' | 'video' | 'audio' | 'spreadsheet' | 'presentation' | 'other';
  sizeBytes: number;
  modifiedAt: string;
  createdAt: string;
  previewText?: string;
  matchReason?: string;
}

export interface RunningWindowInfo {
  id: number;
  name: string;
  title: string;
}

export type MediaControlAction =
  | 'play_pause'
  | 'next'
  | 'previous'
  | 'volume_up'
  | 'volume_down'
  | 'mute';

export interface AutomationWorkflow {
  id: string;
  name: string;
  description: string;
  triggerPhrase: string;
  steps: { agent: AgentId; action: string }[];
  enabled: boolean;
  lastRunAt?: string;
  runCount: number;
}

export type HologramMode = 'orbital' | 'neural-matrix' | 'telemetry-sphere' | 'exploded';

export type ResearchMode = 'web' | 'news' | 'docs' | 'video';

export interface HologramSettings {
  mode: HologramMode;
  projectionBeam: boolean;
  scanlineIntensity: number; // 0 to 1
  holoOpacity: number; // 0.3 to 1
  autoRotate: boolean;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
  state: string;
}

export interface WallpaperSettings {
  mode:
    | 'aurora-command'
    | 'neural-particles'
    | 'aurora-grid'
    | 'neural-horizon'
    | 'orbital-grid'
    | 'custom-video';
  customVideoUrl?: string;
  blurPx: number;
  brightnessPercent: number;
  opacityPercent: number;
  performanceMode: boolean;
}

export type AIModelPreference =
  | 'friday-cognitive'
  | 'friday-language-core'
  | 'local-auto'
  | 'local-core';

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  priority: 'low' | 'normal' | 'high';
  dueDate?: string;
  createdAt: string;
}

export interface ReminderItem {
  id: string;
  title: string;
  triggerDate: string;
  triggerTime: string;
  completed: boolean;
  createdAt: string;
}

export interface AssistantSettings {
  assistantName: string;
  userName: string;
  wakeWord: string;
  aiModel: AIModelPreference;
  ollamaModel?: string;
  responseLanguagePreference?: 'auto' | 'english' | 'hinglish' | 'hindi_simple';
  optInDatasetCollection?: boolean;
  voiceName: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  voiceGender: 'female' | 'male';
  speakingSpeed: number;
  speakingPitch: number;
  language: string;
  audioInputDeviceId?: string;
  continuousListening: boolean;
  wakeWordEnabled: boolean;
  autoSpeakReplies: boolean;
  pushToTalkKey: string;
  reopenShortcut: string;
  startFullscreen: boolean;
  launchOnStartup: boolean;
  themeAccent: 'cyan' | 'cobalt' | 'violet';
  animationQuality: 'high' | 'balanced' | 'low';
  weatherLocation: string;
  temperatureUnit?: 'celsius' | 'fahrenheit';
  favoriteWeatherLocations?: string[];
  weatherNotificationsEnabled?: boolean;
  allowedFolders: string[];
  pausedIndexing: boolean;
  screenCaptureConsent: boolean;
  wallpaper: WallpaperSettings;
  hologram: HologramSettings;
  enabledAgents: Record<AgentId, boolean>;
}

export interface FridayAndroidBridge {
  isAndroid?: () => boolean;
  getDeviceTelemetry?: () => string;
  speak?: (text: string, language: string, gender: string, rate: number, pitch: number) => boolean;
  stopSpeaking?: () => boolean;
  startListening?: (language: string, offlinePreferred: boolean) => boolean;
  stopListening?: () => boolean;
  openApp?: (appQuery: string) => string;
  openSettings?: (settingKey: string) => string;
  setFlashlight?: (enabled: boolean) => string;
  setAlarm?: (hour: number, minute: number, label: string) => string;
  prepareCallDialer?: (target: string, confirmed: boolean) => string;
  openCamera?: () => string;
  openGallery?: () => string;
  openMapsSearch?: (query: string) => string;
  mediaControl?: (action: string) => string;
  copyToClipboard?: (text: string) => string;
  shareText?: (text: string) => string;
  saveMemoryRecord?: (kind: string, payloadJson: string) => boolean;
  readMemoryRecords?: (kind: string) => string;
  searchWebPublic?: (query: string) => string;
  getNetworkOnline?: () => boolean;
}

export interface ApiConnectionStatus {
  connected: boolean;
  checking: boolean;
  provider: string;
  model: string;
  engine?: 'friday-cognitive' | 'friday-language-core' | 'local-core';
  freeWebReady?: boolean;
  requiresPaidKey?: boolean;
  latencyMs?: number;
  error?: string;
  cognitiveStats?: {
    memoryCount: number;
    customIntentCount: number;
    lexiconCount: number;
    knowledgeChunks: number;
    datasetSamples: number;
    languageCoreReady: boolean;
  };
}

export type DiagnosticStatus = 'pass' | 'fail' | 'warning' | 'unavailable';

export interface DiagnosticCheckItem {
  id: string;
  category: string;
  name: string;
  expected: string;
  actual: string;
  status: DiagnosticStatus;
  durationMs: number;
  error?: string;
  recommendation?: string;
  checkedAt: string;
}

export interface HardwareCompatibilityAudit {
  timestamp: string;
  osName: string;
  osEdition: string;
  osVersion: string;
  platform: string;
  arch: string;
  isWindows: boolean;
  windowsCompatible: boolean;
  nodeVersion: string;
  cpuModel: string;
  cpuCores: number;
  cpuSpeedGhz: number | null;
  gpuName: string;
  gpuVendor: string;
  gpuVramMb: number | null;
  gpuDriver: string | null;
  ramTotalGb: number;
  ramAvailableGb: number;
  storageTotalGb: number;
  storageFreeGb: number;
  storageType: string;
  networkAvailable: boolean;
  hasApiKey: boolean;
  electronConfigured: boolean;
  securityPosture: {
    contextIsolation: boolean;
    nodeIntegrationDisabled: boolean;
    folderSandboxActive: boolean;
    apiKeyServerOnly: boolean;
  };
  optimizationProfile: 'standard-16gb' | 'high-spec' | 'low-power';
}

export interface DiagnosticsReportPayload {
  generatedAt: string;
  environment: string;
  summary: {
    total: number;
    pass: number;
    warning: number;
    fail: number;
    unavailable: number;
  };
  audit: HardwareCompatibilityAudit;
  checks: DiagnosticCheckItem[];
}

export interface DesktopVoiceCapabilities {
  platform: string;
  offlineSttReady: boolean;
  recognizers: string[];
  ttsVoices: string[];
  micAccessStatus: string;
}

export interface DesktopSpeechRecognitionResult {
  ok: boolean;
  text: string;
  engine: string;
  recognizerCulture?: string;
  error?: string;
  errorCode?: string;
}

export interface DesktopAppLaunchResult {
  launched: boolean;
  alreadyRunning?: boolean;
  resolvedTarget?: string;
  message: string;
  errorCode?: string;
}

export interface FridayDesktopBridge {
  hideToDesktop: () => Promise<{ hidden: boolean }>;
  restoreWindow: () => Promise<{ visible: boolean }>;
  minimizeWindow?: () => Promise<{ minimized: boolean }>;
  toggleMaximize?: () => Promise<{ maximized: boolean }>;
  setFullscreen?: (enabled: boolean) => Promise<unknown>;
  setFloatingMode?: (enabled: boolean) => Promise<unknown>;
  setStartupLaunch?: (enabled: boolean) => Promise<unknown>;
  updateReopenShortcut?: (shortcut: string) => Promise<{ registered: boolean; shortcut: string }>;
  getDesktopState?: () => Promise<{
    fullscreen: boolean;
    maximized: boolean;
    floatingMode: boolean;
    reopenShortcut: string;
    openAtLogin: boolean;
  }>;
  quitApp?: () => Promise<{ quitting: boolean }>;
  getVoiceCapabilities?: () => Promise<DesktopVoiceCapabilities>;
  requestMicPermission?: () => Promise<{ granted: boolean; status: string; detail: string }>;
  recognizeSpeechWav?: (payload: {
    wavBase64: string;
    language: string;
  }) => Promise<DesktopSpeechRecognitionResult>;
  speakWindowsTts?: (payload: {
    text: string;
    language: string;
    gender: string;
    rate: number;
    pitch: number;
  }) => Promise<{ ok: boolean; detail?: string }>;
  stopWindowsTts?: () => Promise<{ stopped: boolean }>;
  launchApp?: (target: string) => Promise<DesktopAppLaunchResult>;
  openWebsite?: (urlOrAlias: string) => Promise<{ opened: boolean; url?: string; message: string }>;
  openFolder?: (folderNameOrPath: string) => Promise<{ opened: boolean; path?: string; message: string }>;
  getActiveWindow?: () => Promise<{ ok: boolean; pid?: number; processName?: string; title?: string; detail: string }>;
  inspectScreenUi?: (processFilter?: string) => Promise<{ ok: boolean; text?: string; detail: string }>;
  getWindowsDiagnostics?: () => Promise<Record<string, unknown>>;
  onStopSpeech?: (callback: () => void) => () => void;
  isDesktopShell: boolean;
}


