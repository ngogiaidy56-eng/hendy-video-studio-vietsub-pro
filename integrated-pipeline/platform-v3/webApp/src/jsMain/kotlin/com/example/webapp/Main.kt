package com.example.webapp

import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.window.ComposeViewport
import com.example.composeapp.App

@OptIn(ExperimentalComposeUiApi::class)
fun main() {
    val token = js("window.__AUTH_TOKEN__ || null") as String?
    val isAdmin = js("Boolean(window.__IS_ADMIN__)") as Boolean
    val apiBaseUrl = js("window.__API_BASE_URL__ || window.location.origin") as String
    ComposeViewport { App(token = token, isAdmin = isAdmin, apiBaseUrl = apiBaseUrl) }
}
