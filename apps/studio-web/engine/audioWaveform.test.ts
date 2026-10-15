import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceSamplesToBars } from './audioWaveformCore';

test('waveform reducer outputs bounded peaks for each bar', () => {
  const result = reduceSamplesToBars(Float32Array.from([0.1, -0.8, 0.2, 0.4, -0.5, 0]), 3);
  assert.equal(result.length, 3);
  assert.ok(Math.abs(result[0] - 0.8) < 0.0001);
  assert.ok(Math.abs(result[1] - 0.4) < 0.0001);
  assert.ok(Math.abs(result[2] - 0.5) < 0.0001);
});

test('waveform reducer safely handles empty input and rejects invalid bar counts', () => {
  assert.deepEqual(Array.from(reduceSamplesToBars([], 4)), [0, 0, 0, 0]);
  assert.throws(() => reduceSamplesToBars([1], 0), RangeError);
  assert.throws(() => reduceSamplesToBars([1], 513), RangeError);
});
