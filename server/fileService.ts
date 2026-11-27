import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { categorizeExtension, validateNewFolderName } from '../src/core/fileIndex.ts';
import type {
  FileIndexerProgress,
  FileIndexerStatus,
  FileMediaMetadata,
  FolderPermissionStatus,
  IndexedFileItem,
} from '../src/core/types.ts';
import {
  listIndexedFilesFromSqlite,
  listIndexedFolderMeta,
  pruneIndexedFilesForRoot,
  removeIndexedFilesByRoot,
  saveIndexedFolderMeta,
  upsertIndexedFilesInSqlite,
} from './cognitiveDb.ts';
import { inspectImageDimensions, inspectWavAudioBuffer } from './mediaInspect.ts';
import { extractPdfTextFromBuffer } from './pdfParser.ts';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-electron',
  '.playwright-cli',
  '.friday-data',
  '$RECYCLE.BIN',
  'System Volume Information',
]);

const TEXT_PREVIEW_EXTS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'md',
  'txt',
  'css',
  'html',
  'csv',
  'py',
  'sql',
  'log',
  'yml',
  'yaml',
  'xml',
  'ini',
  'env',
  'rtf',
]);

let cachedIndex: {
  key: string;
  scannedAt: number;
  files: IndexedFileItem[];
} | null = null;

function normalizePathForCompare(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function resolveRealPathOrNearestAncestor(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  if (fs.existsSync(resolved)) {
    try {
      return fs.realpathSync(resolved);
    } catch {
      return resolved;
    }
  }
  const trailingParts: string[] = [];
  let cursor = resolved;
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    trailingParts.unshift(path.basename(cursor));
    cursor = parent;
  }
  let realBase = cursor;
  if (fs.existsSync(cursor)) {
    try {
      realBase = fs.realpathSync(cursor);
    } catch {
      realBase = cursor;
    }
  }
  return trailingParts.length > 0 ? path.join(realBase, ...trailingParts) : realBase;
}

function isWithinRoot(candidate: string, root: string): boolean {
  const normCandidate = normalizePathForCompare(candidate);
  const normRoot = normalizePathForCompare(root);
  if (normCandidate === normRoot) return true;
  const rootWithSep = normRoot.endsWith(path.sep) ? normRoot : normRoot + path.sep;
  return normCandidate.startsWith(rootWithSep);
}

export function getDefaultPermittedFolders(): string[] {
  const cwd = path.resolve(process.cwd());
  const isInstallOrSystemDir =
    /app\.asar|[\\/]Program Files|[\\/]AppData[\\/]Local[\\/]Programs|[\\/]Windows[\\/]System32/i.test(cwd);
  const candidates: string[] = [];
  if (!isInstallOrSystemDir) {
    candidates.push(cwd);
  }
  if (process.env.FRIDAY_DATA_DIR) {
    const dataDir = path.resolve(process.env.FRIDAY_DATA_DIR);
    if (fs.existsSync(dataDir)) {
      candidates.push(dataDir);
    }
  }
  if (process.platform === 'win32') {
    const home = os.homedir();
    for (const sub of ['Downloads', 'Desktop', 'Documents', 'Pictures', 'Videos', 'Music']) {
      const full = path.join(home, sub);
      if (fs.existsSync(full)) {
        candidates.push(full);
      }
    }
  }
  if (candidates.length === 0) {
    candidates.push(cwd);
  }
  return Array.from(new Set(candidates));
}

export function invalidateFileIndexCache(): void {
  cachedIndex = null;
}

export function isPathPermitted(targetPath: string, allowedFolders: string[]): boolean {
  if (!targetPath || targetPath.includes('\0') || allowedFolders.length === 0) return false;
  if (process.platform !== 'win32' && /^[a-zA-Z]:[\\/]/.test(targetPath.trim())) {
    return false;
  }
  const resolvedTarget = path.resolve(targetPath);
  const realTarget = resolveRealPathOrNearestAncestor(resolvedTarget);

  return allowedFolders.some((folder) => {
    if (!folder || folder.includes('\0')) return false;
    const resolvedRoot = path.resolve(folder);
    const realRoot = resolveRealPathOrNearestAncestor(resolvedRoot);
    return isWithinRoot(resolvedTarget, resolvedRoot) && isWithinRoot(realTarget, realRoot);
  });
}

export function validateAndNormalizeFolder(folderPath: string): {
  ok: boolean;
  path: string;
  exists: boolean;
  readable: boolean;
  error?: string;
} {
  const trimmed = folderPath.trim();
  if (!trimmed || trimmed.includes('\0')) {
    return { ok: false, path: trimmed, exists: false, readable: false, error: 'Folder path is invalid.' };
  }
  if (process.platform !== 'win32' && /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return {
      ok: false,
      path: trimmed,
      exists: false,
      readable: false,
      error: 'Windows drive paths require a Windows desktop environment.',
    };
  }
  const resolved = path.resolve(trimmed);
  if (!fs.existsSync(resolved)) {
    return {
      ok: false,
      path: resolved,
      exists: false,
      readable: false,
      error: `Folder "${resolved}" does not exist.`,
    };
  }
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return {
        ok: false,
        path: resolved,
        exists: true,
        readable: false,
        error: `"${resolved}" is a file, not a folder.`,
      };
    }
    fs.accessSync(resolved, fs.constants.R_OK);
    // Probe reading directory entries to catch Windows ACL denials cleanly
    fs.readdirSync(resolved, { withFileTypes: true }).slice(0, 1);
    return { ok: true, path: resolved, exists: true, readable: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return {
      ok: false,
      path: resolved,
      exists: true,
      readable: false,
      error:
        code === 'EACCES' || code === 'EPERM'
          ? `Permission denied reading "${resolved}".`
          : (err as Error).message,
    };
  }
}

export function inspectPermittedFoldersStatus(allowedFolders: string[]): FolderPermissionStatus[] {
  let metaMap = new Map<
    string,
    { fileCount: number; readable: boolean; lastIndexedAt?: string; lastError?: string }
  >();
  try {
    for (const m of listIndexedFolderMeta()) {
      metaMap.set(normalizePathForCompare(m.rootFolder), m);
    }
  } catch {
    // SQLite may be unavailable in pure unit contexts
  }

  return allowedFolders.map((folder) => {
    const check = validateAndNormalizeFolder(folder);
    const meta = metaMap.get(normalizePathForCompare(check.path));
    return {
      path: check.path,
      exists: check.exists,
      readable: check.readable,
      error: check.error || meta?.lastError,
      fileCount: meta?.fileCount ?? 0,
      lastIndexedAt: meta?.lastIndexedAt,
    };
  });
}

export function createPermittedFolder(params: {
  parentFolder: string;
  folderName: string;
  allowedFolders: string[];
}): {
  created: boolean;
  path?: string;
  statusCode: number;
  conflict?: boolean;
  error?: string;
} {
  const { parentFolder, folderName, allowedFolders } = params;
  if (!parentFolder || !parentFolder.trim()) {
    return { created: false, statusCode: 400, error: 'Choose a permitted parent folder first.' };
  }
  const resolvedParent = path.resolve(parentFolder.trim());
  if (!isPathPermitted(resolvedParent, allowedFolders)) {
    return {
      created: false,
      statusCode: 403,
      error: 'Selected parent folder is outside your permitted folders.',
    };
  }
  const parentCheck = validateAndNormalizeFolder(resolvedParent);
  if (!parentCheck.ok) {
    return {
      created: false,
      statusCode: 403,
      error: parentCheck.error || 'Parent folder is not accessible.',
    };
  }
  try {
    fs.accessSync(resolvedParent, fs.constants.W_OK);
  } catch {
    return {
      created: false,
      statusCode: 403,
      error: `Write permission denied for "${resolvedParent}".`,
    };
  }

  const nameValidation = validateNewFolderName(folderName);
  if (!nameValidation.valid) {
    return { created: false, statusCode: 400, error: nameValidation.error || 'Invalid folder name.' };
  }

  const targetPath = path.join(resolvedParent, nameValidation.cleanName);
  if (!isPathPermitted(targetPath, allowedFolders)) {
    return { created: false, statusCode: 403, error: 'Target folder escapes permitted workspace.' };
  }
  if (fs.existsSync(targetPath)) {
    return {
      created: false,
      conflict: true,
      statusCode: 409,
      path: targetPath,
      error: `A folder or file named "${nameValidation.cleanName}" already exists in ${resolvedParent}.`,
    };
  }

  try {
    fs.mkdirSync(targetPath, { recursive: false });
    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      return { created: false, statusCode: 500, error: 'Folder creation verification failed.' };
    }
    invalidateFileIndexCache();
    return { created: true, statusCode: 200, path: targetPath };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') {
      return {
        created: false,
        conflict: true,
        statusCode: 409,
        path: targetPath,
        error: `Folder "${nameValidation.cleanName}" already exists.`,
      };
    }
    return {
      created: false,
      statusCode: code === 'EACCES' || code === 'EPERM' ? 403 : 500,
      error: `Failed to create folder: ${(err as Error).message}`,
    };
  }
}

export function scanPermittedFolders(allowedFolders: string[], paused: boolean, maxFiles = 250): IndexedFileItem[] {
  if (paused || allowedFolders.length === 0) return [];
  const results: IndexedFileItem[] = [];
  const visitedDirs = new Set<string>();

  function walk(dir: string, rootDir: string, depth: number) {
    if (depth > 5 || results.length >= maxFiles) return;
    let realDir = dir;
    try {
      realDir = fs.realpathSync(dir);
    } catch {
      return;
    }
    const dirKey = normalizePathForCompare(realDir);
    if (visitedDirs.has(dirKey) || !isWithinRoot(realDir, rootDir)) return;
    visitedDirs.add(dirKey);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      if (entry.isSymbolicLink()) continue;
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
          let contentExcerpt: string | undefined;
          if (TEXT_PREVIEW_EXTS.has(ext) && stat.size <= 128 * 1024) {
            const raw = fs.readFileSync(fullPath, 'utf-8');
            previewText = raw.slice(0, 400);
            contentExcerpt = raw.slice(0, 4000);
          }
          results.push({
            id: crypto.createHash('sha1').update(fullPath).digest('hex').slice(0, 16),
            rootFolder: rootDir,
            name: entry.name,
            path: fullPath,
            relativePath: path.relative(rootDir, fullPath) || entry.name,
            extension: ext || 'file',
            category: categorizeExtension(ext),
            sizeBytes: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            createdAt: stat.birthtime.toISOString(),
            previewText,
            contentExcerpt,
            indexedAt: new Date().toISOString(),
          });
        } catch {
          // Ignore unreadable files
        }
      }
    }
  }

  for (const folder of allowedFolders) {
    const resolved = path.resolve(folder);
    if (fs.existsSync(resolved)) {
      walk(resolved, resolved, 0);
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
  if (allowedFolders.length === 0) return [];
  try {
    const persisted = listIndexedFilesFromSqlite(allowedFolders);
    if (persisted.length > 0) {
      return persisted.slice(0, maxFiles);
    }
  } catch {
    // Fall back to in-memory cache/sync scan
  }
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

// ---------- Non-Blocking Incremental SQLite Indexer ----------

interface IndexWorkerState {
  status: FileIndexerStatus;
  running: boolean;
  paused: boolean;
  cancelled: boolean;
  totalFolders: number;
  processedFolders: number;
  filesIndexed: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  currentFolder: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  jobEpoch: number;
  activePromise: Promise<void> | null;
}

const workerState: IndexWorkerState = {
  status: 'ready',
  running: false,
  paused: false,
  cancelled: false,
  totalFolders: 0,
  processedFolders: 0,
  filesIndexed: 0,
  updatedCount: 0,
  skippedCount: 0,
  errorCount: 0,
  currentFolder: null,
  startedAt: null,
  completedAt: null,
  lastError: null,
  jobEpoch: 0,
  activePromise: null,
};

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function getFileIndexProgress(allowedFolders: string[], pausedSetting: boolean): FileIndexerProgress {
  const folderStatuses = inspectPermittedFoldersStatus(allowedFolders);
  let totalPersisted = workerState.filesIndexed;
  try {
    totalPersisted = Math.max(totalPersisted, listIndexedFilesFromSqlite(allowedFolders).length);
  } catch {
    // Ignore SQLite read fallback in early boot
  }

  let effectiveStatus: FileIndexerStatus = workerState.status;
  if (allowedFolders.length === 0) {
    effectiveStatus = 'not_configured';
  } else if (pausedSetting || workerState.paused) {
    effectiveStatus = 'paused';
  } else if (workerState.running) {
    effectiveStatus = 'indexing';
  } else if (folderStatuses.length > 0 && folderStatuses.every((f) => !f.exists || !f.readable)) {
    effectiveStatus = 'permission_denied';
  } else if (workerState.status === 'ready' && totalPersisted > 0) {
    effectiveStatus = 'completed';
  }

  return {
    status: effectiveStatus,
    totalFolders: allowedFolders.length,
    processedFolders: workerState.processedFolders,
    filesIndexed: totalPersisted,
    updatedCount: workerState.updatedCount,
    skippedCount: workerState.skippedCount,
    errorCount: workerState.errorCount,
    currentFolder: workerState.currentFolder,
    startedAt: workerState.startedAt,
    completedAt: workerState.completedAt,
    lastError: workerState.lastError,
    paused: pausedSetting || workerState.paused,
    folderStatuses,
  };
}

export async function startBackgroundFileIndexing(
  allowedFolders: string[],
  options: { force?: boolean; maxFilesPerRoot?: number; maxTotalFiles?: number } = {}
): Promise<FileIndexerProgress> {
  const normalizedRoots = Array.from(new Set(allowedFolders.map((f) => path.resolve(f)).filter(Boolean)));
  if (normalizedRoots.length === 0) {
    workerState.status = 'not_configured';
    workerState.running = false;
    return getFileIndexProgress(normalizedRoots, false);
  }

  if (workerState.running && workerState.activePromise && !options.force) {
    return getFileIndexProgress(normalizedRoots, false);
  }

  const epoch = ++workerState.jobEpoch;
  workerState.cancelled = false;
  workerState.paused = false;
  workerState.running = true;
  workerState.status = 'indexing';
  workerState.totalFolders = normalizedRoots.length;
  workerState.processedFolders = 0;
  workerState.filesIndexed = 0;
  workerState.updatedCount = 0;
  workerState.skippedCount = 0;
  workerState.errorCount = 0;
  workerState.currentFolder = normalizedRoots[0] || null;
  workerState.startedAt = new Date().toISOString();
  workerState.completedAt = null;
  workerState.lastError = null;

  const maxTotalFiles = options.maxTotalFiles ?? 2500;
  const maxFilesPerRoot = options.maxFilesPerRoot ?? 1000;

  const runJob = async () => {
    try {
      const existingByPath = new Map<string, IndexedFileItem>();
      try {
        for (const item of listIndexedFilesFromSqlite(normalizedRoots)) {
          existingByPath.set(path.resolve(item.path), item);
        }
      } catch {
        // Ignore initial read error
      }

      const visitedRealDirs = new Set<string>();
      let globalTotal = 0;

      for (let idx = 0; idx < normalizedRoots.length; idx += 1) {
        if (workerState.cancelled || workerState.paused || workerState.jobEpoch !== epoch) break;
        const rootDir = normalizedRoots[idx];
        workerState.currentFolder = rootDir;

        const rootCheck = validateAndNormalizeFolder(rootDir);
        if (!rootCheck.ok) {
          workerState.errorCount += 1;
          workerState.lastError = rootCheck.error || `Cannot access ${rootDir}`;
          try {
            saveIndexedFolderMeta({
              rootFolder: rootDir,
              fileCount: 0,
              readable: false,
              lastIndexedAt: new Date().toISOString(),
              lastError: rootCheck.error,
            });
          } catch {
            // Ignore meta write failure
          }
          workerState.processedFolders = idx + 1;
          continue;
        }

        const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];
        const validPathsForRoot = new Set<string>();
        const pendingBatch: IndexedFileItem[] = [];
        let rootFileCount = 0;
        let rootError: string | null = null;

        while (queue.length > 0 && globalTotal < maxTotalFiles && rootFileCount < maxFilesPerRoot) {
          if (workerState.cancelled || workerState.paused || workerState.jobEpoch !== epoch) break;
          const current = queue.shift()!;
          if (current.depth > 6) continue;

          let realDir: string;
          try {
            realDir = await fs.promises.realpath(current.dir);
          } catch {
            continue;
          }
          const realKey = normalizePathForCompare(realDir);
          if (visitedRealDirs.has(realKey) || !isWithinRoot(realDir, rootDir)) continue;
          visitedRealDirs.add(realKey);

          let entries: fs.Dirent[];
          try {
            entries = await fs.promises.readdir(current.dir, { withFileTypes: true });
          } catch (err) {
            workerState.errorCount += 1;
            rootError = (err as Error).message;
            continue;
          }

          for (const entry of entries) {
            if (
              workerState.cancelled ||
              workerState.paused ||
              workerState.jobEpoch !== epoch ||
              globalTotal >= maxTotalFiles ||
              rootFileCount >= maxFilesPerRoot
            ) {
              break;
            }
            if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
            if (entry.isSymbolicLink()) {
              workerState.skippedCount += 1;
              continue;
            }

            const fullPath = path.join(current.dir, entry.name);
            if (entry.isDirectory()) {
              if (!IGNORED_DIRS.has(entry.name)) {
                queue.push({ dir: fullPath, depth: current.depth + 1 });
              }
              continue;
            }
            if (!entry.isFile()) continue;

            try {
              const stat = await fs.promises.stat(fullPath);
              const resolvedFull = path.resolve(fullPath);
              validPathsForRoot.add(resolvedFull);
              rootFileCount += 1;
              globalTotal += 1;
              workerState.filesIndexed = globalTotal;

              const existing = existingByPath.get(resolvedFull);
              const modifiedIso = stat.mtime.toISOString();
              if (
                existing &&
                existing.modifiedAt === modifiedIso &&
                existing.sizeBytes === stat.size &&
                existing.indexedAt
              ) {
                workerState.skippedCount += 1;
              } else {
                const ext = path.extname(entry.name).replace(/^\./, '').toLowerCase();
                let previewText: string | undefined;
                let contentExcerpt: string | undefined;

                if (TEXT_PREVIEW_EXTS.has(ext) && stat.size <= 128 * 1024) {
                  try {
                    const textRaw = await fs.promises.readFile(resolvedFull, 'utf-8');
                    previewText = textRaw.slice(0, 400);
                    contentExcerpt = textRaw.slice(0, 4000);
                  } catch {
                    // Ignore unreadable content
                  }
                } else if (ext === 'pdf' && stat.size <= 5 * 1024 * 1024) {
                  try {
                    const buf = await fs.promises.readFile(resolvedFull);
                    const parsed = await extractPdfTextFromBuffer(buf);
                    if (parsed.text && !parsed.isScannedImageOnly) {
                      previewText = parsed.text.slice(0, 400);
                      contentExcerpt = parsed.text.slice(0, 4000);
                    }
                  } catch {
                    // Ignore malformed PDF during background pass
                  }
                }

                pendingBatch.push({
                  id: crypto.createHash('sha1').update(resolvedFull).digest('hex').slice(0, 16),
                  rootFolder: rootDir,
                  name: entry.name,
                  path: resolvedFull,
                  relativePath: path.relative(rootDir, resolvedFull) || entry.name,
                  extension: ext || 'file',
                  category: categorizeExtension(ext),
                  sizeBytes: stat.size,
                  modifiedAt: modifiedIso,
                  createdAt: stat.birthtime.toISOString(),
                  previewText,
                  contentExcerpt,
                  indexedAt: new Date().toISOString(),
                });
                workerState.updatedCount += 1;

                if (pendingBatch.length >= 25) {
                  upsertIndexedFilesInSqlite(pendingBatch.splice(0, pendingBatch.length));
                }
              }

              if (globalTotal % 20 === 0) {
                await yieldToEventLoop();
              }
            } catch {
              workerState.errorCount += 1;
            }
          }
          await yieldToEventLoop();
        }

        if (pendingBatch.length > 0) {
          upsertIndexedFilesInSqlite(pendingBatch.splice(0, pendingBatch.length));
        }

        if (!workerState.cancelled && !workerState.paused && workerState.jobEpoch === epoch) {
          try {
            pruneIndexedFilesForRoot(rootDir, validPathsForRoot);
            saveIndexedFolderMeta({
              rootFolder: rootDir,
              fileCount: rootFileCount,
              readable: rootError === null,
              lastIndexedAt: new Date().toISOString(),
              lastError: rootError,
            });
          } catch {
            // Ignore SQLite meta failure
          }
          workerState.processedFolders = idx + 1;
        }
      }

      if (workerState.jobEpoch === epoch) {
        if (workerState.paused) {
          workerState.status = 'paused';
        } else if (workerState.cancelled) {
          workerState.status = 'ready';
        } else {
          workerState.status =
            workerState.errorCount > 0 && workerState.filesIndexed === 0 ? 'failed' : 'completed';
          workerState.completedAt = new Date().toISOString();
        }
      }
    } catch (err) {
      if (workerState.jobEpoch === epoch) {
        workerState.status = 'failed';
        workerState.lastError = (err as Error).message;
      }
    } finally {
      if (workerState.jobEpoch === epoch) {
        workerState.running = false;
        workerState.currentFolder = null;
        invalidateFileIndexCache();
      }
    }
  };

  workerState.activePromise = runJob();
  return getFileIndexProgress(normalizedRoots, false);
}

export function pauseFileIndexing(): FileIndexerProgress {
  workerState.paused = true;
  workerState.running = false;
  workerState.status = 'paused';
  return getFileIndexProgress([], true);
}

export function resumeFileIndexing(allowedFolders: string[]): Promise<FileIndexerProgress> {
  workerState.paused = false;
  return startBackgroundFileIndexing(allowedFolders, { force: true });
}

export function cancelFileIndexing(): void {
  workerState.cancelled = true;
  workerState.paused = false;
  workerState.running = false;
  workerState.jobEpoch += 1;
  workerState.currentFolder = null;
  workerState.status = 'ready';
}

export function removePermittedFolderFromIndex(folderPath: string): number {
  invalidateFileIndexCache();
  try {
    return removeIndexedFilesByRoot(folderPath);
  } catch {
    return 0;
  }
}

export function getPersistedOrIndexedFiles(
  allowedFolders: string[],
  paused: boolean,
  maxFiles = 1500
): IndexedFileItem[] {
  if (allowedFolders.length === 0) return [];
  try {
    const rows = listIndexedFilesFromSqlite(allowedFolders);
    if (rows.length > 0) {
      return rows.slice(0, maxFiles);
    }
  } catch {
    // Fall back to cache
  }
  return getCachedFileIndex(allowedFolders, paused, Math.min(maxFiles, 400));
}

export async function readPermittedFilePreview(
  filePath: string,
  allowedFolders: string[]
): Promise<{
  path: string;
  name: string;
  content: string;
  sizeBytes: number;
  modifiedAt: string;
  createdAt: string;
  extension: string;
  category: IndexedFileItem['category'];
  mediaMeta?: FileMediaMetadata;
}> {
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
  const modifiedAt = stat.mtime.toISOString();
  const createdAt = stat.birthtime.toISOString();

  if (ext === 'pdf') {
    const buffer = fs.readFileSync(resolved);
    const parsed = await extractPdfTextFromBuffer(buffer);
    const mediaMeta: FileMediaMetadata = {
      format: 'PDF',
      pageCount: parsed.numPages,
      title: parsed.title,
      author: parsed.author,
    };
    if (parsed.isScannedImageOnly) {
      return {
        path: resolved,
        name: path.basename(resolved),
        content: `[PDF Document: ${path.basename(resolved)} · ${parsed.numPages} page(s)]\nThis PDF appears to contain scanned images without an embedded text layer. Capture a page screenshot or upload it in Media & Screen Intelligence to inspect visual contents.`,
        sizeBytes: stat.size,
        modifiedAt,
        createdAt,
        extension: ext,
        category,
        mediaMeta,
      };
    }
    const headerMeta = [
      `PDF Pages: ${parsed.numPages}`,
      parsed.title ? `Title: ${parsed.title}` : null,
      parsed.author ? `Author: ${parsed.author}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const body = parsed.text.slice(0, 24000);
    return {
      path: resolved,
      name: path.basename(resolved),
      content: `${headerMeta ? `[${headerMeta}]\n\n` : ''}${body}${
        parsed.text.length > 24000 ? '\n\n... [PDF preview truncated at 24 KB]' : ''
      }`,
      sizeBytes: stat.size,
      modifiedAt,
      createdAt,
      extension: ext,
      category,
      mediaMeta,
    };
  }

  if (category === 'image') {
    let mediaMeta: FileMediaMetadata = { format: ext.toUpperCase() };
    try {
      if (stat.size <= 15 * 1024 * 1024) {
        const buf = fs.readFileSync(resolved);
        const dim = inspectImageDimensions(buf, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
        mediaMeta = {
          format: dim.format,
          width: dim.width,
          height: dim.height,
        };
      }
    } catch {
      // Non-fatal metadata inspect error
    }
    return {
      path: resolved,
      name: path.basename(resolved),
      content: `[Image: ${path.basename(resolved)} · ${mediaMeta.format}${
        mediaMeta.width && mediaMeta.height ? ` ${mediaMeta.width}×${mediaMeta.height}px` : ''
      }]`,
      sizeBytes: stat.size,
      modifiedAt,
      createdAt,
      extension: ext,
      category,
      mediaMeta,
    };
  }

  if (category === 'audio' || category === 'video') {
    let mediaMeta: FileMediaMetadata = { format: ext.toUpperCase() };
    if (ext === 'wav' && stat.size <= 32 * 1024 * 1024) {
      try {
        const buf = fs.readFileSync(resolved);
        const wav = inspectWavAudioBuffer(buf);
        if (wav.isRiffWave) {
          mediaMeta = {
            format: 'WAV',
            durationSec: wav.durationSec,
            sampleRate: wav.sampleRate,
            channels: wav.channels,
            bitsPerSample: wav.bitsPerSample,
          };
        }
      } catch {
        // Ignore WAV header error
      }
    }
    const details = [
      mediaMeta.format,
      mediaMeta.durationSec ? `${mediaMeta.durationSec}s` : null,
      mediaMeta.sampleRate ? `${mediaMeta.sampleRate} Hz` : null,
      mediaMeta.channels ? `${mediaMeta.channels}ch` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      path: resolved,
      name: path.basename(resolved),
      content: `[${category === 'audio' ? 'Audio' : 'Video'} File: ${path.basename(resolved)} · ${details}]`,
      sizeBytes: stat.size,
      modifiedAt,
      createdAt,
      extension: ext,
      category,
      mediaMeta,
    };
  }

  if (stat.size > 512 * 1024) {
    return {
      path: resolved,
      name: path.basename(resolved),
      content: fs.readFileSync(resolved, 'utf-8').slice(0, 16000) + '\n\n... [Preview truncated at 16 KB]',
      sizeBytes: stat.size,
      modifiedAt,
      createdAt,
      extension: ext,
      category,
    };
  }

  return {
    path: resolved,
    name: path.basename(resolved),
    content: fs.readFileSync(resolved, 'utf-8'),
    sizeBytes: stat.size,
    modifiedAt,
    createdAt,
    extension: ext,
    category,
  };
}

