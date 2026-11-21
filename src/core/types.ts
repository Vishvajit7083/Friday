export type VoiceState =
  | 'standby'
  | 'listening'
  | 'processing'
  | 'searching'
  | 'executing'
  | 'speaking'
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
}

export interface WeatherData {
  location: string;
  latitude: number;
  longitude: number;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeedKmh: number;
  feelsLike: number;
  updatedAt: string;
  forecast: WeatherForecastDay[];
  source: string;
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  intent?: string;
  steps?: ExecutionStep[];
  sources?: GroundingSource[];
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
}

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

export interface AssistantSettings {
  assistantName: string;
  userName: string;
  wakeWord: string;
  aiModel: 'gemini-4-hydrogen' | 'gemini-4-neon' | 'gemini-3.1-flash-lite';
  voiceName: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  voiceGender: 'female' | 'male';
  speakingSpeed: number;
  language: string;
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
  allowedFolders: string[];
  pausedIndexing: boolean;
  screenCaptureConsent: boolean;
  wallpaper: WallpaperSettings;
  hologram: HologramSettings;
  enabledAgents: Record<AgentId, boolean>;
}

export interface ApiConnectionStatus {
  connected: boolean;
  checking: boolean;
  provider: string;
  model: string;
  latencyMs?: number;
  error?: string;
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

