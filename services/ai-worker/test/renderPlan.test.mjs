import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAss, buildRenderPlan, safeAssetName } from '../src/renderPlan.ts';

const manifest = {
  projectId: 'p1', title: 'Render test', width: 1280, height: 720, fps: 30,
  tracks: [
    { id: 'v1', name: 'Video chính', kind: 'video', clips: [{ id: 'c1', assetId: 'video-1.mp4', name: 'video.mp4', start: 0, duration: 5, sourceStart: 0, transitionIn: { type: 'fade', duration: 0.3 } }] },
    { id: 'pip', name: 'PiP', kind: 'overlay', clips: [{ id: 'c2', assetId: 'overlay.mp4', name: 'overlay.mp4', start: 1, duration: 3, transform: { x: 0.66, y: 0.05, width: 0.3, height: 0.3, opacity: 0.9 }, keyframes: [{ time: 0, x: 0.66, y: 0.05 }, { time: 2, x: 0.05, y: 0.05 }], transitionOut: { type: 'fade', duration: 0.25 } }] },
    { id: 'voice', name: 'Voice TTS', kind: 'audio', volume: 1, clips: [{ id: 'a2', assetId: 'voice.wav', name: 'voice.wav', start: 0, duration: 5, volume: 1 }] },
    { id: 'bgm', name: 'Nhạc nền', kind: 'audio', volume: 0.2, clips: [{ id: 'a1', assetId: 'bgm.mp3', name: 'bgm.mp3', start: 0, duration: 5, volume: 0.5 }] },
  ],
  subtitles: [{ id: 's1', start: 0.5, end: 2, text: 'Xin chào {bị escape}', style: { fontFamily: 'Arial', fontSize: 28, color: '#ffffff', outlineColor: '#000000', outlineWidth: 2, bold: true } }],
  export: { format: 'mp4', burnSubtitles: true, quality: 'standard', audioDucking: { enabled: true, thresholdDb: -24, ratio: 5, attackMs: 20, releaseMs: 250 } },
};

test('safeAssetName rejects traversal and accepts generated asset ids', () => {
  assert.equal(safeAssetName('c9a0-video.mp4'), 'c9a0-video.mp4');
  assert.throws(() => safeAssetName('../secret.mp4'));
  assert.throws(() => safeAssetName('folder/file.mp4'));
});

test('ASS writer writes stable times and styles per cue', () => {
  const ass = buildAss(manifest);
  assert.match(ass, /PlayResX: 1280/);
  assert.match(ass, /0:00:00\.50/);
  assert.match(ass, /Xin chào/);
  assert.match(ass, /CueStyle1/);
});

test('render plan contains clip composite, animated overlay, audio ducking and ASS burn-in', () => {
  const files = [
    { track: manifest.tracks[0], clip: manifest.tracks[0].clips[0], filePath: '/tmp/video-1.mp4', inputIndex: 0, hasAudio: true, isStill: false },
    { track: manifest.tracks[1], clip: manifest.tracks[1].clips[0], filePath: '/tmp/overlay.mp4', inputIndex: 1, hasAudio: false, isStill: false },
    { track: manifest.tracks[2], clip: manifest.tracks[2].clips[0], filePath: '/tmp/voice.wav', inputIndex: 2, hasAudio: true, isStill: false },
    { track: manifest.tracks[3], clip: manifest.tracks[3].clips[0], filePath: '/tmp/bgm.mp3', inputIndex: 3, hasAudio: true, isStill: false },
  ];
  const plan = buildRenderPlan(manifest, files, '/tmp/output.mp4', '/tmp/output.ass');
  assert.equal(plan.inputCount, 4);
  assert.equal(plan.duration, 5);
  assert.match(plan.filterComplex, /overlay=/);
  assert.match(plan.filterComplex, /sidechaincompress=/);
  assert.match(plan.filterComplex, /subtitles=/);
  assert.ok(plan.args.includes('/tmp/output.mp4'));
});
