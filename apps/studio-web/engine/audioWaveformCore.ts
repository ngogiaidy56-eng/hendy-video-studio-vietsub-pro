/** Pure peak reducer used by the audio waveform worker and unit tests. */
export function reduceSamplesToBars(samples: ArrayLike<number>, bars = 120): Float32Array {
  if (!Number.isInteger(bars) || bars < 1 || bars > 512) {
    throw new RangeError('bars must be an integer between 1 and 512');
  }
  const count = Number.isFinite(samples.length) ? Math.max(0, Math.floor(samples.length)) : 0;
  const result = new Float32Array(bars);
  if (!count) return result;
  for (let i = 0; i < bars; i++) {
    const start = Math.floor((i * count) / bars);
    const end = Math.max(start + 1, Math.floor(((i + 1) * count) / bars));
    let peak = 0;
    for (let j = start; j < Math.min(count, end); j++) {
      const value = Number(samples[j]);
      if (Number.isFinite(value)) peak = Math.max(peak, Math.abs(value));
    }
    result[i] = Math.min(1, peak);
  }
  return result;
}

