package com.example.composeapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.core.data.InMemorySubtitleRepository
import com.example.core.data.InMemorySystemConfigRepository
import com.example.core.network.SubtitleApiClient
import kotlinx.coroutines.launch
import org.koin.compose.koinInject

@Composable
fun PlayerContainerScreen(vm: PlayerViewModel) {
    val playing by vm.playing.collectAsState()
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Telegram Video Subtitle Studio", style = MaterialTheme.typography.headlineSmall)
        Card(Modifier.fillMaxWidth().height(240.dp)) {
            Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                Text("🎬 Platform Player Adapter\nAndroid: Media3\n iOS: AVPlayer\nDesktop: VLCj")
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = vm::toggle) { Text(if (playing) "Pause" else "Play") }
            OutlinedButton(onClick = {}) { Text("Open video") }
        }
    }
}

@Composable
fun TimelineEditorScreen(vm: TimelineEditorViewModel, token: String?) {
    val items by vm.items.collectAsState()
    val busy by vm.busy.collectAsState()
    val scope = rememberCoroutineScope()
    var input by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Timeline Editor", style = MaterialTheme.typography.headlineSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(input, { input = it }, Modifier.weight(1f), placeholder = { Text("Nhập câu phụ đề...") })
            Button(onClick = { if (input.isNotBlank()) { vm.addLine(input); input = "" } }) { Text("Thêm") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(enabled = !busy && !token.isNullOrBlank(), onClick = { vm.translate(token!!, "vi") }) { Text(if (busy) "Đang dịch..." else "Gemini dịch") }
        }
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(items) { item ->
                ElevatedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(10.dp)) {
                        Text("${item.startMs}ms → ${item.endMs}ms", style = MaterialTheme.typography.labelSmall)
                        Text(item.text)
                    }
                }
            }
        }
    }
}

@Composable
fun AdminDashboardScreen(token: String?, api: SubtitleApiClient, system: InMemorySystemConfigRepository) {
    val maintenance by system.maintenance.collectAsState()
    val features by system.features.collectAsState()
    var message by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Admin Dashboard", style = MaterialTheme.typography.headlineSmall)
        Text(if (maintenance.enabled) "🟠 MAINTENANCE ĐANG BẬT" else "🟢 SYSTEM ONLINE")
        OutlinedTextField(message, { message = it }, Modifier.fillMaxWidth(), label = { Text("Thông báo bảo trì") })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(enabled = !token.isNullOrBlank(), onClick = { scope.launch {
                val next = api.setMaintenance(token!!, com.example.core.model.AdminActionRequest(true, message))
                system.setMaintenance(next)
            } }) { Text("Bật") }
            OutlinedButton(enabled = !token.isNullOrBlank(), onClick = { scope.launch {
                val next = api.setMaintenance(token!!, com.example.core.model.AdminActionRequest(false))
                system.setMaintenance(next)
            } }) { Text("Tắt") }
        }
        HorizontalDivider()
        Text("Feature flags")
        Text("Whisper: ${if (features.whisperEnabled) "ON" else "OFF"}")
        Text("Gemini: ${if (features.geminiEnabled) "ON" else "OFF"}")
        Text("Render Hardsub: ${if (features.renderHardsubEnabled) "ON" else "OFF"}")
        Button(enabled = !token.isNullOrBlank(), onClick = { scope.launch {
            val next = api.setFeatures(token!!, com.example.core.model.FeatureToggleRequest(geminiEnabled = !features.geminiEnabled))
            system.setFeatures(next)
        } }) { Text("Toggle Gemini") }
    }
}
