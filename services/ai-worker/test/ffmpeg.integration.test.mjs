import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAss, buildRenderPlan } from '../src/renderPlan.ts';

const execFileAsync = promisify(execFile);
const enabled = process.env.RUN_FFMPEG_INTEGRATION === '1';

const manifest = {
  projectId: 'ffmpeg-e2e', title: 'FFmpeg Integration', width: 320, height: 180, fps: 24,
  tracks: [
    { id: 'v', name: 'Video chính', kind: 'video', clips: [{ id: 'main', assetId: 'main.mp4', name: 'main.mp4', start: 0, duration: 2, sourceStart: 0, transitionIn: { type: 'fade', duration: 0.2 } }] },
    { id: 'pip', name: 'PiP overlay', kind: 'overlay', clips: [{ id: 'pip1', assetId: 'pip.mp4', name: 'pip.mp4', start: 0.3, duration: 1.2, transform: { x: 0.65, y: 0.08, width: 0.28, height: 0.28, opacity: 1 }, keyframes: [{ time: 0, x: 0.65, y: 0.08 }, { time: 1, x: 0.05, y: 0.08 }], transitionOut: { type: 'fade', duration: 0.2 } }] },
    { id: 'voice', name: 'Voice / thoại', kind: 'audio', volume: 1, clips: [{ id: 'vo1', assetId: 'voice.wav', name: 'voice.wav', start: 0.2, duration: 1.2, volume: 1 }] },
    { id: 'bgm', name: 'Nhạc nền BGM', kind: 'audio', volume: 0.2, clips: [{ id: 'bgm1', assetId: 'bgm.wav', name: 'bgm.wav', start: 0, duration: 2, volume: 1 }] },
  ],
  subtitles: [{ id: 's1', start: 0.4, end: 1.4, text: 'Kiểm thử xuất video', style: { fontFamily: 'Arial', fontSize: 18, color: '#ffffff', outlineColor: '#000000', outlineWidth: 2, bold: true } }],
  export: { format: 'mp4', burnSubtitles: true, quality: 'draft', audioDucking: { enabled: true, thresholdDb: -24, ratio: 4, attackMs: 20, releaseMs: 200 } },
};

test('FFmpeg integration: composite + PiP + voice/BGM ducking + ASS burn-in', { skip: !enabled }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hendy-ffmpeg-e2e-'));
  try {
    const main = join(dir, 'main.mp4');
    const pip = join(dir, 'pip.mp4');
    const voice = join(dir, 'voice.wav');
    const bgm = join(dir, 'bgm.wav');
    const ass = join(dir, 'subs.ass');
    const out = join(dir, 'out.mp4');
    await execFileAsync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=24:duration=2','-f','lavfi','-i','sine=frequency=520:sample_rate=44100:duration=2','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',main], { timeout: 30000 });
    await execFileAsync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=yellow:size=96x96:rate=24:duration=1.2','-c:v','libx264','-pix_fmt','yuv420p',pip], { timeout: 30000 });
    await execFileAsync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','sine=frequency=880:sample_rate=44100:duration=1.2',voice], { timeout: 30000 });
    await execFileAsync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','sine=frequency=220:sample_rate=44100:duration=2',bgm], { timeout: 30000 });
    const fileInputs = [
      { track: manifest.tracks[0], clip: manifest.tracks[0].clips[0], filePath: main, inputIndex: 0, hasAudio: true, isStill: false },
      { track: manifest.tracks[1], clip: manifest.tracks[1].clips[0], filePath: pip, inputIndex: 1, hasAudio: false, isStill: false },
      { track: manifest.tracks[2], clip: manifest.tracks[2].clips[0], filePath: voice, inputIndex: 2, hasAudio: true, isStill: false },
      { track: manifest.tracks[3], clip: manifest.tracks[3].clips[0], filePath: bgm, inputIndex: 3, hasAudio: true, isStill: false },
    ];
    const { writeFile } = await import('node:fs/promises');
    await writeFile(ass, buildAss(manifest), 'utf8');
    const plan = buildRenderPlan(manifest, fileInputs, out, ass);
    await execFileAsync('ffmpeg', plan.args, { timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
    const outStat = await stat(out);
    assert.ok(outStat.size > 1024, 'MP4 output should not be empty');
    const probe = await execFileAsync('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',out]);
    const duration = Number(probe.stdout.trim());
    assert.ok(duration >= 1.8 && duration <= 2.2, `Expected ~2s output, got ${duration}`);
    assert.match(plan.filterComplex, /sidechaincompress=/);
    assert.match(plan.filterComplex, /subtitles=/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
