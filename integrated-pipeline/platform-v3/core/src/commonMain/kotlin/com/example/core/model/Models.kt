package com.example.core.model

import kotlinx.datetime.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName

@Serializable
data class SubtitleItem(
    val id: String,
    val startMs: Long,
    val endMs: Long,
    val text: String,
    val speaker: String? = null,
    val confidence: Double? = null,
)

@Serializable
data class VideoMeta(
    val id: String,
    val filename: String,
    val mimeType: String,
    val sizeBytes: Long,
    val durationMs: Long? = null,
    val width: Int? = null,
    val height: Int? = null,
)

@Serializable
data class MaintenanceStatus(
    val enabled: Boolean,
    val message: String = "Hệ thống đang bảo trì.",
    val updatedAt: Instant? = null,
)

@Serializable
data class FeatureConfig(
    val geminiEnabled: Boolean = true,
    val whisperEnabled: Boolean = true,
    val renderHardsubEnabled: Boolean = true,
)

@Serializable
data class TelegramUser(
    val id: Long,
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    val username: String? = null,
    @SerialName("language_code") val languageCode: String? = null,
)

@Serializable
data class AppStatus(
    val service: String,
    val environment: String,
    val maintenance: MaintenanceStatus,
    val features: FeatureConfig,
    val activeClients: Int,
    val version: String,
)

@Serializable
data class TranslationRequest(
    val text: String,
    val sourceLanguage: String = "auto",
    val targetLanguage: String = "vi",
    val context: String = "",
)

@Serializable
data class TranslationResponse(val text: String)

@Serializable
data class AuthRequest(val initData: String)

@Serializable
data class AuthResponse(
    val token: String,
    val user: TelegramUser,
    val isAdmin: Boolean,
    val expiresAtEpochSeconds: Long,
)

@Serializable
data class AdminActionRequest(val enabled: Boolean, val message: String? = null)

@Serializable
data class FeatureToggleRequest(
    val geminiEnabled: Boolean? = null,
    val whisperEnabled: Boolean? = null,
    val renderHardsubEnabled: Boolean? = null,
)

@Serializable
data class WsEvent(
    val type: String,
    val message: String,
    val payload: String? = null,
    val timestamp: String,
)
