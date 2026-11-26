-- SQLite Schema for F.R.I.D.A.Y. Windows Desktop & Cognitive Engine Persistence
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_time TEXT NOT NULL,
  category TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_memory (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  memory_value TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_history (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  intent TEXT,
  metadata_json TEXT,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS action_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  agent TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT
);

CREATE TABLE IF NOT EXISTS app_collections (
  collection_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 6-Layer Cognitive Memory Engine
CREATE TABLE IF NOT EXISTS cognitive_memory (
  id TEXT PRIMARY KEY,
  layer TEXT NOT NULL,
  category TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  memory_value TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  importance REAL NOT NULL DEFAULT 0.5,
  confidence REAL NOT NULL DEFAULT 0.8,
  source TEXT NOT NULL DEFAULT 'inferred',
  access_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_accessed_at TEXT NOT NULL,
  expires_at TEXT
);

-- Dynamic Extensible Intent Registry
CREATE TABLE IF NOT EXISTS dynamic_intents (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  user_defined INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  usage_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Editable Hinglish/Hindi/English Vocabulary Lexicon
CREATE TABLE IF NOT EXISTS vocabulary_lexicon (
  id TEXT PRIMARY KEY,
  phrase TEXT NOT NULL UNIQUE,
  canonical TEXT NOT NULL,
  language TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Level 2 Correction Learning
CREATE TABLE IF NOT EXISTS learning_corrections (
  id TEXT PRIMARY KEY,
  wrong_input TEXT NOT NULL,
  wrong_intent_id TEXT,
  corrected_phrase TEXT NOT NULL,
  target_intent_id TEXT NOT NULL,
  target_action TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);

-- Level 4 Repeated Task Pattern Suggestions
CREATE TABLE IF NOT EXISTS task_patterns (
  id TEXT PRIMARY KEY,
  sequence_key TEXT NOT NULL UNIQUE,
  steps_json TEXT NOT NULL,
  occurrences INTEGER NOT NULL DEFAULT 1,
  suggested_name TEXT NOT NULL,
  suggested_trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested',
  last_seen_at TEXT NOT NULL
);

-- Local Knowledge Engine Indexed Chunks
CREATE TABLE IF NOT EXISTS knowledge_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_path TEXT,
  provenance TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Level 5 Opt-In Training Dataset Collection
CREATE TABLE IF NOT EXISTS training_dataset (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  normalized_prompt TEXT NOT NULL,
  language TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  entities_json TEXT NOT NULL,
  response TEXT NOT NULL,
  quality_score REAL NOT NULL DEFAULT 0.8,
  approved INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- Structured Task Plans
CREATE TABLE IF NOT EXISTS task_plans (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Background Automation Tasks Queue
CREATE TABLE IF NOT EXISTS background_tasks (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  scenario_key TEXT NOT NULL,
  state TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Editable WorkflowMemory Preferences
CREATE TABLE IF NOT EXISTS workflow_preferences (
  pref_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  category TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

