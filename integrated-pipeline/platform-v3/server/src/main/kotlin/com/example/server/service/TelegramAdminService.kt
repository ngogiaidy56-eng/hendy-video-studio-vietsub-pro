package com.example.server.service

class TelegramAdminService(private val adminIds: Set<Long>) {
    fun isAdmin(userId: Long): Boolean = userId in adminIds
}
