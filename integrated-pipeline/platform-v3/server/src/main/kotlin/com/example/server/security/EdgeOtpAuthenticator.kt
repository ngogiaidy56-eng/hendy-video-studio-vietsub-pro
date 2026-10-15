package com.example.server.security

import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import io.ktor.http.HttpStatusCode
import java.nio.charset.StandardCharsets
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

data class EdgeUser(val telegramUserId: Long)

object EdgeOtpAuthenticator {
    fun authenticate(call: ApplicationCall, secret: String): EdgeUser? {
        if (secret.isBlank()) return null
        val id = call.request.headers["X-Edge-User-Id"]?.toLongOrNull() ?: return null
        val ts = call.request.headers["X-Edge-Timestamp"]?.toLongOrNull() ?: return null
        val signature = call.request.headers["X-Edge-Signature"] ?: return null
        if (kotlin.math.abs(System.currentTimeMillis() / 1000L - ts) > 60) return null
        val expected = hmacSha256(secret, "$id:$ts")
        return if (constantTimeEquals(expected, signature)) EdgeUser(id) else null
    }

    private fun hmacSha256(secret: String, value: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(StandardCharsets.UTF_8), "HmacSHA256"))
        return mac.doFinal(value.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }

    private fun constantTimeEquals(a: String, b: String): Boolean {
        val aa = a.encodeToByteArray(); val bb = b.encodeToByteArray()
        if (aa.size != bb.size) return false
        var result = 0
        for (i in aa.indices) result = result or (aa[i].toInt() xor bb[i].toInt())
        return result == 0
    }
}

suspend fun requireEdgeOtp(call: ApplicationCall, secret: String): EdgeUser? {
    val user = EdgeOtpAuthenticator.authenticate(call, secret)
    if (user == null) call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "INVALID_EDGE_OTP"))
    return user
}
