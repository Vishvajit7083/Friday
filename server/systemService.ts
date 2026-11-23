import os from 'os';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import si from 'systeminformation';
import {
  closeWindowsWindow,
  discoverWindowsStartApps,
  focusWindowsWindow,
  isWindowsAppAvailable,
  launchWindowsTarget,
  listActiveWindows,
  normalizeSafeWebsiteUrl,
  openWindowsFolder,
  openWindowsWebsite,
  setWindowsWindowState,
} from '../electron/windowsAutomation.ts';
import type { DesktopAppItem, RunningWindowInfo, SystemTelemetry } from '../src/core/types.ts';

const execFileAsync = promisify(execFile);

let cachedStaticInfo: {
  cpuModel: string;
  cpuCores: number;
  gpuName: string;
  platform: string;
  hostname: string;
} | null = null;

let cachedStartApps: {
  fetchedAt: number;
  apps: Array<{ name: string; appId: string }>;
} | null = null;

let cachedDetectedAt = 0;

export async function getSystemTelemetry(): Promise<SystemTelemetry> {
  if (!cachedStaticInfo) {
    const [cpu, graphics, osInfo] = await Promise.all([
      si.cpu().catch(() => null),
      si.graphics().catch(() => null),
      si.osInfo().catch(() => null),
    ]);
    const primaryGpu = graphics?.controllers?.[0];
    cachedStaticInfo = {
      cpuModel: cpu ? `${cpu.manufacturer} ${cpu.brand}`.trim() : os.cpus()[0]?.model ?? 'Unavailable',
      cpuCores: cpu?.cores ?? os.cpus().length,
      gpuName: primaryGpu?.model?.trim() || 'Unavailable',
      platform: osInfo ? `${osInfo.distro || osInfo.platform} (${os.arch()})` : `${os.platform()} (${os.arch()})`,
      hostname: osInfo?.hostname ?? os.hostname(),
    };
  }

  const [load, mem, fsSizes, netStats, battery, temp, graphics] = await Promise.all([
    si.currentLoad().catch(() => null),
    si.mem().catch(() => null),
    si.fsSize().catch(() => []),
    si.networkStats().catch(() => []),
    si.battery().catch(() => null),
    si.cpuTemperature().catch(() => null),
    si.graphics().catch(() => null),
  ]);

  const ramTotalBytes = mem?.total ?? os.totalmem();
  const ramUsedBytes = mem?.active ?? (ramTotalBytes - os.freemem());
  const ramTotalGb = Number((ramTotalBytes / 1024 ** 3).toFixed(1));
  const ramUsedGb = Number((ramUsedBytes / 1024 ** 3).toFixed(1));
  const ramPercent = ramTotalBytes > 0 ? Math.round((ramUsedBytes / ramTotalBytes) * 100) : 0;

  const primaryDisk = fsSizes.find((d) => d.mount === '/' || d.mount.toUpperCase().startsWith('C:')) ?? fsSizes[0];
  const storageTotalGb = primaryDisk ? Number((primaryDisk.size / 1024 ** 3).toFixed(1)) : 0;
  const storageUsedGb = primaryDisk ? Number((primaryDisk.used / 1024 ** 3).toFixed(1)) : 0;
  const storagePercent = primaryDisk ? Math.round(primaryDisk.use ?? 0) : 0;

  const totalRxSec = netStats.reduce((sum, n) => sum + (n.rx_sec > 0 ? n.rx_sec : 0), 0);
  const totalTxSec = netStats.reduce((sum, n) => sum + (n.tx_sec > 0 ? n.tx_sec : 0), 0);

  const gpuCtrl = graphics?.controllers?.[0];

  return {
    timestamp: new Date().toISOString(),
    cpuLoad: Math.round(load?.currentLoad ?? 0),
    cpuTemp: temp?.main && temp.main > 0 ? Math.round(temp.main) : null,
    cpuCores: cachedStaticInfo.cpuCores,
    cpuModel: cachedStaticInfo.cpuModel,
    gpuName: cachedStaticInfo.gpuName,
    gpuUsage: typeof gpuCtrl?.utilizationGpu === 'number' ? Math.round(gpuCtrl.utilizationGpu) : null,
    gpuTemp: typeof gpuCtrl?.temperatureGpu === 'number' ? Math.round(gpuCtrl.temperatureGpu) : null,
    ramUsedGb,
    ramTotalGb,
    ramPercent,
    storageUsedGb,
    storageTotalGb,
    storagePercent,
    networkRxKbps: Number((totalRxSec / 1024).toFixed(1)),
    networkTxKbps: Number((totalTxSec / 1024).toFixed(1)),
    batteryPercent: battery?.hasBattery ? Math.round(battery.percent) : null,
    batteryCharging: battery?.hasBattery ? battery.isCharging : null,
    uptimeSeconds: Math.round(os.uptime()),
    platform: cachedStaticInfo.platform,
    hostname: cachedStaticInfo.hostname,
  };
}

export async function checkCommandAvailable(command: string): Promise<boolean> {
  if (process.platform === 'win32') {
    return isWindowsAppAvailable(command);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(command)) return false;
  try {
    await execFileAsync('which', [command], { timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

export async function getCachedWindowsStartApps() {
  if (process.platform !== 'win32') return [];
  const now = Date.now();
  if (cachedStartApps && now - cachedStartApps.fetchedAt < 120_000) {
    return cachedStartApps.apps;
  }
  const apps = await discoverWindowsStartApps();
  cachedStartApps = { fetchedAt: now, apps };
  return apps;
}

export async function detectInstalledApps(apps: DesktopAppItem[], force = false): Promise<DesktopAppItem[]> {
  const now = Date.now();
  if (!force && cachedDetectedAt && now - cachedDetectedAt < 60_000) {
    return apps;
  }
  const [checked, startApps] = await Promise.all([
    Promise.all(
      apps.map(async (app) => {
        const available = await checkCommandAvailable(app.command);
        return { ...app, installed: available };
      })
    ),
    getCachedWindowsStartApps(),
  ]);

  const enriched = checked.map((item) => {
    if (item.installed || startApps.length === 0) return item;
    const match = startApps.find((s) => s.name.toLowerCase().includes(item.name.split(' ')[0].toLowerCase()));
    return match ? { ...item, installed: true } : item;
  });

  // Append top discovered Windows Start Apps not already in list
  const existingNames = new Set(enriched.map((a) => a.name.toLowerCase()));
  for (const sa of startApps.slice(0, 16)) {
    if (!existingNames.has(sa.name.toLowerCase())) {
      existingNames.add(sa.name.toLowerCase());
      enriched.push({
        id: `win-${sa.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28)}`,
        name: sa.name,
        category: 'productivity',
        command: sa.appId,
        installed: true,
        pinned: false,
        description: 'Discovered Windows Start Application',
      });
    }
  }

  cachedDetectedAt = now;
  return enriched;
}

const SEMANTIC_APP_ALIASES: Array<{ rx: RegExp; lookup: string; label: string }> = [
  { rx: /\b(coding|ide|vs\s*code|vscode|visual\s+studio\s+code)\b/i, lookup: 'code', label: 'Visual Studio Code' },
  { rx: /\b(google\s+chrome|google-chrome|chrome|browser)\b/i, lookup: 'chrome', label: 'Google Chrome' },
  { rx: /\b(microsoft\s+edge|msedge|edge)\b/i, lookup: 'edge', label: 'Microsoft Edge' },
  { rx: /\b(android\s+studio|studio64)\b/i, lookup: 'studio64', label: 'Android Studio' },
  { rx: /\b(spotify|music\s+player)\b/i, lookup: 'spotify', label: 'Spotify' },
  { rx: /\b(whatsapp|messaging)\b/i, lookup: 'whatsapp', label: 'WhatsApp Desktop' },
  { rx: /\b(telegram)\b/i, lookup: 'telegram', label: 'Telegram Desktop' },
  { rx: /\b(command\s+prompt|cmd)\b/i, lookup: 'cmd', label: 'Command Prompt' },
  { rx: /\b(powershell|pwsh)\b/i, lookup: 'powershell', label: 'Windows PowerShell' },
  { rx: /\b(windows\s+terminal|terminal|wt)\b/i, lookup: 'wt', label: 'Windows Terminal' },
  { rx: /\b(file\s+explorer|explorer|files)\b/i, lookup: 'explorer', label: 'File Explorer' },
  { rx: /\b(notepad|notes)\b/i, lookup: 'notepad', label: 'Notepad' },
  { rx: /\b(calculator|calc)\b/i, lookup: 'calculator', label: 'Calculator' },
  { rx: /\b(windows\s+settings|wi-?fi\s+settings|bluetooth\s+settings|display\s+settings|sound\s+settings|microphone\s+settings|settings)\b/i, lookup: 'settings', label: 'Windows Settings' },
  { rx: /\b(task\s+manager|taskmgr)\b/i, lookup: 'taskmgr', label: 'Task Manager' },
  { rx: /\b(paint|mspaint)\b/i, lookup: 'paint', label: 'Paint' },
  { rx: /\b(vlc)\b/i, lookup: 'vlc', label: 'VLC Media Player' },
];

export async function launchApplication(app: DesktopAppItem): Promise<{ launched: boolean; message: string }> {
  if (process.platform === 'win32') {
    const winTarget = app.command === 'google-chrome' ? 'chrome' : app.command || app.name;
    const result = await launchWindowsTarget(winTarget);
    return {
      launched: result.launched,
      message: result.detail,
    };
  }

  const available = await checkCommandAvailable(app.command);
  if (!available) {
    return {
      launched: false,
      message: `${app.name} (${app.command}) is unavailable in this host environment. Run F.R.I.D.A.Y. in Windows Electron mode to launch local desktop applications.`,
    };
  }

  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return {
      launched: false,
      message: `${app.name} binary exists, but no desktop display session is active on this headless server.`,
    };
  }

  return new Promise((resolve) => {
    try {
      const child = spawn(app.command, [], { detached: true, stdio: 'ignore', shell: false });
      child.once('error', (err) => {
        resolve({ launched: false, message: `Failed to launch ${app.name}: ${err.message}` });
      });
      child.unref();
      resolve({ launched: true, message: `Launched ${app.name} (${app.command}).` });
    } catch (err) {
      resolve({ launched: false, message: `Failed to launch ${app.name}: ${(err as Error).message}` });
    }
  });
}

export async function handleAppOrWindowCommand(
  userCommand: string,
  apps: DesktopAppItem[],
  allowedFolders: string[] = []
): Promise<{
  handled: boolean;
  message: string;
  windows?: RunningWindowInfo[];
  launchedApp?: DesktopAppItem;
}> {
  const trimmed = userCommand.trim();
  const lower = trimmed.toLowerCase();

  if (/\b(running|active\s+windows|applications\s+currently\s+running)\b/i.test(lower)) {
    const windows = await listActiveWindows();
    return {
      handled: true,
      windows,
      message:
        windows.length > 0
          ? `Active Windows (${windows.length}):\n${windows
              .slice(0, 10)
              .map((w) => `- ${w.name}: ${w.title}`)
              .join('\n')}`
          : process.platform === 'win32'
            ? 'No active application windows with titles were detected.'
            : 'Running window enumeration requires a live Windows desktop session.',
    };
  }

  // Handle explicit folder open requests (e.g. "open downloads folder", "open desktop")
  if (
    /\b(open|launch|show)\b/i.test(lower) &&
    (/\b(downloads?|desktop|documents?|pictures?|videos?|music)\s*(folder|directory)?\b/i.test(lower) ||
      /[a-zA-Z]:\\[^\n\r"'<>|]+/.test(trimmed)) &&
    !/\b(file\s+explorer|explorer)\b/i.test(lower)
  ) {
    const folderRes = await openWindowsFolder(trimmed, allowedFolders);
    return {
      handled: true,
      message: folderRes.message,
    };
  }

  // Handle explicit Settings section requests on Windows (e.g. "open bluetooth settings", "open windows settings")
  if (/\bsettings\b/i.test(lower)) {
    const settingsRes = await launchWindowsTarget(trimmed);
    return {
      handled: true,
      message: settingsRes.detail,
    };
  }

  // Handle website open commands (e.g., "open youtube", "open github.com", "open https://google.com in chrome")
  const explicitBrowser = /\bchrome\b/i.test(lower)
    ? 'chrome'
    : /\bedge\b/i.test(lower)
      ? 'edge'
      : undefined;

  const websiteTarget = normalizeSafeWebsiteUrl(trimmed);
  if (
    websiteTarget &&
    (/\b(youtube|google|github|gmail|notion|wikipedia)\b/i.test(lower) ||
      /https?:\/\/|[a-z0-9-]+\.(?:com|org|net|io|dev|in|edu|gov|ai)/i.test(lower)) &&
    !/\b(google\s+chrome)\b/i.test(lower)
  ) {
    const webRes = await openWindowsWebsite(trimmed, explicitBrowser);
    return {
      handled: true,
      message: webRes.message,
    };
  }

  // Determine target alias or app match
  const alias = SEMANTIC_APP_ALIASES.find((a) => a.rx.test(lower));
  const matchedApp =
    apps.find((a) => lower.includes(a.name.toLowerCase()) || lower.includes(a.command.toLowerCase())) ||
    (alias
      ? apps.find(
          (a) =>
            a.command.toLowerCase() === alias.lookup ||
            a.command.toLowerCase().includes(alias.lookup) ||
            a.name.toLowerCase().includes(alias.label.toLowerCase())
        )
      : undefined);

  const targetName =
    alias?.lookup ||
    (matchedApp?.command === 'google-chrome' ? 'chrome' : matchedApp?.command) ||
    '';

  if (/\b(minimize)\b/i.test(lower) && targetName) {
    const ok = await setWindowsWindowState(targetName, 'minimize');
    return {
      handled: true,
      message: ok
        ? `Minimized ${matchedApp?.name || alias?.label || targetName}.`
        : `Could not locate an active window for "${matchedApp?.name || alias?.label || targetName}" to minimize.`,
    };
  }

  if (/\b(maximize)\b/i.test(lower) && targetName) {
    const ok = await setWindowsWindowState(targetName, 'maximize');
    return {
      handled: true,
      message: ok
        ? `Maximized ${matchedApp?.name || alias?.label || targetName}.`
        : `Could not locate an active window for "${matchedApp?.name || alias?.label || targetName}" to maximize.`,
    };
  }

  if (/\b(switch\s+to|focus)\b/i.test(lower) && targetName) {
    const ok = await focusWindowsWindow(targetName);
    if (ok) {
      return { handled: true, message: `Switched focus to ${matchedApp?.name || alias?.label || targetName}.` };
    }
    const winLaunch = await launchWindowsTarget(targetName);
    return {
      handled: true,
      launchedApp: matchedApp,
      message: winLaunch.detail,
    };
  }

  if (alias) {
    if (process.platform === 'win32') {
      const res = await launchWindowsTarget(alias.lookup);
      return {
        handled: true,
        launchedApp: matchedApp,
        message: res.detail,
      };
    }
    if (matchedApp) {
      const launched = await launchApplication(matchedApp);
      return { handled: true, launchedApp: matchedApp, message: launched.message };
    }
    return {
      handled: true,
      message: `${alias.label} desktop launch requires a Windows 10/11 desktop session.`,
    };
  }

  if (matchedApp) {
    const launched = await launchApplication(matchedApp);
    return { handled: true, launchedApp: matchedApp, message: launched.message };
  }

  // Generic extracted app name (e.g., "open paint", "open obs", "open discord")
  const genericExtract = trimmed.match(
    /^(?:hey[,\s]+friday[,\s]+|friday[,\s]+)?(?:open|launch|start)\s+(?:the\s+|my\s+)?([a-z0-9._ -]{2,40})$/i
  );
  if (genericExtract?.[1]) {
    const requestedName = genericExtract[1].trim();
    if (process.platform === 'win32') {
      const res = await launchWindowsTarget(requestedName);
      return { handled: true, message: res.detail };
    }
    return {
      handled: true,
      message: `Application "${requestedName}" cannot be launched in this non-Windows server container. Run F.R.I.D.A.Y. on Windows Desktop to launch "${requestedName}".`,
    };
  }

  // Try Start Apps discovery by name
  const startApps = await getCachedWindowsStartApps();
  const startMatch = startApps.find((s) => lower.includes(s.name.toLowerCase()));
  if (startMatch) {
    const res = await launchWindowsTarget(startMatch.appId);
    return {
      handled: true,
      message: res.detail,
    };
  }

  return {
    handled: true,
    message: `Which application would you like to open or switch to? Supported targets include Google Chrome, Microsoft Edge, Notepad, Calculator, File Explorer, Command Prompt, PowerShell, Windows Settings, Task Manager, VS Code, or any installed Start Menu app.`,
  };
}

export async function closeWindowSafe(targetSummary: string): Promise<{ closed: boolean; detail: string }> {
  const m = targetSummary.match(/\b(?:close|kill|terminate)\s+([a-zA-Z0-9._ -]{2,40})/i);
  const name = (m?.[1] || targetSummary).trim();
  const alias = SEMANTIC_APP_ALIASES.find((a) => a.rx.test(name));
  return closeWindowsWindow(alias?.lookup || name);
}

export async function getTopProcesses(limit = 12): Promise<Array<{ pid: number; name: string; cpu: number; mem: number; state: string }>> {
  const data = await si.processes().catch(() => null);
  if (!data?.list) return [];
  return [...data.list]
    .sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0))
    .slice(0, limit)
    .map((p) => ({
      pid: p.pid,
      name: p.name || 'process',
      cpu: Number((p.cpu ?? 0).toFixed(1)),
      mem: Number((p.mem ?? 0).toFixed(1)),
      state: p.state || 'running',
    }));
}
