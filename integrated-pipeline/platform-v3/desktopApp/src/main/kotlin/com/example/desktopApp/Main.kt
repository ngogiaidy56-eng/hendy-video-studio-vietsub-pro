package com.example.desktopApp

import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import com.example.composeapp.App

fun main() = application {
    Window(onCloseRequest = ::exitApplication, title = "Video Subtitle Studio") { App(apiBaseUrl = "http://127.0.0.1:8080") }
}
