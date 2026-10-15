package com.example.core.data

import com.example.core.model.FeatureConfig
import com.example.core.model.MaintenanceStatus
import com.example.core.model.SubtitleItem
import com.example.core.model.TelegramUser
import kotlinx.coroutines.flow.StateFlow

interface SubtitleRepository {
    val items: StateFlow<List<SubtitleItem>>
    fun replace(items: List<SubtitleItem>)
    fun update(item: SubtitleItem)
    fun remove(id: String)
    fun clear()
}

interface SystemConfigRepository {
    val maintenance: StateFlow<MaintenanceStatus>
    val features: StateFlow<FeatureConfig>
    fun setMaintenance(value: MaintenanceStatus)
    fun setFeatures(value: FeatureConfig)
}

interface SessionRepository {
    val currentUser: StateFlow<TelegramUser?>
    val isAdmin: StateFlow<Boolean>
    fun setSession(user: TelegramUser, isAdmin: Boolean)
    fun clear()
}
