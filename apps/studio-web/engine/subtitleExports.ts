import type { SubtitleCue } from '@hendy/shared-types';
import { formatSrtTime } from './subtitleFormats';

function timestamp(value: number, decimal: '.' | ','): string {
  return formatSrtTime(value).replace(',', decimal);
}

/** Export cues to WebVTT, including the mandatory header. */
export function exportVtt(cues: SubtitleCue[]): string {
  const body = [...cues].sort((a, b) => a.start - b.start).map((cue, index) =>
    `${index + 1}\n${timestamp(cue.start, '.')} --> ${timestamp(cue.end, '.')}\n${cue.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`
  ).join('\n\n');
  return `WEBVTT\n\n${body}${body ? '\n' : ''}`;
}

/** Export a readable transcript with optional timestamps. */
export function exportTranscript(cues: SubtitleCue[], includeTimestamps = true): string {
  return [...cues].sort((a, b) => a.start - b.start).map(cue => includeTimestamps
    ? `[${timestamp(cue.start, ',')} - ${timestamp(cue.end, ',')}] ${cue.text}`
    : cue.text).join('\n');
}

function assColor(hex: string | undefined, fallback = '#FFFFFF'): string {
  const value = /^#[0-9a-f]{6}$/i.test(hex ?? '') ? hex! : fallback;
  const red = value.slice(1, 3); const green = value.slice(3, 5); const blue = value.slice(5, 7);
  return `&H00${blue}${green}${red}`.toUpperCase();
}
function assTime(value: number): string {
  const centis = Math.round(Math.max(0, value) * 100);
  const hours = Math.floor(centis / 360000); const minutes = Math.floor(centis % 360000 / 6000);
  const seconds = Math.floor(centis % 6000 / 100); const fraction = centis % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`;
}

/** Export editable Advanced SubStation Alpha, distinct from MP4 hardsub rendering. */
export function exportAss(cues: SubtitleCue[], style: { fontFamily?: string; fontSize?: number; color?: string; outlineColor?: string; outlineWidth?: number; bold?: boolean; italic?: boolean } = {}): string {
  const font = (style.fontFamily ?? 'Arial').replace(/[\r\n,]/g, ' ').slice(0, 80) || 'Arial';
  const size = Math.max(8, Math.min(128, Math.round(style.fontSize ?? 28)));
  const outline = Math.max(0, Math.min(12, Number(style.outlineWidth ?? 2)));
  const styles = `Style: Default,${font},${size},${assColor(style.color)},${assColor(style.color)},${assColor(style.outlineColor, '#000000')},&H80000000,${style.bold === false ? 0 : -1},${style.italic ? -1 : 0},0,0,100,100,0,0,1,${outline},0,2,20,20,35,1`;
  const events = [...cues].sort((a, b) => a.start - b.start).map(cue => {
    const text = cue.text.replace(/\r\n?/g, '\n').replace(/\n/g, '\\N').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\u0000/g, '');
    return `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${text}`;
  });
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nScaledBorderAndShadow: yes\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${styles}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}${events.length ? '\n' : ''}`;
}
