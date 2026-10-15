package net.hendystudio.core

data class SubtitleItem(val id: String, val startMs: Long, val endMs: Long, val text: String)
data class TimelineClip(val id: String, val assetId: String, val startMs: Long, val durationMs: Long, val track: String)
data class StudioProject(val id: String, val title: String, val clips: List<TimelineClip>, val subtitles: List<SubtitleItem>)
