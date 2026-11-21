# F.R.I.D.A.Y. — Project Audit & Windows Readiness Status (`PROJECT_STATUS.md`)

**Updated Date:** 2026-11-21
**Inspected Repository Root:** `/app/applet` (Windows target `D:\Friday-main`)
**Target Platform:** Windows 11 / Windows 10 Desktop Companion (Electron + React + TypeScript + Node.js + Local Ollama / Offline Core)

---

## 1. Existing Architecture Summary

- **Frontend (`/src`)**: React 19 + TypeScript + Tailwind CSS v4 (`@tailwindcss/vite`), Three.js (`FridayCore3D.tsx`), custom HUD glassmorphism (`index.css`), and preserved views under `/src/components/views/`. **Zero visual redesign applied — UI locked to approved specification.**
- **Local-First Backend (`/server.ts` & `/server/*`)**: Express 4 server (port `3000`) serving Vite middleware in dev and `dist/` in production. Features:
  - **Local-First Hybrid AI Orchestrator (`server/aiService.ts` + `server/localAiService.ts`)**: `local-auto` default requiring **zero paid cloud API keys**. Automatically connects to local **Ollama** (`http://127.0.0.1:11434`) with NDJSON token streaming (`keep_alive: '10m'`), falls back seamlessly to the zero-latency deterministic Local Tool & Intent Core, and optionally supports Gemini if `GEMINI_API_KEY` is supplied.
  - **Real-Time SSE Streaming (`/api/assistant/stream`)**: Emits `meta`, `delta`, `done`, and `error` events with `AbortController` client cancellation (`req.on('close')`) and per-stage latency telemetry (`PipelineTimings`).
  - **Keyless Direct Internet Research (`server/internetResearchService.ts`)**: Free web search (DuckDuckGo HTML + Wikipedia OpenSearch) and SSRF-hardened public webpage extraction/summarization (`validatePublicHttpUrl` blocking loopback/RFC1918/link-local IPs + DNS resolution checks).
  - **Low-Latency Voice Pipeline (`src/App.tsx`)**: Local browser/Windows `SpeechSynthesis` queued sentence-by-sentence directly from streamed SSE tokens, immediate barge-in interruption (`isInterruptionCommand`), and Web Speech API STT + clean non-failing fallback.
  - **Windows Automation, App Launcher & Media (`server/systemService.ts`, `server/mediaService.ts`, `electron/windowsAutomation.ts`)**: Cached (60s TTL) Windows StartApp/UWP & executable discovery, safe `shell: false` launching, running window listing + Focus/Minimize/Maximize/Close (with confirmation gate), and Win32 media/volume key control + local media playback (`POST /api/files/open`, `GET /api/files/stream`).
  - **Natural-Language File Intelligence (`server/fileService.ts`, `src/core/fileIndex.ts`)**: Permitted default user folders (`Downloads`, `Desktop`, `Documents`, `Pictures`, `Videos`, `Music`), 30s TTL index cache, relative date/folder/type intent parsing (`yesterday`, `today`, `last week`), `matchReason` explanations, and native default-app opening.
- **Electron Shell (`/electron/*`, `tsconfig.electron.json`)**: Self-bootstrapping ESM main process (`dist-electron/electron/main.js`) with embedded backend server startup, tray icon + menu, `Ctrl+Shift+Space` global reopen shortcut, `ESC` hide-to-desktop, floating assistant mode, `desktopCapturer` display media handler, and `render-process-gone` crash recovery.

---

## 2. Completed Milestones (Verified)

1. **Paid API Dependency Removed**: All chat, health, research, file summary, briefing, and voice endpoints operate offline or via Ollama/free web without requiring `GEMINI_API_KEY`. Legacy saved databases auto-migrate to `local-auto`.
2. **Real-Time Streaming & Latency Profiling**: `/api/assistant/stream` SSE pipeline + `/api/diagnostics/latency` stage timing metrics (`intentMs`, `toolMs`, `firstTokenMs`, `modelMs`, `totalMs`).
3. **Free Direct Web Research**: `/api/browser/research` searches live web & summarizes pages cleanly with verified links and SSRF protection.
4. **Electron & Windows Native Automation**: Compiles cleanly via `npm run electron:compile`, auto-spawns backend when packaged, registers display capture, window state management, UWP app launch, Win32 media keys, and terminates child backend on quit.
5. **Security Hardening**: `sanitizeSettingsPatch`, `sanitizeCalendarPatch`, `sanitizeMemoryPatch`, sliding-window rate limiting, SSRF IP/DNS validation, folder sandbox (`isPathPermitted`), `shell: false` child spawning, and mandatory confirmation gates for delete/close-app actions.

---

## 3. Physical Windows Hardware Checks Recommended After Pull

Container verification validates TypeScript builds, unit tests (`node:test`), live HTTP/SSE APIs, free web research, diagnostics, and Chromium UI rendering at `1440×900`. On the target Windows 10/11 laptop (`D:\Friday-main`), verify:
- Real microphone wake-word / speech recognition in Windows Electron or Chrome (`http://localhost:3000`).
- Local Ollama streaming with your installed model (e.g., `ollama pull llama3.2`).
- Windows Start Menu / UWP app launching, Focus/Close running windows, and Win32 volume/media keys.
- Native NSIS `.exe` installer generation via `npx electron-builder --win`.
