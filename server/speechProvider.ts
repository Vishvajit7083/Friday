import os from 'os';
import type { SpeechCapabilityReport, SpeechProvider } from '../src/core/cognitive/types.ts';
import { isHinglishInterruptionPhrase } from '../src/core/cognitive/hinglishNlp.ts';

export class WindowsAndWebSpeechProvider implements SpeechProvider {
  readonly id = 'windows-system-and-web-speech';
  readonly name = 'Windows System.Speech + Web Speech Bridge';

  isInterruption(transcript: string): boolean {
    return isHinglishInterruptionPhrase(transcript);
  }

  async getCapabilities(): Promise<SpeechCapabilityReport> {
    const isWin = process.platform === 'win32';
    const hasCustomWhisperDir = Boolean(process.env.LOCAL_SPEECH_MODEL_DIR?.trim());

    return {
      platform: `${os.platform()} (${os.arch()})`,
      sttProvider: isWin ? 'Windows System.Speech.Recognition + Web Speech API' : 'Chromium Web Speech API (online browser engine)',
      ttsProvider: isWin ? 'Windows System.Speech.Synthesis (SAPI5 Voices) + Web speechSynthesis' : 'Browser Web speechSynthesis',
      offlineEnglishStt: isWin,
      hindiHinglishSttSupport: isWin ? 'limited_windows_recognizer' : 'browser_or_whisper_needed',
      limitations: [
        'Windows built-in System.Speech offline recognizers provide reliable English (en-US / en-IN) models, but Romanized Hinglish mixed sentences often mis-transcribe unless a dedicated Windows Hindi speech pack or local Whisper/Vosk model is installed.',
        'Web Speech API (hi-IN / en-IN) handles Hinglish reasonably well when online, whereas fully offline Hinglish STT requires plugging in local whisper.cpp or Vosk Hindi-English weights.',
        'Browser microphone capture is protected against TTS echo via active speech-output gating and duplicate transcript suppression.',
      ],
      recommendedLocalAdapters: [
        {
          name: 'whisper.cpp (faster-whisper / ggml-small)',
          role: 'stt',
          status: hasCustomWhisperDir ? 'adapter_ready' : 'not_bundled',
          notes: 'Multilingual English + Hindi/Devanagari/Hinglish offline STT; connect via LOCAL_SPEECH_MODEL_DIR.',
        },
        {
          name: 'Vosk Offline Speech (vosk-model-hi / en-in)',
          role: 'stt',
          status: 'not_bundled',
          notes: 'Lightweight streaming CPU offline speech recognizer adapter slot.',
        },
        {
          name: 'Piper / Coqui Local Neural TTS',
          role: 'tts',
          status: 'not_bundled',
          notes: 'Optional offline natural voice synthesis adapter alongside Windows SAPI5.',
        },
      ],
    };
  }
}

export const defaultSpeechProvider = new WindowsAndWebSpeechProvider();
