package com.example.core.data

import com.example.core.model.FeatureConfig
import com.example.core.model.MaintenanceStatus
import com.example.core.model.SubtitleItem
import com.example.core.model.TelegramUser
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class InMemorySubtitleRepository : SubtitleRepository {
    private val state = MutableStateFlow<List<SubtitleItem>>(emptyList())
    override val items: StateFlow<List<SubtitleItem>> = state
    override fun replace(items: List<SubtitleItem>) { state.value = items }
    override fun update(item: SubtitleItem) { state.value = state.value.map { if (it.id == item.id) item else it } }
    override fun remove(id: String) { state.value = state.value.filterNot { it.id == id } }
    override fun clear() { state.value = emptyList() }
}

class InMemorySystemConfigRepository : SystemConfigRepository {
    private val maintenanceState = MutableStateFlow(MaintenanceStatus(false))
    private val featuresState = MutableStateFlow(FeatureConfig())
    override val maintenance: StateFlow<MaintenanceStatus> = maintenanceState
    override val features: StateFlow<FeatureConfig> = featuresState
    override fun setMaintenance(value: MaintenanceStatus) { maintenanceState.value = value }
    override fun setFeatures(value: FeatureConfig) { featuresState.value = value }
}

class InMemorySessionRepository : SessionRepository {
    private val userState = MutableStateFlow<TelegramUser?>(null)
    private val adminState = MutableStateFlow(false)
    override val currentUser: StateFlow<TelegramUser?> = userState
    override val isAdmin: StateFlow<Boolean> = adminState
    override fun setSession(user: TelegramUser, isAdmin: Boolean) { userState.value = user; adminState.value = isAdmin }
    override fun clear() { userState.value = null; adminState.value = false }
}
