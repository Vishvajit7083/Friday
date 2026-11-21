import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const SAFE_PROCESS_NAME = /^[a-zA-Z0-9._ -]+$/;
const SAFE_COMMAND_OR_APPID = /^[a-zA-Z0-9._:\\/\-]+$/;

/**
 * Windows-native automation bridge (PowerShell + Windows Shell).
 * All arguments are strictly validated against allowlists and executed with shell: false.
 */
export async function discoverWindowsStartApps(): Promise<Array<{ name: string; appId: string }>> {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-Command', 'Get-StartApps | Select-Object -First 50 Name, AppID | ConvertTo-Json'],
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

export async function listActiveWindows(): Promise<Array<{ id: number; name: string; title: string }>> {
  if (process.platform !== 'win32') return [];
  try {
    const script =
      'Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 25 Id, ProcessName, MainWindowTitle | ConvertTo-Json';
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
    $proc = Get-Process -Name "${safeName}" -ErrorAction SilentlyContinue | Select-Object -First 1;
    if ($proc) { $wshell.AppActivate($proc.Id) } else { $false }
  `;
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
    timeout: 4000,
  });
  return stdout.trim().toLowerCase() === 'true';
}

export async function launchWindowsTarget(command: string): Promise<{ launched: boolean; detail: string }> {
  if (process.platform !== 'win32') {
    return { launched: false, detail: 'Not running on a Windows host.' };
  }
  const clean = command.trim();
  if (!clean || !SAFE_COMMAND_OR_APPID.test(clean)) {
    return { launched: false, detail: 'Application identifier contains disallowed characters.' };
  }

  return new Promise((resolve) => {
    try {
      const child = spawn('cmd.exe', ['/c', 'start', '', clean], {
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
      child.once('error', (err) => {
        resolve({ launched: false, detail: err.message });
      });
      child.unref();
      resolve({ launched: true, detail: `Dispatched Windows application launch for "${clean}".` });
    } catch (err) {
      resolve({ launched: false, detail: (err as Error).message });
    }
  });
}
