var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
// Electron Main Process for F.R.I.D.A.Y. Windows Desktop Companion
// Provides secure context-isolated window controls, system tray, floating companion mode,
// ESC hide-to-desktop without terminating background services, and global reopen shortcut.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
const currentDir = path.dirname(fileURLToPath(import.meta.url));
export function getElectronConfig() {
    return {
        fullscreen: process.env.FRIDAY_FULLSCREEN !== 'false',
        reopenShortcut: process.env.FRIDAY_REOPEN_SHORTCUT || 'CommandOrControl+Shift+Space',
        serverUrl: process.env.FRIDAY_SERVER_URL || 'http://127.0.0.1:3000',
    };
}
// Inline 16x16 cyan geometric emblem PNG data URI so Windows Tray never renders an empty icon
const TRAY_SVG_DATA_URL = 'data:image/svg+xml;base64,' +
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#050b18"/>
      <circle cx="16" cy="16" r="12" fill="none" stroke="#22d3ee" stroke-width="2.2"/>
      <polygon points="16,24 9,11 23,11" fill="none" stroke="#67e8f9" stroke-width="2"/>
      <polygon points="16,19 13,13 19,13" fill="#22d3ee"/>
    </svg>`).toString('base64');
async function probeServerHealth(baseUrl) {
    try {
        const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/health`, {
            signal: AbortSignal.timeout(900),
        });
        return res.ok;
    }
    catch {
        return false;
    }
}
async function ensureLocalServerRunning(baseUrl) {
    if (await probeServerHealth(baseUrl))
        return null;
    const rootDir = path.resolve(currentDir, '../..');
    const distServer = path.join(rootDir, 'dist', 'index.html');
    const isProdBundle = fs.existsSync(distServer);
    const tsxBin = process.platform === 'win32'
        ? path.join(rootDir, 'node_modules', '.bin', 'tsx.cmd')
        : path.join(rootDir, 'node_modules', '.bin', 'tsx');
    const cmd = fs.existsSync(tsxBin) ? tsxBin : 'npx';
    const args = fs.existsSync(tsxBin) ? ['server.ts'] : ['tsx', 'server.ts'];
    const child = spawn(cmd, args, {
        cwd: rootDir,
        env: {
            ...process.env,
            NODE_ENV: isProdBundle ? 'production' : process.env.NODE_ENV || 'development',
        },
        stdio: 'ignore',
        shell: false,
    });
    for (let i = 0; i < 24; i += 1) {
        if (await probeServerHealth(baseUrl)) {
            return child;
        }
        await new Promise((r) => setTimeout(r, 350));
    }
    return child;
}
export async function bootstrapElectronShell() {
    const electron = await import(__rewriteRelativeImportExtension('electron'));
    const { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, Menu, Tray, nativeImage, session, shell, } = electron;
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
        app.quit();
        return;
    }
    let mainWindow = null;
    let tray = null;
    let embeddedServerProcess = null;
    let isQuitting = false;
    let floatingMode = false;
    const config = getElectronConfig();
    let activeShortcut = config.reopenShortcut;
    function isTrustedAppUrl(targetUrl) {
        try {
            const parsedTarget = new URL(targetUrl);
            const parsedBase = new URL(config.serverUrl);
            return (parsedTarget.origin === parsedBase.origin ||
                parsedTarget.hostname === 'localhost' ||
                parsedTarget.hostname === '127.0.0.1');
        }
        catch {
            return false;
        }
    }
    function registerShortcut(shortcut) {
        const candidate = shortcut.replace(/\bCtrl\b/gi, 'CommandOrControl').trim();
        if (!/^[a-zA-Z0-9+]+$/.test(candidate) || candidate.length > 40) {
            return false;
        }
        try {
            globalShortcut.unregisterAll();
            const ok = globalShortcut.register(candidate, () => toggleVisibility());
            if (ok)
                activeShortcut = candidate;
            return ok;
        }
        catch {
            return false;
        }
    }
    function toggleVisibility(forceShow) {
        if (!mainWindow)
            return;
        const shouldShow = typeof forceShow === 'boolean' ? forceShow : !mainWindow.isVisible();
        if (shouldShow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
        else {
            // Hiding preserves background server, wake-word, and telemetry
            mainWindow.hide();
        }
    }
    function applyFloatingMode(enabled) {
        if (!mainWindow)
            return;
        floatingMode = enabled;
        if (enabled) {
            if (mainWindow.isFullScreen())
                mainWindow.setFullScreen(false);
            mainWindow.setAlwaysOnTop(true, 'floating');
            mainWindow.setSize(480, 720);
            mainWindow.center();
        }
        else {
            mainWindow.setAlwaysOnTop(false);
            mainWindow.setSize(1440, 900);
            mainWindow.center();
        }
    }
    function getDesktopState() {
        return {
            fullscreen: Boolean(mainWindow?.isFullScreen()),
            maximized: Boolean(mainWindow?.isMaximized()),
            floatingMode,
            reopenShortcut: activeShortcut,
            openAtLogin: Boolean(app.getLoginItemSettings?.().openAtLogin),
        };
    }
    function createWindow() {
        mainWindow = new BrowserWindow({
            width: 1440,
            height: 900,
            minWidth: 960,
            minHeight: 620,
            frame: false,
            transparent: false,
            fullscreen: config.fullscreen,
            backgroundColor: '#050811',
            webPreferences: {
                preload: path.join(currentDir, 'preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
            },
        });
        mainWindow.loadURL(config.serverUrl);
        mainWindow.webContents.on('render-process-gone', () => {
            if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
                setTimeout(() => {
                    mainWindow?.loadURL(config.serverUrl).catch(() => { });
                }, 500);
            }
        });
        mainWindow.webContents.on('will-navigate', (event, url) => {
            if (!isTrustedAppUrl(url)) {
                event.preventDefault();
            }
        });
        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            if (/^https?:\/\//i.test(url) && !isTrustedAppUrl(url)) {
                shell.openExternal(url).catch(() => { });
            }
            return { action: 'deny' };
        });
        mainWindow.on('close', (event) => {
            if (!isQuitting) {
                event.preventDefault();
                mainWindow?.hide();
            }
        });
    }
    app.on('second-instance', () => {
        toggleVisibility(true);
    });
    app.whenReady().then(async () => {
        embeddedServerProcess = await ensureLocalServerRunning(config.serverUrl);
        const allowedPermissions = new Set(['media', 'audioCapture', 'display-capture', 'fullscreen']);
        session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
            const originOk = isTrustedAppUrl(webContents.getURL());
            callback(originOk && allowedPermissions.has(permission));
        });
        if (typeof session.defaultSession.setDisplayMediaRequestHandler === 'function' && desktopCapturer) {
            session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
                try {
                    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
                    callback({ video: sources[0] });
                }
                catch {
                    callback({});
                }
            });
        }
        createWindow();
        registerShortcut(activeShortcut);
        const icon = nativeImage.createFromDataURL(TRAY_SVG_DATA_URL);
        tray = new Tray(icon);
        tray.setToolTip('F.R.I.D.A.Y. Personal AI Companion');
        tray.setContextMenu(Menu.buildFromTemplate([
            { label: 'Show F.R.I.D.A.Y.', click: () => toggleVisibility(true) },
            {
                label: 'Toggle Floating Mode',
                click: () => {
                    toggleVisibility(true);
                    applyFloatingMode(!floatingMode);
                },
            },
            { label: 'Hide to Desktop (ESC)', click: () => toggleVisibility(false) },
            { type: 'separator' },
            {
                label: 'Quit F.R.I.D.A.Y.',
                click: () => {
                    isQuitting = true;
                    embeddedServerProcess?.kill();
                    mainWindow?.destroy();
                    app.quit();
                },
            },
        ]));
        tray.on('click', () => toggleVisibility());
        ipcMain.handle('friday:hide-to-desktop', () => {
            toggleVisibility(false);
            return { hidden: true };
        });
        ipcMain.handle('friday:restore-window', () => {
            toggleVisibility(true);
            return { visible: true };
        });
        ipcMain.handle('friday:minimize-window', () => {
            mainWindow?.minimize();
            return { minimized: true };
        });
        ipcMain.handle('friday:toggle-maximize', () => {
            if (!mainWindow)
                return { maximized: false };
            if (mainWindow.isMaximized())
                mainWindow.unmaximize();
            else
                mainWindow.maximize();
            return { maximized: mainWindow.isMaximized() };
        });
        ipcMain.handle('friday:set-fullscreen', (_evt, enabled) => {
            if (typeof enabled !== 'boolean' || !mainWindow)
                return getDesktopState();
            if (enabled && floatingMode)
                applyFloatingMode(false);
            mainWindow.setFullScreen(enabled);
            return getDesktopState();
        });
        ipcMain.handle('friday:set-floating-mode', (_evt, enabled) => {
            if (typeof enabled !== 'boolean')
                return getDesktopState();
            applyFloatingMode(enabled);
            return getDesktopState();
        });
        ipcMain.handle('friday:set-startup-launch', (_evt, enabled) => {
            if (typeof enabled !== 'boolean')
                return getDesktopState();
            app.setLoginItemSettings?.({ openAtLogin: enabled });
            return getDesktopState();
        });
        ipcMain.handle('friday:update-reopen-shortcut', (_evt, shortcut) => {
            if (typeof shortcut !== 'string')
                return { registered: false, shortcut: activeShortcut };
            const registered = registerShortcut(shortcut);
            return { registered, shortcut: activeShortcut };
        });
        ipcMain.handle('friday:get-window-state', () => getDesktopState());
        ipcMain.handle('friday:quit-app', () => {
            isQuitting = true;
            embeddedServerProcess?.kill();
            mainWindow?.destroy();
            app.quit();
            return { quitting: true };
        });
    });
    app.on('will-quit', () => {
        globalShortcut.unregisterAll();
        embeddedServerProcess?.kill();
    });
}
if (typeof process !== 'undefined' && process.versions?.electron) {
    bootstrapElectronShell().catch((err) => {
        console.error('Failed to bootstrap Electron shell:', err);
    });
}
