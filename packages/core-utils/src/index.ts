export function secondsToTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("seconds must be a finite non-negative number");
  const totalMs = Math.round(seconds * 1000);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}
export function clamp(value: number, min: number, max: number): number {
  if (![value, min, max].every(Number.isFinite) || min > max) throw new RangeError("invalid clamp arguments");
  return Math.min(max, Math.max(min, value));
}
