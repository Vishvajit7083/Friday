import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMicrophoneError,
  computeRmsLevel,
  downsampleTo16kPcm,
  encodeMonoWav16kBase64,
  encodePcm16WavBytes,
  mergeFloat32Chunks,
  selectPreferredSpeechVoice,
} from './voicePipeline';
import { analyzeUserCommand, extractVoiceCommand } from './intentEngine';
import { sanitizeSettingsPatch } from './diagnostics';
import { registerPreloadBridge } from '../../electron/preload';

test('downsampleTo16kPcm & encodeMonoWav16kBase64 produce valid 16kHz PCM16 RIFF WAV', () => {
  const inputRate = 48000;
  const durationSec = 0.25;
  const samples = new Float32Array(inputRate * durationSec);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.sin((2 * Math.PI * 440 * i) / inputRate) * 0.5;
  }

  const pcm = downsampleTo16kPcm(samples, inputRate);
  assert.equal(pcm.length, 4000);

  const wavBytes = encodePcm16WavBytes(pcm, 16000);
  assert.equal(wavBytes.length, 44 + pcm.length * 2);

  const header = Buffer.from(wavBytes).toString('ascii', 0, 4);
  const waveTag = Buffer.from(wavBytes).toString('ascii', 8, 12);
  const view = new DataView(wavBytes.buffer);
  assert.equal(header, 'RIFF');
  assert.equal(waveTag, 'WAVE');
  assert.equal(view.getUint16(20, true), 1); // PCM
  assert.equal(view.getUint16(22, true), 1); // Mono
  assert.equal(view.getUint32(24, true), 16000); // Sample rate
  assert.equal(view.getUint16(34, true), 16); // Bits per sample

  const b64 = encodeMonoWav16kBase64(samples, inputRate);
  assert.ok(b64.startsWith('UklGR')); // Base64 for 'RIFF'
});

test('mergeFloat32Chunks & computeRmsLevel compute accurate audio levels', () => {
  const merged = mergeFloat32Chunks([new Float32Array([0.5, -0.5]), new Float32Array([0.5, -0.5])]);
  assert.equal(merged.length, 4);
  assert.ok(Math.abs(computeRmsLevel(merged) - 0.5) < 1e-6);
  assert.equal(computeRmsLevel(new Float32Array(0)), 0);
});

test('selectPreferredSpeechVoice matches language and gender preferences', () => {
  const voices = [
    { name: 'Microsoft David Desktop', lang: 'en-US', localService: true },
    { name: 'Microsoft Zira Desktop', lang: 'en-US', localService: true },
    { name: 'Microsoft Swara Online (Natural)', lang: 'hi-IN', localService: false },
    { name: 'Microsoft Aarohi Online', lang: 'mr-IN', localService: false },
  ];

  assert.equal(selectPreferredSpeechVoice(voices, 'en-US', 'female')?.name, 'Microsoft Zira Desktop');
  assert.equal(selectPreferredSpeechVoice(voices, 'en-US', 'male')?.name, 'Microsoft David Desktop');
  assert.equal(selectPreferredSpeechVoice(voices, 'hi-IN', 'female')?.lang, 'hi-IN');
  assert.equal(selectPreferredSpeechVoice(voices, 'mr-IN', 'female')?.lang, 'mr-IN');
  assert.equal(selectPreferredSpeechVoice([], 'en-US', 'female'), null);
});

test('classifyMicrophoneError maps DOMException errors to actionable guidance', () => {
  const denied = classifyMicrophoneError(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
  assert.equal(denied.code, 'permission-denied');
  assert.match(denied.message, /Windows/i);

  const missing = classifyMicrophoneError(Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' }));
  assert.equal(missing.code, 'no-device');

  const busy = classifyMicrophoneError(Object.assign(new Error('Could not start audio source'), { name: 'NotReadableError' }));
  assert.equal(busy.code, 'device-busy');

  const unsupported = classifyMicrophoneError(new Error('getUserMedia not supported'));
  assert.equal(unsupported.code, 'unsupported');
});

test('intentEngine routes Windows apps & websites accurately while keeping mobile commands intact', () => {
  const desktopCommands = [
    'open file explorer',
    'open notepad',
    'open calculator',
    'open command prompt',
    'open powershell',
    'open microsoft edge',
    'open windows settings',
    'open task manager',
    'open vs code',
    'open google chrome',
    'open https://github.com',
    'open youtube.com',
  ];

  for (const cmd of desktopCommands) {
    const intent = analyzeUserCommand(cmd);
    assert.equal(intent.category, 'app_control', `Expected app_control for "${cmd}", got "${intent.category}"`);
  }

  assert.equal(analyzeUserCommand('open youtube').category, 'phone_control');
  assert.equal(analyzeUserCommand('open instagram').category, 'phone_control');

  const extracted = extractVoiceCommand('Hey Friday, open Chrome', 'Hey Friday', false);
  assert.equal(extracted.matched, true);
  assert.equal(extracted.command, 'open Chrome');
});

test('sanitizeSettingsPatch preserves and clamps audioInputDeviceId safely', () => {
  const baseSettings = {
    assistantName: 'F.R.I.D.A.Y.',
    userName: 'Siddesh',
    wakeWord: 'Hey Friday',
    aiModel: 'local-auto' as const,
    ollamaModel: '',
    voiceName: 'Kore' as const,
    voiceGender: 'female' as const,
    speakingSpeed: 1,
    speakingPitch: 1,
    language: 'en-US',
    audioInputDeviceId: '',
    continuousListening: false,
    wakeWordEnabled: true,
    autoSpeakReplies: false,
    pushToTalkKey: 'Space',
    reopenShortcut: 'Ctrl+Shift+Space',
    startFullscreen: true,
    launchOnStartup: false,
    themeAccent: 'violet' as const,
    animationQuality: 'high' as const,
    weatherLocation: 'Kolhapur, MH',
    allowedFolders: ['.'],
    pausedIndexing: false,
    screenCaptureConsent: false,
    wallpaper: {
      mode: 'aurora-command' as const,
      blurPx: 0,
      brightnessPercent: 95,
      opacityPercent: 92,
      performanceMode: false,
    },
    hologram: {
      mode: 'orbital' as const,
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
  const clean = sanitizeSettingsPatch(
    {
      audioInputDeviceId: '  mic-device-123  ',
      language: 'en-US',
    },
    baseSettings
  );
  assert.equal(clean.audioInputDeviceId, 'mic-device-123');

  const longId = 'x'.repeat(260);
  const clamped = sanitizeSettingsPatch({ audioInputDeviceId: longId }, baseSettings);
  assert.equal((clamped.audioInputDeviceId || '').length, 200);
});

test('registerPreloadBridge exposes complete FridayDesktopBridge channels synchronously', async () => {
  let exposedKey = '';
  let exposedApi: Record<string, unknown> = {};
  const invoked: Array<{ channel: string; args: unknown[] }> = [];

  const ok = registerPreloadBridge({
    contextBridge: {
      exposeInMainWorld: (key, api) => {
        exposedKey = key;
        exposedApi = api as Record<string, unknown>;
      },
    },
    ipcRenderer: {
      invoke: async (channel, ...args) => {
        invoked.push({ channel, args });
        return { ok: true, channel };
      },
    },
  });

  assert.equal(ok, true);
  assert.equal(exposedKey, 'fridayDesktop');
  assert.equal(exposedApi.isDesktopShell, true);

  await (exposedApi.launchApp as (target: string) => Promise<unknown>)('chrome');
  await (exposedApi.recognizeSpeechWav as (p: { wavBase64: string; language: string }) => Promise<unknown>)({
    wavBase64: 'UklGRg==',
    language: 'en-US',
  });
  await (exposedApi.requestMicPermission as () => Promise<unknown>)();

  assert.deepEqual(
    invoked.map((c) => c.channel),
    ['friday:launch-app', 'friday:recognize-speech-wav', 'friday:request-mic-permission']
  );
});
