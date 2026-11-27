// Electron Preload Bridge (Context-Isolated, Synchronous CJS Compatible)
// Exposes an explicit allowlist of desktop window, speech, and Windows automation IPCs.

interface ElectronPreloadApi {
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => void;
  };
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    on?: (channel: string, listener: (...args: unknown[]) => void) => void;
    removeListener?: (channel: string, listener: (...args: unknown[]) => void) => void;
  };
}

declare const require: ((id: string) => unknown) | undefined;

export function registerPreloadBridge(electronOverride?: ElectronPreloadApi): boolean {
  let electronApi = electronOverride;
  if (!electronApi && typeof require === 'function') {
    try {
      electronApi = require('electron') as ElectronPreloadApi;
    } catch {
      electronApi = undefined;
    }
  }
  if (!electronApi?.contextBridge || !electronApi?.ipcRenderer) {
    return false;
  }

  const { contextBridge, ipcRenderer } = electronApi;

  contextBridge.exposeInMainWorld('fridayDesktop', {
    hideToDesktop: () => ipcRenderer.invoke('friday:hide-to-desktop'),
    restoreWindow: () => ipcRenderer.invoke('friday:restore-window'),
    minimizeWindow: () => ipcRenderer.invoke('friday:minimize-window'),
    toggleMaximize: () => ipcRenderer.invoke('friday:toggle-maximize'),
    setFullscreen: (enabled: boolean) => ipcRenderer.invoke('friday:set-fullscreen', Boolean(enabled)),
    setFloatingMode: (enabled: boolean) => ipcRenderer.invoke('friday:set-floating-mode', Boolean(enabled)),
    setStartupLaunch: (enabled: boolean) => ipcRenderer.invoke('friday:set-startup-launch', Boolean(enabled)),
    updateReopenShortcut: (shortcut: string) =>
      ipcRenderer.invoke('friday:update-reopen-shortcut', String(shortcut)),
    getDesktopState: () => ipcRenderer.invoke('friday:get-window-state'),
    quitApp: () => ipcRenderer.invoke('friday:quit-app'),
    getVoiceCapabilities: () => ipcRenderer.invoke('friday:voice-capabilities'),
    requestMicPermission: () => ipcRenderer.invoke('friday:request-mic-permission'),
    recognizeSpeechWav: (payload: { wavBase64: string; language: string }) =>
      ipcRenderer.invoke('friday:recognize-speech-wav', payload),
    speakWindowsTts: (payload: {
      text: string;
      language: string;
      gender: string;
      rate: number;
      pitch: number;
    }) => ipcRenderer.invoke('friday:speak-windows-tts', payload),
    stopWindowsTts: () => ipcRenderer.invoke('friday:stop-windows-tts'),
    launchApp: (target: string) => ipcRenderer.invoke('friday:launch-app', String(target)),
    openWebsite: (urlOrAlias: string) => ipcRenderer.invoke('friday:open-website', String(urlOrAlias)),
    openFolder: (folderNameOrPath: string) =>
      ipcRenderer.invoke('friday:open-folder', String(folderNameOrPath)),
    selectFolder: () => ipcRenderer.invoke('friday:select-folder'),
    revealFileInExplorer: (filePath: string) =>
      ipcRenderer.invoke('friday:reveal-file', String(filePath)),
    openFile: (filePath: string) => ipcRenderer.invoke('friday:open-file', String(filePath)),
    getActiveWindow: () => ipcRenderer.invoke('friday:active-window'),
    inspectScreenUi: (processFilter?: string) =>
      ipcRenderer.invoke('friday:inspect-screen-ui', processFilter ? String(processFilter) : undefined),
    captureScreen: (opts?: { target?: 'screen' | 'window'; sourceId?: string; windowName?: string }) =>
      ipcRenderer.invoke('friday:capture-screen', opts),
    listScreenSources: () => ipcRenderer.invoke('friday:list-screen-sources'),
    getWindowsDiagnostics: () => ipcRenderer.invoke('friday:windows-diagnostics'),
    onStopSpeech: (callback: () => void) => {
      if (typeof ipcRenderer.on !== 'function') return () => {};
      const handler = () => callback();
      ipcRenderer.on('friday:stop-speech', handler);
      return () => {
        ipcRenderer.removeListener?.('friday:stop-speech', handler);
      };
    },
    isDesktopShell: true,
  });

  return true;
}

if (typeof process !== 'undefined' && process.versions?.electron) {
  registerPreloadBridge();
}
