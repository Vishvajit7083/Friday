import type { IndexedFileItem } from './types';

const EXTENSION_CATEGORY_MAP: Record<string, IndexedFileItem['category']> = {
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  txt: 'document',
  md: 'document',
  rtf: 'document',
  xls: 'spreadsheet',
  xlsx: 'spreadsheet',
  csv: 'spreadsheet',
  ppt: 'presentation',
  pptx: 'presentation',
  key: 'presentation',
  ts: 'code',
  tsx: 'code',
  js: 'code',
  jsx: 'code',
  py: 'code',
  json: 'code',
  html: 'code',
  css: 'code',
  sql: 'code',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  svg: 'image',
  gif: 'image',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  mkv: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  ogg: 'audio',
};

export function categorizeExtension(ext: string): IndexedFileItem['category'] {
  const clean = ext.replace(/^\./, '').toLowerCase();
  return EXTENSION_CATEGORY_MAP[clean] ?? 'other';
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

export interface FileSearchIntent {
  keywords: string[];
  categoryHint: IndexedFileItem['category'] | 'all';
  folderHint: string | null;
  dateFilter: 'today' | 'yesterday' | 'last_week' | 'recent' | null;
  sortByRecent: boolean;
  requestedAction: 'open' | 'play' | 'preview' | 'find';
}

const STOPWORDS = new Set([
  'friday',
  'hey',
  'find',
  'search',
  'locate',
  'show',
  'me',
  'the',
  'my',
  'a',
  'an',
  'i',
  'was',
  'downloaded',
  'working',
  'on',
  'from',
  'in',
  'about',
  'with',
  'for',
  'where',
  'is',
  'that',
  'this',
  'recently',
  'recent',
  'latest',
  'newest',
  'last',
  'yesterday',
  'today',
  'week',
  'file',
  'files',
  'open',
  'play',
  'preview',
]);

export function parseFileSearchIntent(rawQuery: string): FileSearchIntent {
  const q = rawQuery.trim().toLowerCase();

  let categoryHint: IndexedFileItem['category'] | 'all' = 'all';
  if (/\b(photo|photos|picture|pictures|image|images|wallpaper|screenshot|png|jpg|jpeg)\b/.test(q)) {
    categoryHint = 'image';
  } else if (/\b(video|videos|clip|clips|movie|movies|mp4|mkv|webm|recording)\b/.test(q)) {
    categoryHint = 'video';
  } else if (/\b(music|song|songs|audio|track|tracks|mp3|wav|m4a|playlist)\b/.test(q)) {
    categoryHint = 'audio';
  } else if (/\b(presentation|slides|deck|ppt|pptx)\b/.test(q)) {
    categoryHint = 'presentation';
  } else if (/\b(excel|spreadsheet|expenses|csv|xlsx|xls)\b/.test(q)) {
    categoryHint = 'spreadsheet';
  } else if (/\b(pdf|resume|cv|invoice|document|docx|doc|report|notes|txt)\b/.test(q)) {
    categoryHint = 'document';
  } else if (/\b(code|script|source|typescript|python|json)\b/.test(q)) {
    categoryHint = 'code';
  }

  let folderHint: string | null = null;
  for (const folder of ['downloads', 'desktop', 'documents', 'pictures', 'videos', 'music']) {
    if (new RegExp(`\\b${folder}\\b`).test(q)) {
      folderHint = folder;
      break;
    }
  }

  let dateFilter: FileSearchIntent['dateFilter'] = null;
  if (/\byesterday\b/.test(q)) dateFilter = 'yesterday';
  else if (/\btoday\b/.test(q)) dateFilter = 'today';
  else if (/\blast\s+week\b/.test(q)) dateFilter = 'last_week';
  else if (/\b(recent|recently|latest|newest)\b/.test(q)) dateFilter = 'recent';

  const sortByRecent = Boolean(dateFilter || /\b(latest|newest|recent|recently|yesterday|today)\b/.test(q));

  let requestedAction: FileSearchIntent['requestedAction'] = 'find';
  if (/\b(play|listen|watch)\b/.test(q)) requestedAction = 'play';
  else if (/\bopen\b/.test(q)) requestedAction = 'open';
  else if (/\b(show|preview|read)\b/.test(q)) requestedAction = 'preview';

  const keywords = q
    .replace(/[^a-z0-9._\s-]/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length > 1 && !STOPWORDS.has(tok));

  return {
    keywords,
    categoryHint,
    folderHint,
    dateFilter,
    sortByRecent,
    requestedAction,
  };
}

function matchesDateFilter(
  isoDate: string,
  filter: FileSearchIntent['dateFilter'],
  nowMs: number
): boolean {
  if (!filter) return true;
  const ts = Date.parse(isoDate);
  if (!Number.isFinite(ts)) return false;
  const ageMs = Math.max(0, nowMs - ts);
  const oneDay = 24 * 60 * 60 * 1000;
  if (filter === 'today') return ageMs <= oneDay;
  if (filter === 'yesterday') return ageMs <= 2 * oneDay;
  if (filter === 'last_week') return ageMs <= 8 * oneDay;
  if (filter === 'recent') return ageMs <= 14 * oneDay;
  return true;
}

export function evaluateFileMatch(
  file: IndexedFileItem,
  query: string,
  nowMs = Date.now()
): { score: number; reason: string } {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 1, reason: 'Listed in permitted workspace' };

  const intent = parseFileSearchIntent(q);
  const nameLower = file.name.toLowerCase();
  const pathLower = `${file.path} ${file.relativePath}`.toLowerCase();
  const previewLower = (file.previewText ?? '').toLowerCase();

  let score = 0;
  const reasons: string[] = [];

  if (nameLower === q) {
    score += 130;
    reasons.push('exact filename match');
  } else if (nameLower.includes(q)) {
    score += 75;
    reasons.push('filename match');
  }

  if (intent.categoryHint !== 'all') {
    if (file.category === intent.categoryHint) {
      score += 40;
      reasons.push(`file type (${file.category})`);
    } else if (intent.keywords.length === 0) {
      return { score: 0, reason: '' };
    }
  }

  if (intent.folderHint && pathLower.includes(intent.folderHint)) {
    score += 32;
    reasons.push(`in ${intent.folderHint} folder`);
  }

  if (intent.dateFilter && matchesDateFilter(file.modifiedAt, intent.dateFilter, nowMs)) {
    score += 28;
    reasons.push(
      intent.dateFilter === 'yesterday'
        ? 'modified recently/yesterday'
        : intent.dateFilter === 'today'
          ? 'modified today'
          : 'recent modification date'
    );
  }

  const tokens = intent.keywords.length > 0 ? intent.keywords : q.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (nameLower.includes(token)) {
      score += 28;
      reasons.push(`name matches "${token}"`);
    } else if (pathLower.includes(token)) {
      score += 14;
      reasons.push(`path matches "${token}"`);
    }
    if (previewLower.includes(token)) {
      score += 16;
      reasons.push(`content matches "${token}"`);
    }
    if ((token === 'presentation' || token === 'slides' || token === 'deck') && file.category === 'presentation') {
      score += 30;
    }
    if ((token === 'excel' || token === 'spreadsheet' || token === 'expenses' || token === 'csv') && file.category === 'spreadsheet') {
      score += 30;
    }
    if ((token === 'image' || token === 'picture' || token === 'photo') && file.category === 'image') {
      score += 25;
    }
    if ((token === 'video' || token === 'clip' || token === 'recording') && file.category === 'video') {
      score += 25;
    }
    if ((token === 'audio' || token === 'song' || token === 'voice' || token === 'music') && file.category === 'audio') {
      score += 25;
    }
    if ((token === 'document' || token === 'pdf' || token === 'resume' || token === 'report' || token === 'invoice') && file.category === 'document') {
      score += 25;
    }
    if ((token === 'code' || token === 'script' || token === 'source') && file.category === 'code') {
      score += 20;
    }
  }

  if (intent.sortByRecent && score > 0) {
    const ageDays = Math.max(0, (nowMs - Date.parse(file.modifiedAt || '')) / (24 * 60 * 60 * 1000));
    if (Number.isFinite(ageDays)) {
      score += Math.max(0, Math.round(15 - Math.min(15, ageDays)));
    }
  }

  const uniqueReasons = Array.from(new Set(reasons)).slice(0, 3);
  return {
    score,
    reason: uniqueReasons.length > 0 ? uniqueReasons.join(' + ') : 'indexed workspace file',
  };
}

export function scoreFileMatch(file: IndexedFileItem, query: string): number {
  return evaluateFileMatch(file, query).score;
}

export function searchIndexedFiles(
  files: IndexedFileItem[],
  query: string,
  categoryFilter: IndexedFileItem['category'] | 'all' = 'all',
  nowMs = Date.now()
): IndexedFileItem[] {
  const intent = parseFileSearchIntent(query);
  const effectiveCategory =
    categoryFilter !== 'all'
      ? categoryFilter
      : intent.categoryHint !== 'all'
        ? intent.categoryHint
        : 'all';

  const filtered =
    effectiveCategory === 'all' ? files : files.filter((f) => f.category === effectiveCategory);

  if (!query.trim()) {
    return [...filtered].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  return filtered
    .map((file) => {
      const evaluated = evaluateFileMatch(file, query, nowMs);
      return {
        file: { ...file, matchReason: evaluated.reason },
        score: evaluated.score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.file.modifiedAt.localeCompare(a.file.modifiedAt))
    .map((item) => item.file);
}

export function findDuplicateGroups(files: IndexedFileItem[]): IndexedFileItem[][] {
  const groups = new Map<string, IndexedFileItem[]>();
  for (const file of files) {
    const normalizedName = file.name.replace(/\s*\(\d+\)(?=\.[^.]+$)/, '').toLowerCase();
    const key = `${normalizedName}::${file.sizeBytes}`;
    const existing = groups.get(key) ?? [];
    existing.push(file);
    groups.set(key, existing);
  }
  return Array.from(groups.values()).filter((g) => g.length > 1);
}
