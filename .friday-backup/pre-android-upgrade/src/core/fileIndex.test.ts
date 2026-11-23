import test from 'node:test';
import assert from 'node:assert/strict';
import { categorizeExtension, findDuplicateGroups, formatBytes, searchIndexedFiles } from './fileIndex';
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

test('searches files using natural language category cues', () => {
  const results = searchIndexedFiles(SAMPLE_FILES, 'presentation project');
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'final_year_project_slides.pptx');
});

test('detects duplicate files by normalized name and byte size', () => {
  const dupes = findDuplicateGroups(SAMPLE_FILES);
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].length, 2);
});
