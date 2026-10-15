package com.example.core.network

import com.example.core.model.AdminActionRequest
import com.example.core.model.FeatureToggleRequest

class AdminApiClient(private val api: SubtitleApiClient) {
    suspend fun enableMaintenance(token: String, message: String? = null) =
        api.setMaintenance(token, AdminActionRequest(enabled = true, message = message))

    suspend fun disableMaintenance(token: String) =
        api.setMaintenance(token, AdminActionRequest(enabled = false))

    suspend fun toggleFeatures(token: String, request: FeatureToggleRequest) =
        api.setFeatures(token, request)
}
