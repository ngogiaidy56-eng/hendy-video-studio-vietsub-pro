package com.example.server.service

import com.example.core.model.TelegramUser
import com.example.core.util.TelegramAuthValidator
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.Serializable
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.math.abs

data class TelegramInitDataValidatorConfig(val botToken: String, val maxAgeSeconds: Long)

class TelegramAuthValidatorJvm(private val config: TelegramInitDataValidatorConfig) : TelegramAuthValidator {
    private val json = Json { ignoreUnknownKeys = true }

    override fun validate(initData: String): TelegramUser? {
        if (config.botToken.isBlank()) return null
        val fields = initData.split('&').mapNotNull { item ->
            val i = item.indexOf('=')
            if (i <= 0) null else URLDecoder.decode(item.substring(0, i), StandardCharsets.UTF_8) to
                URLDecoder.decode(item.substring(i + 1), StandardCharsets.UTF_8)
        }.toMap()
        val receivedHash = fields["hash"] ?: return null
        val authDate = fields["auth_date"]?.toLongOrNull() ?: return null
        if (abs(System.currentTimeMillis() / 1000L - authDate) > config.maxAgeSeconds) return null

        val dataCheckString = fields.filterKeys { it != "hash" }.toSortedMap().entries.joinToString("\n") { "${it.key}=${it.value}" }
        val secret = hmacSha256(config.botToken, "WebAppData")
        val calculated = hmacSha256Hex(secret, dataCheckString)
        if (!constantTimeEquals(calculated, receivedHash)) return null

        val userJson = fields["user"] ?: return null
        return runCatching { json.decodeFromString<TelegramUser>(userJson) }.getOrNull()
    }

    private fun hmacSha256(keyString: String, data: String): ByteArray = hmacSha256(keyString.toByteArray(StandardCharsets.UTF_8), data.toByteArray(StandardCharsets.UTF_8))
    private fun hmacSha256(key: ByteArray, data: String): ByteArray = hmacSha256(key, data.toByteArray(StandardCharsets.UTF_8))
    private fun hmacSha256(key: ByteArray, data: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(data)
    }
    private fun hmacSha256Hex(key: ByteArray, data: String) = hmacSha256(key, data).joinToString("") { "%02x".format(it) }
    private fun constantTimeEquals(a: String, b: String): Boolean {
        if (a.length != b.length) return false
        var result = 0
        for (i in a.indices) result = result or (a[i].code xor b[i].code)
        return result == 0
    }
}
