import type { HologramMode, VoiceState } from './types';

export interface HologramProfile {
  ringSpeed: number;
  pulseAmplitude: number;
  scanlineSpeed: number;
  explodedSpread: number;
  beamOpacity: number;
}

export function computeHologramProfile(
  state: VoiceState,
  mode: HologramMode,
  audioLevel: number,
  quality: 'high' | 'balanced' | 'low'
): HologramProfile {
  const clampedAudio = Math.min(1, Math.max(0, audioLevel));
  const qualityFactor = quality === 'low' ? 0.5 : quality === 'balanced' ? 0.8 : 1;

  let baseSpeed = 0.4;
  let pulseAmplitude = 0.03;
  let scanlineSpeed = 1.4;
  let beamOpacity = 0.24;

  switch (state) {
    case 'wake_word_detected':
      baseSpeed = 1.25;
      pulseAmplitude = 0.12 + clampedAudio * 0.16;
      scanlineSpeed = 3.1;
      beamOpacity = 0.42;
      break;
    case 'listening':
      baseSpeed = 0.95;
      pulseAmplitude = 0.09 + clampedAudio * 0.18;
      scanlineSpeed = 2.6;
      beamOpacity = 0.36;
      break;
    case 'transcribing':
      baseSpeed = 1.55;
      pulseAmplitude = 0.07;
      scanlineSpeed = 3.6;
      beamOpacity = 0.38;
      break;
    case 'processing':
    case 'executing':
      baseSpeed = 1.9;
      pulseAmplitude = 0.08;
      scanlineSpeed = 4.2;
      beamOpacity = 0.42;
      break;
    case 'searching':
      baseSpeed = 1.45;
      pulseAmplitude = 0.06;
      scanlineSpeed = 3.4;
      beamOpacity = 0.34;
      break;
    case 'speaking':
      baseSpeed = 1.05;
      pulseAmplitude = 0.12 + clampedAudio * 0.22;
      scanlineSpeed = 3.0;
      beamOpacity = 0.4;
      break;
    case 'completed':
      baseSpeed = 0.6;
      pulseAmplitude = 0.05;
      scanlineSpeed = 1.8;
      beamOpacity = 0.28;
      break;
    case 'error':
      baseSpeed = 0.22;
      pulseAmplitude = 0.1;
      scanlineSpeed = 5.5;
      beamOpacity = 0.32;
      break;
    default:
      break;
  }

  return {
    ringSpeed: Number((baseSpeed * qualityFactor).toFixed(3)),
    pulseAmplitude: Number(pulseAmplitude.toFixed(3)),
    scanlineSpeed: Number((scanlineSpeed * qualityFactor).toFixed(3)),
    explodedSpread: mode === 'exploded' ? 1.55 : mode === 'telemetry-sphere' ? 1.18 : 1.0,
    beamOpacity,
  };
}

export function computeAgentOrbitPosition(
  index: number,
  total: number,
  radius: number,
  elapsedSeconds: number
): [number, number, number] {
  const safeTotal = Math.max(1, total);
  const angle = (index / safeTotal) * Math.PI * 2 + elapsedSeconds * 0.25;
  const tilt = ((index % 3) - 1) * 0.45;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const y = Math.sin(angle * 2 + index) * tilt;
  return [x, y, z];
}
