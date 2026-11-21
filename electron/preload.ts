// Electron Preload Bridge (Context-Isolated)
// Exposes an explicit allowlist of desktop window controls without leaking Node APIs.
export async function registerPreloadBridge() {
  const electron = await import('electron' as string);
  const { contextBridge, ipcRenderer } = electron;

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
    isDesktopShell: true,
  });
}

if (typeof process !== 'undefined' && process.versions?.electron) {
  registerPreloadBridge().catch(() => {});
}
