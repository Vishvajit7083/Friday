import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeUserCommand, extractVoiceCommand, isInterruptionCommand } from './intentEngine';
import { evaluateFileMatch, parseFileSearchIntent, searchIndexedFiles } from './fileIndex';
import { sanitizeSettingsPatch } from './diagnostics';
import type { AssistantSettings, IndexedFileItem } from './types';

test('routes hardware performance queries to system agent', () => {
  const parsed = analyzeUserCommand('Friday, show me my laptop performance and RAM usage');
  assert.equal(parsed.category, 'system_telemetry');
  assert.equal(parsed.agents.includes('system'), true);
  assert.equal(parsed.requiresConfirmation, false);
});

test('routes natural file searches to file agent', () => {
  const parsed = analyzeUserCommand('Friday, find the Excel file containing my monthly expenses');
  assert.equal(parsed.category, 'file_search');
  assert.equal(parsed.agents.includes('file'), true);
});

test('routes Google search requests to browser agent', () => {
  const parsed = analyzeUserCommand('Friday, search Google for the best Raspberry Pi AI projects');
  assert.equal(parsed.category, 'web_search');
  assert.equal(parsed.agents.includes('browser'), true);
});

test('routes media playback and volume commands to media_control', () => {
  const playParsed = analyzeUserCommand('Friday, play my downloaded music');
  assert.equal(playParsed.category, 'media_control');
  assert.equal(playParsed.requiresConfirmation, false);

  const volParsed = analyzeUserCommand('increase volume');
  assert.equal(volParsed.category, 'media_control');
});

test('enforces confirmation gate on destructive file commands and closing apps', () => {
  const parsedDelete = analyzeUserCommand('Friday, delete all files in my Downloads folder');
  assert.equal(parsedDelete.category, 'sensitive_action');
  assert.equal(parsedDelete.requiresConfirmation, true);

  const parsedClose = analyzeUserCommand('Friday, close notepad');
  assert.equal(parsedClose.category, 'sensitive_action');
  assert.equal(parsedClose.requiresConfirmation, true);
});

test('requires confirmation before scheduling new calendar meetings', () => {
  const parsed = analyzeUserCommand('Friday, schedule a meeting tomorrow at 10am');
  assert.equal(parsed.category, 'calendar_schedule');
  assert.equal(parsed.requiresConfirmation, true);
});

test('extracts command cleanly with punctuated wake word or direct mic mode', () => {
  const withWake = extractVoiceCommand('Hey, Friday, check laptop performance', 'Hey Friday', true);
  assert.equal(withWake.matched, true);
  assert.equal(withWake.command, 'check laptop performance');

  const direct = extractVoiceCommand('open chrome', 'Hey Friday', false);
  assert.equal(direct.matched, true);
  assert.equal(direct.command, 'open chrome');

  const ignored = extractVoiceCommand('open chrome', 'Hey Friday', true);
  assert.equal(ignored.matched, false);
});

test('detects voice barge-in interruption phrases without false positives', () => {
  assert.equal(isInterruptionCommand('stop'), true);
  assert.equal(isInterruptionCommand('Friday, stop talking'), true);
  assert.equal(isInterruptionCommand('quiet please'), true);
  assert.equal(isInterruptionCommand('cancel'), true);
  assert.equal(isInterruptionCommand('open chrome'), false);
  assert.equal(isInterruptionCommand('stop by the store tomorrow'), false);
});

test('parses natural file search intent with folder, category, and relative date hints', () => {
  const intent = parseFileSearchIntent('open the photo I downloaded yesterday from Downloads');
  assert.equal(intent.categoryHint, 'image');
  assert.equal(intent.folderHint, 'downloads');
  assert.equal(intent.dateFilter, 'yesterday');
  assert.equal(intent.requestedAction, 'open');

  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  const modifiedRecent = new Date(now - 20 * 60 * 60 * 1000).toISOString();
  const modifiedOlder = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
  const sampleFiles: IndexedFileItem[] = [
    {
      id: '1',
      name: 'vacation_photo.png',
      path: 'C:/Users/Vishvajit/Downloads/vacation_photo.png',
      relativePath: 'Downloads/vacation_photo.png',
      extension: 'png',
      category: 'image',
      sizeBytes: 102400,
      modifiedAt: modifiedRecent,
      createdAt: modifiedRecent,
    },
    {
      id: '2',
      name: 'budget.xlsx',
      path: 'C:/Users/Vishvajit/Documents/budget.xlsx',
      relativePath: 'Documents/budget.xlsx',
      extension: 'xlsx',
      category: 'spreadsheet',
      sizeBytes: 24576,
      modifiedAt: modifiedOlder,
      createdAt: modifiedOlder,
    },
  ];

  const matchEval = evaluateFileMatch(sampleFiles[0], 'photo from Downloads yesterday', now);
  assert.equal(matchEval.score > 50, true);
  assert.equal(matchEval.reason.includes('image'), true);

  const results = searchIndexedFiles(sampleFiles, 'open the photo from Downloads yesterday', 'all', now);
  assert.equal(results.length, 1);
  assert.equal(results[0].name, 'vacation_photo.png');
  assert.equal(typeof results[0].matchReason, 'string');
});

test('sanitizes local-first AI model settings and rejects unsafe ollamaModel characters', () => {
  const baseSettings: AssistantSettings = {
    assistantName: 'F.R.I.D.A.Y.',
    userName: 'Vishvajit',
    wakeWord: 'Hey Friday',
    aiModel: 'local-auto',
    ollamaModel: 'llama3.2:3b',
    voiceName: 'Kore',
    voiceGender: 'female',
    speakingSpeed: 1,
    language: 'en-US',
    continuousListening: false,
    wakeWordEnabled: true,
    autoSpeakReplies: true,
    pushToTalkKey: 'Ctrl+Space',
    reopenShortcut: 'Ctrl+Shift+Space',
    startFullscreen: true,
    launchOnStartup: false,
    themeAccent: 'cyan',
    animationQuality: 'high',
    weatherLocation: 'San Francisco, United States',
    allowedFolders: ['/tmp'],
    pausedIndexing: false,
    screenCaptureConsent: false,
    wallpaper: {
      mode: 'aurora-command',
      customVideoUrl: '',
      blurPx: 0,
      brightnessPercent: 90,
      opacityPercent: 100,
      performanceMode: false,
    },
    hologram: {
      mode: 'orbital',
      projectionBeam: true,
      scanlineIntensity: 0.25,
      holoOpacity: 0.9,
      autoRotate: true,
    },
    enabledAgents: {
      core: true,
      voice: true,
      system: true,
      file: true,
      browser: true,
      application: true,
      vision: true,
      media: true,
      calendar: true,
      memory: true,
      automation: true,
    },
  };

  const validUpdate = sanitizeSettingsPatch(
    { aiModel: 'ollama', ollamaModel: 'qwen2.5:7b-instruct' },
    baseSettings
  );
  assert.equal(validUpdate.aiModel, 'ollama');
  assert.equal(validUpdate.ollamaModel, 'qwen2.5:7b-instruct');

  const clearedUpdate = sanitizeSettingsPatch({ aiModel: 'local-core', ollamaModel: '' }, baseSettings);
  assert.equal(clearedUpdate.aiModel, 'local-core');
  assert.equal(clearedUpdate.ollamaModel, '');

  const rejectedUpdate = sanitizeSettingsPatch(
    { aiModel: 'unknown-model', ollamaModel: 'llama3.2; rm -rf /' },
    baseSettings
  );
  assert.equal(rejectedUpdate.aiModel, 'local-auto');
  assert.equal(rejectedUpdate.ollamaModel, 'llama3.2:3b');
});

