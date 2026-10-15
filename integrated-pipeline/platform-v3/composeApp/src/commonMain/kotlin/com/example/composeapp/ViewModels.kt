package com.example.composeapp

import com.example.core.data.InMemorySessionRepository
import com.example.core.data.InMemorySubtitleRepository
import com.example.core.model.SubtitleItem
import com.example.core.model.TranslationRequest
import com.example.core.network.SubtitleApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class PlayerViewModel {
    private val _playing = MutableStateFlow(false)
    val playing: StateFlow<Boolean> = _playing
    fun toggle() { _playing.value = !_playing.value }
}

class TimelineEditorViewModel(private val repo: InMemorySubtitleRepository, private val api: SubtitleApiClient) {
    val items = repo.items
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy

    fun addLine(text: String) {
        val n = items.value.size
        repo.update(SubtitleItem("line-$n", n * 2000L, n * 2000L + 1800L, text))
        if (n == items.value.size) repo.replace(items.value + SubtitleItem("line-$n", n * 2000L, n * 2000L + 1800L, text))
    }

    fun translate(token: String, targetLanguage: String = "vi") {
        val snapshot = items.value
        if (snapshot.isEmpty()) return
        _busy.value = true
        scope.launch {
            runCatching {
                snapshot.forEach { item ->
                    val result = api.translate(token, TranslationRequest(item.text, "auto", targetLanguage, "video subtitle"))
                    repo.update(item.copy(text = result.text))
                }
            }.also { _busy.value = false }
        }
    }

    fun replace(items: List<SubtitleItem>) = repo.replace(items)
}

class AdminControlViewModel(private val system: com.example.core.data.InMemorySystemConfigRepository) {
    val maintenance = system.maintenance
    val features = system.features
}

class SessionViewModel(private val session: InMemorySessionRepository) {
    val user = session.currentUser
    val isAdmin = session.isAdmin
    fun apply(user: com.example.core.model.TelegramUser, admin: Boolean) = session.setSession(user, admin)
}
