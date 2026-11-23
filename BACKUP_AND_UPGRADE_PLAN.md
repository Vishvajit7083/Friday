# F.R.I.D.A.Y. Ultimate Android AI Assistant Upgrade — Checkpoint & Modification Plan

## 1. Checkpoint Backup
- Created full snapshot of pre-upgrade source tree at `.friday-backup/pre-android-upgrade/` covering `src/`, `server/`, `electron/`, `package.json`, `tsconfig.json`, `vite.config.ts`, and `index.html`.
- Existing HUD layout, blue/cyan theme (`#040814` + cyan holographic rings), 3D Three.js core (`FridayCore3D.tsx`), navigation rails, and animations are locked and preserved intact.

## 2. Existing Architecture Inspection Summary
- **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Three.js.
- **Voice System**: Browser Web Speech API (`SpeechRecognition`/`speechSynthesis`) + optional server TTS fallback. Lacked `speakingPitch`, `hi-IN` (Hindi) & `mr-IN` (Marathi) language presets, gender-matched voice selection, and native Android `TextToSpeech`/`SpeechRecognizer` bridge hooks.
- **Backend / AI Mode**: Express 4 (`server.ts`) + paid-key-free `local-auto` / `local-core` + DuckDuckGo/Wikipedia free research (`internetResearchService.ts`). Previously required Express `/api/*` for chat, settings, telemetry, calendar, and weather—meaning an offline Android APK (`WebViewAssetLoader`) needed a pure client-side standalone execution engine (`localClientEngine.ts`) to run cleanly without `localhost:3000`.

## 3. Planned Modular Additions & Minimal Surgical Updates

### A. Pure TypeScript Offline Intelligence & Productivity Modules (`/src/core/`)
- `src/core/unitConverter.ts` *(New)* — Bidirectional unit conversions (Length, Weight, Temperature, Digital Storage, Speed, Time).
- `src/core/translator.ts` *(New)* — Built-in offline English <-> Hindi (`hi-IN`) & Marathi (`mr-IN`) phrase/vocabulary dictionary + natural response formatting.
- `src/core/productivityTools.ts` *(New)* — Notes, To-Do tasks, Reminders, Alarm intent parsing, and extractive text summarization (`localStorage` + SQLite bridge sync).
- `src/core/localClientEngine.ts` *(New)* — Standalone offline/Android command processor used automatically whenever the Express backend is absent (`WebViewAssetLoader` in APK or standalone build), plus instant Android device bridge routing (`window.fridayAndroid`).
- `src/core/types.ts`, `src/core/diagnostics.ts`, `src/core/intentEngine.ts` *(Surgical edits)* — Add `speakingPitch`, `NoteItem`, `TodoItem`, `ReminderItem`, `FridayAndroidBridge` interface, natural math phrase support (`multiplied by`, `divided by`), unit/translate/note/todo/alarm/phone-control routing, and strict confirmation gates (`call ...`, `send sms`, `delete ...`).

### B. Voice, UI & Client Integration (`/src/`)
- `src/App.tsx` *(Surgical edits)* — Native Android bridge wiring (`window.fridayAndroid` + `window.__fridayAndroidEvents`), gender-aware Web Speech synthesis + `speakingPitch` + natural sentence pauses, instant speech interruption, Android telemetry/weather fallback, and offline/APK persistence.
- `src/components/views/CoreAndVoiceViews.tsx` *(Surgical edits)* — Add Speaking Pitch slider (`0.60x–1.50x`) and `hi-IN` (Hindi) & `mr-IN` (Marathi) to Recognition/Voice Language without changing layout/colors.
- `src/components/views/PersonalViews.tsx` *(Surgical edits)* — Add Notes & To-Do Checklist section inside Calendar & Daily Productivity view while preserving all existing calendar controls.

### C. Server Parity (`/server/`)
- `server/localAiService.ts` & `server/aiService.ts` *(Surgical edits)* — Integrate unit conversion, translation, notes/todos, text summarization, and natural math replies into server deterministic pipeline as well so both Desktop Web and Android APK share full feature parity.

### D. Native Android Studio Kotlin Project (`/android/`)
- Complete Gradle Kotlin project (`com.friday.assistant`, minSdk 26, targetSdk 35) featuring:
  - `MainActivity.kt` (`WebViewAssetLoader` serving `assets/www/` over HTTPS virtual origin, runtime mic/call/alarm permission handling, immersive edge-to-edge HUD styling)
  - `voice/VoiceEngineModule.kt` (Android `TextToSpeech` + offline-first `SpeechRecognizer` + `AudioManager` focus + female/male voice ranking + rate/pitch)
  - `system/DeviceControlModule.kt` (YouTube, Chrome, Camera, Gallery, Dialer [confirmation-gated], Contacts, Maps, Settings [Wi-Fi, Bluetooth, Display, Sound, Apps, Notifications], Battery, Torch flashlight, AlarmClock, Calendar intent, Clipboard, Share, Media controls)
  - `storage/LocalMemoryDbHelper.kt` (`SQLiteOpenHelper` local storage for conversations, preferences, notes, tasks, reminders, frequent commands)
  - `ai/LocalNetAndSearchModule.kt` (Network connectivity check + CORS-free public Wikipedia/DuckDuckGo fetch)
  - `bridge/FridayJsBridge.kt` (`@JavascriptInterface` exposing `window.fridayAndroid` to F.R.I.D.A.Y. Web HUD)
- `scripts/sync-android-assets.mjs` + `npm run android:sync` in `package.json`.
