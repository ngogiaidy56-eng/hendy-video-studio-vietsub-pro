package com.example.server.pipeline

import com.example.core.model.PipelineRequest
import com.example.core.model.PipelineResult
import com.example.core.model.PipelineStepResult
import java.util.UUID

class PipelineOrchestrator(
    private val patcher: AutoPatchService,
    private val dryRun: StrictDryRunService,
    private val recovery: RecoveryService,
    private val sotJson: String,
) {
    fun run(request: PipelineRequest): PipelineResult {
        val jobId = UUID.randomUUID().toString()
        val steps = mutableListOf<PipelineStepResult>()
        val backup = recovery.backup("sot-$jobId", sotJson)
        val patched = patcher.patch(sotJson)
        steps += PipelineStepResult("auto-patch", "PASS", patched.changes.joinToString("; ").ifBlank { "SOT đã hợp lệ" })
        val gate = dryRun.run()
        steps += gate
        val failed = gate.status != "PASS"
        return PipelineResult(
            jobId = jobId,
            status = if (failed) "BLOCKED" else "NOMINAL",
            verdict = if (failed) "RELEASE_BLOCKED" else "RELEASE_UNLOCKED",
            steps = steps,
            patchedConfig = patched.patchedConfig,
            recoveryPath = backup.absolutePath,
        )
    }
}
