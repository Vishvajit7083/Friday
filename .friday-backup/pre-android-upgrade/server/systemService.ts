import os from 'os';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import si from 'systeminformation';
import {
  closeWindowsWindow,
  discoverWindowsStartApps,
  focusWindowsWindow,
  launchWindowsTarget,
  listActiveWindows,
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
  if (!/^[a-zA-Z0-9._-]+$/.test(command)) return false;
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    await execFileAsync(checker, [command], { timeout: 1500 });
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

const SEMANTIC_APP_ALIASES: Array<{ rx: RegExp; lookup: string; winCommands: string[] }> = [
  { rx: /\b(coding|ide|vs\s*code|vscode|visual\s+studio\s+code)\b/i, lookup: 'code', winCommands: ['code', 'Code'] },
  { rx: /\b(chrome|google\s+chrome|browser)\b/i, lookup: 'chrome', winCommands: ['chrome', 'msedge'] },
  { rx: /\b(edge|microsoft\s+edge)\b/i, lookup: 'msedge', winCommands: ['msedge'] },
  { rx: /\b(spotify|music\s+player)\b/i, lookup: 'spotify', winCommands: ['spotify'] },
  { rx: /\b(whatsapp|messaging)\b/i, lookup: 'whatsapp', winCommands: ['whatsapp'] },
  { rx: /\b(terminal|powershell|cmd|shell)\b/i, lookup: 'wt', winCommands: ['wt', 'powershell', 'cmd'] },
  { rx: /\b(explorer|files|file\s+explorer)\b/i, lookup: 'explorer', winCommands: ['explorer'] },
  { rx: /\b(notepad|notes)\b/i, lookup: 'notepad', winCommands: ['notepad'] },
  { rx: /\b(calculator|calc)\b/i, lookup: 'calc', winCommands: ['calc'] },
  { rx: /\b(vlc)\b/i, lookup: 'vlc', winCommands: ['vlc'] },
];

export async function launchApplication(app: DesktopAppItem): Promise<{ launched: boolean; message: string }> {
  if (process.platform === 'win32') {
    const winTarget = app.command === 'google-chrome' ? 'chrome' : app.command;
    const available = winTarget.includes('!') || (await checkCommandAvailable(winTarget));
    const result = await launchWindowsTarget(available ? winTarget : app.name);
    return {
      launched: result.launched,
      message: result.launched ? `Launched ${app.name} on Windows desktop.` : result.detail,
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
  apps: DesktopAppItem[]
): Promise<{
  handled: boolean;
  message: string;
  windows?: RunningWindowInfo[];
  launchedApp?: DesktopAppItem;
}> {
  const lower = userCommand.toLowerCase();

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

  // Determine target alias or app match
  const alias = SEMANTIC_APP_ALIASES.find((a) => a.rx.test(lower));
  const matchedApp =
    apps.find((a) => lower.includes(a.name.toLowerCase()) || lower.includes(a.command.toLowerCase())) ||
    (alias
      ? apps.find(
          (a) =>
            a.command.toLowerCase().includes(alias.lookup) ||
            a.name.toLowerCase().includes(alias.lookup)
        )
      : undefined);

  const targetName = matchedApp?.command === 'google-chrome' ? 'chrome' : matchedApp?.command || alias?.lookup || '';

  if (/\b(minimize)\b/i.test(lower) && targetName) {
    const ok = await setWindowsWindowState(targetName, 'minimize');
    return {
      handled: true,
      message: ok
        ? `Minimized ${matchedApp?.name || targetName}.`
        : `Could not locate an active window for "${matchedApp?.name || targetName}" to minimize.`,
    };
  }

  if (/\b(maximize)\b/i.test(lower) && targetName) {
    const ok = await setWindowsWindowState(targetName, 'maximize');
    return {
      handled: true,
      message: ok
        ? `Maximized ${matchedApp?.name || targetName}.`
        : `Could not locate an active window for "${matchedApp?.name || targetName}" to maximize.`,
    };
  }

  if (/\b(switch\s+to|focus)\b/i.test(lower) && targetName) {
    const ok = await focusWindowsWindow(targetName);
    if (ok) {
      return { handled: true, message: `Switched focus to ${matchedApp?.name || targetName}.` };
    }
    if (matchedApp) {
      const launched = await launchApplication(matchedApp);
      return { handled: true, launchedApp: matchedApp, message: launched.message };
    }
    return {
      handled: true,
      message: `No running window matched "${targetName}".`,
    };
  }

  if (matchedApp) {
    const launched = await launchApplication(matchedApp);
    return { handled: true, launchedApp: matchedApp, message: launched.message };
  }

  // Try Start Apps discovery by name
  const startApps = await getCachedWindowsStartApps();
  const startMatch = startApps.find((s) => lower.includes(s.name.toLowerCase()));
  if (startMatch) {
    const res = await launchWindowsTarget(startMatch.appId);
    return {
      handled: true,
      message: res.launched ? `Launched ${startMatch.name}.` : res.detail,
    };
  }

  return {
    handled: true,
    message: `Which application would you like to open or switch to? Installed/known targets include: ${apps
      .slice(0, 8)
      .map((a) => a.name)
      .join(', ')}.`,
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
