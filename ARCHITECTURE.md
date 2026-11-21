# F.R.I.D.A.Y. — System Architecture (`ARCHITECTURE.md`)

## 1. Design Philosophy
F.R.I.D.A.Y. (**Fully Responsive Intelligent Digital Assistant for You**) runs as a **local-first, paid-API-free** Windows desktop companion built with Electron, React 19, TypeScript, Express, and Three.js.

- **UI Design Lock**: All desktop/web upgrades bind exclusively to the approved Command Center HUD (`CommandWorkspace`, `TopHudBar`, `LeftSidebar`, `FridayCore3D`, `LiveWallpaper`, `BottomQuickActions`).
- **Zero Mandatory Cloud API Key**: Every core workflow—conversation, system telemetry, file intelligence, app launching, media playback, calendar/memory, voice I/O, and live web research—operates without `GEMINI_API_KEY`.

---

## 2. AI & Execution Pipeline

### Inference Routing (`server/aiService.ts` + `server/localAiService.ts`)
1. **`local-auto` (Default — Zero External Installs Required)**:
   - Runs F.R.I.D.A.Y.'s **Built-In Local Core + Live Web Knowledge** engine: executes hardware/app/file/media/calendar/memory tools locally, evaluates safe arithmetic offline, and automatically answers factual/general questions via free DuckDuckGo + Wikipedia summary lookup (`searchFreeWeb`).
   - Also auto-detects optional external local LLM servers if running: any OpenAI-compatible runtime (`LOCAL_AI_BASE_URL` for LM Studio / `llama.cpp` / Jan) or Ollama (`127.0.0.1:11434`).
2. **`local-core`**: Strictly built-in Local Core + Live Web (zero external LLM calls).
3. **`ollama`**: External local LLM mode (OpenAI-compatible `LOCAL_AI_BASE_URL` or Ollama).
4. **Optional Gemini (`gemini-*`)**: Used *only* if `GEMINI_API_KEY` is explicitly configured in `.env`.

### Streaming & Latency Telemetry (`POST /api/assistant/stream`)
- Uses Server-Sent Events (`text/event-stream`):
  - `event: meta` -> route intent, active agents, latency breakdown so far
  - `event: delta` -> token-by-token text chunks
  - `event: done` -> final structured `AssistantCommandResponse` + `PipelineTimings`
- Supports abort cancellation (`AbortController` wired to `req.on('close')`).
- Per-request timings recorded in `GET /api/diagnostics/latency`:
  - `intentMs`: intent classification & routing
  - `toolMs`: local tool execution / OS query
  - `firstTokenMs`: time to first streamed response byte
  - `modelMs`: total LLM streaming time
  - `totalMs`: end-to-end server duration

---

## 3. Voice & Barge-In Loop (`src/App.tsx`, `src/core/intentEngine.ts`)
- **Speech Input**:
  - Live Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) with `interimResults` + wake-word filtering (`extractVoiceCommand`).
  - Audio recorder fallback (`/api/voice/transcribe`) returns `{ localFallback: true }` gracefully if no cloud key is present so UI remains error-free.
- **Barge-In Interruption**:
  - `isInterruptionCommand()` intercepts `"stop"`, `"Friday, stop talking"`, `"quiet"`, `"cancel"`, and `"shut up"` while speaking or streaming, immediately cancelling `window.speechSynthesis` and aborting active SSE streams.
- **Sentence-Chunked Speech Output**:
  - During SSE `delta` streaming, completed sentences are pushed into `localSpeechQueue` and spoken immediately via `window.speechSynthesis` without waiting for full generation or cloud TTS round-trips.

---

## 4. Internet Research & SSRF Protection (`server/internetResearchService.ts`)
- **Free Search (`searchFreeWeb`)**: Queries DuckDuckGo HTML endpoint and Wikipedia OpenSearch API directly with clean result parsing (`VerifiedSource[]`).
- **Safe Page Extraction (`fetchPublicWebPage`)**:
  - Enforces `http:`/`https:` scheme only.
  - Blocks `localhost`, `.local`, private IPv4/IPv6 ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`), and resolves hostnames via `dns.lookup` before fetching.
  - Extracts clean text paragraphs + extractive summary (`buildExtractiveSummary`).

---

## 5. Desktop, File & Media Architecture
- **Permitted File Intelligence (`server/fileService.ts`, `src/core/fileIndex.ts`)**:
  - Auto-seeds `Downloads`, `Desktop`, `Documents`, `Pictures`, `Videos`, and `Music` (filtered to existing directories, plus workspace fallback).
  - 30-second in-memory file index cache invalidated on folder changes (`invalidateFileIndexCache`).
  - Natural-language parser handles categories (`photo`, `video`, `music`, `excel`, `pdf`), folders, and relative dates (`today`, `yesterday`, `last week`), returning `matchReason`.
  - Streams media/audio previews safely via `GET /api/files/stream` and opens files natively via `POST /api/files/open`.
- **Windows Automation (`electron/windowsAutomation.ts`, `server/systemService.ts`)**:
  - 60-second StartApp/executable cache (`discoverWindowsStartApps` + `where`/`which`).
  - Running window enumeration (`GET /api/apps/windows`) + safe actions (`focus`, `minimize`, `maximize`, `close` via confirmation gate).
  - Win32 media/volume key synthesis (`sendWindowsMediaKey`) + local music/video matching (`server/mediaService.ts`).
- **Electron Desktop Shell (`electron/main.ts`, `electron/preload.ts`)**:
  - Compiles cleanly to `dist-electron/` via `tsconfig.electron.json`.
  - Auto-spawns embedded Node server in packaged builds when `localhost:3000` is not yet listening and terminates it on quit.
  - Registers `session.defaultSession.setDisplayMediaRequestHandler` with `desktopCapturer`, `ESC` hide-to-desktop, floating assistant mode, tray icon/menu, `will-navigate` security guard, and `render-process-gone` auto-reload recovery.
