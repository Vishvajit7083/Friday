import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile, spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import type {
  DesktopAppLaunchResult,
  DesktopSpeechRecognitionResult,
  DesktopVoiceCapabilities,
  MediaControlAction,
} from '../src/core/types.ts';

const execFileAsync = promisify(execFile);

const SAFE_PROCESS_NAME = /^[a-zA-Z0-9._ -]+$/;
const SAFE_COMMAND_OR_APPID = /^[a-zA-Z0-9._:\\/\s!()-]+$/;

const MEDIA_VK_MAP: Record<MediaControlAction, number> = {
  play_pause: 0xb3, // VK_MEDIA_PLAY_PAUSE
  next: 0xb0, // VK_MEDIA_NEXT_TRACK
  previous: 0xb1, // VK_MEDIA_PREV_TRACK
  volume_up: 0xaf, // VK_VOLUME_UP
  volume_down: 0xae, // VK_VOLUME_DOWN
  mute: 0xad, // VK_VOLUME_MUTE
};

interface WindowsCatalogEntry {
  displayName: string;
  exeNames: string[];
  candidatePaths: () => string[];
  appIdHints?: string[];
  settingsUri?: string;
  fallbackWebsite?: string;
}

function getEnvDirs() {
  return {
    programFiles: process.env.ProgramFiles || 'C:\\Program Files',
    programFilesX86: process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    localAppData: process.env.LocalAppData || path.join(os.homedir(), 'AppData', 'Local'),
    appData: process.env.AppData || path.join(os.homedir(), 'AppData', 'Roaming'),
    systemRoot: process.env.SystemRoot || 'C:\\Windows',
  };
}

const WINDOWS_APP_CATALOG: Record<string, WindowsCatalogEntry> = {
  chrome: {
    displayName: 'Google Chrome',
    exeNames: ['chrome.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [
        path.join(d.programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(d.programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(d.localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ];
    },
    appIdHints: ['google chrome', 'chrome'],
  },
  edge: {
    displayName: 'Microsoft Edge',
    exeNames: ['msedge.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [
        path.join(d.programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(d.programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ];
    },
    appIdHints: ['microsoft edge', 'msedge'],
  },
  notepad: {
    displayName: 'Notepad',
    exeNames: ['notepad.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [
        path.join(d.systemRoot, 'System32', 'notepad.exe'),
        path.join(d.systemRoot, 'notepad.exe'),
      ];
    },
    appIdHints: ['notepad'],
  },
  calculator: {
    displayName: 'Calculator',
    exeNames: ['calc.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [path.join(d.systemRoot, 'System32', 'calc.exe')];
    },
    appIdHints: ['calculator'],
  },
  explorer: {
    displayName: 'File Explorer',
    exeNames: ['explorer.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [path.join(d.systemRoot, 'explorer.exe')];
    },
    appIdHints: ['file explorer'],
  },
  cmd: {
    displayName: 'Command Prompt',
    exeNames: ['cmd.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [path.join(d.systemRoot, 'System32', 'cmd.exe')];
    },
    appIdHints: ['command prompt'],
  },
  powershell: {
    displayName: 'Windows PowerShell',
    exeNames: ['pwsh.exe', 'powershell.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [
        path.join(d.programFiles, 'PowerShell', '7', 'pwsh.exe'),
        path.join(d.systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ];
    },
    appIdHints: ['powershell'],
  },
  wt: {
    displayName: 'Windows Terminal',
    exeNames: ['wt.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [path.join(d.localAppData, 'Microsoft', 'WindowsApps', 'wt.exe')];
    },
    appIdHints: ['terminal', 'windows terminal'],
  },
  settings: {
    displayName: 'Windows Settings',
    exeNames: [],
    candidatePaths: () => [],
    settingsUri: 'ms-settings:',
    appIdHints: ['settings'],
  },
  taskmgr: {
    displayName: 'Task Manager',
    exeNames: ['taskmgr.exe', 'Taskmgr.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [path.join(d.systemRoot, 'System32', 'Taskmgr.exe')];
    },
    appIdHints: ['task manager'],
  },
  paint: {
    displayName: 'Paint',
    exeNames: ['mspaint.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [path.join(d.systemRoot, 'System32', 'mspaint.exe')];
    },
    appIdHints: ['paint'],
  },
  code: {
    displayName: 'Visual Studio Code',
    exeNames: ['Code.exe', 'code.cmd'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [
        path.join(d.localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe'),
        path.join(d.programFiles, 'Microsoft VS Code', 'Code.exe'),
        path.join(d.programFilesX86, 'Microsoft VS Code', 'Code.exe'),
      ];
    },
    appIdHints: ['visual studio code'],
  },
  studio64: {
    displayName: 'Android Studio',
    exeNames: ['studio64.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [
        path.join(d.programFiles, 'Android', 'Android Studio', 'bin', 'studio64.exe'),
        path.join(d.localAppData, 'Programs', 'Android Studio', 'bin', 'studio64.exe'),
      ];
    },
    appIdHints: ['android studio'],
  },
  whatsapp: {
    displayName: 'WhatsApp Desktop',
    exeNames: ['WhatsApp.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [path.join(d.localAppData, 'WhatsApp', 'WhatsApp.exe')];
    },
    appIdHints: ['whatsapp'],
    fallbackWebsite: 'https://web.whatsapp.com',
  },
  telegram: {
    displayName: 'Telegram Desktop',
    exeNames: ['Telegram.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [path.join(d.appData, 'Telegram Desktop', 'Telegram.exe')];
    },
    appIdHints: ['telegram'],
    fallbackWebsite: 'https://web.telegram.org',
  },
  spotify: {
    displayName: 'Spotify',
    exeNames: ['Spotify.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [path.join(d.appData, 'Spotify', 'Spotify.exe')];
    },
    appIdHints: ['spotify'],
    fallbackWebsite: 'https://open.spotify.com',
  },
  vlc: {
    displayName: 'VLC Media Player',
    exeNames: ['vlc.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [
        path.join(d.programFiles, 'VideoLAN', 'VLC', 'vlc.exe'),
        path.join(d.programFilesX86, 'VideoLAN', 'VLC', 'vlc.exe'),
      ];
    },
    appIdHints: ['vlc'],
  },
  winword: {
    displayName: 'Microsoft Word',
    exeNames: ['WINWORD.EXE'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [
        path.join(d.programFiles, 'Microsoft Office', 'root', 'Office16', 'WINWORD.EXE'),
        path.join(d.programFilesX86, 'Microsoft Office', 'root', 'Office16', 'WINWORD.EXE'),
      ];
    },
    appIdHints: ['word', 'microsoft word'],
  },
  excel: {
    displayName: 'Microsoft Excel',
    exeNames: ['EXCEL.EXE'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [
        path.join(d.programFiles, 'Microsoft Office', 'root', 'Office16', 'EXCEL.EXE'),
        path.join(d.programFilesX86, 'Microsoft Office', 'root', 'Office16', 'EXCEL.EXE'),
      ];
    },
    appIdHints: ['excel', 'microsoft excel'],
  },
  powerpnt: {
    displayName: 'Microsoft PowerPoint',
    exeNames: ['POWERPNT.EXE'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [
        path.join(d.programFiles, 'Microsoft Office', 'root', 'Office16', 'POWERPNT.EXE'),
        path.join(d.programFilesX86, 'Microsoft Office', 'root', 'Office16', 'POWERPNT.EXE'),
      ];
    },
    appIdHints: ['powerpoint', 'microsoft powerpoint'],
  },
  'notepad++': {
    displayName: 'Notepad++',
    exeNames: ['notepad++.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [
        path.join(d.programFiles, 'Notepad++', 'notepad++.exe'),
        path.join(d.programFilesX86, 'Notepad++', 'notepad++.exe'),
      ];
    },
    appIdHints: ['notepad++'],
  },
  devenv: {
    displayName: 'Visual Studio',
    exeNames: ['devenv.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [
        path.join(d.programFiles, 'Microsoft Visual Studio', '2022', 'Community', 'Common7', 'IDE', 'devenv.exe'),
        path.join(d.programFiles, 'Microsoft Visual Studio', '2022', 'Professional', 'Common7', 'IDE', 'devenv.exe'),
      ];
    },
    appIdHints: ['visual studio 2022', 'visual studio'],
  },
  discord: {
    displayName: 'Discord',
    exeNames: ['Discord.exe'],
    candidatePaths: () => {
      const d = getEnvDirs();
      return [path.join(d.localAppData, 'Discord', 'Update.exe')];
    },
    appIdHints: ['discord'],
    fallbackWebsite: 'https://discord.com/app',
  },
};

const ALIAS_TO_CATALOG_KEY: Array<{ rx: RegExp; key: string }> = [
  { rx: /\b(google\s*chrome|google-chrome|chrome)\b/i, key: 'chrome' },
  { rx: /\b(microsoft\s*edge|msedge|edge)\b/i, key: 'edge' },
  { rx: /\b(vs\s*code|vscode|visual\s*studio\s*code|code)\b/i, key: 'code' },
  { rx: /\b(visual\s*studio|devenv)\b/i, key: 'devenv' },
  { rx: /\b(notepad\+\+|notepad\s*plus\s*plus)\b/i, key: 'notepad++' },
  { rx: /\b(microsoft\s*word|ms\s*word|winword|word)\b/i, key: 'winword' },
  { rx: /\b(microsoft\s*excel|ms\s*excel|excel)\b/i, key: 'excel' },
  { rx: /\b(microsoft\s*powerpoint|ms\s*powerpoint|powerpoint|powerpnt)\b/i, key: 'powerpnt' },
  { rx: /\b(android\s*studio|studio64)\b/i, key: 'studio64' },
  { rx: /\b(file\s*explorer|explorer)\b/i, key: 'explorer' },
  { rx: /\b(command\s*prompt|cmd)\b/i, key: 'cmd' },
  { rx: /\b(powershell|pwsh)\b/i, key: 'powershell' },
  { rx: /\b(windows\s*terminal|wt|terminal)\b/i, key: 'wt' },
  { rx: /\b(windows\s*settings|settings)\b/i, key: 'settings' },
  { rx: /\b(task\s*manager|taskmgr)\b/i, key: 'taskmgr' },
  { rx: /\b(calculator|calc)\b/i, key: 'calculator' },
  { rx: /\b(notepad)\b/i, key: 'notepad' },
  { rx: /\b(paint|mspaint)\b/i, key: 'paint' },
  { rx: /\b(whatsapp)\b/i, key: 'whatsapp' },
  { rx: /\b(telegram)\b/i, key: 'telegram' },
  { rx: /\b(spotify)\b/i, key: 'spotify' },
  { rx: /\b(vlc)\b/i, key: 'vlc' },
  { rx: /\b(discord)\b/i, key: 'discord' },
];

const WEBSITE_ALIASES: Record<string, { label: string; url: string }> = {
  youtube: { label: 'YouTube', url: 'https://www.youtube.com' },
  google: { label: 'Google', url: 'https://www.google.com' },
  github: { label: 'GitHub', url: 'https://github.com' },
  gmail: { label: 'Gmail', url: 'https://mail.google.com' },
  notion: { label: 'Notion', url: 'https://www.notion.so' },
  wikipedia: { label: 'Wikipedia', url: 'https://www.wikipedia.org' },
  instagram: { label: 'Instagram', url: 'https://www.instagram.com' },
  facebook: { label: 'Facebook', url: 'https://www.facebook.com' },
};

const SAFE_SETTINGS_URIS: Record<string, string> = {
  wifi: 'ms-settings:network-wifi',
  'wi-fi': 'ms-settings:network-wifi',
  bluetooth: 'ms-settings:bluetooth',
  display: 'ms-settings:display',
  sound: 'ms-settings:sound',
  volume: 'ms-settings:sound',
  microphone: 'ms-settings:privacy-microphone',
  battery: 'ms-settings:batterysaver',
  notifications: 'ms-settings:notifications',
  apps: 'ms-settings:appsfeatures',
  windows: 'ms-settings:',
  settings: 'ms-settings:',
};

let activeSapiSpeechProcess: ChildProcess | null = null;

function normalizeAppLookupKey(raw: string): string | null {
  const clean = raw.trim().toLowerCase();
  const matched = ALIAS_TO_CATALOG_KEY.find((a) => a.rx.test(clean));
  return matched ? matched.key : null;
}

async function whereExecutable(exeName: string): Promise<string | null> {
  if (process.platform !== 'win32' || !/^[a-zA-Z0-9._-]+$/.test(exeName)) return null;
  try {
    const { stdout } = await execFileAsync('where.exe', [exeName], { timeout: 1800 });
    const first = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && fs.existsSync(l));
    return first || null;
  } catch {
    return null;
  }
}

async function lookupWindowsAppPathsRegistry(exeName: string): Promise<string | null> {
  if (process.platform !== 'win32' || !/^[a-zA-Z0-9._-]+$/.test(exeName)) return null;
  const script = `
    $exe = '${exeName}';
    $keys = @(
      "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\$exe",
      "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\$exe"
    );
    foreach ($k in $keys) {
      if (Test-Path $k) {
        $p = (Get-ItemProperty -Path $k -ErrorAction SilentlyContinue).'(default)';
        if ($p) {
          $p = $p.Trim('"');
          if (Test-Path $p) { Write-Output $p; break }
        }
      }
    }
  `;
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      timeout: 2500,
    });
    const found = stdout.trim().split(/\r?\n/)[0]?.trim();
    return found && fs.existsSync(found) ? found : null;
  } catch {
    return null;
  }
}

function spawnVerifiedExecutable(
  executablePath: string,
  args: string[]
): Promise<{ started: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (started: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      resolve({ started, error });
    };

    try {
      const child = spawn(executablePath, args, {
        detached: true,
        stdio: 'ignore',
        shell: false,
      });

      child.once('error', (err) => {
        finish(false, err.message);
      });

      child.once('exit', (code) => {
        if (!settled && code !== null && code !== 0) {
          finish(false, `Process exited immediately with code ${code}`);
        }
      });

      child.unref();
      setTimeout(() => finish(true), 220);
    } catch (err) {
      finish(false, (err as Error).message);
    }
  });
}

export async function discoverWindowsStartApps(): Promise<Array<{ name: string; appId: string }>> {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-Command', 'Get-StartApps | Select-Object -First 120 Name, AppID | ConvertTo-Json'],
      { timeout: 6000 }
    );
    const parsed = JSON.parse(stdout || '[]');
    const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return rows
      .filter((item) => item?.Name && item?.AppID)
      .map((item) => ({ name: String(item.Name), appId: String(item.AppID) }));
  } catch {
    return [];
  }
}

export async function resolveWindowsExecutableForKey(catalogKey: string): Promise<{
  exePath: string | null;
  settingsUri?: string;
  appId?: string;
  displayName: string;
}> {
  const entry = WINDOWS_APP_CATALOG[catalogKey];
  if (!entry) {
    return { exePath: null, displayName: catalogKey };
  }
  if (entry.settingsUri) {
    return { exePath: null, settingsUri: entry.settingsUri, displayName: entry.displayName };
  }

  for (const candidate of entry.candidatePaths()) {
    if (fs.existsSync(candidate)) {
      return { exePath: candidate, displayName: entry.displayName };
    }
  }

  for (const exeName of entry.exeNames) {
    const foundWhere = await whereExecutable(exeName);
    if (foundWhere) return { exePath: foundWhere, displayName: entry.displayName };
  }

  for (const exeName of entry.exeNames) {
    const regPath = await lookupWindowsAppPathsRegistry(exeName);
    if (regPath) return { exePath: regPath, displayName: entry.displayName };
  }

  if (entry.appIdHints && entry.appIdHints.length > 0) {
    const startApps = await discoverWindowsStartApps();
    const match = startApps.find((sa) =>
      entry.appIdHints!.some((h) => sa.name.toLowerCase().includes(h.toLowerCase()))
    );
    if (match) {
      return { exePath: null, appId: match.appId, displayName: entry.displayName };
    }
  }

  return { exePath: null, displayName: entry.displayName };
}

export async function isWindowsAppAvailable(commandOrName: string): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  const catalogKey = normalizeAppLookupKey(commandOrName);
  if (catalogKey) {
    const resolved = await resolveWindowsExecutableForKey(catalogKey);
    return Boolean(resolved.exePath || resolved.settingsUri || resolved.appId);
  }
  if (commandOrName.includes('!')) return true;
  if (/^[a-zA-Z0-9._-]+$/.test(commandOrName)) {
    return Boolean(await whereExecutable(commandOrName));
  }
  return false;
}

export function normalizeSafeWebsiteUrl(rawInput: string): { label: string; url: string } | null {
  const clean = rawInput.trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();

  for (const [alias, meta] of Object.entries(WEBSITE_ALIASES)) {
    if (lower === alias || lower.includes(alias)) {
      return meta;
    }
  }

  const urlMatch = clean.match(/(https?:\/\/[^\s"'<>]+|[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s"'<>]*)?)/i);
  if (!urlMatch) return null;

  let candidate = urlMatch[1];
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return { label: parsed.hostname, url: parsed.toString() };
  } catch {
    return null;
  }
}

export async function openWindowsWebsite(
  urlOrAlias: string,
  preferredBrowser?: 'chrome' | 'edge'
): Promise<{ opened: boolean; url?: string; message: string }> {
  const resolved = normalizeSafeWebsiteUrl(urlOrAlias);
  if (!resolved) {
    return { opened: false, message: `Invalid or unsafe website address "${urlOrAlias}".` };
  }

  if (process.platform !== 'win32') {
    return {
      opened: false,
      url: resolved.url,
      message: `Prepared URL ${resolved.url}. Native Windows browser launch requires a live Windows desktop session.`,
    };
  }

  if (preferredBrowser) {
    const browserResolved = await resolveWindowsExecutableForKey(preferredBrowser);
    if (browserResolved.exePath) {
      const spawnRes = await spawnVerifiedExecutable(browserResolved.exePath, [resolved.url]);
      if (spawnRes.started) {
        return {
          opened: true,
          url: resolved.url,
          message: `Opened ${resolved.label} (${resolved.url}) in ${browserResolved.displayName}.`,
        };
      }
    }
  }

  // Use Windows Shell URL handler (never cmd.exe /c start with arbitrary shell strings)
  const spawnRes = await spawnVerifiedExecutable('rundll32.exe', ['url.dll,FileProtocolHandler', resolved.url]);
  if (spawnRes.started) {
    return {
      opened: true,
      url: resolved.url,
      message: `Opened ${resolved.label} (${resolved.url}) in your default Windows browser.`,
    };
  }

  return {
    opened: false,
    url: resolved.url,
    message: `Failed to open ${resolved.url}: ${spawnRes.error || 'Windows URL handler error'}.`,
  };
}

export async function openWindowsFolder(
  folderQuery: string,
  allowedFolders: string[] = []
): Promise<{ opened: boolean; path?: string; message: string }> {
  const lower = folderQuery.toLowerCase();
  const home = os.homedir();
  const namedFolders: Array<{ rx: RegExp; dir: string; label: string }> = [
    { rx: /\bdownloads?\b/i, dir: path.join(home, 'Downloads'), label: 'Downloads' },
    { rx: /\bdesktop\b/i, dir: path.join(home, 'Desktop'), label: 'Desktop' },
    { rx: /\bdocuments?\b/i, dir: path.join(home, 'Documents'), label: 'Documents' },
    { rx: /\bpictures?\b/i, dir: path.join(home, 'Pictures'), label: 'Pictures' },
    { rx: /\bvideos?\b/i, dir: path.join(home, 'Videos'), label: 'Videos' },
    { rx: /\bmusic\b/i, dir: path.join(home, 'Music'), label: 'Music' },
    { rx: /\b(home|user\s+folder)\b/i, dir: home, label: 'Home' },
    { rx: /\bworkspace\b/i, dir: process.cwd(), label: 'Workspace' },
  ];

  let targetDir: string | null = null;
  let targetLabel = folderQuery;

  const named = namedFolders.find((n) => n.rx.test(lower));
  if (named) {
    targetDir = named.dir;
    targetLabel = named.label;
  } else {
    const winPathMatch = folderQuery.match(/([a-zA-Z]:\\[^\n\r"'<>|]+)/);
    if (winPathMatch) {
      const candidate = path.resolve(winPathMatch[1].trim());
      const permitted =
        candidate === home ||
        candidate.startsWith(home + path.sep) ||
        allowedFolders.some((f) => {
          const r = path.resolve(f);
          return candidate === r || candidate.startsWith(r + path.sep);
        });
      if (permitted) {
        targetDir = candidate;
        targetLabel = candidate;
      } else {
        return {
          opened: false,
          message: `Folder "${candidate}" is outside permitted user folders. Grant access in Settings -> File Permissions first.`,
        };
      }
    }
  }

  if (!targetDir) {
    return { opened: false, message: `Could not identify target folder in "${folderQuery}".` };
  }

  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    return {
      opened: false,
      path: targetDir,
      message: `Folder "${targetDir}" does not exist on this system.`,
    };
  }

  if (process.platform !== 'win32') {
    return {
      opened: false,
      path: targetDir,
      message: `Verified folder "${targetDir}". File Explorer GUI requires a Windows desktop session.`,
    };
  }

  const explorerPath = path.join(getEnvDirs().systemRoot, 'explorer.exe');
  const spawnRes = await spawnVerifiedExecutable(explorerPath, [targetDir]);
  if (spawnRes.started) {
    return {
      opened: true,
      path: targetDir,
      message: `Opened folder ${targetLabel} (${targetDir}) in File Explorer.`,
    };
  }
  return {
    opened: false,
    path: targetDir,
    message: `Could not open File Explorer for "${targetDir}": ${spawnRes.error || 'Launch failed'}.`,
  };
}

export async function listActiveWindows(): Promise<Array<{ id: number; name: string; title: string }>> {
  if (process.platform !== 'win32') return [];
  try {
    const script =
      'Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 30 Id, ProcessName, MainWindowTitle | ConvertTo-Json';
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      timeout: 5000,
    });
    const parsed = JSON.parse(stdout || '[]');
    const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return rows.map((r) => ({
      id: Number(r.Id),
      name: String(r.ProcessName || ''),
      title: String(r.MainWindowTitle || ''),
    }));
  } catch {
    return [];
  }
}

export async function focusWindowsWindow(processName: string): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  if (!SAFE_PROCESS_NAME.test(processName)) return false;
  const safeName = processName.replace(/['"`$]/g, '');
  const script = `
    $wshell = New-Object -ComObject wscript.shell;
    $proc = Get-Process | Where-Object { $_.MainWindowTitle -ne "" -and ($_.ProcessName -like "*${safeName}*" -or $_.MainWindowTitle -like "*${safeName}*") } | Select-Object -First 1;
    if ($proc) { $wshell.AppActivate($proc.Id) } else { $false }
  `;
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      timeout: 4000,
    });
    return stdout.trim().toLowerCase() === 'true';
  } catch {
    return false;
  }
}

export async function setWindowsWindowState(
  processName: string,
  state: 'minimize' | 'maximize' | 'restore'
): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  if (!SAFE_PROCESS_NAME.test(processName)) return false;
  const safeName = processName.replace(/['"`$]/g, '');
  const showCode = state === 'minimize' ? 6 : state === 'maximize' ? 3 : 9;
  const script = `
    Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);' -Name Win32ShowWindow -Namespace Win32Funcs -ErrorAction SilentlyContinue;
    $proc = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -like "*${safeName}*" -or $_.MainWindowTitle -like "*${safeName}*") } | Select-Object -First 1;
    if ($proc) { [Win32Funcs.Win32ShowWindow]::ShowWindowAsync($proc.MainWindowHandle, ${showCode}) } else { $false }
  `;
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      timeout: 4000,
    });
    return stdout.trim().toLowerCase() === 'true';
  } catch {
    return false;
  }
}

export async function closeWindowsWindow(processName: string): Promise<{ closed: boolean; detail: string }> {
  if (process.platform !== 'win32') {
    return { closed: false, detail: 'Window closing is only available on a Windows host.' };
  }
  if (!SAFE_PROCESS_NAME.test(processName)) {
    return { closed: false, detail: 'Disallowed process identifier.' };
  }
  const safeName = processName.replace(/['"`$]/g, '');
  const script = `
    $procs = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -like "*${safeName}*" -or $_.MainWindowTitle -like "*${safeName}*") };
    if ($procs) {
      $procs | ForEach-Object { $_.CloseMainWindow() | Out-Null };
      "CLOSED:" + $procs.Count
    } else {
      "NOT_FOUND"
    }
  `;
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      timeout: 4500,
    });
    const out = stdout.trim();
    if (out.startsWith('CLOSED:')) {
      return { closed: true, detail: `Requested graceful close for "${safeName}".` };
    }
    return { closed: false, detail: `No running window matched "${safeName}".` };
  } catch (err) {
    return { closed: false, detail: (err as Error).message };
  }
}

export async function launchWindowsTarget(command: string): Promise<{
  launched: boolean;
  detail: string;
  alreadyRunning?: boolean;
  resolvedTarget?: string;
  errorCode?: string;
}> {
  if (process.platform !== 'win32') {
    return {
      launched: false,
      detail: 'Windows desktop automation requires a live Windows 10/11 host.',
      errorCode: 'NOT_WINDOWS',
    };
  }
  const clean = command.trim();
  if (!clean) {
    return { launched: false, detail: 'No application name specified.', errorCode: 'INVALID_TARGET' };
  }

  const lower = clean.toLowerCase();

  // Handle explicit Windows Settings deep links safely
  for (const [k, uri] of Object.entries(SAFE_SETTINGS_URIS)) {
    if (lower.includes(`${k} settings`) || lower === `settings:${k}` || lower === k) {
      if (lower.includes('settings') || lower.startsWith('settings:')) {
        const explorerPath = path.join(getEnvDirs().systemRoot, 'explorer.exe');
        const res = await spawnVerifiedExecutable(explorerPath, [uri]);
        return res.started
          ? { launched: true, resolvedTarget: uri, detail: `Opened Windows Settings (${uri}).` }
          : { launched: false, errorCode: 'LAUNCH_FAILED', detail: `Failed to open Windows Settings: ${res.error}` };
      }
    }
  }

  // Handle known website aliases if passed directly (e.g. youtube, github, gmail, notion)
  if (WEBSITE_ALIASES[lower]) {
    const webRes = await openWindowsWebsite(lower);
    return {
      launched: webRes.opened,
      resolvedTarget: webRes.url,
      detail: webRes.message,
      errorCode: webRes.opened ? undefined : 'WEB_OPEN_FAILED',
    };
  }

  // Handle cataloged Windows apps with strict path + StartApps verification
  const catalogKey = normalizeAppLookupKey(clean);
  if (catalogKey) {
    const resolved = await resolveWindowsExecutableForKey(catalogKey);
    const catalogEntry = WINDOWS_APP_CATALOG[catalogKey];

    if (resolved.settingsUri) {
      const explorerPath = path.join(getEnvDirs().systemRoot, 'explorer.exe');
      const res = await spawnVerifiedExecutable(explorerPath, [resolved.settingsUri]);
      return res.started
        ? { launched: true, resolvedTarget: resolved.settingsUri, detail: `Opening ${resolved.displayName}.` }
        : { launched: false, errorCode: 'LAUNCH_FAILED', detail: `Failed to open ${resolved.displayName}: ${res.error}` };
    }

    if (resolved.exePath) {
      const res = await spawnVerifiedExecutable(resolved.exePath, []);
      return res.started
        ? { launched: true, resolvedTarget: resolved.exePath, detail: `Opening ${resolved.displayName}.` }
        : { launched: false, errorCode: 'LAUNCH_FAILED', detail: `Failed to launch ${resolved.displayName}: ${res.error}` };
    }

    if (resolved.appId) {
      const explorerPath = path.join(getEnvDirs().systemRoot, 'explorer.exe');
      const targetArg = `shell:AppsFolder\\${resolved.appId}`;
      const res = await spawnVerifiedExecutable(explorerPath, [targetArg]);
      return res.started
        ? { launched: true, resolvedTarget: targetArg, detail: `Opening ${resolved.displayName}.` }
        : { launched: false, errorCode: 'LAUNCH_FAILED', detail: `Failed to launch ${resolved.displayName}: ${res.error}` };
    }

    // Fallback for Windows Terminal -> PowerShell if wt.exe not installed
    if (catalogKey === 'wt') {
      const psResolved = await resolveWindowsExecutableForKey('powershell');
      if (psResolved.exePath) {
        const res = await spawnVerifiedExecutable(psResolved.exePath, []);
        if (res.started) {
          return {
            launched: true,
            resolvedTarget: psResolved.exePath,
            detail: 'Windows Terminal not found; opened Windows PowerShell.',
          };
        }
      }
    }

    if (catalogEntry?.fallbackWebsite) {
      const webRes = await openWindowsWebsite(catalogEntry.fallbackWebsite);
      return {
        launched: webRes.opened,
        resolvedTarget: webRes.url,
        detail: `${resolved.displayName} desktop app not installed; ${webRes.message}`,
      };
    }

    return {
      launched: false,
      errorCode: 'NOT_FOUND',
      detail: `${resolved.displayName} is not installed or could not be located on this Windows PC.`,
    };
  }

  // Handle explicit UWP AppIDs (e.g., discovered via Get-StartApps)
  if (!SAFE_COMMAND_OR_APPID.test(clean)) {
    return {
      launched: false,
      errorCode: 'INVALID_TARGET',
      detail: 'Application identifier contains disallowed characters.',
    };
  }

  if (clean.includes('!')) {
    const explorerPath = path.join(getEnvDirs().systemRoot, 'explorer.exe');
    const targetArg = `shell:AppsFolder\\${clean}`;
    const res = await spawnVerifiedExecutable(explorerPath, [targetArg]);
    return res.started
      ? { launched: true, resolvedTarget: targetArg, detail: `Launched Windows application (${clean}).` }
      : { launched: false, errorCode: 'LAUNCH_FAILED', detail: `Failed to launch "${clean}": ${res.error}` };
  }

  // Dynamic fallback: search Get-StartApps or PATH executables BEFORE claiming launch success
  const foundExe = await whereExecutable(clean);
  if (foundExe) {
    const res = await spawnVerifiedExecutable(foundExe, []);
    return res.started
      ? { launched: true, resolvedTarget: foundExe, detail: `Opening ${path.basename(foundExe, '.exe')}.` }
      : { launched: false, errorCode: 'LAUNCH_FAILED', detail: `Failed to launch "${clean}": ${res.error}` };
  }

  const startApps = await discoverWindowsStartApps();
  const matchedStartApp = startApps.find((s) => s.name.toLowerCase().includes(lower));
  if (matchedStartApp) {
    const explorerPath = path.join(getEnvDirs().systemRoot, 'explorer.exe');
    const targetArg = `shell:AppsFolder\\${matchedStartApp.appId}`;
    const res = await spawnVerifiedExecutable(explorerPath, [targetArg]);
    return res.started
      ? { launched: true, resolvedTarget: targetArg, detail: `Opening ${matchedStartApp.name}.` }
      : { launched: false, errorCode: 'LAUNCH_FAILED', detail: `Failed to launch ${matchedStartApp.name}: ${res.error}` };
  }

  return {
    launched: false,
    errorCode: 'NOT_FOUND',
    detail: `Application "${clean}" was not found in Windows PATH, Program Files, or Start Menu.`,
  };
}

export async function launchWindowsAppVerified(target: string): Promise<DesktopAppLaunchResult> {
  const res = await launchWindowsTarget(target);
  return {
    launched: res.launched,
    alreadyRunning: res.alreadyRunning,
    resolvedTarget: res.resolvedTarget,
    message: res.detail,
    errorCode: res.errorCode,
  };
}

export async function openLocalPathInDefaultApp(targetPath: string): Promise<{ opened: boolean; detail: string }> {
  if (!targetPath || targetPath.includes('\0')) {
    return { opened: false, detail: 'Invalid target path.' };
  }
  if (!fs.existsSync(targetPath)) {
    return { opened: false, detail: `Target path does not exist: "${targetPath}".` };
  }
  if (process.platform === 'win32') {
    const explorerPath = path.join(getEnvDirs().systemRoot, 'explorer.exe');
    const res = await spawnVerifiedExecutable(explorerPath, [targetPath]);
    return res.started
      ? { opened: true, detail: `Opened "${targetPath}" using default Windows handler.` }
      : { opened: false, detail: `Failed to open "${targetPath}": ${res.error}` };
  }
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return {
      opened: false,
      detail: 'File verified in permitted storage; native OS viewer requires a desktop session (e.g. Windows).',
    };
  }
  const res = await spawnVerifiedExecutable('xdg-open', [targetPath]);
  return res.started
    ? { opened: true, detail: `Opened "${targetPath}".` }
    : { opened: false, detail: `Failed to open "${targetPath}": ${res.error}` };
}

export async function sendWindowsMediaKey(
  action: MediaControlAction
): Promise<{ executed: boolean; detail: string }> {
  if (process.platform !== 'win32') {
    return {
      executed: false,
      detail: `System media control (${action}) requires a Windows host session.`,
    };
  }
  const vk = MEDIA_VK_MAP[action];
  if (!vk) {
    return { executed: false, detail: 'Unsupported media key action.' };
  }
  const repeat = action === 'volume_up' || action === 'volume_down' ? 4 : 1;
  const script = `
    Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);' -Name Win32Keys -Namespace Win32Media -ErrorAction SilentlyContinue;
    for ($i = 0; $i -lt ${repeat}; $i++) {
      [Win32Media.Win32Keys]::keybd_event(${vk}, 0, 0, [UIntPtr]::Zero);
      [Win32Media.Win32Keys]::keybd_event(${vk}, 0, 2, [UIntPtr]::Zero);
    }
  `;
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 3000 });
    return { executed: true, detail: `Executed Windows media action: ${action.replace(/_/g, ' ')}.` };
  } catch (err) {
    return { executed: false, detail: (err as Error).message };
  }
}

export async function getWindowsSpeechCapabilities(): Promise<DesktopVoiceCapabilities> {
  if (process.platform !== 'win32') {
    return {
      platform: process.platform,
      offlineSttReady: false,
      recognizers: [],
      ttsVoices: [],
      micAccessStatus: 'browser-managed',
    };
  }

  const script = `
    Add-Type -AssemblyName System.Speech -ErrorAction SilentlyContinue;
    $recs = @();
    try {
      $recs = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | ForEach-Object { $_.Culture.Name }
    } catch {}
    $voices = @();
    try {
      $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
      $voices = $synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name + ' (' + $_.VoiceInfo.Culture.Name + ')' };
      $synth.Dispose();
    } catch {}
    $micConsent = 'unknown';
    try {
      $u = (Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone' -ErrorAction SilentlyContinue).Value;
      $nonPackaged = (Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged' -ErrorAction SilentlyContinue).Value;
      if ($u -eq 'Deny') { $micConsent = 'denied' }
      elseif ($nonPackaged -eq 'Deny') { $micConsent = 'desktop-apps-denied' }
      elseif ($u -eq 'Allow') { $micConsent = 'granted' }
    } catch {}
    @{ recognizers = @($recs); voices = @($voices); mic = $micConsent } | ConvertTo-Json -Compress
  `;

  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      timeout: 5500,
    });
    const parsed = JSON.parse(stdout.trim() || '{}') as {
      recognizers?: string[];
      voices?: string[];
      mic?: string;
    };
    const recognizers = Array.isArray(parsed.recognizers) ? parsed.recognizers : [];
    const ttsVoices = Array.isArray(parsed.voices) ? parsed.voices : [];
    return {
      platform: 'win32',
      offlineSttReady: recognizers.length > 0,
      recognizers,
      ttsVoices,
      micAccessStatus: parsed.mic || 'unknown',
    };
  } catch {
    return {
      platform: 'win32',
      offlineSttReady: false,
      recognizers: [],
      ttsVoices: [],
      micAccessStatus: 'unknown',
    };
  }
}

export async function recognizeWindowsSpeechFromWav(
  wavBase64: string,
  language = 'en-US'
): Promise<DesktopSpeechRecognitionResult> {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      text: '',
      engine: 'windows-system-speech',
      errorCode: 'NOT_WINDOWS',
      error: 'Windows native System.Speech recognition is only available on Windows 10/11.',
    };
  }

  if (!wavBase64 || wavBase64.length > 12 * 1024 * 1024) {
    return {
      ok: false,
      text: '',
      engine: 'windows-system-speech',
      errorCode: 'INVALID_AUDIO',
      error: 'Audio buffer is empty or exceeds the maximum 12MB speech payload.',
    };
  }

  const audioBuf = Buffer.from(wavBase64, 'base64');
  if (audioBuf.length < 44 || audioBuf.subarray(0, 4).toString('ascii') !== 'RIFF') {
    return {
      ok: false,
      text: '',
      engine: 'windows-system-speech',
      errorCode: 'INVALID_WAV',
      error: 'Invalid PCM WAV audio format for Windows Speech Recognition.',
    };
  }

  const cleanLang = /^[a-z]{2}(-[A-Z]{2})?$/.test(language) ? language : 'en-US';
  const tempWavPath = path.join(os.tmpdir(), `friday-stt-${crypto.randomUUID()}.wav`);
  fs.writeFileSync(tempWavPath, audioBuf);

  const escapedWav = tempWavPath.replace(/'/g, "''");
  const script = `
    Add-Type -AssemblyName System.Speech;
    $installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers();
    if (-not $installed -or $installed.Count -eq 0) {
      @{ ok = $false; text = ''; errorCode = 'NO_RECOGNIZER'; error = 'No Windows Speech Recognition language pack is installed in Windows Settings -> Time & language -> Speech.' } | ConvertTo-Json -Compress;
      exit 0
    }
    $targetLang = '${cleanLang}';
    $baseLang = $targetLang.Split('-')[0];
    $chosen = $installed | Where-Object { $_.Culture.Name -ieq $targetLang } | Select-Object -First 1;
    if (-not $chosen) {
      $chosen = $installed | Where-Object { $_.Culture.TwoLetterISOLanguageName -ieq $baseLang } | Select-Object -First 1;
    }
    if (-not $chosen) {
      $chosen = $installed | Where-Object { $_.Culture.TwoLetterISOLanguageName -ieq 'en' } | Select-Object -First 1;
    }
    if (-not $chosen) { $chosen = $installed | Select-Object -First 1; }
    try {
      $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($chosen);
      $grammar = New-Object System.Speech.Recognition.DictationGrammar;
      $engine.LoadGrammar($grammar);
      $engine.SetInputToWaveFile('${escapedWav}');
      $result = $engine.Recognize();
      $engine.Dispose();
      $txt = if ($result -and $result.Text) { $result.Text.Trim() } else { '' };
      @{ ok = $true; text = $txt; recognizerCulture = $chosen.Culture.Name } | ConvertTo-Json -Compress;
    } catch {
      @{ ok = $false; text = ''; errorCode = 'RECOGNIZER_ERROR'; recognizerCulture = $chosen.Culture.Name; error = $_.Exception.Message } | ConvertTo-Json -Compress;
    }
  `;

  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      timeout: 12000,
    });
    const parsed = JSON.parse(stdout.trim() || '{}') as {
      ok?: boolean;
      text?: string;
      recognizerCulture?: string;
      errorCode?: string;
      error?: string;
    };
    return {
      ok: Boolean(parsed.ok),
      text: String(parsed.text || '').trim(),
      engine: 'windows-system-speech',
      recognizerCulture: parsed.recognizerCulture,
      errorCode: parsed.errorCode,
      error: parsed.error,
    };
  } catch (err) {
    return {
      ok: false,
      text: '',
      engine: 'windows-system-speech',
      errorCode: 'EXEC_FAILED',
      error: `Windows Speech Recognition invocation failed: ${(err as Error).message}`,
    };
  } finally {
    try {
      if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);
    } catch {
      // Ignore cleanup failure on locked temp files
    }
  }
}

export async function stopWindowsSapiTts(): Promise<{ stopped: boolean }> {
  if (activeSapiSpeechProcess) {
    try {
      activeSapiSpeechProcess.kill();
    } catch {
      // Ignore
    }
    activeSapiSpeechProcess = null;
    return { stopped: true };
  }
  return { stopped: false };
}

export async function speakWindowsSapiTts(params: {
  text: string;
  language?: string;
  gender?: string;
  rate?: number;
}): Promise<{ ok: boolean; detail?: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, detail: 'Windows SAPI TTS is only available on Windows hosts.' };
  }
  await stopWindowsSapiTts();
  const cleanText = params.text.replace(/[*_`#]/g, '').trim().slice(0, 1200);
  if (!cleanText) return { ok: false, detail: 'Empty speech text.' };

  // Pass spoken text via Base64 UTF-8 to avoid shell/PowerShell quoting issues completely
  const textB64 = Buffer.from(cleanText, 'utf-8').toString('base64');
  const langPrefix = (params.language || 'en-US').toLowerCase().slice(0, 5);
  const preferMale = params.gender === 'male' ? 'Male' : 'Female';
  const sapiRate = Math.max(-5, Math.min(5, Math.round(((params.rate ?? 1.0) - 1.0) * 8)));

  const script = `
    Add-Type -AssemblyName System.Speech;
    $text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${textB64}'));
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;
    try {
      $synth.Rate = ${sapiRate};
      $voices = $synth.GetInstalledVoices() | Where-Object { $_.Enabled };
      $langMatch = $voices | Where-Object { $_.VoiceInfo.Culture.Name.ToLower().StartsWith('${langPrefix.slice(0, 2)}') };
      $genderMatch = $langMatch | Where-Object { $_.VoiceInfo.Gender.ToString() -eq '${preferMale}' } | Select-Object -First 1;
      if ($genderMatch) { $synth.SelectVoice($genderMatch.VoiceInfo.Name) }
      elseif ($langMatch) { $synth.SelectVoice(($langMatch | Select-Object -First 1).VoiceInfo.Name) }
      $synth.Speak($text);
    } finally {
      $synth.Dispose();
    }
  `;

  return new Promise((resolve) => {
    try {
      const child = spawn('powershell.exe', ['-NoProfile', '-Command', script], {
        stdio: 'ignore',
        shell: false,
      });
      activeSapiSpeechProcess = child;
      child.once('error', (err) => {
        if (activeSapiSpeechProcess === child) activeSapiSpeechProcess = null;
        resolve({ ok: false, detail: err.message });
      });
      child.once('exit', (code) => {
        if (activeSapiSpeechProcess === child) activeSapiSpeechProcess = null;
        resolve({ ok: code === 0, detail: code === 0 ? 'Spoken via Windows SAPI' : `SAPI exited with code ${code}` });
      });
    } catch (err) {
      resolve({ ok: false, detail: (err as Error).message });
    }
  });
}

// ---------- WindowManager, AccessibilityManager, ComputerInteractionEngine & OCRManager ----------

export async function detectActiveWindow(): Promise<{
  ok: boolean;
  pid?: number;
  processName?: string;
  title?: string;
  detail: string;
}> {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      detail: 'Active foreground window inspection requires a Windows desktop session.',
    };
  }
  const script = `
    Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);' -Name Win32Fg -Namespace Win32FgNs -ErrorAction SilentlyContinue;
    $hwnd = [Win32FgNs.Win32Fg]::GetForegroundWindow();
    [uint32]$wpid = 0;
    [void][Win32FgNs.Win32Fg]::GetWindowThreadProcessId($hwnd, [ref]$wpid);
    $p = Get-Process -Id $wpid -ErrorAction SilentlyContinue;
    @{ pid = [int]$wpid; name = if ($p) { $p.ProcessName } else { '' }; title = if ($p) { $p.MainWindowTitle } else { '' } } | ConvertTo-Json -Compress
  `;
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 3500 });
    const parsed = JSON.parse(stdout.trim() || '{}') as { pid?: number; name?: string; title?: string };
    return {
      ok: Boolean(parsed.pid),
      pid: parsed.pid,
      processName: parsed.name,
      title: parsed.title,
      detail: parsed.title ? `${parsed.name}: ${parsed.title}` : `Foreground PID ${parsed.pid ?? 'unknown'}`,
    };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

export async function listUiElementsWindows(processFilter?: string): Promise<{
  ok: boolean;
  elements: Array<{ name: string; automationId: string; controlType: string }>;
  detail: string;
}> {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      elements: [],
      detail: 'Windows UI Automation accessibility inspection requires a live Windows 10/11 desktop.',
    };
  }
  const safeFilter = (processFilter || '').replace(/[^a-zA-Z0-9._ -]/g, '');
  const script = `
    Add-Type -AssemblyName UIAutomationClient;
    Add-Type -AssemblyName UIAutomationTypes;
    $root = [System.Windows.Automation.AutomationElement]::RootElement;
    $target = $null;
    if ('${safeFilter}' -ne '') {
      $proc = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -like '*${safeFilter}*' -or $_.MainWindowTitle -like '*${safeFilter}*') } | Select-Object -First 1;
      if ($proc) { $target = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle) }
    }
    if (-not $target) {
      Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();' -Name Win32Fg2 -Namespace Win32FgNs2 -ErrorAction SilentlyContinue;
      $fg = [Win32FgNs2.Win32Fg2]::GetForegroundWindow();
      if ($fg -ne [IntPtr]::Zero) { $target = [System.Windows.Automation.AutomationElement]::FromHandle($fg) }
    }
    if (-not $target) { $target = $root }
    $items = $target.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) | Select-Object -First 45;
    $out = @();
    foreach ($el in $items) {
      $n = $el.Current.Name;
      if ($n) {
        $out += @{ name = $n; automationId = [string]$el.Current.AutomationId; controlType = [string]$el.Current.ControlType.ProgrammaticName }
      }
    }
    $out | ConvertTo-Json -Compress
  `;
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 6500 });
    const parsed = JSON.parse(stdout.trim() || '[]');
    const arr = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    const elements = arr.map((e) => ({
      name: String(e.name || ''),
      automationId: String(e.automationId || ''),
      controlType: String(e.controlType || ''),
    }));
    return {
      ok: true,
      elements,
      detail: `Inspected ${elements.length} Windows UI Automation element(s).`,
    };
  } catch (err) {
    return { ok: false, elements: [], detail: (err as Error).message };
  }
}

export async function typeTextWindows(text: string): Promise<{ ok: boolean; detail: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, detail: 'Keyboard automation requires a Windows desktop session.' };
  }
  const safeB64 = Buffer.from(text.slice(0, 1000), 'utf-8').toString('base64');
  const script = `
    Add-Type -AssemblyName System.Windows.Forms;
    $raw = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${safeB64}'));
    $escaped = $raw -replace '([+^%~(){}\\[\\]])', '{$1}';
    [System.Windows.Forms.SendKeys]::SendWait($escaped);
    'SENT'
  `;
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 4000 });
    return { ok: stdout.includes('SENT'), detail: 'Sent text input via KeyboardController.' };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

export async function sendShortcutWindows(keys: string): Promise<{ ok: boolean; detail: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, detail: 'Shortcut automation requires a Windows desktop session.' };
  }
  // Allow only validated SendKeys format characters (e.g. ^s, ^c, %{F4}, {ENTER})
  if (!/^[a-zA-Z0-9^+%~{}\s]{1,24}$/.test(keys)) {
    return { ok: false, detail: 'Disallowed shortcut sequence.' };
  }
  const script = `
    Add-Type -AssemblyName System.Windows.Forms;
    [System.Windows.Forms.SendKeys]::SendWait('${keys}');
    'SENT'
  `;
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 3500 });
    return { ok: stdout.includes('SENT'), detail: `Dispatched shortcut "${keys}".` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

export async function moveAndClickWindows(x: number, y: number, doubleClick = false): Promise<{ ok: boolean; detail: string }> {
  if (process.platform !== 'win32') {
    return { ok: false, detail: 'Mouse automation requires a Windows desktop session.' };
  }
  const ix = Math.max(0, Math.round(x));
  const iy = Math.max(0, Math.round(y));
  const script = `
    Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y); [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, UIntPtr dwExtraInfo);' -Name Win32Mouse -Namespace Win32MouseNs -ErrorAction SilentlyContinue;
    [Win32MouseNs.Win32Mouse]::SetCursorPos(${ix}, ${iy}) | Out-Null;
    [Win32MouseNs.Win32Mouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero);
    [Win32MouseNs.Win32Mouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero);
    ${doubleClick ? '[Win32MouseNs.Win32Mouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); [Win32MouseNs.Win32Mouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero);' : ''}
    'CLICKED'
  `;
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { timeout: 3500 });
    return { ok: stdout.includes('CLICKED'), detail: `Clicked coordinate (${ix}, ${iy}).` };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

export async function captureAndOcrScreenWindows(): Promise<{
  ok: boolean;
  text: string;
  activeWindow?: string;
  elementsCount: number;
  detail: string;
}> {
  if (process.platform !== 'win32') {
    const activeNote = 'Running in non-Windows host; desktop screen OCR & UIA require a live Windows 10/11 session (or use Screen Capture inside the File Explorer view).';
    return { ok: false, text: activeNote, elementsCount: 0, detail: activeNote };
  }

  const fg = await detectActiveWindow();
  const uia = await listUiElementsWindows(fg.processName);
  const uiaLines = uia.elements.map((e) => e.name).filter(Boolean).slice(0, 30);

  return {
    ok: uiaLines.length > 0 || fg.ok,
    text: uiaLines.join('\n'),
    activeWindow: fg.detail,
    elementsCount: uia.elements.length,
    detail: `Extracted ${uiaLines.length} accessibility text items from active Windows desktop (${fg.detail}).`,
  };
}

