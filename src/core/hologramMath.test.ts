import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAgentOrbitPosition, computeHologramProfile } from './hologramMath';

test('computes higher ring and scanline speeds during processing', () => {
  const idle = computeHologramProfile('standby', 'orbital', 0, 'high');
  const proc = computeHologramProfile('processing', 'orbital', 0, 'high');
  assert.ok(proc.ringSpeed > idle.ringSpeed);
  assert.ok(proc.scanlineSpeed > idle.scanlineSpeed);
});

test('amplifies pulse with live audio during speaking state', () => {
  const quiet = computeHologramProfile('speaking', 'orbital', 0, 'high');
  const loud = computeHologramProfile('speaking', 'orbital', 0.8, 'high');
  assert.ok(loud.pulseAmplitude > quiet.pulseAmplitude);
});

test('expands layer spread in exploded hologram mode', () => {
  const normal = computeHologramProfile('standby', 'orbital', 0, 'high');
  const exploded = computeHologramProfile('standby', 'exploded', 0, 'high');
  assert.ok(exploded.explodedSpread > normal.explodedSpread);
});

test('computes bounded 3D orbital coordinates for agent nodes', () => {
  const [x, y, z] = computeAgentOrbitPosition(0, 11, 2.5, 0);
  assert.ok(Math.abs(x - 2.5) < 0.001);
  assert.ok(Math.abs(z) < 0.001);
  assert.ok(Math.abs(y) <= 0.5);
});
