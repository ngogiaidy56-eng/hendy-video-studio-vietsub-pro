/// <reference lib="webworker" />
import { reduceSamplesToBars } from '../engine/audioWaveformCore';

type WaveMessage = { type: 'sample'; samples: Float32Array; bars: number };
const worker = self as DedicatedWorkerGlobalScope;
worker.onmessage = (event: MessageEvent<WaveMessage>) => {
  const { type, samples, bars } = event.data;
  if (type !== 'sample' || !(samples instanceof Float32Array) || !samples.length || !Number.isInteger(bars) || bars < 1 || bars > 512) return;
  const result = reduceSamplesToBars(samples, bars);
  worker.postMessage({ type: 'waveform', bars: result }, [result.buffer]);
};
export {};
