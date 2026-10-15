import type { SubtitleCue } from '@hendy/shared-types';

export interface VoiceSegment {
  start: number;
  end: number;
  peakRms: number;
  confidence: number;
}

export interface SyncOptions {
  sensitivity?: 'low' | 'medium' | 'high';
  leadInMs?: number;
  leadOutMs?: number;
  maxBoundaryShiftMs?: number;
  minCueDurationMs?: number;
}

export interface CueSyncChange {
  cueId: string;
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  startShiftMs: number;
  endShiftMs: number;
}

export interface AudioSyncResult {
  cues: SubtitleCue[];
  segments: VoiceSegment[];
  changes: CueSyncChange[];
  analyzedSeconds: number;
}

/**
 * Detect speech-like activity in mono PCM using short-frame RMS and an adaptive
 * noise floor. This is a timing helper, not ASR: it cannot infer word boundaries.
 */
export function detectVoiceSegmentsFromSamples(
  samples: Float32Array,
  sampleRate: number,
  sensitivity: SyncOptions['sensitivity'] = 'medium',
): VoiceSegment[] {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || samples.length < sampleRate * 0.12) return [];
  const frameSeconds = 0.02;
  const frameSize = Math.max(1, Math.round(sampleRate * frameSeconds));
  const frameCount = Math.floor(samples.length / frameSize);
  if (frameCount < 6) return [];

  const rms = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * frameSize;
    const end = Math.min(samples.length, start + frameSize);
    let squareSum = 0;
    for (let index = start; index < end; index++) {
      const sample = samples[index];
      squareSum += sample * sample;
    }
    rms[frame] = Math.sqrt(squareSum / Math.max(1, end - start));
  }

  const smooth = new Float32Array(frameCount);
  for (let index = 0; index < frameCount; index++) {
    let sum = rms[index];
    let count = 1;
    if (index > 0) { sum += rms[index - 1]; count++; }
    if (index + 1 < frameCount) { sum += rms[index + 1]; count++; }
    smooth[index] = sum / count;
  }

  const sorted = Array.from(smooth).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
  const upper = sorted[Math.floor(sorted.length * 0.85)] ?? 0;
  const peak = sorted[sorted.length - 1] ?? 0;
  // Silence or extremely low-level material should produce no false positives.
  if (upper < 0.003 || peak < 0.006) return [];

  const multiplier = sensitivity === 'high' ? 0.18 : sensitivity === 'low' ? 0.42 : 0.28;
  const onsetThreshold = Math.max(0.0025, floor + (upper - floor) * multiplier);
  const sustainThreshold = onsetThreshold * 0.68;
  const mergeGapFrames = Math.ceil(0.18 / frameSeconds);
  const minimumSpeechFrames = Math.ceil(0.12 / frameSeconds);
  const raw: Array<{ startFrame: number; endFrame: number; peak: number }> = [];
  let active = false;
  let startFrame = 0;
  let lastActive = -1;
  let quietFrames = 0;
  let segmentPeak = 0;

  for (let frame = 0; frame < frameCount; frame++) {
    const threshold = active ? sustainThreshold : onsetThreshold;
    const isVoice = smooth[frame] >= threshold;
    if (isVoice) {
      if (!active) { active = true; startFrame = frame; segmentPeak = smooth[frame]; }
      segmentPeak = Math.max(segmentPeak, smooth[frame]);
      lastActive = frame;
      quietFrames = 0;
    } else if (active) {
      quietFrames++;
      if (quietFrames > mergeGapFrames) {
        const endFrame = lastActive + 1;
        if (endFrame - startFrame >= minimumSpeechFrames) raw.push({ startFrame, endFrame, peak: segmentPeak });
        active = false;
        quietFrames = 0;
        segmentPeak = 0;
      }
    }
  }
  if (active) {
    const endFrame = Math.max(startFrame + 1, lastActive + 1);
    if (endFrame - startFrame >= minimumSpeechFrames) raw.push({ startFrame, endFrame, peak: segmentPeak });
  }

  return raw.map(segment => ({
    start: Number((segment.startFrame * frameSeconds).toFixed(3)),
    end: Number((segment.endFrame * frameSeconds).toFixed(3)),
    peakRms: Number(segment.peak.toFixed(4)),
    confidence: Number(Math.min(0.99, Math.max(0.5, 0.5 + segment.peak / Math.max(peak, 0.001) * 0.49)).toFixed(2)),
  }));
}

/** Snap cue starts/ends only to a nearby VAD boundary; distant boundaries are left untouched. */
export function alignCuesToVoiceSegments(
  input: SubtitleCue[],
  segments: VoiceSegment[],
  overrides: SyncOptions = {},
): AudioSyncResult {
  const options = {
    leadInMs: 40,
    leadOutMs: 80,
    maxBoundaryShiftMs: 650,
    minCueDurationMs: 250,
    ...overrides,
  };
  const ordered = [...input].sort((a, b) => a.start - b.start);
  const cues = ordered.map(cue => ({ ...cue }));
  const changes: CueSyncChange[] = [];
  const maxShift = options.maxBoundaryShiftMs / 1000;

  for (let index = 0; index < cues.length; index++) {
    const cue = cues[index];
    if (!cue.text.trim() || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.end <= cue.start) continue;
    const previousEnd = index > 0 ? cues[index - 1].end : 0;
    const nextStart = index + 1 < cues.length ? cues[index + 1].start : Number.POSITIVE_INFINITY;
    const startCandidates = segments.filter(segment => Math.abs(segment.start - cue.start) <= maxShift);
    const endCandidates = segments.filter(segment => Math.abs(segment.end - cue.end) <= maxShift);
    const nearestStart = startCandidates.sort((a, b) => Math.abs(a.start - cue.start) - Math.abs(b.start - cue.start))[0];
    const nearestEnd = endCandidates.sort((a, b) => Math.abs(a.end - cue.end) - Math.abs(b.end - cue.end))[0];
    const oldStart = cue.start;
    const oldEnd = cue.end;
    let newStart = nearestStart ? Math.max(0, nearestStart.start - options.leadInMs / 1000) : oldStart;
    let newEnd = nearestEnd ? nearestEnd.end + options.leadOutMs / 1000 : oldEnd;

    // Preserve subtitle order and avoid overlapping adjacent cues.
    newStart = Math.max(previousEnd, Math.min(oldStart + maxShift, Math.max(oldStart - maxShift, newStart)));
    newEnd = Math.min(nextStart, Math.max(oldEnd - maxShift, Math.min(oldEnd + maxShift, newEnd)));
    if (newEnd - newStart < options.minCueDurationMs / 1000) {
      newStart = oldStart;
      newEnd = oldEnd;
    }
    newStart = Number(Math.max(0, newStart).toFixed(3));
    newEnd = Number(Math.max(newStart + options.minCueDurationMs / 1000, newEnd).toFixed(3));
    if (newEnd > nextStart) { newStart = oldStart; newEnd = oldEnd; }

    if (Math.abs(newStart - oldStart) >= 0.025 || Math.abs(newEnd - oldEnd) >= 0.025) {
      cue.start = newStart;
      cue.end = newEnd;
      changes.push({
        cueId: cue.id,
        oldStart,
        oldEnd,
        newStart,
        newEnd,
        startShiftMs: Math.round((newStart - oldStart) * 1000),
        endShiftMs: Math.round((newEnd - oldEnd) * 1000),
      });
    }
  }
  return { cues, segments, changes, analyzedSeconds: segments.length ? segments[segments.length - 1].end : 0 };
}

/** Decode a user-selected audio asset and close AudioContext reliably. */
export async function syncSubtitlesFromAudioFile(
  file: File,
  cues: SubtitleCue[],
  options: SyncOptions = {},
): Promise<AudioSyncResult> {
  if (file.size > 80 * 1024 * 1024) throw new Error('Tệp audio vượt quá 80 MB; hãy dùng một bản audio đã nén hoặc cắt ngắn.');
  if (!file.type.startsWith('audio/')) throw new Error('Hãy chọn tệp audio (WAV/MP3/M4A/WebM audio) để đồng bộ.');
  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) throw new Error('Trình duyệt không hỗ trợ Web Audio API.');
  const context = new AudioContextCtor();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const segments = detectVoiceSegmentsFromSamples(channel, buffer.sampleRate, options.sensitivity ?? 'medium');
    if (!segments.length) throw new Error('Không phát hiện được vùng giọng nói; kiểm tra tệp audio hoặc giảm nhiễu nền.');
    return alignCuesToVoiceSegments(cues, segments, options);
  } finally {
    await context.close().catch(() => undefined);
  }
}
