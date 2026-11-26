import test from 'node:test';
import assert from 'node:assert/strict';
import {
  determineOptimizationProfile,
  formatTestReportMarkdown,
  sanitizeCalendarPatch,
  sanitizeMemoryPatch,
  sanitizeSettingsPatch,
  summarizeDiagnostics,
} from './diagnostics';
import type { AssistantSettings, DiagnosticCheckItem, DiagnosticsReportPayload } from './types';

test('summarizes diagnostic check statuses accurately', () => {
  const checks: DiagnosticCheckItem[] = [
    {
      id: '1',
      category: 'AI',
      name: 'Cognitive Engine',
      expected: 'Connected',
      actual: 'Connected',
      status: 'pass',
      durationMs: 120,
      checkedAt: '2026-11-21T00:00:00Z',
    },
    {
      id: '2',
      category: 'Hardware',
      name: 'GPU Temp',
      expected: 'Read temp',
      actual: 'Unavailable',
      status: 'unavailable',
      durationMs: 10,
      checkedAt: '2026-11-21T00:00:00Z',
    },
    {
      id: '3',
      category: 'Electron',
      name: 'Shell',
      expected: 'Electron',
      actual: 'Web Host',
      status: 'warning',
      durationMs: 5,
      checkedAt: '2026-11-21T00:00:00Z',
    },
  ];
  assert.deepEqual(summarizeDiagnostics(checks), {
    total: 3,
    pass: 1,
    warning: 1,
    fail: 0,
    unavailable: 1,
  });
});

test('selects optimization profile based on real hardware thresholds', () => {
  assert.equal(determineOptimizationProfile(4, 4), 'low-power');
  assert.equal(determineOptimizationProfile(16, 8), 'standard-16gb');
  assert.equal(determineOptimizationProfile(32, 12), 'high-spec');
});

test('formats valid TEST_REPORT.md markdown table without breaking pipes', () => {
  const report: DiagnosticsReportPayload = {
    generatedAt: '2026-11-21T12:00:00Z',
    environment: 'linux (x64)',
    summary: { total: 1, pass: 1, warning: 0, fail: 0, unavailable: 0 },
    audit: {
      timestamp: '2026-11-21T12:00:00Z',
      osName: 'Linux',
      osEdition: 'Container',
      osVersion: '4.19',
      platform: 'linux',
      arch: 'x64',
      isWindows: false,
      windowsCompatible: true,
      nodeVersion: 'v22.23.2',
      cpuModel: 'Test CPU',
      cpuCores: 4,
      cpuSpeedGhz: 2.5,
      gpuName: 'None',
      gpuVendor: 'None',
      gpuVramMb: null,
      gpuDriver: null,
      ramTotalGb: 16,
      ramAvailableGb: 12,
      storageTotalGb: 100,
      storageFreeGb: 80,
      storageType: 'SSD',
      networkAvailable: true,
      hasApiKey: true,
      electronConfigured: true,
      securityPosture: {
        contextIsolation: true,
        nodeIntegrationDisabled: true,
        folderSandboxActive: true,
        apiKeyServerOnly: true,
      },
      optimizationProfile: 'standard-16gb',
    },
    checks: [
      {
        id: 'db',
        category: 'Database',
        name: 'DB Roundtrip',
        expected: 'Valid JSON | load',
        actual: 'Loaded cleanly',
        status: 'pass',
        durationMs: 4,
        checkedAt: '2026-11-21T12:00:00Z',
      },
    ],
  };

  const md = formatTestReportMarkdown(report);
  assert.ok(md.includes('| Test Name | Test Date | Environment |'));
  assert.ok(md.includes('Valid JSON \\| load'));
  assert.ok(md.includes('| PASS |'));
});

test('sanitizes calendar, memory, and settings patches against unauthorized keys', () => {
  const cal = sanitizeCalendarPatch({
    id: 'hacked',
    createdAt: '1999',
    title: '  Sprint Review ',
    completed: true,
    category: 'invalid',
  });
  assert.deepEqual(cal, { title: 'Sprint Review', completed: true });

  const mem = sanitizeMemoryPatch({
    id: 'hacked',
    approved: false,
    key: 'IDE',
    value: 'VS Code',
  });
  assert.deepEqual(mem, { key: 'IDE', value: 'VS Code' });

  const baseSettings = {
    assistantName: 'F.R.I.D.A.Y.',
    userName: 'Vishvajit',
    wakeWord: 'Hey Friday',
    aiModel: 'friday-cognitive',
    voiceName: 'Kore',
    voiceGender: 'female',
    speakingSpeed: 1,
    language: 'en-US',
    continuousListening: false,
    wakeWordEnabled: true,
    autoSpeakReplies: false,
    pushToTalkKey: 'Space',
    reopenShortcut: 'Ctrl+Space',
    startFullscreen: true,
    launchOnStartup: false,
    themeAccent: 'cyan',
    animationQuality: 'high',
    weatherLocation: 'San Francisco, US',
    allowedFolders: ['/app'],
    pausedIndexing: false,
    screenCaptureConsent: false,
    wallpaper: {
      mode: 'aurora-command',
      blurPx: 0,
      brightnessPercent: 95,
      opacityPercent: 92,
      performanceMode: false,
    },
    hologram: {
      mode: 'orbital',
      projectionBeam: true,
      scanlineIntensity: 0.5,
      holoOpacity: 0.85,
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
  } as AssistantSettings;

  const patched = sanitizeSettingsPatch(
    {
      aiModel: 'invalid-external-model',
      speakingSpeed: 99,
      wallpaper: { customVideoUrl: 'javascript:alert(1)', blurPx: -5 },
    },
    baseSettings
  );
  assert.equal(patched.aiModel, 'friday-cognitive');
  assert.equal(patched.speakingSpeed, 1.6);
  assert.equal(patched.wallpaper.customVideoUrl, undefined);
  assert.equal(patched.wallpaper.blurPx, 0);
});
