import type { VoiceState } from './types';
import { cleanVoiceTranscript, isNoiseOrEmptyTranscript } from './voicePipeline';

export interface SpeechEpochTracker {
  epoch: number;
  activeRequestId: string | null;
  speakingText: string;
}

export function createSpeechEpochTracker(): SpeechEpochTracker {
  return {
    epoch: 0,
    activeRequestId: null,
    speakingText: '',
  };
}

export function beginSpeechEpoch(
  tracker: SpeechEpochTracker,
  requestId: string,
  text = ''
): { next: SpeechEpochTracker; token: number } {
  const token = tracker.epoch + 1;
  return {
    token,
    next: {
      epoch: token,
      activeRequestId: requestId,
      speakingText: text,
    },
  };
}

export function invalidateSpeechEpoch(tracker: SpeechEpochTracker): SpeechEpochTracker {
  return {
    epoch: tracker.epoch + 1,
    activeRequestId: null,
    speakingText: '',
  };
}

export function isSpeechTokenValid(tracker: SpeechEpochTracker, token: number): boolean {
  return token > 0 && tracker.epoch === token;
}

export interface SubmissionDedupState {
  lastText: string;
  lastTimestampMs: number;
}

export function shouldIgnoreDuplicateSubmission(
  prev: SubmissionDedupState | null,
  nextText: string,
  nowMs: number,
  windowMs = 1500
): boolean {
  if (!prev) return false;
  const normalizedPrev = prev.lastText.trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizedNext = nextText.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalizedNext) return true;
  if (normalizedPrev !== normalizedNext) return false;
  return nowMs - prev.lastTimestampMs >= 0 && nowMs - prev.lastTimestampMs < windowMs;
}

export function isWithinPostSpeechEchoWindow(
  speechEndedAtMs: number,
  nowMs: number,
  cooldownMs = 600
): boolean {
  if (!speechEndedAtMs || speechEndedAtMs <= 0) return false;
  const elapsed = nowMs - speechEndedAtMs;
  return elapsed >= 0 && elapsed <= cooldownMs;
}

/**
 * Prevents the assistant's own spoken output from triggering itself through open mic feedback.
 */
export function isEchoOfAssistantSpeech(
  recognizedTranscript: string,
  activeSpokenText: string,
  isSpeakingOrCooldownNow: boolean
): boolean {
  if (!isSpeakingOrCooldownNow) return false;
  const heard = recognizedTranscript.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
  const spoken = activeSpokenText.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
  if (!heard || heard.length < 4 || !spoken) return false;
  if (spoken.includes(heard)) return true;
  const heardWords = heard.split(' ').filter((w) => w.length > 2);
  if (heardWords.length >= 3) {
    const matched = heardWords.filter((w) => spoken.includes(w));
    if (matched.length / heardWords.length >= 0.75) {
      return true;
    }
  }
  return false;
}

export interface WakeWordResolution {
  action: 'command' | 'arm_wake_word' | 'ignore';
  command: string;
  armedUntilMs?: number;
  disarmWakeWord?: boolean;
}

export function resolveWakeWordUtterance(params: {
  transcript: string;
  wakeWord: string;
  wakeWordEnabled: boolean;
  wakeWordArmedUntilMs?: number;
  nowMs?: number;
  armDurationMs?: number;
}): WakeWordResolution {
  const cleaned = cleanVoiceTranscript(params.transcript);
  if (isNoiseOrEmptyTranscript(cleaned)) {
    return { action: 'ignore', command: '' };
  }

  if (!params.wakeWordEnabled) {
    return { action: 'command', command: cleaned, disarmWakeWord: false };
  }

  const nowMs = params.nowMs ?? Date.now();
  const armDurationMs = params.armDurationMs ?? 8000;
  const normalizedWake = params.wakeWord.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wakePrefixPattern = normalizedWake
    ? `(?:${normalizedWake}|hey[,\\s]+f\\.?r\\.?i\\.?d\\.?a\\.?y\\.?|hey[,\\s]+friday|ok[,\\s]+friday|hi[,\\s]+friday|f\\.?r\\.?i\\.?d\\.?a\\.?y\\.?)`
    : `(?:hey[,\\s]+f\\.?r\\.?i\\.?d\\.?a\\.?y\\.?|hey[,\\s]+friday|ok[,\\s]+friday|hi[,\\s]+friday|f\\.?r\\.?i\\.?d\\.?a\\.?y\\.?)`;

  const wakeRegex = new RegExp(wakePrefixPattern, 'i');
  const hasWake = wakeRegex.test(cleaned);

  if (hasWake) {
    const stripped = cleanVoiceTranscript(
      cleaned.replace(wakeRegex, ' ').replace(/^[\s,.:;!?-]+/, '').trim()
    );
    if (stripped && !isNoiseOrEmptyTranscript(stripped)) {
      return { action: 'command', command: stripped, disarmWakeWord: true };
    }
    return {
      action: 'arm_wake_word',
      command: '',
      armedUntilMs: nowMs + armDurationMs,
      disarmWakeWord: false,
    };
  }

  if ((params.wakeWordArmedUntilMs ?? 0) > nowMs) {
    return { action: 'command', command: cleaned, disarmWakeWord: true };
  }

  return { action: 'ignore', command: '' };
}

export function resolvePostInterruptState(continuousListening: boolean): VoiceState {
  return continuousListening ? 'listening' : 'standby';
}

