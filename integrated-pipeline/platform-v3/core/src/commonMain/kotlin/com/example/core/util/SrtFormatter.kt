package com.example.core.util

import com.example.core.model.SubtitleItem

object SrtFormatter {
    fun format(items: List<SubtitleItem>): String = buildString {
        items.sortedBy { it.startMs }.forEachIndexed { index, item ->
            append(index + 1).append('\n')
            append(toTimestamp(item.startMs)).append(" --> ").append(toTimestamp(item.endMs)).append('\n')
            append(item.text.trim()).append("\n\n")
        }
    }

    private fun toTimestamp(ms: Long): String {
        val total = ms.coerceAtLeast(0L)
        val hours = total / 3_600_000
        val minutes = (total % 3_600_000) / 60_000
        val seconds = (total % 60_000) / 1_000
        val millis = total % 1_000
        return listOf(hours, minutes, seconds).joinToString(":") { it.toString().padStart(2, '0') } + "," + millis.toString().padStart(3, '0')
    }
}
