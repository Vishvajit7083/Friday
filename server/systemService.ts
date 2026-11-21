import os from 'os';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import si from 'systeminformation';
import { launchWindowsTarget } from '../electron/windowsAutomation.ts';
import type { DesktopAppItem, SystemTelemetry } from '../src/core/types.ts';

const execFileAsync = promisify(execFile);

let cachedStaticInfo: {
  cpuModel: string;
  cpuCores: number;
  gpuName: string;
  platform: string;
  hostname: string;
} | null = null;

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

export async function detectInstalledApps(apps: DesktopAppItem[]): Promise<DesktopAppItem[]> {
  const checked = await Promise.all(
    apps.map(async (app) => {
      const available = await checkCommandAvailable(app.command);
      return { ...app, installed: available };
    })
  );
  return checked;
}

export async function launchApplication(app: DesktopAppItem): Promise<{ launched: boolean; message: string }> {
  if (process.platform === 'win32') {
    const available = await checkCommandAvailable(app.command);
    if (!available) {
      return {
        launched: false,
        message: `${app.name} (${app.command}) is not installed or not in Windows PATH.`,
      };
    }
    const result = await launchWindowsTarget(app.command);
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
