import test from 'node:test';
import assert from 'node:assert/strict';
import { tryConvertUnits } from './unitConverter';
import { translateText, tryTranslateCommand } from './translator';
import { parseProductivityCommand, summarizeTextExtractive } from './productivityTools';
import { analyzeUserCommand, tryEvaluateSafeMath } from './intentEngine';
import { sanitizeSettingsPatch } from './diagnostics';
import { buildDefaultLocalState, executeClientConfirmAction, executeClientOfflineCommand } from './localClientEngine';
import type { AssistantSettings } from './types';

const BASE_SETTINGS: AssistantSettings = {
  assistantName: 'F.R.I.D.A.Y.',
  userName: 'Vishvajit',
  wakeWord: 'Hey Friday',
  aiModel: 'local-auto',
  ollamaModel: '',
  voiceName: 'Kore',
  voiceGender: 'female',
  speakingSpeed: 1.0,
  speakingPitch: 1.0,
  language: 'en-US',
  continuousListening: false,
  wakeWordEnabled: true,
  autoSpeakReplies: false,
  pushToTalkKey: 'Space',
  reopenShortcut: 'Ctrl+Shift+Space',
  startFullscreen: true,
  launchOnStartup: false,
  themeAccent: 'cyan',
  animationQuality: 'high',
  weatherLocation: 'Pune, India',
  allowedFolders: ['.'],
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
    scanlineIntensity: 0.55,
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
};

test('evaluates spoken math operators including multiplied by and divided by', () => {
  assert.equal(tryEvaluateSafeMath('calculate 250 multiplied by 35'), '8750');
  assert.equal(tryEvaluateSafeMath('what is 144 divided by 12'), '12');
  assert.equal(tryEvaluateSafeMath('compute 45 plus 55'), '100');
});

test('converts units offline across length, temperature, weight, and data', () => {
  const kmToMi = tryConvertUnits('convert 10 km to miles');
  assert.ok(kmToMi);
  assert.equal(kmToMi.toUnit, 'mi');
  assert.ok(Math.abs(kmToMi.outputValue - 6.2137119) < 0.001);

  const fToC = tryConvertUnits('212 fahrenheit in celsius');
  assert.ok(fToC);
  assert.equal(fToC.outputValue, 100);

  const gbToMb = tryConvertUnits('2 gb to mb');
  assert.ok(gbToMb);
  assert.equal(gbToMb.outputValue, 2048);
});

test('translates offline between English, Hindi, and Marathi', () => {
  const mr = tryTranslateCommand('translate hello into Marathi');
  assert.ok(mr);
  assert.equal(mr.targetLang, 'mr');
  assert.equal(mr.translatedText, 'नमस्कार');

  const hi = tryTranslateCommand('translate thank you to Hindi');
  assert.ok(hi);
  assert.equal(hi.targetLang, 'hi');
  assert.equal(hi.translatedText, 'धन्यवाद');

  const backEn = translateText('नमस्कार', 'en');
  assert.equal(backEn.translatedText, 'hello');
});

test('parses notes, todos, reminders, alarms, and summarizes text extractively', () => {
  const note = parseProductivityCommand('take a note: submit Android APK assignment');
  assert.equal(note?.kind, 'note_add');

  const rem = parseProductivityCommand('remind me to study tomorrow at 6 pm');
  assert.equal(rem?.kind, 'reminder_add');
  assert.equal(rem?.time, '18:00');

  const alarm = parseProductivityCommand('set an alarm for 6:30 am');
  assert.equal(alarm?.kind, 'alarm_set');
  assert.equal(alarm?.hour, 6);
  assert.equal(alarm?.minute, 30);

  const summary = summarizeTextExtractive(
    'F.R.I.D.A.Y. runs offline inside an Android APK. It supports voice recognition and natural text to speech. It also includes notes, reminders, unit conversion, and Marathi/Hindi translation. Battery telemetry and flashlight controls work via native Kotlin bridges.',
    2
  );
  assert.ok(summary.length > 20);
});

test('routes Android phone control commands and enforces confirmation on call requests', () => {
  const yt = analyzeUserCommand('open youtube');
  assert.equal(yt.category, 'phone_control');
  assert.equal(yt.requiresConfirmation, false);

  const bt = analyzeUserCommand('open bluetooth settings');
  assert.equal(bt.category, 'phone_control');

  const torch = analyzeUserCommand('turn on flashlight');
  assert.equal(torch.category, 'phone_control');

  const callCmd = analyzeUserCommand('call mom');
  assert.equal(callCmd.category, 'sensitive_action');
  assert.equal(callCmd.requiresConfirmation, true);
});

test('sanitizes speakingPitch and Marathi/Hindi language settings', () => {
  const patched = sanitizeSettingsPatch(
    { speakingPitch: 1.25, language: 'mr-IN', voiceGender: 'female' },
    BASE_SETTINGS
  );
  assert.equal(patched.speakingPitch, 1.25);
  assert.equal(patched.language, 'mr-IN');

  const clamped = sanitizeSettingsPatch({ speakingPitch: 9.0 }, BASE_SETTINGS);
  assert.equal(clamped.speakingPitch, 1.5);
});

test('executes standalone offline client engine commands including notes, math, translation, and call confirmation', async () => {
  const initialState = buildDefaultLocalState(BASE_SETTINGS);

  const mathRes = await executeClientOfflineCommand('calculate 250 multiplied by 35', initialState);
  assert.equal(mathRes.assistantMessage.content, 'The result is 8750.');

  const trRes = await executeClientOfflineCommand('translate hello into Marathi', mathRes.nextState);
  assert.ok(trRes.assistantMessage.content.includes('नमस्कार'));

  const noteRes = await executeClientOfflineCommand('take a note: test APK on smartphone', trRes.nextState);
  assert.ok(noteRes.nextState.notes.some((n) => n.content.includes('test APK on smartphone')));

  const callPending = await executeClientOfflineCommand('call 9876543210', noteRes.nextState);
  assert.ok(callPending.assistantMessage.pendingConfirmation);

  const confirmed = executeClientConfirmAction(
    callPending.assistantMessage.pendingConfirmation!.actionType,
    callPending.assistantMessage.pendingConfirmation!.summary,
    true,
    callPending.nextState
  );
  assert.ok(confirmed.confirmationMessage.content.includes('9876543210'));
});

test('unwraps JSON payloads from Android JavascriptInterface bridge into readable messages', async () => {
  const g = globalThis as unknown as { window?: Record<string, unknown> };
  const prevWindow = g.window;
  g.window = {
    fridayAndroid: {
      isAndroid: () => true,
      openApp: (t: string) => JSON.stringify({ ok: true, message: `Opened Android app: ${t}` }),
      prepareCallDialer: (t: string) => JSON.stringify({ ok: true, message: `Dialer prepared for ${t}` }),
    },
  };
  try {
    const state = buildDefaultLocalState(BASE_SETTINGS);
    const yt = await executeClientOfflineCommand('open youtube', state);
    assert.equal(yt.assistantMessage.content, 'Opened Android app: youtube');

    const dial = executeClientConfirmAction('sensitive_action', 'call mom', true, yt.nextState);
    assert.equal(dial.confirmationMessage.content, 'Dialer prepared for mom');
  } finally {
    if (prevWindow === undefined) {
      delete g.window;
    } else {
      g.window = prevWindow;
    }
  }
});

