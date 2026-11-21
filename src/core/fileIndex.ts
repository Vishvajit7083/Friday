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

export function scoreFileMatch(file: IndexedFileItem, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const tokens = q.split(/\s+/).filter(Boolean);
  const nameLower = file.name.toLowerCase();
  const pathLower = file.relativePath.toLowerCase();
  const previewLower = (file.previewText ?? '').toLowerCase();

  let score = 0;

  if (nameLower === q) score += 120;
  else if (nameLower.includes(q)) score += 70;

  for (const token of tokens) {
    if (nameLower.includes(token)) score += 25;
    if (pathLower.includes(token)) score += 12;
    if (previewLower.includes(token)) score += 15;

    // Natural language category synonyms
    if ((token === 'presentation' || token === 'slides' || token === 'deck') && file.category === 'presentation') {
      score += 35;
    }
    if ((token === 'excel' || token === 'spreadsheet' || token === 'expenses' || token === 'csv') && file.category === 'spreadsheet') {
      score += 35;
    }
    if ((token === 'image' || token === 'picture' || token === 'photo') && file.category === 'image') {
      score += 30;
    }
    if ((token === 'video' || token === 'clip' || token === 'recording') && file.category === 'video') {
      score += 30;
    }
    if ((token === 'audio' || token === 'song' || token === 'voice') && file.category === 'audio') {
      score += 30;
    }
    if ((token === 'document' || token === 'pdf' || token === 'resume' || token === 'report') && file.category === 'document') {
      score += 30;
    }
    if ((token === 'code' || token === 'script' || token === 'source') && file.category === 'code') {
      score += 25;
    }
  }

  return score;
}

export function searchIndexedFiles(
  files: IndexedFileItem[],
  query: string,
  categoryFilter: IndexedFileItem['category'] | 'all' = 'all'
): IndexedFileItem[] {
  const filtered = categoryFilter === 'all' ? files : files.filter((f) => f.category === categoryFilter);
  if (!query.trim()) {
    return [...filtered].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }
  return filtered
    .map((file) => ({ file, score: scoreFileMatch(file, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
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
