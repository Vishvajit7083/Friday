export interface SpeechVoiceLike {
  name: string;
  lang: string;
  localService?: boolean;
}

export interface VoiceDiagnosticItem {
  id: string;
  label: string;
  status: 'pass' | 'warning' | 'fail';
  detail: string;
}

/**
 * Downsamples mono Float32 PCM audio from arbitrary WebAudio sampleRate (e.g. 44100/48000 Hz)
 * to 16000 Hz 16-bit PCM WAV bytes and encodes as base64.
 */
export function downsampleTo16kPcm(samples: Float32Array, inputSampleRate: number): Int16Array {
  const targetRate = 16000;
  if (!samples.length || !Number.isFinite(inputSampleRate) || inputSampleRate <= 0) {
    return new Int16Array(0);
  }

  const ratio = inputSampleRate / targetRate;
  const outputLength = Math.max(1, Math.floor(samples.length / ratio));
  const result = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += samples[j];
      count += 1;
    }
    const sample = count > 0 ? sum / count : samples[Math.min(start, samples.length - 1)] || 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    result[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }

  return result;
}

export function encodePcm16WavBytes(pcmSamples: Int16Array, sampleRate = 16000): Uint8Array {
  const dataSize = pcmSamples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcmSamples.length; i += 1) {
    view.setInt16(offset, pcmSamples[i], true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function encodeMonoWav16kBase64(samples: Float32Array, inputSampleRate: number): string {
  const pcm16 = downsampleTo16kPcm(samples, inputSampleRate);
  if (!pcm16.length) return '';
  const wavBytes = encodePcm16WavBytes(pcm16, 16000);
  return bytesToBase64(wavBytes);
}

export function computeRmsLevel(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / samples.length);
}

export function mergeFloat32Chunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export function selectPreferredSpeechVoice<T extends SpeechVoiceLike>(
  voices: T[],
  language: string,
  voiceGender: 'female' | 'male'
): T | null {
  if (!voices.length) return null;
  const targetLang = (language || 'en-US').toLowerCase();
  const baseLang = targetLang.split('-')[0];
  const preferFemale = voiceGender !== 'male';
  const femaleHints = [
    'zira',
    'aria',
    'jenny',
    'samantha',
    'victoria',
    'karen',
    'swara',
    'lekha',
    'heera',
    'kalpana',
    'neerja',
    'ananya',
    'female',
    'woman',
  ];
  const maleHints = ['david', 'mark', 'guy', 'rishi', 'prabhat', 'daniel', 'george', 'madhur', 'male', 'man'];

  let best: T | null = null;
  let bestScore = -1000;
  for (const v of voices) {
    let score = 0;
    const vLang = (v.lang || '').toLowerCase();
    const vName = (v.name || '').toLowerCase();
    if (vLang === targetLang) score += 60;
    else if (vLang.startsWith(baseLang)) score += 35;
    else if (vLang.startsWith('en')) score += 5;

    if (v.localService) score += 8;
    if (vName.includes('natural') || vName.includes('neural') || vName.includes('online')) score += 12;

    const isFemaleName = femaleHints.some((h) => vName.includes(h));
    const isMaleName = maleHints.some((h) => vName.includes(h));
    if (preferFemale && isFemaleName) score += 22;
    if (!preferFemale && isMaleName) score += 22;
    if (preferFemale && isMaleName) score -= 14;
    if (!preferFemale && isFemaleName) score -= 14;

    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

export function classifyMicrophoneError(err: unknown): {
  code: 'permission-denied' | 'no-device' | 'device-busy' | 'unsupported' | 'unknown';
  message: string;
} {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  const msg = err instanceof Error ? err.message : String(err || 'Unknown microphone error');
  const lower = `${name} ${msg}`.toLowerCase();

  if (lower.includes('notallowed') || lower.includes('permission') || lower.includes('denied')) {
    return {
      code: 'permission-denied',
      message:
        'Microphone permission denied. On Windows 10/11, enable Settings -> Privacy & security -> Microphone -> "Let desktop apps access your microphone".',
    };
  }
  if (lower.includes('notfound') || lower.includes('requested device not found') || lower.includes('no audio')) {
    return {
      code: 'no-device',
      message: 'No microphone input device detected. Connect or enable an audio input device in Windows Sound settings.',
    };
  }
  if (lower.includes('notreadable') || lower.includes('trackstart') || lower.includes('in use') || lower.includes('abort')) {
    return {
      code: 'device-busy',
      message: 'Microphone is busy or locked by another application (e.g., Zoom/Teams/browser tab). Close the other app or pick a different microphone in Voice Assistant.',
    };
  }
  if (lower.includes('not supported') || lower.includes('getusermedia') || lower.includes('secure context')) {
    return {
      code: 'unsupported',
      message: 'Audio capture API is unavailable in this window context.',
    };
  }
  return {
    code: 'unknown',
    message: `Microphone capture failed: ${msg}`,
  };
}
