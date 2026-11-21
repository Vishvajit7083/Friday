import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { categorizeExtension } from '../src/core/fileIndex.ts';
import type { IndexedFileItem } from '../src/core/types.ts';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-electron', '.playwright-cli', '.friday-data']);
const TEXT_PREVIEW_EXTS = new Set(['ts', 'tsx', 'js', 'jsx', 'json', 'md', 'txt', 'css', 'html', 'csv', 'py', 'sql']);

let cachedIndex: {
  key: string;
  scannedAt: number;
  files: IndexedFileItem[];
} | null = null;

export function getDefaultPermittedFolders(): string[] {
  const cwd = path.resolve(process.cwd());
  const candidates = [cwd];
  if (process.platform === 'win32') {
    const home = os.homedir();
    for (const sub of ['Downloads', 'Desktop', 'Documents', 'Pictures', 'Videos', 'Music']) {
      const full = path.join(home, sub);
      if (fs.existsSync(full)) {
        candidates.push(full);
      }
    }
  }
  return Array.from(new Set(candidates));
}

export function invalidateFileIndexCache(): void {
  cachedIndex = null;
}

export function isPathPermitted(targetPath: string, allowedFolders: string[]): boolean {
  if (!targetPath || targetPath.includes('\0')) return false;
  if (process.platform !== 'win32' && /^[a-zA-Z]:[\\/]/.test(targetPath.trim())) {
    return false;
  }
  const resolvedTarget = path.resolve(targetPath);
  return allowedFolders.some((folder) => {
    const resolvedRoot = path.resolve(folder);
    return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep);
  });
}

export function scanPermittedFolders(allowedFolders: string[], paused: boolean, maxFiles = 250): IndexedFileItem[] {
  if (paused) return [];
  const results: IndexedFileItem[] = [];

  function walk(dir: string, rootDir: string, depth: number) {
    if (depth > 4 || results.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          walk(fullPath, rootDir, depth + 1);
        }
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          const ext = path.extname(entry.name).replace(/^\./, '').toLowerCase();
          let previewText: string | undefined;
          if (TEXT_PREVIEW_EXTS.has(ext) && stat.size < 64 * 1024) {
            previewText = fs.readFileSync(fullPath, 'utf-8').slice(0, 400);
          }
          results.push({
            id: crypto.createHash('sha1').update(fullPath).digest('hex').slice(0, 16),
            name: entry.name,
            path: fullPath,
            relativePath: path.relative(rootDir, fullPath) || entry.name,
            extension: ext || 'file',
            category: categorizeExtension(ext),
            sizeBytes: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            createdAt: stat.birthtime.toISOString(),
            previewText,
          });
        } catch {
          // Ignore unreadable files
        }
      }
    }
  }

  for (const folder of allowedFolders) {
    if (fs.existsSync(folder)) {
      walk(path.resolve(folder), path.resolve(folder), 0);
    }
  }

  return results;
}

export function getCachedFileIndex(
  allowedFolders: string[],
  paused: boolean,
  maxFiles = 300,
  ttlMs = 30_000
): IndexedFileItem[] {
  if (paused) return [];
  const key = `${allowedFolders.join('|')}::${maxFiles}`;
  const now = Date.now();
  if (cachedIndex && cachedIndex.key === key && now - cachedIndex.scannedAt < ttlMs) {
    return cachedIndex.files;
  }
  const files = scanPermittedFolders(allowedFolders, paused, maxFiles);
  cachedIndex = { key, scannedAt: now, files };
  return files;
}

export function readPermittedFilePreview(
  filePath: string,
  allowedFolders: string[]
): { name: string; content: string; sizeBytes: number; extension: string; category: IndexedFileItem['category'] } {
  const resolved = path.resolve(filePath);
  if (!isPathPermitted(resolved, allowedFolders)) {
    throw new Error('Access denied: file is outside user-permitted folders.');
  }
  if (!fs.existsSync(resolved)) {
    throw new Error('File not found.');
  }
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    throw new Error('Selected path is a directory.');
  }
  const ext = path.extname(resolved).replace(/^\./, '').toLowerCase();
  const category = categorizeExtension(ext);
  if (category === 'image' || category === 'video' || category === 'audio') {
    return {
      name: path.basename(resolved),
      content: `[Binary ${category} file: ${path.basename(resolved)} · Use Open in Default App or /api/files/stream to view/play.]`,
      sizeBytes: stat.size,
      extension: ext,
      category,
    };
  }
  if (stat.size > 512 * 1024) {
    return {
      name: path.basename(resolved),
      content: fs.readFileSync(resolved, 'utf-8').slice(0, 16000) + '\n\n... [Preview truncated at 16 KB]',
      sizeBytes: stat.size,
      extension: ext,
      category,
    };
  }
  return {
    name: path.basename(resolved),
    content: fs.readFileSync(resolved, 'utf-8'),
    sizeBytes: stat.size,
    extension: ext,
    category,
  };
}
