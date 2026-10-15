import test from 'node:test';
import assert from 'node:assert/strict';
import { smartMergeSubtitles } from './subtitleSmartMerge';
import { exportAss, exportTranscript, exportVtt } from './subtitleExports';
import type { SubtitleCue } from '@hendy/shared-types';

const cue = (id: string, start: number, end: number, text: string): SubtitleCue => ({ id, start, end, text });

test('merges short neighboring fragments', () => {
  const result = smartMergeSubtitles([cue('a', 0, 0.8, 'Xin chào'), cue('b', 0.95, 1.5, 'mọi người')]);
  assert.equal(result.cues.length, 1);
  assert.equal(result.cues[0].text, 'Xin chào mọi người');
  assert.equal(result.mergedCount, 1);
});

test('preserves sentence boundaries, long pauses and overlapping speaker cues', () => {
  const input = [cue('a', 0, 1, 'Xin chào.'), cue('b', 1.1, 1.5, 'Tôi là Linh'), cue('c', 3, 3.5, 'Xin tạm biệt'), cue('d', 3.4, 3.8, 'Ý kiến khác')];
  const result = smartMergeSubtitles(input);
  assert.equal(result.cues.length, 4);
});

test('exports WebVTT, ASS and timestamped transcript', () => {
  const input = [cue('a', 1.25, 2.5, 'Xin chào\nViệt Nam')];
  assert.match(exportVtt(input), /^WEBVTT\n\n1\n00:00:01\.250 --> 00:00:02\.500/m);
  assert.match(exportAss(input), /Dialogue: 0,0:00:01\.25,0:00:02\.50,Default/);
  assert.match(exportAss(input), /Xin chào\\NViệt Nam/);
  assert.match(exportTranscript(input), /\[00:00:01,250 - 00:00:02,500\]/);
});
