package com.example.composeapp

import androidx.compose.material3.*
import androidx.compose.runtime.*

@Composable
fun AppNavigation(isAdmin: Boolean, content: @Composable (Screen) -> Unit) {
    var selected by remember { mutableStateOf(Screen.PLAYER) }
    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(selected == Screen.PLAYER, { selected = Screen.PLAYER }, icon = { Text("▶") }, label = { Text("Player") })
                NavigationBarItem(selected == Screen.TIMELINE, { selected = Screen.TIMELINE }, icon = { Text("✎") }, label = { Text("Timeline") })
                if (isAdmin) NavigationBarItem(selected == Screen.ADMIN, { selected = Screen.ADMIN }, icon = { Text("⚙") }, label = { Text("Admin") })
            }
        }
    ) { padding ->
        androidx.compose.foundation.layout.Box(androidx.compose.foundation.layout.Modifier.padding(padding)) {
            content(selected)
        }
    }
}
