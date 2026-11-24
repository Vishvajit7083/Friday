import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginSpeechEpoch,
  createSpeechEpochTracker,
  invalidateSpeechEpoch,
  isEchoOfAssistantSpeech,
  isSpeechTokenValid,
  resolvePostInterruptState,
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

test('post-interrupt state returns to listening only when continuous mode is enabled', () => {
  assert.equal(resolvePostInterruptState(true), 'listening');
  assert.equal(resolvePostInterruptState(false), 'standby');
  assert.equal(analyzeUserCommand('What is the weather in Tokyo tomorrow?').category, 'weather_query');
});
