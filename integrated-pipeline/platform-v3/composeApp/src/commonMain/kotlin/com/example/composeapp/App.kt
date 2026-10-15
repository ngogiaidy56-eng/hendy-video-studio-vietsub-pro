package com.example.composeapp

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import org.koin.compose.KoinApplication
import org.koin.compose.koinInject

@Composable
fun App(token: String? = null, isAdmin: Boolean = false, apiBaseUrl: String = "http://127.0.0.1:8080") {
    KoinApplication(application = { modules(appModule(apiBaseUrl)) }) {
        val repo = koinInject<com.example.core.data.InMemorySubtitleRepository>()
        val system = koinInject<com.example.core.data.InMemorySystemConfigRepository>()
        val api = koinInject<com.example.core.network.SubtitleApiClient>()
        val playerVm = remember { PlayerViewModel() }
        val editorVm = remember { TimelineEditorViewModel(repo, api) }
        MaterialTheme {
            AppNavigation(isAdmin) { screen ->
                when (screen) {
                    Screen.PLAYER -> PlayerContainerScreen(playerVm)
                    Screen.TIMELINE -> TimelineEditorScreen(editorVm, token)
                    Screen.ADMIN -> AdminDashboardScreen(token, api, system)
                }
            }
        }
    }
}
