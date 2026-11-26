# F.R.I.D.A.Y. Cognitive Engine — Architecture & Self-Trained Language Model Roadmap

## 1. Self-Owned Cognitive Architecture (15 Modules)

F.R.I.D.A.Y. operates as a modular, self-owned Windows desktop AI system using **zero external inference APIs** (no Ollama, OpenAI, Gemini, Claude, or Groq) and **zero mandatory API keys**.

```
User (Text / Mic)
  ↓
11. Voice Interaction Engine (SpeechProvider + Hinglish Barge-In Interruption)
  ↓
1. Language Understanding Engine (Fuzzy Levenshtein + ASR Repair + Entity Extraction)
2. Hinglish NLP Engine (English / Hindi Devanagari / Romanized Hinglish + Lexicon)
  ↓
3. Contextual Conversation Engine (Coreference, Follow-up, Clarification, Task Resume)
  ↓
15. Cognitive Orchestrator (15-Step Pipeline Coordinator)
  ├── 4. Memory Engine (SQLite 6-Layer: working, short_term, long_term, episodic, semantic, procedural)
  ├── 5. Knowledge Engine (Indexed Workspace Docs, Notes, FAQs, Provenance Tagging)
  ├── 6. Learning Engine (L1–L6 Self-Learning + Opt-In JSONL Dataset + BPE Tokenizer)
  ├── 7. Intent Engine (Dynamic Teachable Custom Intents + Precedence Scoring)
  ├── 8. Task Planning Engine (Structured TaskPlan with Dependencies & Confirmation Gates)
  ├── 9. Decision Engine (Deterministic Offline vs. Online Route Selection)
  └── 13. Web Research Engine (SSRF-Hardened Public Web Lookup when Online)
  ↓
12. Tool Execution Engine (Sandboxed Windows Automation, Apps, Files, Weather, Reminders)
  ↓
10. Response Generation Engine (ModelProvider + FutureLanguageCoreProvider)
14. Personality Engine (Tone, Empathy, Conciseness, Non-Robotic Phrasing Variation)
  ↓
Speech Output (Windows SAPI / Browser SpeechSynthesis / Pluggable Local TTS) & HUD UI
```

### Module Interfaces (`src/core/cognitive/`)
- `vocabularyData.ts`: Editable English/Hinglish/Hindi lexicon (`kholo -> open`, `kal`, `isko`, ASR typos).
- `hinglishNlp.ts`: Script detection, canonical phrase replacement, Hinglish interruption phrases (`ruk ja`, `chup`, `bas`, `bas kar`, `shant`, `band kar`).
- `languageUnderstanding.ts`: Levenshtein typo repair, multi-language entity extraction (`app`, `folder`, `dateHint`, `teachRule`), and intent hints.
- `contextEngine.ts`: Pronouns & demonstratives (`isko`, `is folder`, `doosra wala`, `last mein`, `continue kar`, `arey nahi`, `isko save kar`).
- `intentRegistry.ts`: Built-in + user-taught intents (`"when I say X, do Y"` / `"jab main X bolu, toh Y kar"`).
- `taskPlanner.ts`: Dependency-ordered multi-step `StructuredTaskPlan` + risk confirmation gates + offline/online decision routing.
- `learningPipeline.ts`: Levels 1–6 self-learning (vocabulary, correction mapping, preference tracking, repeated pattern detection, JSONL export, BPE tokenizer & eval harness, pluggable `FutureLanguageCoreProvider`).
- `personalityEngine.ts`: Honest, concise, warm phrasing without robotic filler (`"Certainly."` / `"Of course."` avoided).
- `responseGenerator.ts`: Simple-Hindi explanation transformer, grounded citations, `LocalCognitiveModelProvider`.
- `cognitiveOrchestrator.ts`: Coordinated 15-step execution engine with `CognitiveMemoryStorePort`, `CognitiveKnowledgePort`, and `CognitiveLearningStorePort`.

---

## 2. 6-Layer Persistent SQLite Memory (`server/cognitiveDb.ts` + `server/schema.sql`)

Backed by built-in `node:sqlite` (`DatabaseSync`) inside `.friday-data/friday.sqlite`:
1. **`working`**: Active turn goals, clarification options, paused task plans.
2. **`short_term`**: Recent conversation references, candidate lists, session state.
3. **`long_term`**: User-approved facts, saved notes/summaries (`"Isko save kar"`), preferences.
4. **`episodic`**: Timestamped past sessions & project discussions (`"Kal jo project discuss kiya tha"`).
5. **`semantic`**: Domain knowledge facts & user vocabulary definitions.
6. **`procedural`**: Learned custom commands, multi-step macros, workflow habits.

Legacy JSON stores (`.friday-data/friday-db.json`) auto-migrate once on boot without data loss, and full JSON export/import is exposed at `/api/cognitive/memory/export` and `/api/cognitive/memory/import`.

---

## 3. Windows Speech & Hindi/Hinglish Limitations (`server/speechProvider.ts`)

- **Default Desktop Path**: Windows `System.Speech` (SAPI) for offline English STT and TTS output, paired with Chromium Web Speech API when available in browser preview.
- **Honest Limitations**:
  - Offline Windows `System.Speech` quality depends on which Windows Speech Recognizer language packs are installed on the machine.
  - Pure Devanagari or heavy Hinglish code-switching on `en-US` SAPI packs can produce phonetic misrecognitions; F.R.I.D.A.Y. compensates downstream via Hinglish ASR typo normalization and Levenshtein repair rather than claiming native bilingual neural ASR without a local model installed.
  - Pluggable adapter slots (`SpeechProvider`) are documented and wired for future offline neural speech binaries (`whisper.cpp`, `Vosk`, `Piper`).

---

## 4. 5-Phase `F.R.I.D.A.Y. LANGUAGE CORE` Roadmap (Zero External APIs)

F.R.I.D.A.Y. never pretends heuristic rules are a trained neural model. Instead, it cleanly separates today's Cognitive Engine from the future self-trained neural language core via `ModelProvider` + `FutureLanguageCoreProvider`:

| Phase | Milestone | Status in Codebase |
| --- | --- | --- |
| **Phase 1 — Cognitive Foundation** | 15-module cognitive architecture, Hinglish NLP, 6-layer SQLite memory, sandboxed OS tools, L1–L4 learning | **Implemented & Active** |
| **Phase 2 — Curated Dataset & Subword Tokenizer** | Opt-in sanitized prompt/intent/response JSONL dataset curation + local BPE tokenizer trainer (`vocabSize`, `mergePairs`, train/eval split, UNK eval) | **Implemented & Active** (`Settings` + `AI Core`) |
| **Phase 3 — Local PyTorch / Rust Sequence Model** | Train compact encoder-decoder or causal transformer (10M–120M params) offline on exported `friday-training-dataset.jsonl` + Hinglish dialogue corpora using trained BPE tokenizer | Next Offline ML Milestone |
| **Phase 4 — Quantized Local Runtime** | Export quantized GGUF / ONNX int4 weights and load via `FRIDAY_LANGUAGE_CORE_WEIGHTS` inside `FutureLanguageCoreProvider` (`ModelProvider` interface) | **Adapter Ready** |
| **Phase 5 — Continual LoRA / Adapter Alignment** | Periodically fine-tune adapter weights locally on user-approved Level 2 correction pairs & Level 5 verified dataset exports with regression eval harness | Roadmap |
