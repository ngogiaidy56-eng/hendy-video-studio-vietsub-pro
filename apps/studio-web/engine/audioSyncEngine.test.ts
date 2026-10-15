import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SubtitleCue } from '@hendy/shared-types';
import { alignCuesToVoiceSegments, detectVoiceSegmentsFromSamples } from './audioSyncEngine';

describe('audio cue synchronization', () => {
  it('detects two separate voice-like activity windows from PCM samples', () => {
    const sampleRate = 16_000;
    const seconds = 3;
    const samples = new Float32Array(sampleRate * seconds);
    for (let i = 0; i < samples.length; i++) {
      const time = i / sampleRate;
      if ((time >= 0.4 && time <= 1.05) || (time >= 1.8 && time <= 2.55)) {
        samples[i] = Math.sin(2 * Math.PI * 260 * time) * 0.2;
      }
    }
    const segments = detectVoiceSegmentsFromSamples(samples, sampleRate);
    assert.equal(segments.length, 2);
    assert.ok(segments[0].start >= 0.35 && segments[0].start <= 0.45);
    assert.ok(segments[1].start >= 1.75 && segments[1].start <= 1.85);
  });

  it('does not treat silence as voice activity', () => {
    const segments = detectVoiceSegmentsFromSamples(new Float32Array(16_000 * 2), 16_000);
    assert.deepEqual(segments, []);
  });

  it('adjusts nearby subtitle boundaries but preserves unrelated cue timing', () => {
    const cues: SubtitleCue[] = [
      { id: 'a', start: 0.48, end: 1.0, text: 'Xin chào' },
      { id: 'b', start: 3.8, end: 4.2, text: 'Giữ nguyên thời gian' },
    ];
    const segments = [
      { start: 0.4, end: 1.04, peakRms: 0.2, confidence: 0.95 },
      { start: 1.8, end: 2.5, peakRms: 0.2, confidence: 0.95 },
    ];
    const result = alignCuesToVoiceSegments(cues, segments, { leadInMs: 0, leadOutMs: 0 });
    assert.equal(result.cues[0].start, 0.4);
    assert.equal(result.cues[0].end, 1.04);
    assert.equal(result.cues[1].start, 3.8);
    assert.equal(result.changes.length, 1);
  });
});
