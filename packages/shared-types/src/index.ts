export type MediaKind = "video" | "audio" | "image" | "subtitle";
export type TrackKind = "video" | "audio" | "subtitle" | "overlay";
export type UserRole = "admin" | "editor" | "viewer";
export type SubtitleCue = { id: string; start: number; end: number; text: string; style?: SubtitleStyle };
export type SubtitleStyle = {
  fontFamily: string;
  fontSize: number;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  bold: boolean;
  italic?: boolean;
  alignment?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  marginV?: number;
};
/** Transform coordinates are normalized to the output canvas (0..1). */
export type ClipTransform = {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  crop?: { x: number; y: number; width: number; height: number };
};
export type ClipKeyframe = { time: number; x?: number; y?: number; scale?: number; opacity?: number };
export type ClipTransition = { type: "fade" | "dissolve"; duration: number };
export interface TimelineClip {
  id: string;
  assetId?: string;
  name: string;
  start: number;
  duration: number;
  sourceStart?: number;
  volume?: number;
  transform?: ClipTransform;
  keyframes?: ClipKeyframe[];
  transitionIn?: ClipTransition;
  transitionOut?: ClipTransition;
}
export interface TimelineTrack { id: string; name: string; kind: TrackKind; muted?: boolean; volume?: number; clips: TimelineClip[]; }
export interface AudioDuckingConfig { enabled: boolean; thresholdDb: number; ratio: number; attackMs: number; releaseMs: number; }
export interface RenderManifest {
  projectId: string;
  title: string;
  width: number;
  height: number;
  fps: number;
  tracks: TimelineTrack[];
  subtitles: SubtitleCue[];
  export: { format: "mp4"; burnSubtitles: boolean; quality: "draft" | "standard" | "high"; audioDucking?: AudioDuckingConfig };
}
export interface VideoProject { id: string; title: string; updatedAt: string; duration: number; tracks: TimelineTrack[]; subtitles: SubtitleCue[]; }
export type RenderJobStatus = "queued" | "active" | "completed" | "failed" | "queued-local-only" | "cancelled";
export interface RenderJobSnapshot { id: string; status: RenderJobStatus; progress: number; message: string; outputUrl?: string; error?: string; createdAt: string; }
export interface AuthUser { id: string; email: string; displayName: string; roles: UserRole[]; }
