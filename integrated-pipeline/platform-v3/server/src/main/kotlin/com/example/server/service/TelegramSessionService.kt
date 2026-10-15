package com.example.server.service

import com.example.core.model.TelegramUser
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

data class Session(val user: TelegramUser, val isAdmin: Boolean, val expiresAt: Long)

class TelegramSessionService(private val adminService: TelegramAdminService) {
    private val sessions = ConcurrentHashMap<String, Session>()
    private val ttlSeconds = 12 * 60 * 60L

    fun create(user: TelegramUser): Pair<String, Session> {
        val token = UUID.randomUUID().toString()
        val session = Session(user, adminService.isAdmin(user.id), Instant.now().epochSecond + ttlSeconds)
        sessions[token] = session
        return token to session
    }

    fun get(token: String?): Session? {
        if (token.isNullOrBlank()) return null
        val session = sessions[token] ?: return null
        if (session.expiresAt <= Instant.now().epochSecond) {
            sessions.remove(token)
            return null
        }
        return session
    }
}
