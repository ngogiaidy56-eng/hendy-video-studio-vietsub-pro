package com.example.server.routes

import com.example.core.model.*
import com.example.server.config.AppConfig
import com.example.server.security.requireAdmin
import com.example.server.service.*
import io.ktor.http.ContentDisposition
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.request.receive
import io.ktor.server.request.receiveMultipart
import io.ktor.util.cio.writeChannel
import io.ktor.server.response.respond
import io.ktor.server.response.respondFile
import io.ktor.server.routing.*
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import io.ktor.websocket.CloseReason
import java.io.File
import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.io.path.inputStream
import io.ktor.server.request.path

fun Route.apiRoutes(
    config: AppConfig,
    flags: FeatureFlagService,
    sessions: TelegramSessionService,
    auth: com.example.core.util.TelegramAuthValidator,
    whisper: WhisperService,
    ai: AiService,
    ffmpeg: FFmpegService,
    events: EventStreamService,
    pipeline: com.example.server.pipeline.PipelineOrchestrator,
    autoPatch: com.example.server.pipeline.AutoPatchService,
) {
    route("/api") {
        post("/pipeline/dry-run") {
            com.example.server.security.requireSession(sessions) ?: return@post
            val req = call.receive<PipelineRequest>()
            val result = pipeline.run(req)
            events.broadcast("pipeline", "${result.status}: ${result.verdict}", result.jobId)
            call.respond(result)
        }

        post("/pipeline/patch") {
            com.example.server.security.requireSession(sessions) ?: return@post
            val req = call.receive<AutoPatchRequest>()
            call.respond(autoPatch.patch(req.configJson))
        }

        get("/status") {
            call.respond(
                AppStatus(
                    service = "telegram-video-editor",
                    environment = "production-ready-template",
                    maintenance = flags.maintenance(),
                    features = flags.get(),
                    activeClients = events.activeClients(),
                    version = "0.1.0",
                )
            )
        }

        post("/auth/edge-otp") {
            val edgeUser = com.example.server.security.requireEdgeOtp(call, config.edgeSharedSecret) ?: return@post
            val telegramUser = TelegramUser(id = edgeUser.telegramUserId)
            val (token, session) = sessions.create(telegramUser)
            call.respond(AuthResponse(token, telegramUser, session.isAdmin, session.expiresAt))
        }

        post("/auth/telegram") {
            val req = call.receive<AuthRequest>()
            val user = auth.validate(req.initData)
                ?: return@post call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "INVALID_TELEGRAM_INIT_DATA"))
            val (token, session) = sessions.create(user)
            call.respond(AuthResponse(token, user, session.isAdmin, session.expiresAt))
        }

        post("/translate") {
            val session = com.example.server.security.requireSession(sessions) ?: return@post
            if (!flags.get().geminiEnabled) return@post call.respond(HttpStatusCode.ServiceUnavailable, mapOf("error" to "GEMINI_DISABLED"))
            val req = call.receive<TranslationRequest>()
            val result = ai.translate(req)
            events.broadcast("translation", "Đã dịch phụ đề cho ${session.user.username ?: session.user.id}")
            call.respond(TranslationResponse(result))
        }

        post("/ocr") {
            val session = com.example.server.security.requireSession(sessions) ?: return@post
            if (!flags.get().geminiEnabled) return@post call.respond(HttpStatusCode.ServiceUnavailable, mapOf("error" to "GEMINI_DISABLED"))
            val tempInput = File(config.workDir, "ocr-${UUID.randomUUID()}.bin")
            var mimeType = "image/png"
            receiveMultipart(formFieldLimit = 25L * 1024 * 1024).forEachPart { part ->
                if (part is PartData.FileItem) {
                    mimeType = part.contentType?.toString() ?: mimeType
                    part.provider().copyAndClose(tempInput.writeChannel())
                }
                part.dispose()
            }
            try {
                val text = ai.extractTextFromImage(tempInput.readBytes(), mimeType)
                events.broadcast("ocr", "OCR hoàn tất cho ${session.user.username ?: session.user.id}")
                call.respond(ImageOcrResponse(text))
            } finally { tempInput.delete() }
        }

        post("/transcribe") {
            val session = com.example.server.security.requireSession(sessions) ?: return@post
            if (!flags.get().whisperEnabled) return@post call.respond(HttpStatusCode.ServiceUnavailable, mapOf("error" to "WHISPER_DISABLED"))
            val tempInput = File(config.workDir, "upload-${UUID.randomUUID()}.bin")
            receiveSingleFile(call, tempInput)
            try {
                val text = whisper.transcribe(tempInput)
                events.broadcast("transcription", "Hoàn tất bóc tách audio cho ${session.user.username ?: session.user.id}")
                call.respond(mapOf("text" to text))
            } finally { tempInput.delete() }
        }

        post("/render") {
            com.example.server.security.requireSession(sessions) ?: return@post
            if (!flags.get().renderHardsubEnabled) return@post call.respond(HttpStatusCode.ServiceUnavailable, mapOf("error" to "RENDER_DISABLED"))
            val input = File(config.workDir, "video-${UUID.randomUUID()}.mp4")
            val srt = File(config.workDir, "subtitle-${UUID.randomUUID()}.srt")
            receiveRenderParts(call, input, srt)
            val output = File(config.workDir, "render-${UUID.randomUUID()}.mp4")
            try {
                val result = ffmpeg.renderHardsub(input, srt, output)
                events.broadcast("render", "Render hardsub hoàn tất", result.output.name)
                call.response.headers.append("X-Render-Duration-Ms", result.durationMs.toString())
                output.deleteOnExit()
                call.respondFile(output)
            } finally {
                input.delete(); srt.delete()
            }
        }

        route("/admin") {
            post("/maintenance") {
                requireAdmin(sessions) ?: return@post
                val req = call.receive<AdminActionRequest>()
                val status = flags.setMaintenance(req.enabled, req.message)
                events.broadcast("maintenance", if (req.enabled) "Bật maintenance" else "Tắt maintenance")
                call.respond(status)
            }
            post("/features") {
                requireAdmin(sessions) ?: return@post
                val req = call.receive<FeatureToggleRequest>()
                val features = flags.update(req.geminiEnabled, req.whisperEnabled, req.renderHardsubEnabled)
                events.broadcast("features", "Đã cập nhật feature flags")
                call.respond(features)
            }
        }
    }

    webSocket("/ws/events") {
        val token = call.request.queryParameters["token"]
        if (sessions.get(token) == null) {
            close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Unauthorized"))
            return@webSocket
        }
        events.connect(this)
        try {
            send(Frame.Text("{\"type\":\"hello\",\"message\":\"connected\"}"))
            for (frame in incoming) {
                if (frame is Frame.Text && frame.readText() == "ping") send(Frame.Text("pong"))
            }
        } finally { events.disconnect(this) }
    }
}

private suspend fun receiveSingleFile(call: ApplicationCall, target: File) {
    val multipart = call.receiveMultipart(formFieldLimit = 200L * 1024 * 1024)
    var found = false
    multipart.forEachPart { part ->
        when (part) {
            is PartData.FileItem -> { part.provider().copyAndClose(target.writeChannel()); found = true }
            else -> Unit
        }
        part.dispose()
    }
    if (!found) error("Multipart file part không tồn tại")
}

private suspend fun receiveRenderParts(call: ApplicationCall, video: File, srt: File) {
    val multipart = call.receiveMultipart(formFieldLimit = 200L * 1024 * 1024)
    var videoFound = false; var srtFound = false
    multipart.forEachPart { part ->
        if (part is PartData.FileItem) {
            val name = part.name?.lowercase() ?: ""
            val target = when {
                name.contains("srt") || part.originalFileName?.endsWith(".srt", ignoreCase = true) == true -> srt
                else -> video
            }
            part.provider().copyAndClose(target.writeChannel())
            if (target == srt) srtFound = true else videoFound = true
        }
        part.dispose()
    }
    require(videoFound && srtFound) { "Cần multipart 'video' và 'srt'" }
}
