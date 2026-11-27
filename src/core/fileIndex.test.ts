import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  categorizeExtension,
  findDuplicateGroups,
  formatBytes,
  parseFileSearchIntent,
  searchIndexedFiles,
  validateNewFolderName,
} from './fileIndex';
import type { IndexedFileItem } from './types';

const SAMPLE_FILES: IndexedFileItem[] = [
  {
    id: '1',
    name: 'monthly_expenses_2026.xlsx',
    path: '/workspace/docs/monthly_expenses_2026.xlsx',
    relativePath: 'docs/monthly_expenses_2026.xlsx',
    extension: 'xlsx',
    category: 'spreadsheet',
    sizeBytes: 42800,
    modifiedAt: '2026-11-19T12:00:00Z',
    createdAt: '2026-11-01T10:00:00Z',
    previewText: 'Rent, Utilities, Hardware Prototype Components',
  },
  {
    id: '2',
    name: 'final_year_project_slides.pptx',
    path: '/workspace/presentations/final_year_project_slides.pptx',
    relativePath: 'presentations/final_year_project_slides.pptx',
    extension: 'pptx',
    category: 'presentation',
    sizeBytes: 1250000,
    modifiedAt: '2026-11-20T09:00:00Z',
    createdAt: '2026-11-15T08:00:00Z',
  },
  {
    id: '3',
    name: 'monthly_expenses_2026 (1).xlsx',
    path: '/workspace/downloads/monthly_expenses_2026 (1).xlsx',
    relativePath: 'downloads/monthly_expenses_2026 (1).xlsx',
    extension: 'xlsx',
    category: 'spreadsheet',
    sizeBytes: 42800,
    modifiedAt: '2026-11-20T12:00:00Z',
    createdAt: '2026-11-20T12:00:00Z',
  },
];

test('categorizes extensions accurately', () => {
  assert.equal(categorizeExtension('.pdf'), 'document');
  assert.equal(categorizeExtension('xlsx'), 'spreadsheet');
  assert.equal(categorizeExtension('tsx'), 'code');
  assert.equal(categorizeExtension('mp4'), 'video');
});

test('formats byte sizes cleanly', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(2097152), '2.0 MB');
});

test('searches files using natural language category cues and Hinglish stopwords', () => {
  const results = searchIndexedFiles(SAMPLE_FILES, 'presentation project');
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'final_year_project_slides.pptx');

  const intent = parseFileSearchIntent('D drive mein pdf files dhoondo');
  assert.equal(intent.folderHint, 'd:');
  assert.equal(intent.categoryHint, 'document');
  assert.ok(intent.keywords.includes('pdf'));
});

test('detects duplicate files by normalized name and byte size', () => {
  const dupes = findDuplicateGroups(SAMPLE_FILES);
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].length, 2);
});

test('validates Windows-compatible new folder names without silently mangling characters', () => {
  assert.equal(validateNewFolderName('Client Reports 2026').valid, true);
  assert.equal(validateNewFolderName('').valid, false);
  assert.equal(validateNewFolderName('   ').valid, false);
  assert.equal(validateNewFolderName('bad:name').valid, false);
  assert.equal(validateNewFolderName('bad/name').valid, false);
  assert.equal(validateNewFolderName('CON').valid, false);
  assert.equal(validateNewFolderName('trailing.').valid, false);
});

test('fileService enforces permitted paths, creates folders with conflict check, and persists SQLite file index', async () => {
  const prevDir = process.env.FRIDAY_DATA_DIR;
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'friday-idx-data-'));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'friday-idx-root-'));
  const siblingEvilRoot = `${tempRoot}-evil`;
  fs.mkdirSync(siblingEvilRoot, { recursive: true });
  process.env.FRIDAY_DATA_DIR = tempDataDir;

  try {
    fs.writeFileSync(path.join(tempRoot, 'notes.md'), '# Project Roadmap\nQuantum scheduler architecture.\n', 'utf-8');
    fs.mkdirSync(path.join(tempRoot, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'sub', 'budget.csv'), 'item,cost\nserver,1200\n', 'utf-8');
    fs.writeFileSync(path.join(siblingEvilRoot, 'secret.txt'), 'do not leak', 'utf-8');

    const fileService = await import('../../server/fileService.ts');
    const cognitiveDb = await import('../../server/cognitiveDb.ts');

    // Path containment checks
    assert.equal(fileService.isPathPermitted(path.join(tempRoot, 'notes.md'), [tempRoot]), true);
    assert.equal(fileService.isPathPermitted(path.join(siblingEvilRoot, 'secret.txt'), [tempRoot]), false);
    assert.equal(fileService.isPathPermitted(path.join(tempRoot, '..', path.basename(siblingEvilRoot), 'secret.txt'), [tempRoot]), false);

    // Folder validation
    assert.equal(fileService.validateAndNormalizeFolder(tempRoot).ok, true);
    assert.equal(fileService.validateAndNormalizeFolder(path.join(tempRoot, 'notes.md')).ok, false);
    assert.equal(fileService.validateAndNormalizeFolder(path.join(tempRoot, 'does-not-exist')).ok, false);

    // Create permitted folder + conflict + invalid name + permission denial
    const created = fileService.createPermittedFolder({
      parentFolder: tempRoot,
      folderName: 'My Reports 2026',
      allowedFolders: [tempRoot],
    });
    assert.equal(created.created, true);
    assert.equal(fs.existsSync(created.path!), true);

    const dup = fileService.createPermittedFolder({
      parentFolder: tempRoot,
      folderName: 'My Reports 2026',
      allowedFolders: [tempRoot],
    });
    assert.equal(dup.created, false);
    assert.equal(dup.statusCode, 409);
    assert.equal(dup.conflict, true);

    const badChar = fileService.createPermittedFolder({
      parentFolder: tempRoot,
      folderName: 'bad*name',
      allowedFolders: [tempRoot],
    });
    assert.equal(badChar.created, false);
    assert.equal(badChar.statusCode, 400);

    const outside = fileService.createPermittedFolder({
      parentFolder: siblingEvilRoot,
      folderName: 'hack',
      allowedFolders: [tempRoot],
    });
    assert.equal(outside.created, false);
    assert.equal(outside.statusCode, 403);

    // Non-blocking background indexing + SQLite persistence
    await fileService.startBackgroundFileIndexing([tempRoot], { force: true });
    // Wait briefly for async indexing pass to finish
    for (let i = 0; i < 40; i++) {
      const p = fileService.getFileIndexProgress([tempRoot], false);
      if (p.status === 'completed') break;
      await new Promise((r) => setTimeout(r, 25));
    }

    const progress = fileService.getFileIndexProgress([tempRoot], false);
    assert.equal(progress.status, 'completed');
    assert.equal(progress.filesIndexed >= 2, true);

    const persisted = cognitiveDb.listIndexedFilesFromSqlite([tempRoot]);
    assert.equal(persisted.length >= 2, true);
    const mdMatch = searchIndexedFiles(persisted, 'Quantum scheduler');
    assert.equal(mdMatch.length, 1);
    assert.equal(mdMatch[0].name, 'notes.md');

    const preview = await fileService.readPermittedFilePreview(path.join(tempRoot, 'notes.md'), [tempRoot]);
    assert.equal(preview.content.includes('Quantum scheduler'), true);

    fileService.cancelFileIndexing();
    cognitiveDb.closeCognitiveSqlite();
  } finally {
    if (prevDir === undefined) {
      delete process.env.FRIDAY_DATA_DIR;
    } else {
      process.env.FRIDAY_DATA_DIR = prevDir;
    }
    for (const dir of [tempDataDir, tempRoot, siblingEvilRoot]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {
        // Ignore cleanup delay
      }
    }
  }
});

