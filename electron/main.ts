// Electron Main Process for F.R.I.D.A.Y. Windows Desktop Companion
// Provides secure context-isolated window controls, system tray, floating companion mode,
// ESC hide-to-desktop without terminating background services, and global reopen shortcut.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawn, type ChildProcess } from 'child_process';
import {
  getWindowsSpeechCapabilities,
  launchWindowsAppVerified,
  openWindowsFolder,
  openWindowsWebsite,
  recognizeWindowsSpeechFromWav,
  speakWindowsSapiTts,
  stopWindowsSapiTts,
} from './windowsAutomation.ts';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export interface ElectronWindowConfig {
  fullscreen: boolean;
  reopenShortcut: string;
  serverUrl: string;
}

export interface ElectronDesktopState {
  fullscreen: boolean;
  maximized: boolean;
  floatingMode: boolean;
  reopenShortcut: string;
  openAtLogin: boolean;
}

export function getElectronConfig(): ElectronWindowConfig {
  return {
    fullscreen: process.env.FRIDAY_FULLSCREEN !== 'false',
    reopenShortcut: process.env.FRIDAY_REOPEN_SHORTCUT || 'CommandOrControl+Shift+Space',
    serverUrl: process.env.FRIDAY_SERVER_URL || 'http://127.0.0.1:3000',
  };
}

// Inline 16x16 cyan geometric emblem PNG data URI so Windows Tray never renders an empty icon
const TRAY_SVG_DATA_URL =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#050b18"/>
      <circle cx="16" cy="16" r="12" fill="none" stroke="#22d3ee" stroke-width="2.2"/>
      <polygon points="16,24 9,11 23,11" fill="none" stroke="#67e8f9" stroke-width="2"/>
      <polygon points="16,19 13,13 19,13" fill="#22d3ee"/>
    </svg>`
  ).toString('base64');

async function probeServerHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/health`, {
      signal: AbortSignal.timeout(900),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureLocalServerRunning(baseUrl: string, userDataDir?: string): Promise<ChildProcess | null> {
  if (await probeServerHealth(baseUrl)) return null;

  const rootDir = path.resolve(currentDir, '../..');
  const distDir = path.join(rootDir, 'dist');
  const distServer = path.join(distDir, 'index.html');
  const isProdBundle = fs.existsSync(distServer);
  const bundledServer = path.join(rootDir, 'dist-electron', 'server.mjs');

  if (isProdBundle && fs.existsSync(bundledServer)) {
    process.env.NODE_ENV = 'production';
    process.env.FRIDAY_DIST_DIR = distDir;
    if (userDataDir) {
      process.env.FRIDAY_DATA_DIR = path.join(userDataDir, 'friday-data');
    }
    try {
      await import(pathToFileURL(bundledServer).href);
      for (let i = 0; i < 24; i += 1) {
        if (await probeServerHealth(baseUrl)) {
          return null;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (err) {
      console.error('Failed to start bundled server:', err);
    }
    return null;
  }

  const tsxBin =
    process.platform === 'win32'
      ? path.join(rootDir, 'node_modules', '.bin', 'tsx.cmd')
      : path.join(rootDir, 'node_modules', '.bin', 'tsx');

  const cmd = fs.existsSync(tsxBin) ? tsxBin : 'npx';
  const args = fs.existsSync(tsxBin) ? ['server.ts'] : ['tsx', 'server.ts'];

  const child = spawn(cmd, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: isProdBundle ? 'production' : process.env.NODE_ENV || 'development',
      FRIDAY_DIST_DIR: distDir,
      ...(userDataDir ? { FRIDAY_DATA_DIR: path.join(userDataDir, 'friday-data') } : {}),
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
  const electron = await import('electron' as string);
  const {
    app,
    BrowserWindow,
    desktopCapturer,
    globalShortcut,
    ipcMain,
    Menu,
    Tray,
    nativeImage,
    session,
    shell,
    systemPreferences,
  } = electron;

  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
  let tray: InstanceType<typeof Tray> | null = null;
  let embeddedServerProcess: ChildProcess | null = null;
  let isQuitting = false;
  let floatingMode = false;
  const config = getElectronConfig();
  let activeShortcut = config.reopenShortcut;

  function isTrustedAppUrl(targetUrl: string): boolean {
    try {
      const parsedTarget = new URL(targetUrl);
      const parsedBase = new URL(config.serverUrl);
      return (
        parsedTarget.origin === parsedBase.origin ||
        parsedTarget.hostname === 'localhost' ||
        parsedTarget.hostname === '127.0.0.1'
      );
    } catch {
      return false;
    }
  }

  function registerShortcut(shortcut: string): boolean {
    const candidate = shortcut.replace(/\bCtrl\b/gi, 'CommandOrControl').trim();
    if (!/^[a-zA-Z0-9+]+$/.test(candidate) || candidate.length > 40) {
      return false;
    }
    try {
      globalShortcut.unregisterAll();
      const ok = globalShortcut.register(candidate, () => toggleVisibility());
      if (ok) activeShortcut = candidate;
      return ok;
    } catch {
      return false;
    }
  }

  function toggleVisibility(forceShow?: boolean) {
    if (!mainWindow) return;
    const shouldShow = typeof forceShow === 'boolean' ? forceShow : !mainWindow.isVisible();
    if (shouldShow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      // Stop any active speech output cleanly when hiding, while preserving background services
      void stopWindowsSapiTts();
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('friday:stop-speech');
      }
      mainWindow.hide();
    }
  }

  function applyFloatingMode(enabled: boolean) {
    if (!mainWindow) return;
    floatingMode = enabled;
    if (enabled) {
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
      mainWindow.setAlwaysOnTop(true, 'floating');
      mainWindow.setSize(480, 720);
      mainWindow.center();
    } else {
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setSize(1440, 900);
      mainWindow.center();
    }
  }

  function getDesktopState(): ElectronDesktopState {
    return {
      fullscreen: Boolean(mainWindow?.isFullScreen()),
      maximized: Boolean(mainWindow?.isMaximized()),
      floatingMode,
      reopenShortcut: activeShortcut,
      openAtLogin: Boolean(app.getLoginItemSettings?.().openAtLogin),
    };
  }

  function createWindow() {
    const cjsPreload = path.join(currentDir, 'preload.cjs');
    const esmPreload = path.join(currentDir, 'preload.js');
    const preloadPath = fs.existsSync(cjsPreload) ? cjsPreload : esmPreload;

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
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    mainWindow.loadURL(config.serverUrl);

    mainWindow.webContents.on('render-process-gone', () => {
      if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
        setTimeout(() => {
          mainWindow?.loadURL(config.serverUrl).catch(() => {});
        }, 500);
      }
    });

    mainWindow.webContents.on('will-navigate', (event: Event, url: string) => {
      if (!isTrustedAppUrl(url)) {
        event.preventDefault();
      }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
      if (/^https?:\/\//i.test(url) && !isTrustedAppUrl(url)) {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });

    mainWindow.on('close', (event: Event) => {
      if (!isQuitting) {
        event.preventDefault();
        void stopWindowsSapiTts();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('friday:stop-speech');
          mainWindow.hide();
        }
      }
    });
  }

  app.on('second-instance', () => {
    toggleVisibility(true);
  });

  app.whenReady().then(async () => {
    embeddedServerProcess = await ensureLocalServerRunning(config.serverUrl, app.getPath('userData'));

    const allowedPermissions = new Set([
      'media',
      'audioCapture',
      'microphone',
      'display-capture',
      'fullscreen',
    ]);
    session.defaultSession.setPermissionCheckHandler?.(
      (_webContents: unknown, permission: string, requestingOrigin: string) => {
        return isTrustedAppUrl(requestingOrigin) && allowedPermissions.has(permission);
      }
    );
    session.defaultSession.setPermissionRequestHandler(
      (
        webContents: { getURL: () => string },
        permission: string,
        callback: (granted: boolean) => void
      ) => {
        const originOk = isTrustedAppUrl(webContents.getURL());
        callback(originOk && allowedPermissions.has(permission));
      }
    );

    if (typeof session.defaultSession.setDisplayMediaRequestHandler === 'function' && desktopCapturer) {
      session.defaultSession.setDisplayMediaRequestHandler(
        async (_request: unknown, callback: (streams: { video?: unknown }) => void) => {
          try {
            const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
            callback({ video: sources[0] });
          } catch {
            callback({});
          }
        }
      );
    }

    createWindow();
    registerShortcut(activeShortcut);

    const icon = nativeImage.createFromDataURL(TRAY_SVG_DATA_URL);
    tray = new Tray(icon);
    tray.setToolTip('F.R.I.D.A.Y. Personal AI Companion');
    tray.setContextMenu(
      Menu.buildFromTemplate([
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
      ])
    );
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
      if (!mainWindow) return { maximized: false };
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
      return { maximized: mainWindow.isMaximized() };
    });

    ipcMain.handle('friday:set-fullscreen', (_evt: unknown, enabled: unknown) => {
      if (typeof enabled !== 'boolean' || !mainWindow) return getDesktopState();
      if (enabled && floatingMode) applyFloatingMode(false);
      mainWindow.setFullScreen(enabled);
      return getDesktopState();
    });

    ipcMain.handle('friday:set-floating-mode', (_evt: unknown, enabled: unknown) => {
      if (typeof enabled !== 'boolean') return getDesktopState();
      applyFloatingMode(enabled);
      return getDesktopState();
    });

    ipcMain.handle('friday:set-startup-launch', (_evt: unknown, enabled: unknown) => {
      if (typeof enabled !== 'boolean') return getDesktopState();
      app.setLoginItemSettings?.({ openAtLogin: enabled });
      return getDesktopState();
    });

    ipcMain.handle('friday:update-reopen-shortcut', (_evt: unknown, shortcut: unknown) => {
      if (typeof shortcut !== 'string') return { registered: false, shortcut: activeShortcut };
      const registered = registerShortcut(shortcut);
      return { registered, shortcut: activeShortcut };
    });

    ipcMain.handle('friday:get-window-state', () => getDesktopState());

    ipcMain.handle('friday:quit-app', () => {
      isQuitting = true;
      void stopWindowsSapiTts();
      embeddedServerProcess?.kill();
      mainWindow?.destroy();
      app.quit();
      return { quitting: true };
    });

    ipcMain.handle('friday:voice-capabilities', async () => {
      return getWindowsSpeechCapabilities();
    });

    ipcMain.handle('friday:request-mic-permission', async () => {
      if (process.platform === 'darwin' && typeof systemPreferences?.askForMediaAccess === 'function') {
        const granted = await systemPreferences.askForMediaAccess('microphone');
        return {
          granted: Boolean(granted),
          status: granted ? 'granted' : 'denied',
          detail: granted ? 'macOS microphone permission granted.' : 'macOS microphone permission denied.',
        };
      }
      const caps = await getWindowsSpeechCapabilities();
      const denied = caps.micAccessStatus === 'denied' || caps.micAccessStatus === 'desktop-apps-denied';
      return {
        granted: !denied,
        status: caps.micAccessStatus,
        detail: denied
          ? 'Windows Microphone Privacy is blocking desktop apps. Enable Settings -> Privacy & security -> Microphone -> "Let desktop apps access your microphone".'
          : 'Microphone access permitted by host configuration.',
      };
    });

    ipcMain.handle(
      'friday:recognize-speech-wav',
      async (_evt: unknown, payload: { wavBase64?: string; language?: string } | undefined) => {
        if (!payload?.wavBase64) {
          return {
            ok: false,
            text: '',
            engine: 'windows-system-speech',
            errorCode: 'INVALID_AUDIO',
            error: 'No audio payload received.',
          };
        }
        return recognizeWindowsSpeechFromWav(payload.wavBase64, payload.language || 'en-US');
      }
    );

    ipcMain.handle(
      'friday:speak-windows-tts',
      async (
        _evt: unknown,
        payload: { text?: string; language?: string; gender?: string; rate?: number } | undefined
      ) => {
        if (!payload?.text?.trim()) return { ok: false, detail: 'Empty speech text.' };
        return speakWindowsSapiTts({
          text: payload.text,
          language: payload.language,
          gender: payload.gender,
          rate: payload.rate,
        });
      }
    );

    ipcMain.handle('friday:stop-windows-tts', async () => {
      return stopWindowsSapiTts();
    });

    ipcMain.handle('friday:launch-app', async (_evt: unknown, target: unknown) => {
      return launchWindowsAppVerified(String(target || ''));
    });

    ipcMain.handle('friday:open-website', async (_evt: unknown, urlOrAlias: unknown) => {
      return openWindowsWebsite(String(urlOrAlias || ''));
    });

    ipcMain.handle('friday:open-folder', async (_evt: unknown, folderNameOrPath: unknown) => {
      return openWindowsFolder(String(folderNameOrPath || ''));
    });

    ipcMain.handle('friday:windows-diagnostics', async () => {
      const voiceCaps = await getWindowsSpeechCapabilities();
      return {
        platform: process.platform,
        arch: process.arch,
        desktopState: getDesktopState(),
        voiceCapabilities: voiceCaps,
      };
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
