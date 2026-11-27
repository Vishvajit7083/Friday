// Electron Main Process for F.R.I.D.A.Y. Windows Desktop Companion
// Provides secure context-isolated window controls, system tray, floating companion mode,
// ESC hide-to-desktop without terminating background services, and global reopen shortcut.
import fs from 'fs';
import path from 'path';
import net from 'net';
import zlib from 'zlib';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawn, type ChildProcess } from 'child_process';
import {
  captureAndOcrScreenWindows,
  captureScreenWindowsGdi,
  detectActiveWindow,
  getWindowsSpeechCapabilities,
  isWindowsPathPermitted,
  launchWindowsAppVerified,
  listUiElementsWindows,
  openLocalPathInDefaultApp,
  openWindowsFolder,
  openWindowsWebsite,
  recognizeWindowsSpeechFromWav,
  revealFileInWindowsExplorer,
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

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Generate a real 16x16 RGBA PNG buffer so Windows Tray always renders a valid icon
function createTrayPngBuffer(): Buffer {
  const size = 16;
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter none
    for (let x = 0; x < size; x += 1) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const off = 1 + x * 4;
      if (dist <= 2.4) {
        // Bright cyan/fuchsia core
        row[off] = 232;
        row[off + 1] = 121;
        row[off + 2] = 249;
        row[off + 3] = 255;
      } else if (dist >= 5.1 && dist <= 6.8) {
        // Neon violet ring
        row[off] = 168;
        row[off + 1] = 85;
        row[off + 2] = 247;
        row[off + 3] = 255;
      } else if (dist <= 7.8) {
        // Dark obsidian HUD backing
        row[off] = 12;
        row[off + 1] = 5;
        row[off + 2] = 28;
        row[off + 3] = 245;
      } else {
        row[off] = 0;
        row[off + 1] = 0;
        row[off + 2] = 0;
        row[off + 3] = 0;
      }
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function probeServerHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/health`, {
      signal: AbortSignal.timeout(900),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as { localEngineReady?: boolean; status?: string } | null;
    return Boolean(data && (data.localEngineReady === true || data.status === 'ok'));
  } catch {
    return false;
  }
}

function isLocalPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, '127.0.0.1');
  });
}

function allocateEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3000;
      srv.close(() => resolve(port));
    });
  });
}

interface EmbeddedServerBootResult {
  serverUrl: string;
  childProcess: ChildProcess | null;
  closeEmbeddedServer?: () => Promise<void>;
  startupError?: string;
}

async function ensureLocalServerRunning(
  preferredBaseUrl: string,
  userDataDir?: string,
  appPath?: string
): Promise<EmbeddedServerBootResult> {
  if (await probeServerHealth(preferredBaseUrl)) {
    return { serverUrl: preferredBaseUrl, childProcess: null };
  }

  const parsedPreferred = new URL(preferredBaseUrl);
  const preferredPort = Number(parsedPreferred.port) || 3000;
  const chosenPort = (await isLocalPortAvailable(preferredPort))
    ? preferredPort
    : await allocateEphemeralPort();
  const activeUrl = `${parsedPreferred.protocol}//127.0.0.1:${chosenPort}`;

  const rootDir = appPath ? path.resolve(appPath) : path.resolve(currentDir, '../..');
  const unpackedRoot = rootDir.replace(/app\.asar$/i, 'app.asar.unpacked');
  const unpackedDist = path.join(unpackedRoot, 'dist');
  const asarDist = path.join(rootDir, 'dist');
  const distDir = fs.existsSync(path.join(unpackedDist, 'index.html')) ? unpackedDist : asarDist;
  const isProdBundle = fs.existsSync(path.join(distDir, 'index.html'));
  const bundledServer = path.join(rootDir, 'dist-electron', 'server.mjs');

  if (userDataDir) {
    const resolvedDataDir = path.join(userDataDir, 'friday-data');
    if (!fs.existsSync(resolvedDataDir)) {
      fs.mkdirSync(resolvedDataDir, { recursive: true });
    }
    process.env.FRIDAY_DATA_DIR = resolvedDataDir;
  }
  process.env.FRIDAY_APP_ROOT = rootDir;
  process.env.FRIDAY_DIST_DIR = distDir;
  process.env.PORT = String(chosenPort);

  if (isProdBundle && fs.existsSync(bundledServer)) {
    process.env.NODE_ENV = 'production';
    process.env.FRIDAY_EMBEDDED_IN_ELECTRON = '1';
    try {
      const serverMod = (await import(pathToFileURL(bundledServer).href)) as {
        startServer?: (portOverride?: number) => Promise<{ port: number; close: () => Promise<void> }>;
      };
      let closeEmbeddedServer: (() => Promise<void>) | undefined;
      if (typeof serverMod.startServer === 'function') {
        const started = await serverMod.startServer(chosenPort);
        closeEmbeddedServer = started.close;
      }
      for (let i = 0; i < 24; i += 1) {
        if (await probeServerHealth(activeUrl)) {
          return { serverUrl: activeUrl, childProcess: null, closeEmbeddedServer };
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return {
        serverUrl: activeUrl,
        childProcess: null,
        closeEmbeddedServer,
        startupError: 'Embedded F.R.I.D.A.Y. server started but health check timed out.',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Failed to start bundled server:', err);
      return {
        serverUrl: activeUrl,
        childProcess: null,
        startupError: `Failed to start bundled server: ${msg}`,
      };
    }
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
      FRIDAY_APP_ROOT: rootDir,
      FRIDAY_DIST_DIR: distDir,
      PORT: String(chosenPort),
      ...(userDataDir ? { FRIDAY_DATA_DIR: path.join(userDataDir, 'friday-data') } : {}),
    },
    stdio: 'ignore',
    shell: false,
  });

  for (let i = 0; i < 28; i += 1) {
    if (await probeServerHealth(activeUrl)) {
      return { serverUrl: activeUrl, childProcess: child };
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return {
    serverUrl: activeUrl,
    childProcess: child,
    startupError: `Local server did not respond on ${activeUrl} within timeout.`,
  };
}

export async function bootstrapElectronShell() {
  const electron = await import('electron' as string);
  const {
    app,
    BrowserWindow,
    desktopCapturer,
    dialog,
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
  let closeEmbeddedServer: (() => Promise<void>) | undefined;
  let isQuitting = false;
  let floatingMode = false;
  const config = getElectronConfig();
  let activeServerUrl = config.serverUrl;
  let activeShortcut = config.reopenShortcut;

  function isTrustedAppUrl(targetUrl: string): boolean {
    try {
      const parsedTarget = new URL(targetUrl);
      const parsedBase = new URL(activeServerUrl);
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

  function renderStartupRecoveryPage(reason: string): string {
    const safeReason = reason.replace(/[<>&"']/g, (ch) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[ch] || ch)
    );
    const safeUrl = activeServerUrl.replace(/[<>&"']/g, '');
    return (
      'data:text/html;charset=utf-8,' +
      encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>F.R.I.D.A.Y. Startup Recovery</title></head>
<body style="margin:0;background:#05020c;color:#f3e8ff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
  <div style="max-width:520px;padding:28px;border:1px solid rgba(217,70,239,0.45);border-radius:16px;background:#0d041d;">
    <h1 style="margin:0 0 10px;font-size:20px;color:#e879f9;">F.R.I.D.A.Y. Startup Recovery</h1>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#e9d5ff;">The desktop command server did not finish initializing cleanly.</p>
    <pre style="margin:0 0 16px;padding:12px;border-radius:8px;background:#05020c;color:#fca5a5;font-size:12px;white-space:pre-wrap;">${safeReason}</pre>
    <button onclick="location.href='${safeUrl}'" style="padding:10px 18px;border-radius:10px;border:1px solid #d946ef;background:#701a75;color:#fff;font-weight:600;cursor:pointer;">Retry Connection</button>
  </div>
</body></html>`)
    );
  }

  function resolveAppIconPath(): string | undefined {
    const appPath = app.isPackaged ? app.getAppPath() : path.resolve(currentDir, '../..');
    const resourcesDir = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath || '';
    const candidates = [
      resourcesDir ? path.join(resourcesDir, 'app.asar.unpacked', 'electron', 'icon.png') : '',
      path.join(appPath, 'electron', 'icon.png'),
      path.join(currentDir, 'icon.png'),
      path.join(process.cwd(), 'electron', 'icon.png'),
      resourcesDir ? path.join(resourcesDir, 'app.asar.unpacked', 'electron', 'icon.ico') : '',
      path.join(appPath, 'electron', 'icon.ico'),
      path.join(process.cwd(), 'electron', 'icon.ico'),
    ];
    return candidates.find((c) => Boolean(c) && fs.existsSync(c));
  }

  function createWindow(startupError?: string) {
    const cjsPreload = path.join(currentDir, 'preload.cjs');
    const esmPreload = path.join(currentDir, 'preload.js');
    const preloadPath = fs.existsSync(cjsPreload) ? cjsPreload : esmPreload;
    const iconPath = resolveAppIconPath();
    const windowIcon = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createFromBuffer(createTrayPngBuffer());
    let loadRetries = 0;

    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 960,
      minHeight: 620,
      frame: false,
      transparent: false,
      fullscreen: config.fullscreen,
      backgroundColor: '#05020c',
      icon: windowIcon,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    if (startupError) {
      mainWindow.loadURL(renderStartupRecoveryPage(startupError)).catch(() => {});
    } else {
      mainWindow.loadURL(activeServerUrl).catch(() => {});
    }

    mainWindow.webContents.on(
      'did-fail-load',
      (_event: Event, errorCode: number, errorDescription: string, validatedURL: string) => {
        if (isQuitting || !mainWindow || mainWindow.isDestroyed()) return;
        if (validatedURL.startsWith('data:')) return;
        if (loadRetries < 5) {
          loadRetries += 1;
          setTimeout(() => {
            mainWindow?.loadURL(activeServerUrl).catch(() => {});
          }, 600);
          return;
        }
        mainWindow
          .loadURL(renderStartupRecoveryPage(`Failed to load ${validatedURL} (${errorCode}: ${errorDescription})`))
          .catch(() => {});
      }
    );

    mainWindow.webContents.on('render-process-gone', () => {
      if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
        setTimeout(() => {
          mainWindow?.loadURL(activeServerUrl).catch(() => {});
        }, 500);
      }
    });

    mainWindow.webContents.on('will-navigate', (event: Event, url: string) => {
      if (!isTrustedAppUrl(url) && !url.startsWith('data:text/html')) {
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
    const appRootPath = app.isPackaged ? app.getAppPath() : path.resolve(currentDir, '../..');
    const boot = await ensureLocalServerRunning(config.serverUrl, app.getPath('userData'), appRootPath);
    activeServerUrl = boot.serverUrl;
    embeddedServerProcess = boot.childProcess;
    closeEmbeddedServer = boot.closeEmbeddedServer;

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

    createWindow(boot.startupError);
    registerShortcut(activeShortcut);

    const trayIconPath = resolveAppIconPath();
    const rawTrayImage = trayIconPath
      ? nativeImage.createFromPath(trayIconPath)
      : nativeImage.createFromBuffer(createTrayPngBuffer());
    const icon = rawTrayImage.isEmpty()
      ? nativeImage.createFromBuffer(createTrayPngBuffer())
      : rawTrayImage.resize({ width: 16, height: 16 });
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
            void closeEmbeddedServer?.();
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
      void closeEmbeddedServer?.();
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

    async function fetchLiveAllowedFolders(): Promise<string[]> {
      try {
        const res = await fetch(`${activeServerUrl.replace(/\/+$/, '')}/api/files/status`, {
          signal: AbortSignal.timeout(1200),
        });
        if (res.ok) {
          const data = (await res.json()) as { allowedFolders?: string[] };
          if (Array.isArray(data.allowedFolders)) return data.allowedFolders;
        }
      } catch {
        // Fallback when querying before server ready
      }
      return [process.cwd(), app.getPath('desktop'), app.getPath('downloads'), app.getPath('documents')];
    }

    ipcMain.handle('friday:open-folder', async (_evt: unknown, folderNameOrPath: unknown) => {
      const allowed = await fetchLiveAllowedFolders();
      return openWindowsFolder(String(folderNameOrPath || ''), allowed);
    });

    ipcMain.handle('friday:select-folder', async () => {
      if (!dialog?.showOpenDialog) {
        return { canceled: true, error: 'Native folder picker is unavailable in this environment.' };
      }
      const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
        title: 'Select Permitted Folder for F.R.I.D.A.Y.',
        buttonLabel: 'Grant Folder Access',
        properties: ['openDirectory', 'dontAddToRecent'],
      });
      if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
        return { canceled: true };
      }
      return { canceled: false, folderPath: path.resolve(result.filePaths[0]) };
    });

    ipcMain.handle('friday:reveal-file', async (_evt: unknown, filePath: unknown) => {
      const raw = String(filePath || '');
      if (!raw || raw.includes('\0')) {
        return { revealed: false, message: 'Invalid file path.' };
      }
      const allowed = await fetchLiveAllowedFolders();
      const resolved = path.resolve(raw);
      if (!isWindowsPathPermitted(resolved, allowed)) {
        return {
          revealed: false,
          path: resolved,
          message: 'Access denied: file is outside user-permitted folders.',
        };
      }
      if (!fs.existsSync(resolved)) {
        return { revealed: false, path: resolved, message: 'File does not exist.' };
      }
      try {
        shell.showItemInFolder(resolved);
        return {
          revealed: true,
          path: resolved,
          message: `Revealed "${path.basename(resolved)}" in system Explorer.`,
        };
      } catch {
        return revealFileInWindowsExplorer(resolved, allowed);
      }
    });

    ipcMain.handle('friday:open-file', async (_evt: unknown, filePath: unknown) => {
      const raw = String(filePath || '');
      if (!raw || raw.includes('\0')) {
        return { opened: false, detail: 'Invalid file path.' };
      }
      const allowed = await fetchLiveAllowedFolders();
      const resolved = path.resolve(raw);
      if (!isWindowsPathPermitted(resolved, allowed)) {
        return { opened: false, detail: 'Access denied: file is outside user-permitted folders.' };
      }
      if (!fs.existsSync(resolved)) {
        return { opened: false, detail: 'File not found.' };
      }
      try {
        const errText = await shell.openPath(resolved);
        if (errText) {
          return openLocalPathInDefaultApp(resolved);
        }
        return { opened: true, detail: `Opened "${path.basename(resolved)}" in default application.` };
      } catch {
        return openLocalPathInDefaultApp(resolved);
      }
    });

    ipcMain.handle('friday:active-window', async () => {
      return detectActiveWindow();
    });

    ipcMain.handle('friday:inspect-screen-ui', async (_evt: unknown, processFilter: unknown) => {
      if (processFilter) {
        return listUiElementsWindows(String(processFilter));
      }
      return captureAndOcrScreenWindows();
    });

    ipcMain.handle(
      'friday:capture-screen',
      async (
        _evt: unknown,
        opts?: { target?: 'screen' | 'window'; sourceId?: string; windowName?: string }
      ) => {
        try {
          if (desktopCapturer) {
            const types: Array<'screen' | 'window'> =
              opts?.target === 'window' ? ['window'] : ['screen', 'window'];
            const sources = (await desktopCapturer.getSources({
              types,
              thumbnailSize: { width: 1920, height: 1080 },
              fetchWindowIcons: true,
            })) as Array<{
              id: string;
              name: string;
              thumbnail: { toPNG: () => Buffer; getSize: () => { width: number; height: number } };
            }>;
            if (sources.length > 0) {
              let source = sources[0];
              if (opts?.sourceId) {
                const matched = sources.find((s) => s.id === opts.sourceId);
                if (matched) source = matched;
              } else if (opts?.windowName) {
                const lower = opts.windowName.toLowerCase();
                const matched = sources.find((s) => s.name.toLowerCase().includes(lower));
                if (matched) source = matched;
              } else if (opts?.target === 'window' && sources.length > 1) {
                const nonFriday = sources.find(
                  (s) => !s.name.includes('F.R.I.D.A.Y.') && s.name.trim().length > 0
                );
                if (nonFriday) source = nonFriday;
              }
              const pngBuf = source.thumbnail.toPNG();
              const size = source.thumbnail.getSize();
              return {
                ok: true,
                base64Data: pngBuf.toString('base64'),
                mimeType: 'image/png',
                sourceName: source.name,
                width: size.width,
                height: size.height,
                detail: `Captured "${source.name}" (${size.width}x${size.height}) via desktopCapturer.`,
              };
            }
          }
        } catch {
          // Fallback to GDI
        }
        if (process.platform === 'win32') {
          return captureScreenWindowsGdi();
        }
        return {
          ok: false,
          mimeType: 'image/png',
          detail: 'Screen capture requires an active desktop display session or live Windows host.',
          error: 'NO_DISPLAY',
        };
      }
    );

    ipcMain.handle('friday:list-screen-sources', async () => {
      try {
        if (desktopCapturer) {
          const sources = (await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 320, height: 180 },
            fetchWindowIcons: true,
          })) as Array<{
            id: string;
            name: string;
            thumbnail?: { toPNG: () => Buffer };
          }>;
          return sources.map((s) => ({
            id: s.id,
            name: s.name,
            isScreen: s.id.startsWith('screen'),
            thumbnailBase64: s.thumbnail ? s.thumbnail.toPNG().toString('base64') : undefined,
          }));
        }
      } catch {
        // Fallback
      }
      return [];
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
    void stopWindowsSapiTts();
    try {
      tray?.destroy();
    } catch {
      // Ignore tray destroy error
    }
    void closeEmbeddedServer?.();
    embeddedServerProcess?.kill();
  });
}

if (typeof process !== 'undefined' && process.versions?.electron) {
  bootstrapElectronShell().catch((err) => {
    console.error('Failed to bootstrap Electron shell:', err);
  });
}
