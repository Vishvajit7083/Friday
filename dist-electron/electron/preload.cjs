var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// electron/preload.ts
var preload_exports = {};
__export(preload_exports, {
  registerPreloadBridge: () => registerPreloadBridge
});
module.exports = __toCommonJS(preload_exports);
function registerPreloadBridge(electronOverride) {
  let electronApi = electronOverride;
  if (!electronApi && typeof require === "function") {
    try {
      electronApi = require("electron");
    } catch {
      electronApi = void 0;
    }
  }
  if (!electronApi?.contextBridge || !electronApi?.ipcRenderer) {
    return false;
  }
  const { contextBridge, ipcRenderer } = electronApi;
  contextBridge.exposeInMainWorld("fridayDesktop", {
    hideToDesktop: () => ipcRenderer.invoke("friday:hide-to-desktop"),
    restoreWindow: () => ipcRenderer.invoke("friday:restore-window"),
    minimizeWindow: () => ipcRenderer.invoke("friday:minimize-window"),
    toggleMaximize: () => ipcRenderer.invoke("friday:toggle-maximize"),
    setFullscreen: (enabled) => ipcRenderer.invoke("friday:set-fullscreen", Boolean(enabled)),
    setFloatingMode: (enabled) => ipcRenderer.invoke("friday:set-floating-mode", Boolean(enabled)),
    setStartupLaunch: (enabled) => ipcRenderer.invoke("friday:set-startup-launch", Boolean(enabled)),
    updateReopenShortcut: (shortcut) => ipcRenderer.invoke("friday:update-reopen-shortcut", String(shortcut)),
    getDesktopState: () => ipcRenderer.invoke("friday:get-window-state"),
    quitApp: () => ipcRenderer.invoke("friday:quit-app"),
    getVoiceCapabilities: () => ipcRenderer.invoke("friday:voice-capabilities"),
    requestMicPermission: () => ipcRenderer.invoke("friday:request-mic-permission"),
    recognizeSpeechWav: (payload) => ipcRenderer.invoke("friday:recognize-speech-wav", payload),
    speakWindowsTts: (payload) => ipcRenderer.invoke("friday:speak-windows-tts", payload),
    stopWindowsTts: () => ipcRenderer.invoke("friday:stop-windows-tts"),
    launchApp: (target) => ipcRenderer.invoke("friday:launch-app", String(target)),
    openWebsite: (urlOrAlias) => ipcRenderer.invoke("friday:open-website", String(urlOrAlias)),
    openFolder: (folderNameOrPath) => ipcRenderer.invoke("friday:open-folder", String(folderNameOrPath)),
    getWindowsDiagnostics: () => ipcRenderer.invoke("friday:windows-diagnostics"),
    onStopSpeech: (callback) => {
      if (typeof ipcRenderer.on !== "function") return () => {
      };
      const handler = () => callback();
      ipcRenderer.on("friday:stop-speech", handler);
      return () => {
        ipcRenderer.removeListener?.("friday:stop-speech", handler);
      };
    },
    isDesktopShell: true
  });
  return true;
}
if (typeof process !== "undefined" && process.versions?.electron) {
  registerPreloadBridge();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  registerPreloadBridge
});
