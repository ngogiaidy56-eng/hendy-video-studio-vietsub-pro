package com.example.core.model

import kotlinx.serialization.Serializable

@Serializable
data class PipelineRequest(
    val mode: String = "dry-run",
    val inputType: String = "none",
    val sourceUrl: String? = null,
    val filename: String? = null,
    val strict: Boolean = true,
    val runExtraction: Boolean = false,
    val runOcr: Boolean = false,
    val runTranscription: Boolean = false,
)

@Serializable
data class PipelineStepResult(
    val name: String,
    val status: String,
    val message: String,
    val durationMs: Long = 0,
)

@Serializable
data class PipelineResult(
    val jobId: String,
    val status: String,
    val verdict: String,
    val steps: List<PipelineStepResult> = emptyList(),
    val patchedConfig: String? = null,
    val recoveryPath: String? = null,
    val extractedText: String? = null,
    val ocrText: String? = null,
    val transcript: String? = null,
)

@Serializable
data class AutoPatchRequest(val configJson: String)

@Serializable
data class AutoPatchResponse(
    val valid: Boolean,
    val patchedConfig: String,
    val changes: List<String> = emptyList(),
)

@Serializable
data class ImageOcrResponse(val text: String)
