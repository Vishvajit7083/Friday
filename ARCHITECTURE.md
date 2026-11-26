# F.R.I.D.A.Y. — System Architecture (`ARCHITECTURE.md`)

## 1. Design Philosophy
F.R.I.D.A.Y. (**Fully Responsive Intelligent Digital Assistant for You**) runs as a **self-owned, offline-first, zero-external-API** Windows desktop companion built with Electron, React 19, TypeScript, Express, built-in SQLite (`node:sqlite`), and Three.js.

- **UI Design Lock**: All desktop/web upgrades preserve the Command Center HUD (`CommandWorkspace`, `TopHudBar`, `LeftSidebar`, `FridayCore3D`, `LiveWallpaper`, `BottomQuickActions`).
- **Zero External AI APIs & Zero Mandatory Keys**: Conversation, Hinglish NLP, contextual memory, intent teaching, hardware telemetry, file intelligence, app launching, media playback, calendar/reminders, and live public web lookup run without Ollama, OpenAI, Gemini, Claude, Groq, or paid API keys.

---

## 2. F.R.I.D.A.Y. Cognitive Engine (`src/core/cognitive/` + `server/cognitiveRuntime.ts`)

Every user turn executes through a 15-module coordinated brain:
1. **Language Understanding Engine** (`languageUnderstanding.ts`) — Levenshtein typo repair, Hinglish ASR repair, date/app/folder/teach-rule entity extraction.
2. **Hinglish NLP Engine** (`hinglishNlp.ts` + `vocabularyData.ts`) — English / Hindi Devanagari / Hinglish detection, lexicon canonicalization, and Hinglish interruption detection.
3. **Contextual Conversation Engine** (`contextEngine.ts`) — multi-turn topic tracking, demonstrative resolution (`"isko"`, `"is folder"`, `"doosra wala"`, `"last mein"`), and pause/resume task state.
4. **6-Layer Memory Engine** (`server/cognitiveDb.ts` + `server/schema.sql`) — SQLite persistence for `working`, `short_term`, `long_term`, `episodic`, `semantic`, and `procedural` layers, plus JSON export/import and automatic one-time migration from `.friday-data/friday-db.json`.
5. **Knowledge Engine** (`server/knowledgeEngine.ts`) — indexes permitted workspace files, user notes, user-added facts, and FAQs with explicit provenance (`retrieved | user_provided | inferred | unknown`).
6. **Learning Engine (Levels 1–6)** (`learningPipeline.ts`) — Level 1 vocabulary learning, Level 2 correction mapping, Level 3 preference adaptation, Level 4 repeated command suggestions, Level 5 opt-in JSONL dataset export, and Level 6 local BPE tokenizer trainer + train/eval split + pluggable `FutureLanguageCoreProvider`.
7. **Dynamic Intent Engine** (`intentRegistry.ts`) — teaches custom rules (`"when I say X, do Y"` / `"jab main X bolu, toh Y kar"`).
8. **Task Planning Engine** (`taskPlanner.ts`) — structured multi-step `StructuredTaskPlan` with dependencies and confirmation gating on destructive/system-modifying actions.
9. **Decision Engine** (`taskPlanner.ts`) — deterministic routing between local tools, structured task plans, knowledge answers, live online research, and honest offline fallbacks.
10. **Response Generation Engine** (`responseGenerator.ts`) — `LocalCognitiveModelProvider` + simple-Hindi explanation translator + `FutureLanguageCoreProvider` adapter.
11. **Voice Interaction Engine** (`server/speechProvider.ts` + `src/App.tsx`) — Windows `System.Speech`, browser `SpeechSynthesis`/`SpeechRecognition`, honest Windows Hindi/Hinglish Speech limitations reporting, and English/Hinglish barge-in interruption (`"ruk ja"`, `"chup"`, `"bas"`, `"stop"`).
12. **Tool Execution Engine** (`server/cognitiveRuntime.ts`) — OS apps, permitted folders/files, weather, reminders, media keys.
13. **Web Research Engine** (`server/internetResearchService.ts`) — SSRF-hardened DuckDuckGo & Wikipedia public search when online.
14. **Personality Engine** (`personalityEngine.ts`) — natural, varied phrasing without robotic filler.
15. **Cognitive Orchestrator** (`cognitiveOrchestrator.ts`) — coordinates all modules and logs structured execution steps & latency timings.

See `COGNITIVE_ARCHITECTURE_AND_ROADMAP.md` for full architecture diagrams and the 5-phase `F.R.I.D.A.Y. LANGUAGE CORE` roadmap.

---

## 3. REST & SSE Endpoints (`server.ts`)
- `POST /api/assistant/stream` & `POST /api/assistant/command` — executes fast local deterministic tools + `runCognitiveTurn` via SSE or JSON.
- `POST /api/assistant/confirm` — completes gated confirmations including Cognitive `StructuredTaskPlan` steps (`confirmedAction: true`).
- `GET /api/cognitive/status` & `POST /api/cognitive/turn` — inspect orchestrator status/context/plans or invoke turns directly.
- `GET/POST/PATCH/DELETE /api/cognitive/memory`, `/api/cognitive/memory/export`, `/api/cognitive/memory/import` — manage 6-layer SQLite memory.
- `GET/POST/DELETE /api/cognitive/intents` — inspect/teach/remove dynamic commands.
- `GET/POST /api/cognitive/knowledge` — search, re-index, or add grounded facts.
- `GET/POST /api/cognitive/learning`, `GET /api/cognitive/learning/dataset.jsonl` — manage L1–L6 learning, Level 4 suggestions, opt-in dataset JSONL export, and Level 6 tokenizer training.

---

## 4. Internet Research, Security & Electron Desktop Shell
- **SSRF Protection** (`server/internetResearchService.ts`): Enforces `http:`/`https:`, blocks private/loopback IPv4/IPv6 ranges, resolves hostnames via `dns.lookup` before fetching.
- **Permitted File Sandboxing** (`server/fileService.ts`, `electron/windowsAutomation.ts`): Zero arbitrary shell execution (`shell: false`), strict `isPathPermitted` checks, and explicit confirmation gates before destructive operations or window closing.
- **Electron Desktop Shell** (`electron/main.ts`, `electron/preload.ts`): Compiles to `dist-electron/`, bundles `node:sqlite`, manages embedded server lifecycle, screen capture consent, tray icon, and global shortcuts.
