package com.example.server.service

import com.example.core.model.WsEvent
import io.ktor.websocket.DefaultWebSocketServerSession
import io.ktor.websocket.Frame
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.concurrent.ConcurrentHashMap
import kotlinx.datetime.Clock

class EventStreamService {
    private val sessions = ConcurrentHashMap.newKeySet<DefaultWebSocketServerSession>()
    private val json = Json { encodeDefaults = true }

    fun connect(session: DefaultWebSocketServerSession) { sessions += session }
    fun disconnect(session: DefaultWebSocketServerSession) { sessions -= session }

    suspend fun broadcast(type: String, message: String, payload: String? = null) {
        val event = WsEvent(type, message, payload, Clock.System.now().toString())
        val frame = Frame.Text(json.encodeToString(event))
        sessions.forEach { session ->
            try {
                session.send(frame)
            } catch (_: Throwable) {
                sessions -= session
            }
        }
    }

    fun activeClients(): Int = sessions.size
}
