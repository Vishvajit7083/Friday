import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginSpeechEpoch,
  createSpeechEpochTracker,
  invalidateSpeechEpoch,
  isEchoOfAssistantSpeech,
  isSpeechTokenValid,
  isWithinPostSpeechEchoWindow,
  resolvePostInterruptState,
  resolveWakeWordUtterance,
  shouldIgnoreDuplicateSubmission,
} from './voiceStateMachine';
import { analyzeUserCommand, isInterruptionCommand } from './intentEngine';

test('speech epoch cancellation invalidates stale playback callbacks immediately', () => {
  let tracker = createSpeechEpochTracker();
  const first = beginSpeechEpoch(tracker, 'req-1', 'Hello Siddesh, checking weather');
  tracker = first.next;
  assert.equal(isSpeechTokenValid(tracker, first.token), true);

  tracker = invalidateSpeechEpoch(tracker);
  assert.equal(isSpeechTokenValid(tracker, first.token), false);

  const second = beginSpeechEpoch(tracker, 'req-2', 'New response');
  tracker = second.next;
  assert.equal(isSpeechTokenValid(tracker, first.token), false);
  assert.equal(isSpeechTokenValid(tracker, second.token), true);
});

test('interruption commands cover stop, cancel, quiet, mute, and polite variants', () => {
  const positive = [
    'stop',
    'Stop!',
    'Friday stop',
    'Hey Friday stop speaking',
    'stop talking',
    'stop reading',
    'cancel',
    'cancel speech',
    'be quiet',
    'quiet',
    'shut up',
    'mute',
    'silence',
    'hush please',
    'abort',
  ];
  for (const phrase of positive) {
    assert.equal(isInterruptionCommand(phrase), true, `Expected interruption match for "${phrase}"`);
  }

  const negative = [
    'stop stopwatch app',
    'open chrome',
    'what is the weather in Tokyo',
    'cancel my 3pm meeting',
  ];
  for (const phrase of negative) {
    assert.equal(isInterruptionCommand(phrase), false, `Expected non-interruption for "${phrase}"`);
  }
});

test('submission deduplication suppresses rapid double-submit and allows distinct commands', () => {
  const prev = { lastText: 'Open Chrome', lastTimestampMs: 1000 };
  assert.equal(shouldIgnoreDuplicateSubmission(prev, 'open chrome', 1400, 1500), true);
  assert.equal(shouldIgnoreDuplicateSubmission(prev, 'open chrome', 3000, 1500), false);
  assert.equal(shouldIgnoreDuplicateSubmission(prev, 'open notepad', 1400, 1500), false);
  assert.equal(shouldIgnoreDuplicateSubmission(prev, '   ', 1400, 1500), true);
});

test('anti-echo suppression rejects self-heard TTS while allowing unrelated commands or idle input', () => {
  const activeSpeech = 'The CPU load is 14 percent and memory usage is 6 gigabytes.';
  assert.equal(isEchoOfAssistantSpeech('CPU load is 14 percent', activeSpeech, true), true);
  assert.equal(isEchoOfAssistantSpeech('CPU load is 14 percent', activeSpeech, false), false);
  assert.equal(isEchoOfAssistantSpeech('open notepad', activeSpeech, true), false);
});

test('isWithinPostSpeechEchoWindow enforces 600ms post-TTS echo cooldown', () => {
  assert.equal(isWithinPostSpeechEchoWindow(0, 1000, 600), false);
  assert.equal(isWithinPostSpeechEchoWindow(1000, 1250, 600), true);
  assert.equal(isWithinPostSpeechEchoWindow(1000, 1600, 600), true);
  assert.equal(isWithinPostSpeechEchoWindow(1000, 1601, 600), false);
  assert.equal(
    isEchoOfAssistantSpeech(
      'Opening Chrome',
      'Opening Chrome now.',
      isWithinPostSpeechEchoWindow(1000, 1300, 600)
    ),
    true
  );
});

test('resolveWakeWordUtterance supports disabled wake-word, inline wake-word, 2-stage arming, and ignore', () => {
  const direct = resolveWakeWordUtterance({
    transcript: 'open Chrome',
    wakeWord: 'Hey Friday',
    wakeWordEnabled: false,
  });
  assert.equal(direct.action, 'command');
  assert.equal(direct.command, 'open Chrome');

  const inline = resolveWakeWordUtterance({
    transcript: 'Hey Friday, open Chrome',
    wakeWord: 'Hey Friday',
    wakeWordEnabled: true,
    nowMs: 5000,
  });
  assert.equal(inline.action, 'command');
  assert.equal(inline.command, 'open Chrome');
  assert.equal(inline.disarmWakeWord, true);

  const arm = resolveWakeWordUtterance({
    transcript: 'Hey Friday',
    wakeWord: 'Hey Friday',
    wakeWordEnabled: true,
    nowMs: 5000,
    armDurationMs: 8000,
  });
  assert.equal(arm.action, 'arm_wake_word');
  assert.equal(arm.armedUntilMs, 13000);

  const followUp = resolveWakeWordUtterance({
    transcript: 'open Chrome',
    wakeWord: 'Hey Friday',
    wakeWordEnabled: true,
    wakeWordArmedUntilMs: arm.armedUntilMs,
    nowMs: 8000,
  });
  assert.equal(followUp.action, 'command');
  assert.equal(followUp.command, 'open Chrome');
  assert.equal(followUp.disarmWakeWord, true);

  const expired = resolveWakeWordUtterance({
    transcript: 'open Chrome',
    wakeWord: 'Hey Friday',
    wakeWordEnabled: true,
    wakeWordArmedUntilMs: arm.armedUntilMs,
    nowMs: 14000,
  });
  assert.equal(expired.action, 'ignore');

  const ignored = resolveWakeWordUtterance({
    transcript: 'random background chatter',
    wakeWord: 'Hey Friday',
    wakeWordEnabled: true,
    nowMs: 5000,
  });
  assert.equal(ignored.action, 'ignore');
});

test('post-interrupt state returns to listening only when continuous mode is enabled', () => {
  assert.equal(resolvePostInterruptState(true), 'listening');
  assert.equal(resolvePostInterruptState(false), 'standby');
  assert.equal(analyzeUserCommand('What is the weather in Tokyo tomorrow?').category, 'weather_query');
});
