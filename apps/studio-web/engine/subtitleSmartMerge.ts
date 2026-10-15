import type { SubtitleCue } from '@hendy/shared-types';

export interface SmartMergeOptions {
  maxGapMs: number;
  maxDurationSec: number;
  maxCharacters: number;
  respectPunctuation: boolean;
}

export interface SmartMergeReport {
  cues: SubtitleCue[];
  originalCount: number;
  resultCount: number;
  mergedCount: number;
  reducedPercentage: number;
}

export const DEFAULT_SMART_MERGE_OPTIONS: SmartMergeOptions = {
  maxGapMs: 400,
  maxDurationSec: 4.5,
  maxCharacters: 70,
  respectPunctuation: true,
};

/**
 * Merge fragmented ASR subtitles without changing the order of unrelated cues.
 * Cues separated by overlaps or a long gap are preserved; terminal punctuation
 * prevents merging by default so two complete sentences remain separate.
 */
export function smartMergeSubtitles(
  input: SubtitleCue[],
  overrides: Partial<SmartMergeOptions> = {},
): SmartMergeReport {
  const options = { ...DEFAULT_SMART_MERGE_OPTIONS, ...overrides };
  const cues = [...input]
    .filter(cue => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.start >= 0 && cue.end > cue.start && cue.text.trim())
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map(cue => ({ ...cue, text: cue.text.trim() }));
  if (options.maxGapMs < 0 || options.maxDurationSec <= 0 || options.maxCharacters < 1) {
    throw new Error('Smart merge limits must be positive numbers.');
  }

  const merged: SubtitleCue[] = [];
  for (const cue of cues) {
    const current = merged.at(-1);
    if (!current) { merged.push({ ...cue }); continue; }
    const gapMs = (cue.start - current.end) * 1000;
    const combinedEnd = Math.max(current.end, cue.end);
    const combinedText = `${current.text} ${cue.text}`.replace(/\s+/g, ' ').trim();
    const endsWithSentencePunctuation = /[.!?…。！？]$/.test(current.text.trim());
    const canMerge = gapMs >= -80
      && gapMs <= options.maxGapMs
      && combinedEnd - current.start <= options.maxDurationSec
      && combinedText.length <= options.maxCharacters
      && (!options.respectPunctuation || !endsWithSentencePunctuation);
    if (canMerge) {
      current.end = combinedEnd;
      current.text = combinedText;
    } else {
      merged.push({ ...cue });
    }
  }

  const reducedCount = Math.max(0, cues.length - merged.length);
  return {
    cues: merged,
    originalCount: cues.length,
    resultCount: merged.length,
    mergedCount: reducedCount,
    reducedPercentage: cues.length ? Math.round(reducedCount / cues.length * 100) : 0,
  };
}
