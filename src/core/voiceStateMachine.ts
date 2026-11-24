import type { VoiceState } from './types';

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

/**
 * Prevents the assistant's own spoken output from triggering itself through open mic feedback.
 */
export function isEchoOfAssistantSpeech(
  recognizedTranscript: string,
  activeSpokenText: string,
  isSpeakingNow: boolean
): boolean {
  if (!isSpeakingNow) return false;
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

export function resolvePostInterruptState(continuousListening: boolean): VoiceState {
  return continuousListening ? 'listening' : 'standby';
}
