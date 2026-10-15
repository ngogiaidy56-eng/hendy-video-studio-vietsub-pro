package com.example.server.service

import com.example.core.model.AppStatus
import com.example.core.model.MaintenanceStatus
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.parameter
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.Parameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import java.io.File

@Serializable
data class TelegramUpdate(
    val update_id: Long? = null,
    val message: TelegramMessage? = null,
    val callback_query: TelegramCallback? = null,
)

@Serializable
data class TelegramMessage(
    val message_id: Long? = null,
    val chat: TelegramChat,
    val from: TelegramFrom? = null,
    val text: String? = null,
    val video: TelegramVideo? = null,
    val document: TelegramDocument? = null,
)

@Serializable data class TelegramChat(val id: Long)
@Serializable data class TelegramFrom(val id: Long, val first_name: String? = null, val last_name: String? = null, val username: String? = null)
@Serializable data class TelegramVideo(val file_id: String)
@Serializable data class TelegramDocument(val file_id: String, val file_name: String? = null)
@Serializable data class TelegramCallback(val id: String, val data: String? = null, val message: TelegramMessage? = null, val from: TelegramFrom? = null)
@Serializable data class TelegramGetFileResult(val file_path: String? = null)
@Serializable data class TelegramGetFileResponse(val ok: Boolean, val result: TelegramGetFileResult? = null)

class TelegramBotService(
    private val client: HttpClient,
    private val token: String,
    private val webhookUrl: String,
    private val webhookSecretToken: String,
    private val admins: TelegramAdminService,
    private val flags: FeatureFlagService,
    private val events: EventStreamService,
    private val workDir: File,
) {
    private val base = "https://api.telegram.org/bot$token"

    suspend fun initialize() {
        if (token.isBlank()) return
        if (webhookUrl.isNotBlank()) {
            require(webhookSecretToken.toByteArray(Charsets.UTF_8).size >= 32) { "TELEGRAM_WEBHOOK_SECRET must be at least 32 bytes before registering a webhook" }
            client.post("$base/setWebhook") {
                parameter("url", webhookUrl)
                parameter("secret_token", webhookSecretToken)
            }
        }
    }

    suspend fun handle(update: TelegramUpdate) {
        val callback = update.callback_query
        if (callback != null) {
            val userId = callback.from?.id ?: return
            if (!admins.isAdmin(userId)) { answerCallback(callback.id, "Không có quyền admin"); return }
            when (callback.data) {
                "maintenance:on" -> { flags.setMaintenance(true, "Bảo trì theo lệnh Telegram"); answerCallback(callback.id, "Đã bật bảo trì"); callback.message?.let { sendMessage(it.chat.id, "🟠 Maintenance: BẬT") } }
                "maintenance:off" -> { flags.setMaintenance(false); answerCallback(callback.id, "Đã tắt bảo trì"); callback.message?.let { sendMessage(it.chat.id, "🟢 Maintenance: TẮT") } }
                "status" -> { answerCallback(callback.id, "OK"); callback.message?.let { sendMessage(it.chat.id, statusText()) } }
                "feature:gemini" -> { val f = flags.update(geminiEnabled = !flags.get().geminiEnabled); answerCallback(callback.id, "Gemini: ${if (f.geminiEnabled) "ON" else "OFF"}"); callback.message?.let { sendMessage(it.chat.id, statusText()) } }
                "feature:whisper" -> { val f = flags.update(whisperEnabled = !flags.get().whisperEnabled); answerCallback(callback.id, "Whisper: ${if (f.whisperEnabled) "ON" else "OFF"}"); callback.message?.let { sendMessage(it.chat.id, statusText()) } }
                "feature:render" -> { val f = flags.update(renderHardsubEnabled = !flags.get().renderHardsubEnabled); answerCallback(callback.id, "Render: ${if (f.renderHardsubEnabled) "ON" else "OFF"}"); callback.message?.let { sendMessage(it.chat.id, statusText()) } }
            }
            return
        }
        val message = update.message ?: return
        val text = message.text?.trim()
        when {
            text == "/start" -> sendMessage(message.chat.id, "🎬 Video Subtitle Platform\nDùng /status, /admin. Gửi video để xử lý.")
            text == "/status" -> sendMessage(message.chat.id, statusText())
            text == "/admin" -> {
                if (!admins.isAdmin(message.from?.id ?: -1)) sendMessage(message.chat.id, "⛔ Bạn không có quyền admin")
                else sendAdminKeyboard(message.chat.id)
            }
            message.video != null || message.document != null -> {
                val fileId = message.video?.file_id ?: message.document?.file_id ?: return
                try {
                    val file = downloadFile(fileId, message.document?.file_name ?: "telegram-video.mp4")
                    events.broadcast("telegram_video", "Đã lưu video Telegram", file.name)
                    sendMessage(message.chat.id, "✅ Đã nhận và lưu video: ${file.name}")
                } catch (error: Throwable) {
                    sendMessage(message.chat.id, "❌ Không tải được video: ${error.message ?: "unknown error"}")
                }
            }
        }
    }

    private suspend fun statusText(): String {
        val m = flags.maintenance()
        val f = flags.get()
        return "🎬 Video Subtitle Platform\nMaintenance: ${if (m.enabled) "ON" else "OFF"}\nWhisper: ${if (f.whisperEnabled) "ON" else "OFF"}\nGemini: ${if (f.geminiEnabled) "ON" else "OFF"}\nRender Hardsub: ${if (f.renderHardsubEnabled) "ON" else "OFF"}"
    }

    private suspend fun sendAdminKeyboard(chatId: Long) {
        val keyboard = """{"inline_keyboard":[[{"text":"📊 Status","callback_data":"status"}],[{"text":"🟠 Maintenance ON","callback_data":"maintenance:on"},{"text":"🟢 OFF","callback_data":"maintenance:off"}],[{"text":"Gemini","callback_data":"feature:gemini"},{"text":"Whisper","callback_data":"feature:whisper"},{"text":"Render","callback_data":"feature:render"}]]}"""
        sendMessage(chatId, "⚙️ Admin Control", keyboard)
    }

    private suspend fun downloadFile(fileId: String, preferredName: String): File {
        val fileInfo: TelegramGetFileResponse = client.get("$base/getFile") { parameter("file_id", fileId) }.body()
        require(fileInfo.ok) { "Telegram getFile thất bại" }
        val path = fileInfo.result?.file_path ?: error("Telegram không trả về file_path")
        val extension = path.substringAfterLast('.', "mp4").take(8).replace(Regex("[^A-Za-z0-9]"), "")
        val safe = preferredName.replace(Regex("[^A-Za-z0-9._-]"), "_").take(80).ifBlank { "video" }
        val output = File(workDir, "tg-${java.util.UUID.randomUUID()}-${safe.substringBeforeLast('.', safe)}.$extension")
        val bytes: ByteArray = client.get("https://api.telegram.org/file/bot$token/$path").body()
        output.writeBytes(bytes)
        return output
    }

    private suspend fun sendMessage(chatId: Long, text: String, replyMarkupJson: String? = null) {
        client.post("$base/sendMessage") {
            contentType(ContentType.Application.Json)
            setBody(buildString {
                append("{\"chat_id\":").append(chatId).append(",\"text\":")
                append(kotlinx.serialization.json.Json.encodeToString<String>(text))
                replyMarkupJson?.let { append(",\"reply_markup\":").append(it) }
                append('}')
            })
        }
    }

    private suspend fun answerCallback(id: String, text: String) {
        client.post("$base/answerCallbackQuery") {
            contentType(ContentType.Application.Json)
            setBody("{\"callback_query_id\":${kotlinx.serialization.json.Json.encodeToString<String>(id)},\"text\":${kotlinx.serialization.json.Json.encodeToString<String>(text)}}")
        }
    }
}
