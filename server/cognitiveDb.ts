import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import type {
  CognitiveMemoryRecord,
  CognitiveMemorySearchQuery,
  DynamicIntentDefinition,
  KnowledgeChunk,
  LearningCorrectionRecord,
  LexiconEntry,
  MemoryLayer,
  StructuredTaskPlan,
  TaskPatternSuggestion,
  TokenizerVocabArtifact,
  TrainingDatasetSample,
  UserPreferenceProfile,
} from '../src/core/cognitive/types.ts';
import { createDefaultPreferenceProfile } from '../src/core/cognitive/learningPipeline.ts';
import { stringSimilarity } from '../src/core/cognitive/languageUnderstanding.ts';
import type { BackgroundTaskRecord, WorkflowPreferenceItem } from '../src/core/automation/types.ts';
import type { IndexedFileItem } from '../src/core/types.ts';

function getDataDir(): string {
  return process.env.FRIDAY_DATA_DIR
    ? path.resolve(process.env.FRIDAY_DATA_DIR)
    : path.resolve(process.cwd(), '.friday-data');
}

function getSqlitePath(): string {
  return path.join(getDataDir(), 'friday.sqlite');
}

let cachedDb: DatabaseSync | null = null;
let cachedDbPath = '';

const EMBEDDED_SCHEMA_SQL = `
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
CREATE TABLE IF NOT EXISTS dynamic_intents (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  user_defined INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  usage_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vocabulary_lexicon (
  id TEXT PRIMARY KEY,
  phrase TEXT NOT NULL UNIQUE,
  canonical TEXT NOT NULL,
  language TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
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
CREATE TABLE IF NOT EXISTS task_plans (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS background_tasks (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  scenario_key TEXT NOT NULL,
  state TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workflow_preferences (
  pref_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  category TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS file_index (
  id TEXT PRIMARY KEY,
  root_folder TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  relative_path TEXT NOT NULL,
  extension TEXT NOT NULL,
  category TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  modified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  preview_text TEXT,
  content_excerpt TEXT,
  indexed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS file_index_folders (
  root_folder TEXT PRIMARY KEY,
  file_count INTEGER NOT NULL DEFAULT 0,
  readable INTEGER NOT NULL DEFAULT 1,
  last_indexed_at TEXT,
  last_error TEXT
);
`;

export function getCognitiveSqlite(): DatabaseSync {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const dbPath = getSqlitePath();
  if (cachedDb && cachedDbPath === dbPath) {
    return cachedDb;
  }
  if (cachedDb) {
    try {
      cachedDb.close();
    } catch {
      // ignore close error on path swap
    }
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(EMBEDDED_SCHEMA_SQL);
  seedInitialCognitiveRecords(db);
  cachedDb = db;
  cachedDbPath = dbPath;
  return db;
}

export function closeCognitiveSqlite(): void {
  if (!cachedDb) return;
  try {
    cachedDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    // ignore checkpoint errors if DB is read-only or closing
  }
  try {
    cachedDb.close();
  } catch {
    // ignore close errors
  }
  cachedDb = null;
  cachedDbPath = '';
}

function seedInitialCognitiveRecords(db: DatabaseSync): void {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM cognitive_memory').get() as { cnt: number };
  if (row && row.cnt === 0) {
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO cognitive_memory (id, layer, category, memory_key, memory_value, tags_json, importance, confidence, source, access_count, created_at, updated_at, last_accessed_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      'cog-mem-seed-1',
      'semantic',
      'architecture',
      'F.R.I.D.A.Y. Cognitive Architecture',
      'Self-owned 15-module offline-first cognitive brain with SQLite 6-layer memory, Hinglish NLP, and opt-in learning pipeline.',
      JSON.stringify(['architecture', 'cognitive', 'offline']),
      0.95,
      1.0,
      'user_provided',
      1,
      now,
      now,
      now,
      null
    );
    insert.run(
      'cog-mem-seed-2',
      'long_term',
      'preference',
      'Assistant Persona & Privacy',
      'Concise technical & natural Hinglish/English replies with explicit confirmation before destructive actions.',
      JSON.stringify(['preference', 'privacy']),
      0.9,
      1.0,
      'user_provided',
      1,
      now,
      now,
      now,
      null
    );
    insert.run(
      'cog-mem-seed-3',
      'procedural',
      'workflow',
      'Daily Startup Check',
      'Inspect system CPU/RAM telemetry, load today calendar reminders, and verify permitted workspace directories.',
      JSON.stringify(['procedure', 'startup']),
      0.8,
      0.95,
      'user_provided',
      1,
      now,
      now,
      now,
      null
    );
  }
}

export function getAppCollection<T>(key: string): T | null {
  const db = getCognitiveSqlite();
  const row = db.prepare('SELECT payload_json FROM app_collections WHERE collection_key = ?').get(key) as
    | { payload_json: string }
    | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.payload_json) as T;
  } catch {
    return null;
  }
}

export function setAppCollection<T>(key: string, payload: T): void {
  const db = getCognitiveSqlite();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_collections (collection_key, payload_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(collection_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(payload), now);
}

// ---------- 6-Layer Memory Operations ----------
function mapMemoryRow(row: Record<string, unknown>): CognitiveMemoryRecord {
  let tags: string[] = [];
  try {
    tags = JSON.parse(String(row.tags_json || '[]'));
  } catch {
    tags = [];
  }
  return {
    id: String(row.id),
    layer: String(row.layer) as MemoryLayer,
    category: String(row.category),
    key: String(row.memory_key),
    value: String(row.memory_value),
    tags,
    importance: Number(row.importance ?? 0.5),
    confidence: Number(row.confidence ?? 0.8),
    source: (String(row.source || 'inferred') as CognitiveMemoryRecord['source']),
    accessCount: Number(row.access_count ?? 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastAccessedAt: String(row.last_accessed_at),
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
  };
}

export function saveCognitiveMemory(
  record: Omit<CognitiveMemoryRecord, 'id' | 'createdAt' | 'updatedAt' | 'lastAccessedAt' | 'accessCount'> & {
    id?: string;
  }
): CognitiveMemoryRecord {
  const db = getCognitiveSqlite();
  const now = new Date().toISOString();
  const id = record.id || `cmem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(
    `INSERT INTO cognitive_memory (
      id, layer, category, memory_key, memory_value, tags_json, importance, confidence, source, access_count, created_at, updated_at, last_accessed_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      layer = excluded.layer,
      category = excluded.category,
      memory_key = excluded.memory_key,
      memory_value = excluded.memory_value,
      tags_json = excluded.tags_json,
      importance = excluded.importance,
      confidence = excluded.confidence,
      source = excluded.source,
      access_count = cognitive_memory.access_count + 1,
      updated_at = excluded.updated_at,
      last_accessed_at = excluded.last_accessed_at,
      expires_at = excluded.expires_at`
  ).run(
    id,
    record.layer,
    record.category,
    record.key.slice(0, 160),
    record.value.slice(0, 2000),
    JSON.stringify(record.tags || []),
    Math.min(1, Math.max(0, record.importance ?? 0.5)),
    Math.min(1, Math.max(0, record.confidence ?? 0.8)),
    record.source || 'inferred',
    now,
    now,
    now,
    record.expiresAt ?? null
  );

  // Keep working memory bounded to 40 most recent entries so it never bloats
  if (record.layer === 'working') {
    db.prepare(
      `DELETE FROM cognitive_memory WHERE layer = 'working' AND id NOT IN (
         SELECT id FROM cognitive_memory WHERE layer = 'working' ORDER BY updated_at DESC LIMIT 40
       )`
    ).run();
  }

  const saved = db.prepare('SELECT * FROM cognitive_memory WHERE id = ?').get(id) as Record<string, unknown>;
  return mapMemoryRow(saved);
}

export function listCognitiveMemories(layer?: MemoryLayer, limit = 100): CognitiveMemoryRecord[] {
  const db = getCognitiveSqlite();
  const rows = layer
    ? (db
        .prepare('SELECT * FROM cognitive_memory WHERE layer = ? ORDER BY importance DESC, updated_at DESC LIMIT ?')
        .all(layer, limit) as Record<string, unknown>[])
    : (db
        .prepare('SELECT * FROM cognitive_memory ORDER BY updated_at DESC LIMIT ?')
        .all(limit) as Record<string, unknown>[]);
  return rows.map(mapMemoryRow);
}

export function searchCognitiveMemories(query: CognitiveMemorySearchQuery): CognitiveMemoryRecord[] {
  const db = getCognitiveSqlite();
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (query.layer) {
    conditions.push('layer = ?');
    params.push(query.layer);
  }
  if (query.category) {
    conditions.push('category = ?');
    params.push(query.category);
  }

  const sql = `SELECT * FROM cognitive_memory ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT 200`;
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  const all = rows.map(mapMemoryRow);

  const MEMORY_STOPWORDS = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one',
    'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see',
    'two', 'way', 'who', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'want', 'wanted',
    'with', 'that', 'this', 'from', 'they', 'will', 'have', 'what', 'when', 'where', 'which',
    'about', 'there', 'their', 'would', 'could', 'should', 'were', 'been', 'being', 'into',
    'some', 'them', 'then', 'than', 'very', 'just', 'like', 'more', 'only', 'also', 'please',
  ]);
  const SHORT_TECH = new Set(['ai', 'os', 'db', 'ui', 'ux', 'io', 'ip', 'js', 'ts', 'py', 'ml', 'dl']);

  const q = (query.query || '').trim().toLowerCase();
  const tagFilter = (query.tag || '').trim().toLowerCase();
  const terms = q
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => (t.length >= 3 || SHORT_TECH.has(t)) && !MEMORY_STOPWORDS.has(t));
  const nowMs = Date.now();

  const scored = all
    .filter((m) => !tagFilter || m.tags.some((t) => t.toLowerCase() === tagFilter))
    .map((m) => {
      const hay = `${m.key} ${m.value} ${m.category} ${m.tags.join(' ')}`.toLowerCase();
      let matchScore = 0;
      let keywordHits = 0;
      if (!q) {
        matchScore = 1;
      } else {
        for (const t of terms) {
          const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(`\\b${escaped}\\b`, 'i').test(hay)) {
            matchScore += 1.5;
            keywordHits += 1;
          }
        }
        const sim = stringSimilarity(q, m.key.toLowerCase());
        if (sim >= 0.45) {
          matchScore += sim * 2;
        }
      }
      const ageDays = Math.max(0, (nowMs - new Date(m.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
      const recencyBoost = 1 / (1 + ageDays * 0.15);
      const total = matchScore * 0.55 + m.importance * 0.3 + recencyBoost * 0.15;
      const matched = !q || keywordHits > 0 || matchScore >= 0.9;
      return { m, total, matched };
    })
    .filter((x) => x.matched)
    .sort((a, b) => b.total - a.total)
    .slice(0, query.limit ?? 20)
    .map((x) => x.m);

  return scored;
}

export function updateCognitiveMemory(
  id: string,
  patch: Partial<Pick<CognitiveMemoryRecord, 'layer' | 'category' | 'key' | 'value' | 'tags' | 'importance'>>
): CognitiveMemoryRecord | null {
  const db = getCognitiveSqlite();
  const existing = db.prepare('SELECT * FROM cognitive_memory WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) return null;
  const current = mapMemoryRow(existing);
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE cognitive_memory
     SET layer = ?, category = ?, memory_key = ?, memory_value = ?, tags_json = ?, importance = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    patch.layer ?? current.layer,
    patch.category ?? current.category,
    (patch.key ?? current.key).slice(0, 160),
    (patch.value ?? current.value).slice(0, 2000),
    JSON.stringify(patch.tags ?? current.tags),
    patch.importance !== undefined ? Math.min(1, Math.max(0, patch.importance)) : current.importance,
    now,
    id
  );
  const updated = db.prepare('SELECT * FROM cognitive_memory WHERE id = ?').get(id) as Record<string, unknown>;
  return mapMemoryRow(updated);
}

export function deleteCognitiveMemory(id: string): boolean {
  const db = getCognitiveSqlite();
  const res = db.prepare('DELETE FROM cognitive_memory WHERE id = ?').run(id);
  return Number(res.changes) > 0;
}

export function exportCognitiveMemoriesJson(): string {
  const items = listCognitiveMemories(undefined, 1000);
  return JSON.stringify({ exportedAt: new Date().toISOString(), count: items.length, memories: items }, null, 2);
}

export function importCognitiveMemoriesJson(raw: unknown): number {
  const items: Array<Partial<CognitiveMemoryRecord>> = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { memories?: unknown[] }).memories)
      ? ((raw as { memories: Array<Partial<CognitiveMemoryRecord>> }).memories)
      : [];

  let imported = 0;
  for (const item of items) {
    if (!item || typeof item.key !== 'string' || typeof item.value !== 'string') continue;
    const validLayers: MemoryLayer[] = ['working', 'short_term', 'long_term', 'episodic', 'semantic', 'procedural'];
    const layer = validLayers.includes(item.layer as MemoryLayer) ? (item.layer as MemoryLayer) : 'long_term';
    saveCognitiveMemory({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : undefined,
      layer,
      category: typeof item.category === 'string' && item.category.trim() ? item.category.trim() : 'imported',
      key: item.key,
      value: item.value,
      tags: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === 'string') : ['imported'],
      importance: typeof item.importance === 'number' ? item.importance : 0.7,
      confidence: typeof item.confidence === 'number' ? item.confidence : 0.9,
      source: 'user_provided',
    });
    imported += 1;
  }
  return imported;
}

// ---------- Dynamic Intents ----------
export function listDynamicIntents(): DynamicIntentDefinition[] {
  const db = getCognitiveSqlite();
  const rows = db.prepare('SELECT payload_json FROM dynamic_intents ORDER BY updated_at DESC').all() as Array<{
    payload_json: string;
  }>;
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.payload_json) as DynamicIntentDefinition;
      } catch {
        return null;
      }
    })
    .filter((x): x is DynamicIntentDefinition => Boolean(x));
}

export function saveDynamicIntent(intent: DynamicIntentDefinition): void {
  const db = getCognitiveSqlite();
  db.prepare(
    `INSERT INTO dynamic_intents (id, payload_json, user_defined, enabled, usage_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       payload_json = excluded.payload_json,
       user_defined = excluded.user_defined,
       enabled = excluded.enabled,
       usage_count = excluded.usage_count,
       updated_at = excluded.updated_at`
  ).run(
    intent.id,
    JSON.stringify(intent),
    intent.userDefined ? 1 : 0,
    intent.enabled ? 1 : 0,
    intent.usageCount || 0,
    intent.updatedAt
  );
}

export function deleteDynamicIntent(id: string): boolean {
  const db = getCognitiveSqlite();
  const res = db.prepare('DELETE FROM dynamic_intents WHERE id = ? AND user_defined = 1').run(id);
  return Number(res.changes) > 0;
}

// ---------- Vocabulary Lexicon ----------
export function listCustomLexicon(): LexiconEntry[] {
  const db = getCognitiveSqlite();
  const rows = db.prepare('SELECT payload_json FROM vocabulary_lexicon ORDER BY updated_at DESC').all() as Array<{
    payload_json: string;
  }>;
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.payload_json) as LexiconEntry;
      } catch {
        return null;
      }
    })
    .filter((x): x is LexiconEntry => Boolean(x));
}

export function saveLexiconEntry(entry: LexiconEntry): void {
  const db = getCognitiveSqlite();
  db.prepare(
    `INSERT INTO vocabulary_lexicon (id, phrase, canonical, language, kind, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(phrase) DO UPDATE SET
       canonical = excluded.canonical,
       language = excluded.language,
       kind = excluded.kind,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`
  ).run(
    entry.id,
    entry.phrase.toLowerCase(),
    entry.canonical,
    entry.language,
    entry.kind,
    JSON.stringify(entry),
    entry.updatedAt
  );
}

// ---------- Corrections, Preferences, Patterns, Dataset, Tokenizer ----------
export function listLearningCorrections(): LearningCorrectionRecord[] {
  const db = getCognitiveSqlite();
  const rows = db.prepare('SELECT * FROM learning_corrections ORDER BY created_at DESC LIMIT 200').all() as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({
    id: String(r.id),
    wrongInput: String(r.wrong_input),
    wrongIntentId: r.wrong_intent_id ? String(r.wrong_intent_id) : undefined,
    correctedPhrase: String(r.corrected_phrase),
    targetIntentId: String(r.target_intent_id),
    targetAction: String(r.target_action),
    targetPayload: r.payload_json ? (JSON.parse(String(r.payload_json)) as Record<string, unknown>) : undefined,
    createdAt: String(r.created_at),
  }));
}

export function saveLearningCorrection(corr: LearningCorrectionRecord): void {
  const db = getCognitiveSqlite();
  db.prepare(
    `INSERT INTO learning_corrections (id, wrong_input, wrong_intent_id, corrected_phrase, target_intent_id, target_action, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    corr.id,
    corr.wrongInput,
    corr.wrongIntentId ?? null,
    corr.correctedPhrase,
    corr.targetIntentId,
    corr.targetAction,
    corr.targetPayload ? JSON.stringify(corr.targetPayload) : null,
    corr.createdAt
  );
}

export function getPreferenceProfile(): UserPreferenceProfile {
  return getAppCollection<UserPreferenceProfile>('cognitive_preferences') || createDefaultPreferenceProfile();
}

export function savePreferenceProfile(profile: UserPreferenceProfile): void {
  setAppCollection('cognitive_preferences', profile);
}

export function listTaskPatternSuggestions(): TaskPatternSuggestion[] {
  const db = getCognitiveSqlite();
  const rows = db.prepare('SELECT * FROM task_patterns ORDER BY last_seen_at DESC').all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    sequenceKey: String(r.sequence_key),
    steps: JSON.parse(String(r.steps_json || '[]')) as string[],
    occurrences: Number(r.occurrences ?? 1),
    suggestedName: String(r.suggested_name),
    suggestedTrigger: String(r.suggested_trigger),
    status: String(r.status) as TaskPatternSuggestion['status'],
    lastSeenAt: String(r.last_seen_at),
  }));
}

export function saveTaskPatternSuggestion(pat: TaskPatternSuggestion): void {
  const db = getCognitiveSqlite();
  db.prepare(
    `INSERT INTO task_patterns (id, sequence_key, steps_json, occurrences, suggested_name, suggested_trigger, status, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(sequence_key) DO UPDATE SET
       occurrences = excluded.occurrences,
       status = excluded.status,
       last_seen_at = excluded.last_seen_at`
  ).run(
    pat.id,
    pat.sequenceKey,
    JSON.stringify(pat.steps),
    pat.occurrences,
    pat.suggestedName,
    pat.suggestedTrigger,
    pat.status,
    pat.lastSeenAt
  );
}

export function appendTrainingDatasetSample(sample: TrainingDatasetSample): void {
  const db = getCognitiveSqlite();
  db.prepare(
    `INSERT INTO training_dataset (id, prompt, normalized_prompt, language, intent_id, entities_json, response, quality_score, approved, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sample.id,
    sample.prompt,
    sample.normalizedPrompt,
    sample.language,
    sample.intentId,
    JSON.stringify(sample.entities),
    sample.response,
    sample.qualityScore,
    sample.approved ? 1 : 0,
    sample.createdAt
  );
}

export function listTrainingDatasetSamples(limit = 500): TrainingDatasetSample[] {
  const db = getCognitiveSqlite();
  const rows = db.prepare('SELECT * FROM training_dataset ORDER BY created_at DESC LIMIT ?').all(limit) as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({
    id: String(r.id),
    prompt: String(r.prompt),
    normalizedPrompt: String(r.normalized_prompt),
    language: String(r.language) as TrainingDatasetSample['language'],
    intentId: String(r.intent_id),
    entities: JSON.parse(String(r.entities_json || '{"numbers":[]}')),
    response: String(r.response),
    qualityScore: Number(r.quality_score ?? 0.8),
    approved: Number(r.approved ?? 1) === 1,
    createdAt: String(r.created_at),
  }));
}

export function getSavedTokenizerArtifact(): TokenizerVocabArtifact | null {
  return getAppCollection<TokenizerVocabArtifact>('cognitive_tokenizer_artifact');
}

export function saveTokenizerArtifact(artifact: TokenizerVocabArtifact): void {
  setAppCollection('cognitive_tokenizer_artifact', artifact);
}

// ---------- Knowledge Chunks ----------
export function upsertKnowledgeChunk(chunk: KnowledgeChunk): void {
  const db = getCognitiveSqlite();
  db.prepare(
    `INSERT INTO knowledge_items (id, title, content, source_type, source_path, provenance, tags_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       source_type = excluded.source_type,
       source_path = excluded.source_path,
       provenance = excluded.provenance,
       tags_json = excluded.tags_json,
       updated_at = excluded.updated_at`
  ).run(
    chunk.id,
    chunk.title.slice(0, 200),
    chunk.content.slice(0, 6000),
    chunk.sourceType,
    chunk.sourcePath ?? null,
    chunk.provenance,
    JSON.stringify(chunk.tags || []),
    chunk.updatedAt
  );
}

export function listKnowledgeChunks(limit = 300): KnowledgeChunk[] {
  const db = getCognitiveSqlite();
  const rows = db.prepare('SELECT * FROM knowledge_items ORDER BY updated_at DESC LIMIT ?').all(limit) as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    content: String(r.content),
    sourceType: String(r.source_type) as KnowledgeChunk['sourceType'],
    sourcePath: r.source_path ? String(r.source_path) : undefined,
    provenance: String(r.provenance) as KnowledgeChunk['provenance'],
    tags: JSON.parse(String(r.tags_json || '[]')) as string[],
    updatedAt: String(r.updated_at),
  }));
}

export function saveTaskPlanRecord(plan: StructuredTaskPlan): void {
  const db = getCognitiveSqlite();
  db.prepare(
    `INSERT INTO task_plans (id, goal, intent_id, status, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`
  ).run(plan.id, plan.goal, plan.intentId, plan.status, JSON.stringify(plan), plan.createdAt, plan.updatedAt);
}

export function listTaskPlans(limit = 20): StructuredTaskPlan[] {
  const db = getCognitiveSqlite();
  const rows = db.prepare('SELECT payload_json FROM task_plans ORDER BY updated_at DESC LIMIT ?').all(limit) as Array<{
    payload_json: string;
  }>;
  return rows.map((r) => JSON.parse(r.payload_json) as StructuredTaskPlan);
}

// ---------- Background Automation Tasks & Workflow Memory ----------

export function saveBackgroundTaskRecord(task: BackgroundTaskRecord): void {
  const db = getCognitiveSqlite();
  db.prepare(
    `INSERT INTO background_tasks (id, goal, scenario_key, state, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       state = excluded.state,
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at`
  ).run(task.id, task.goal, task.scenarioKey, task.state, JSON.stringify(task), task.createdAt, task.updatedAt);
}

export function getBackgroundTaskRecord(id: string): BackgroundTaskRecord | null {
  const db = getCognitiveSqlite();
  const row = db.prepare('SELECT payload_json FROM background_tasks WHERE id = ?').get(id) as
    | { payload_json: string }
    | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.payload_json) as BackgroundTaskRecord;
  } catch {
    return null;
  }
}

export function listBackgroundTaskRecords(limit = 40): BackgroundTaskRecord[] {
  const db = getCognitiveSqlite();
  const rows = db.prepare('SELECT payload_json FROM background_tasks ORDER BY updated_at DESC LIMIT ?').all(limit) as Array<{
    payload_json: string;
  }>;
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.payload_json) as BackgroundTaskRecord;
      } catch {
        return null;
      }
    })
    .filter((x): x is BackgroundTaskRecord => Boolean(x));
}

export function listWorkflowPreferences(): WorkflowPreferenceItem[] {
  const db = getCognitiveSqlite();
  const rows = db.prepare('SELECT * FROM workflow_preferences ORDER BY updated_at DESC').all() as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({
    key: String(r.pref_key),
    label: String(r.label),
    value: String(r.value),
    category: String(r.category) as WorkflowPreferenceItem['category'],
    updatedAt: String(r.updated_at),
  }));
}

export function saveWorkflowPreference(item: Omit<WorkflowPreferenceItem, 'updatedAt'>): WorkflowPreferenceItem {
  const db = getCognitiveSqlite();
  const updatedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO workflow_preferences (pref_key, label, value, category, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(pref_key) DO UPDATE SET
       label = excluded.label,
       value = excluded.value,
       category = excluded.category,
       updated_at = excluded.updated_at`
  ).run(item.key, item.label, item.value, item.category, updatedAt);
  return { ...item, updatedAt };
}

export function deleteWorkflowPreference(key: string): boolean {
  const db = getCognitiveSqlite();
  const res = db.prepare('DELETE FROM workflow_preferences WHERE pref_key = ?').run(key);
  return Number(res.changes) > 0;
}

export function listApprovedExternalPaths(): string[] {
  return getAppCollection<string[]>('approved_external_paths') || [];
}

export function addApprovedExternalPath(targetPath: string): string[] {
  const existing = listApprovedExternalPaths();
  const resolved = path.resolve(targetPath);
  if (!existing.includes(resolved)) {
    const next = [resolved, ...existing].slice(0, 30);
    setAppCollection('approved_external_paths', next);
    return next;
  }
  return existing;
}

// ---------- Persistent File Explorer Index ----------

export function listIndexedFilesFromSqlite(rootFolders?: string[]): IndexedFileItem[] {
  const db = getCognitiveSqlite();
  let rows: Array<Record<string, unknown>>;
  if (rootFolders && rootFolders.length > 0) {
    const resolvedRoots = Array.from(new Set(rootFolders.map((r) => path.resolve(r))));
    const placeholders = resolvedRoots.map(() => '?').join(',');
    rows = db
      .prepare(`SELECT * FROM file_index WHERE root_folder IN (${placeholders}) ORDER BY modified_at DESC`)
      .all(...resolvedRoots) as Array<Record<string, unknown>>;
  } else {
    rows = db.prepare('SELECT * FROM file_index ORDER BY modified_at DESC').all() as Array<Record<string, unknown>>;
  }
  return rows.map((r) => ({
    id: String(r.id),
    rootFolder: String(r.root_folder),
    name: String(r.name),
    path: String(r.path),
    relativePath: String(r.relative_path),
    extension: String(r.extension),
    category: String(r.category) as IndexedFileItem['category'],
    sizeBytes: Number(r.size_bytes ?? 0),
    modifiedAt: String(r.modified_at),
    createdAt: String(r.created_at),
    previewText: r.preview_text ? String(r.preview_text) : undefined,
    contentExcerpt: r.content_excerpt ? String(r.content_excerpt) : undefined,
    indexedAt: r.indexed_at ? String(r.indexed_at) : undefined,
  }));
}

export function upsertIndexedFilesInSqlite(items: IndexedFileItem[]): void {
  if (items.length === 0) return;
  const db = getCognitiveSqlite();
  const stmt = db.prepare(
    `INSERT INTO file_index (
      id, root_folder, name, path, relative_path, extension, category, size_bytes, modified_at, created_at, preview_text, content_excerpt, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      id = excluded.id,
      root_folder = excluded.root_folder,
      name = excluded.name,
      relative_path = excluded.relative_path,
      extension = excluded.extension,
      category = excluded.category,
      size_bytes = excluded.size_bytes,
      modified_at = excluded.modified_at,
      created_at = excluded.created_at,
      preview_text = excluded.preview_text,
      content_excerpt = excluded.content_excerpt,
      indexed_at = excluded.indexed_at`
  );
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE;');
  try {
    for (const item of items) {
      stmt.run(
        item.id,
        path.resolve(item.rootFolder || path.dirname(item.path)),
        item.name,
        path.resolve(item.path),
        item.relativePath,
        item.extension,
        item.category,
        item.sizeBytes,
        item.modifiedAt,
        item.createdAt,
        item.previewText ?? null,
        item.contentExcerpt ?? null,
        item.indexedAt || now
      );
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function pruneIndexedFilesForRoot(rootFolder: string, validPaths: Set<string>): number {
  const db = getCognitiveSqlite();
  const resolvedRoot = path.resolve(rootFolder);
  const existing = db
    .prepare('SELECT path FROM file_index WHERE root_folder = ?')
    .all(resolvedRoot) as Array<{ path: string }>;
  const stale = existing.filter((row) => !validPaths.has(row.path)).map((row) => row.path);
  if (stale.length === 0) return 0;
  const del = db.prepare('DELETE FROM file_index WHERE path = ?');
  db.exec('BEGIN IMMEDIATE;');
  try {
    for (const p of stale) {
      del.run(p);
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
  return stale.length;
}

export function removeIndexedFilesByRoot(rootFolder: string): number {
  const db = getCognitiveSqlite();
  const resolvedRoot = path.resolve(rootFolder);
  const res = db.prepare('DELETE FROM file_index WHERE root_folder = ?').run(resolvedRoot);
  db.prepare('DELETE FROM file_index_folders WHERE root_folder = ?').run(resolvedRoot);
  return Number(res.changes);
}

export function saveIndexedFolderMeta(meta: {
  rootFolder: string;
  fileCount: number;
  readable: boolean;
  lastIndexedAt?: string;
  lastError?: string | null;
}): void {
  const db = getCognitiveSqlite();
  db.prepare(
    `INSERT INTO file_index_folders (root_folder, file_count, readable, last_indexed_at, last_error)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(root_folder) DO UPDATE SET
       file_count = excluded.file_count,
       readable = excluded.readable,
       last_indexed_at = excluded.last_indexed_at,
       last_error = excluded.last_error`
  ).run(
    path.resolve(meta.rootFolder),
    meta.fileCount,
    meta.readable ? 1 : 0,
    meta.lastIndexedAt ?? null,
    meta.lastError ?? null
  );
}

export function listIndexedFolderMeta(): Array<{
  rootFolder: string;
  fileCount: number;
  readable: boolean;
  lastIndexedAt?: string;
  lastError?: string;
}> {
  const db = getCognitiveSqlite();
  const rows = db.prepare('SELECT * FROM file_index_folders ORDER BY root_folder ASC').all() as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({
    rootFolder: String(r.root_folder),
    fileCount: Number(r.file_count ?? 0),
    readable: Number(r.readable ?? 1) === 1,
    lastIndexedAt: r.last_indexed_at ? String(r.last_indexed_at) : undefined,
    lastError: r.last_error ? String(r.last_error) : undefined,
  }));
}


