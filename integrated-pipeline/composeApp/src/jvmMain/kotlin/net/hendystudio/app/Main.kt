package net.hendystudio.app

import androidx.compose.material.MaterialTheme
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application

fun main() = application {
    Window(onCloseRequest = ::exitApplication, title = "Hendy Video Studio Pro") { StudioApp() }
}

@Composable
fun StudioApp() {
    MaterialTheme { Text("Hendy Video Studio Pro — native pipeline starter") }
}
