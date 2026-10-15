package com.example.server.service

import com.example.core.data.InMemorySystemConfigRepository
import com.example.core.model.FeatureConfig
import com.example.core.model.MaintenanceStatus
import kotlinx.datetime.Clock

class FeatureFlagService(private val repo: InMemorySystemConfigRepository) {
    fun get(): FeatureConfig = repo.features.value
    fun update(
        geminiEnabled: Boolean? = null,
        whisperEnabled: Boolean? = null,
        renderHardsubEnabled: Boolean? = null,
    ): FeatureConfig {
        val old = repo.features.value
        val next = old.copy(
            geminiEnabled = geminiEnabled ?: old.geminiEnabled,
            whisperEnabled = whisperEnabled ?: old.whisperEnabled,
            renderHardsubEnabled = renderHardsubEnabled ?: old.renderHardsubEnabled,
        )
        repo.setFeatures(next)
        return next
    }
    fun maintenance(): MaintenanceStatus = repo.maintenance.value
    fun setMaintenance(enabled: Boolean, message: String? = null): MaintenanceStatus {
        val next = MaintenanceStatus(enabled = enabled, message = message?.takeIf { it.isNotBlank() } ?: repo.maintenance.value.message, updatedAt = Clock.System.now())
        repo.setMaintenance(next)
        return next
    }
}
