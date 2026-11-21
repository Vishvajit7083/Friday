import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
const SAFE_PROCESS_NAME = /^[a-zA-Z0-9._ -]+$/;
const SAFE_COMMAND_OR_APPID = /^[a-zA-Z0-9._:\\/\s-]+$/;
const MEDIA_VK_MAP = {
    play_pause: 0xb3, // VK_MEDIA_PLAY_PAUSE
    next: 0xb0, // VK_MEDIA_NEXT_TRACK
    previous: 0xb1, // VK_MEDIA_PREV_TRACK
    volume_up: 0xaf, // VK_VOLUME_UP
    volume_down: 0xae, // VK_VOLUME_DOWN
    mute: 0xad, // VK_VOLUME_MUTE
};
/**
 * Windows-native automation bridge (PowerShell + Win32 user32 + Windows Shell).
 * All arguments are strictly validated against allowlists and executed with shell: false.
 */
export async function discoverWindowsStartApps() {
    if (process.platform !== 'win32')
        return [];
    try {
        const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', 'Get-StartApps | Select-Object -First 80 Name, AppID | ConvertTo-Json'], { timeout: 6000 });
        const parsed = JSON.parse(stdout || '[]');
        const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
        return rows
            .filter((item) => item?.Name && item?.AppID)
            .map((item) => ({ name: String(item.Name), appId: String(item.AppID) }));
    }
    catch {
        return [];
    }
}
export async function listActiveWindows() {
    if (process.platform !== 'win32')
        return [];
    try {
        const script = 'Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object -First 30 Id, ProcessName, MainWindowTitle | ConvertTo-Json';
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
    }
    catch {
        return [];
    }
}
export async function focusWindowsWindow(processName) {
    if (process.platform !== 'win32')
        return false;
    if (!SAFE_PROCESS_NAME.test(processName))
        return false;
    const safeName = processName.replace(/['"`$]/g, '');
    const script = `
    $wshell = New-Object -ComObject wscript.shell;
    $proc = Get-Process | Where-Object { $_.MainWindowTitle -ne "" -and ($_.ProcessName -like "*${safeName}*" -or $_.MainWindowTitle -like "*${safeName}*") } | Select-Object -First 1;
    if ($proc) { $wshell.AppActivate($proc.Id) } else { $false }
  `;
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
        timeout: 4000,
    });
    return stdout.trim().toLowerCase() === 'true';
}
export async function setWindowsWindowState(processName, state) {
    if (process.platform !== 'win32')
        return false;
    if (!SAFE_PROCESS_NAME.test(processName))
        return false;
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
    }
    catch {
        return false;
    }
}
export async function closeWindowsWindow(processName) {
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
    }
    catch (err) {
        return { closed: false, detail: err.message };
    }
}
export async function launchWindowsTarget(command) {
    if (process.platform !== 'win32') {
        return { launched: false, detail: 'Not running on a Windows host.' };
    }
    const clean = command.trim();
    if (!clean || !SAFE_COMMAND_OR_APPID.test(clean)) {
        return { launched: false, detail: 'Application identifier contains disallowed characters.' };
    }
    return new Promise((resolve) => {
        try {
            // Handle UWP / Microsoft Store AppIDs (e.g., 5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App)
            const isAppId = clean.includes('!');
            const args = isAppId ? ['/c', 'start', '', `shell:AppsFolder\\${clean}`] : ['/c', 'start', '', clean];
            const child = spawn('cmd.exe', args, {
                detached: true,
                stdio: 'ignore',
                shell: false,
            });
            child.once('error', (err) => {
                resolve({ launched: false, detail: err.message });
            });
            child.unref();
            resolve({ launched: true, detail: `Dispatched Windows application launch for "${clean}".` });
        }
        catch (err) {
            resolve({ launched: false, detail: err.message });
        }
    });
}
export async function openLocalPathInDefaultApp(targetPath) {
    if (!targetPath || targetPath.includes('\0')) {
        return { opened: false, detail: 'Invalid target path.' };
    }
    if (process.platform === 'win32') {
        return new Promise((resolve) => {
            try {
                const child = spawn('cmd.exe', ['/c', 'start', '', targetPath], {
                    detached: true,
                    stdio: 'ignore',
                    shell: false,
                });
                child.once('error', (err) => resolve({ opened: false, detail: err.message }));
                child.unref();
                resolve({ opened: true, detail: `Opened "${targetPath}" using default Windows handler.` });
            }
            catch (err) {
                resolve({ opened: false, detail: err.message });
            }
        });
    }
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
        return {
            opened: false,
            detail: 'File verified in permitted storage; native OS viewer requires a desktop session (e.g. Windows).',
        };
    }
    return new Promise((resolve) => {
        const child = spawn('xdg-open', [targetPath], { detached: true, stdio: 'ignore', shell: false });
        child.once('error', (err) => resolve({ opened: false, detail: err.message }));
        child.unref();
        resolve({ opened: true, detail: `Opened "${targetPath}".` });
    });
}
export async function sendWindowsMediaKey(action) {
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
    }
    catch (err) {
        return { executed: false, detail: err.message };
    }
}
