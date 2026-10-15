package com.example.core.util

import com.example.core.model.TelegramUser

/** Server-side implementation is provided by the Ktor module. Never trust initDataUnsafe. */
interface TelegramAuthValidator {
    fun validate(initData: String): TelegramUser?
}
