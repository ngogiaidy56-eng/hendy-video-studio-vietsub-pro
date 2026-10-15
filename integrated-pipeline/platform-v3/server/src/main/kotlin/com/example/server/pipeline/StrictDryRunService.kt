package com.example.server.pipeline

import com.example.core.model.PipelineStepResult
import java.io.File
import java.util.concurrent.TimeUnit

class StrictDryRunService(
    private val projectDir: File,
    private val command: String,
    private val timeoutSeconds: Long = 120,
) {
    fun run(): PipelineStepResult {
        val started = System.nanoTime()
        return try {
            val process = ProcessBuilder(*command.trim().split(Regex("\\s+")).toTypedArray())
                .directory(projectDir)
                .redirectErrorStream(true)
                .start()
            val output = process.inputStream.bufferedReader().use { it.readText() }
            val finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS)
            if (!finished) {
                process.destroyForcibly()
                PipelineStepResult("sandbox-gate", "FAIL", "Dry-run timeout after ${timeoutSeconds}s", elapsed(started))
            } else if (process.exitValue() == 0) {
                PipelineStepResult("sandbox-gate", "PASS", "Strict dry-run passed", elapsed(started))
            } else {
                val tail = output.takeLast(1500).replace("\\u0000", "")
                PipelineStepResult("sandbox-gate", "FAIL", tail.ifBlank { "Dry-run failed" }, elapsed(started))
            }
        } catch (e: Throwable) {
            PipelineStepResult("sandbox-gate", "FAIL", "Không chạy được dry-run: ${e.message}", elapsed(started))
        }
    }

    private fun elapsed(started: Long): Long = (System.nanoTime() - started) / 1_000_000
}
