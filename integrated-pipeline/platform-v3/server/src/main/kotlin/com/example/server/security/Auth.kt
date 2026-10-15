package com.example.server.security

import com.example.server.service.Session
import com.example.server.service.TelegramSessionService
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import io.ktor.http.HttpStatusCode

suspend fun ApplicationCall.requireSession(sessions: TelegramSessionService): Session? {
    val token = request.headers["Authorization"]?.removePrefix("Bearer ")?.trim()
    val session = sessions.get(token)
    if (session == null) {
        respond(HttpStatusCode.Unauthorized, mapOf("error" to "UNAUTHORIZED"))
        return null
    }
    return session
}

suspend fun ApplicationCall.requireAdmin(sessions: TelegramSessionService): Session? {
    val session = requireSession(sessions) ?: return null
    if (!session.isAdmin) {
        respond(HttpStatusCode.Forbidden, mapOf("error" to "ADMIN_REQUIRED"))
        return null
    }
    return session
}
