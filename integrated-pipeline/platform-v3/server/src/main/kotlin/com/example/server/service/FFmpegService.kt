package com.example.server.service

import java.io.File
import java.util.concurrent.TimeUnit

class FFmpegService(private val ffmpegBin: String, private val workDir: File) {
    data class RenderResult(val output: File, val durationMs: Long, val logs: String)

    fun renderHardsub(input: File, srt: File, output: File, timeoutMinutes: Long = 30): RenderResult {
        require(input.exists()) { "Không tìm thấy video: ${input.absolutePath}" }
        require(srt.exists()) { "Không tìm thấy SRT: ${srt.absolutePath}" }
        output.parentFile?.mkdirs()
        val filterPath = srt.absolutePath.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
        val command = listOf(
            ffmpegBin, "-hide_banner", "-y", "-i", input.absolutePath,
            "-vf", "subtitles='$filterPath'",
            "-c:a", "copy", output.absolutePath
        )
        val started = System.nanoTime()
        val process = ProcessBuilder(command).directory(workDir).redirectErrorStream(true).start()
        val logs = process.inputStream.bufferedReader().use { it.readText() }
        if (!process.waitFor(timeoutMinutes, TimeUnit.MINUTES)) {
            process.destroyForcibly()
            error("FFmpeg timeout sau $timeoutMinutes phút")
        }
        if (process.exitValue() != 0) error("FFmpeg thất bại (${process.exitValue()}):\n$logs")
        return RenderResult(output, (System.nanoTime() - started) / 1_000_000, logs.takeLast(4000))
    }
}
