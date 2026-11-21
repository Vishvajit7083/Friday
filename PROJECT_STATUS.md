# F.R.I.D.A.Y. — Project Audit & Windows Readiness Status (`PROJECT_STATUS.md`)

**Audit Date:** 2026-11-21
**Inspected Repository Root:** `/app/applet`
**Target Platform:** Windows 11 / Windows 10 Desktop Companion (Electron + React + TypeScript + Node.js)

---

## 1. Existing Architecture Summary

- **Frontend (`/src`)**: React 19 + TypeScript + Tailwind CSS v4 (`@tailwindcss/vite`), Three.js (`FridayCore3D.tsx`), custom CSS HUD glassmorphism (`index.css`), and modular section views under `/src/components/views/`.
- **Backend (`/server.ts` & `/server/*`)**: Express 4 REST server (port `3000`) serving Vite middleware in dev and `dist/` in production. Handles Gemini AI reasoning (`aiService.ts`), real OS telemetry (`systemService.ts` via `systeminformation`), Open-Meteo weather (`weatherService.ts`), folder-sandboxed file scanning (`fileService.ts`), and JSON file persistence (`store.ts` -> `.friday-data/friday-db.json`).
- **Electron (`/electron/*`)**: Contains starter stubs `main.ts`, `preload.ts`, `windowsAutomation.ts`, plus `electron-builder.yml` and `README_WINDOWS_BUILD.md`.

---

## 2. Completed Features (Verified in Source)

1. **Approved Futuristic Command Center HUD**:
   - `CommandWorkspace.tsx`, `TopHudBar.tsx`, `LeftSidebar.tsx`, `BottomQuickActions.tsx`, `FridayCore3D.tsx`, `LiveWallpaper.tsx`.
   - 3D holographic particle core with 4 modes (`orbital`, `neural-matrix`, `telemetry-sphere`, `exploded`), voice-state colors, emitter beam, and live wallpaper modes including user-selected MP4/WebM video + blur/brightness/opacity/performance-mode controls.
2. **Gemini AI Integration (`server/aiService.ts`, `/api/health/ai`)**:
   - Uses `@google/genai` server-side (`GEMINI_API_KEY` stays strictly on server).
   - Automatic transient failover (`503`, `429`, `Deadline`, `timeout`) from `gemini-4-hydrogen` -> `gemini-3.1-flash-lite`.
   - Live `/api/health/ai` connection diagnostic wired to clickable `API Connected` / `API Offline · Retry` HUD indicator.
   - Google Search & URL Context grounding in `/api/browser/research`.
   - Multimodal analysis (`/api/vision/analyze`), neural WAV TTS (`/api/voice/tts`), and audio STT (`/api/voice/transcribe` with `;codecs=...` MIME normalization).
3. **Voice Pipeline (`src/App.tsx`, `src/core/intentEngine.ts`)**:
   - `SpeechRecognition` with `interimResults`, live transcript feedback, punctuated wake-word parser (`extractVoiceCommand`), and automatic fallback to `MediaRecorder` -> `/api/voice/transcribe`.
   - Neural TTS playback with browser `SpeechSynthesis` fallback and interruption (`stopSpeaking`).
4. **Live Hardware Telemetry (`server/systemService.ts`)**:
   - Real `systeminformation` metrics for CPU load, model/cores, RAM used/total, primary disk storage, network RX/TX KB/s, battery percentage (when present), and OS top process list (`/api/system/processes`).
5. **Permission-Gated File Explorer (`server/fileService.ts`, `src/core/fileIndex.ts`)**:
   - Directory confinement (`isPathPermitted`), incremental depth/file bounds, duplicate file grouping, safe preview, and AI file summarization (`/api/files/summarize`).
6. **Calendar, Personal Memory, Action Audit Log & Workflows (`server/store.ts`)**:
   - Persistent CRUD for calendar events, personal memory, chat history, custom multi-agent workflows, and up to 80 action audit entries.

---

## 3. Incomplete Features

1. **Electron Desktop Entry & Packaging (`electron/main.ts`, `electron/preload.ts`, `package.json`)**:
   - `electron/main.ts` only *exports* `bootstrapElectronShell()` and never invokes it at runtime.
   - `electron/preload.ts` only *exports* `registerPreloadBridge()` and never executes it.
   - `package.json` lacks `"main"`, Electron compile scripts, and `electron` / `electron-builder` packages.
   - Packaged production Electron builds do not yet auto-start the embedded Node backend server (`server.ts`) inside the Electron main process.
   - Tray uses `nativeImage.createEmpty()`, which renders blank/missing on Windows 11.
   - Missing window controls via IPC: minimize, maximize/restore, borderless/floating assistant always-on-top mode, Windows startup toggle (`app.setLoginItemSettings`), dynamic global shortcut updates, and true app exit/shutdown vs hide-to-tray.
2. **Windows Application Control (`server/systemService.ts`, `electron/windowsAutomation.ts`)**:
   - `launchApplication()` only checks `which`/`where` (`checkCommandAvailable`) and does **not** actually spawn the executable or Windows Start App.
   - `electron/windowsAutomation.ts` (`discoverWindowsStartApps`, `focusWindowsWindow`) is orphaned and never called by `server.ts` or `electron/main.ts`.
   - No safe active-window listing, window switching, or user-confirmed window closing wired into the backend.
3. **Database Persistence (`server/store.ts` vs `server/schema.sql`)**:
   - `server/schema.sql` defines 5 SQLite tables, while `server/store.ts` uses `.friday-data/friday-db.json` (no SQLite driver attached yet; Node 22 built-in `node:sqlite` or SQLite adapter can be bridged cleanly).
4. **AI Structured Tool Calling & Multi-Step Planning (`server/aiService.ts`)**:
   - Intent classification relies on regex patterns (`analyzeUserCommand`), not Gemini `functionDeclarations` structured tool execution + verification/recovery loops.
   - `/api/assistant/confirm` still returns a placeholder `"Simulated safe confirmation inside sandbox"` message for non-calendar sensitive actions.
5. **Document & Media Extraction (`server/fileService.ts`)**:
   - Text content indexing works for source/text formats (`.ts`, `.md`, `.txt`, `.json`, `.csv`, `.py`, `.sql`, etc.) only; binary `.pdf`, `.docx`, `.xlsx`, `.pptx` content is not parsed locally without multimodal upload.
6. **Offline Basic Mode & Screen Capture in Electron**:
   - If `GEMINI_API_KEY` is missing or internet is offline, `/api/assistant/command` fails instead of running local deterministic commands (hardware stats, file search, app launch, calendar).
   - Electron `desktopCapturer` permission handler (`setDisplayMediaRequestHandler`) is not yet registered in `electron/main.ts`.
7. **Diagnostics, Hardware Compatibility Audit & Test Report**:
   - No UI or API exists yet for running safe system diagnostics, checking Windows hardware compatibility, inspecting test results (`pass`/`fail`/`warning`/`unavailable`), or generating `TEST_REPORT.md`.

---

## 4. Broken or Mismatched Items Found

1. **Orphaned Electron Boot (`electron/main.ts`, `electron/preload.ts`)**: Running Electron directly against compiled `electron/main.js` would exit or do nothing because `bootstrapElectronShell()` and `registerPreloadBridge()` are exported functions never called at entry.
2. **App Launching Claims Without Process Spawn (`server/systemService.ts`)**: Clicking Launch on an available binary reports `"prepared launch context"` without actually starting the process on desktop hosts.
3. **Strict Mass-Assignment in `PATCH` Routes (`server.ts`)**:
   - `PATCH /api/calendar/:id` (`Object.assign(evt, req.body)`), `PATCH /api/memory/:id`, and `PATCH /api/settings` accept unvalidated `req.body` keys directly.
4. **Default Battery Variable in `TopHudBar.tsx`**: Uses `telemetry?.batteryPercent ?? 100` (renders `"AC"` in text, though internal fallback `100` should be explicit `null` check).

---

## 5. Missing Integrations & Windows Requirements

- **Windows Build Tools**: `electron`, `electron-builder`, and TypeScript Electron compilation config (`tsconfig.electron.json`) are not yet configured in `package.json`.
- **Windows-Native Shell & UIA Bridges**: Connecting `discoverWindowsStartApps()`, `Start-Process`, window focus/close (`AppActivate` / `CloseMainWindow`), and `desktopCapturer` into IPC / backend endpoints.
- **Diagnostics & Automated Test Runner**: Live hardware compatibility audit (`osInfo`, `cpu`, `graphics`, `mem`, `fsSize`, display, microphone/speaker capability detection) + runnable diagnostics dashboard + `TEST_REPORT.md` export.

---

## 6. Dependencies Snapshot (`package.json`)

- **Runtime**: `@google/genai ^3.6.1`, `express ^4.21.2`, `systeminformation ^5.33.23`, `three ^0.187.0`, `react ^19.0.1`, `react-dom ^19.0.1`, `lucide-react ^0.546.0`, `motion ^12.23.24`, `dotenv ^17.2.3`, `vite ^8.3.0`, `@tailwindcss/vite ^4.3.3`.
- **Dev**: `tsx ^4.21.0`, `typescript ^7.0.2`, `@types/express`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/three`, `esbuild`, `autoprefixer`, `tailwindcss`.
- **Missing for Windows Packaging**: `electron`, `electron-builder` (and optional `playwright` / `playwright-core` if headless page scraping is desired beyond Gemini `urlContext`).

---

## 7. Security Problems Identified

1. **Unvalidated `Object.assign` on `PATCH` Routes (`server.ts` lines 415, 462, 523)**: Allows clients to overwrite arbitrary fields (`id`, `createdAt`, `approved`) or pollute object properties. **Fix**: Explicitly whitelist allowed fields per endpoint.
2. **Missing API Rate Limiting (`server.ts`)**: `/api/assistant/command`, `/api/voice/tts`, `/api/voice/transcribe`, and `/api/vision/analyze` have no request throttling. **Fix**: Add sliding-window rate limiter middleware.
3. **Electron Navigation & Permission Hardening (`electron/main.ts`)**: Missing `will-navigate` and `setWindowOpenHandler` restrictions on `BrowserWindow`, and missing explicit `setPermissionRequestHandler` scoping permissions (allowing microphone/display capture cleanly while denying unsafe permissions).
4. **Electron Tray Empty Icon (`electron/main.ts` line 69)**: Should generate an embedded PNG/SVG tray icon rather than `nativeImage.createEmpty()`.
5. **Host Command Validation**: All Windows process calls must strictly use `execFile` / `spawn` with `shell: false` and strict regex/allowlist validation — never passing raw AI strings to PowerShell/CMD.

---

## 8. Testing Requirements

| Test Category | Container / Headless Coverage | Physical Windows Laptop Required |
|---|---|---|
| Frontend Rendering & HUD Lock | Playwright Chromium (`1440×900`, console = 0 errors) | Yes (1080p & multi-DPI check) |
| Unit Tests (Logic / Intent / File Index / Diagnostics) | `node:test` via `npx --yes tsx --test` | Yes |
| Gemini Connectivity & Failover Recovery | Live `GET /api/health/ai` + `/api/assistant/command` | Yes |
| Database Read/Write & Settings Export | Diagnostics round-trip & API CRUD checks | Yes |
| System Telemetry (CPU/RAM/Disk/Net/Temp/Battery) | `systeminformation` real container metrics (`Unavailable` on unsupported GPU/temp sensors) | Yes (verify Windows WMI CPU/GPU temp & battery) |
| Electron Startup, Tray, Minimize/Floating, ESC + Reopen | Electron main/preload compilation & config audit | Yes (`electron .` + `.exe` installer on Windows 10/11) |
| Windows Start Apps Discovery & Real App Launch/Switch | Input-validation & safe-dispatch checks | Yes (Chrome, VS Code, Notepad, Terminal) |
| Physical Microphone Wake-Word & Screen Capture | Web UI transitions + API endpoint tests | Yes (real mic audio & Windows display picker) |

---

## 9. Prioritized Development Milestones

1. **Milestone 1 — Security Fixes, Windows Compatibility Audit & Diagnostics Dashboard (Current Milestone)**:
   - Harden `PATCH` input validation and add API rate limiting in `server.ts`.
   - Fix `electron/main.ts`, `electron/preload.ts`, and `electron/windowsAutomation.ts` (self-bootstrap, complete window control IPC, floating/borderless mode, startup toggle, navigation guard, real tray icon, `Quit F.R.I.D.A.Y.`).
   - Implement real Windows compatibility audit + safe automated diagnostics runner (`/api/diagnostics/audit`, `/api/diagnostics/run`, `TEST_REPORT.md` export).
   - Integrate the Diagnostics & Compatibility Audit Dashboard into the existing `SystemMonitorFullView` (preserving 100% of the approved Command Center UI) + Settings Export in `SettingsView`.
2. **Milestone 2 — Real Windows App Launcher, Window Switcher & Offline Basic Mode**:
   - Wire `discoverWindowsStartApps()`, real safe app spawning (`shell: false`), window focus/close with confirmation, and deterministic offline fallback when Gemini is unavailable.
3. **Milestone 3 — Gemini Structured Function Calling & Multi-Step Verification**:
   - Upgrade `server/aiService.ts` with Gemini `functionDeclarations` tool execution, verification, and error recovery across File, App, Browser, Calendar, and System agents.
4. **Milestone 4 — Advanced File/Media Intelligence & Windows Installer Packaging**:
   - Add PDF/Office metadata/content extraction, clipboard intelligence (with explicit user trigger), `tsconfig.electron.json`, embedded backend startup inside `electron/main.ts`, and NSIS `.exe` installer packaging + `WINDOWS_SETUP.md`.
