package com.example.server

import com.example.core.data.InMemorySystemConfigRepository
import com.example.core.network.*
import com.example.server.config.AppConfig
import com.example.server.routes.apiRoutes
import com.example.server.service.*
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.*
import io.ktor.server.plugins.calllogging.CallLogging
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.response.respond
import io.ktor.server.request.receive
import io.ktor.server.routing.routing
import io.ktor.server.request.path
import io.ktor.server.websocket.WebSockets
import io.ktor.server.netty.Netty
import kotlinx.serialization.json.Json
import io.ktor.http.HttpStatusCode
import java.security.MessageDigest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import io.ktor.client.HttpClient
import io.ktor.client.engine.cio.CIO
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation as ClientContentNegotiation

fun main() {
    val port = System.getenv("PORT")?.toIntOrNull() ?: 8080
    io.ktor.server.engine.embeddedServer(Netty, port = port, host = "0.0.0.0", module = Application::module).start(wait = true)
}

fun Application.module() {
    val config = AppConfig.fromEnv()
    val systemRepo = InMemorySystemConfigRepository()
    systemRepo.setFeatures(com.example.core.model.FeatureConfig(
        geminiEnabled = config.geminiApiKey.isNotBlank(),
        whisperEnabled = config.openAiApiKey.isNotBlank(),
        renderHardsubEnabled = config.ffmpegBin.isNotBlank(),
    ))
    val flags = FeatureFlagService(systemRepo)
    val adminService = TelegramAdminService(config.telegramAdminIds)
    val sessions = TelegramSessionService(adminService)
    val eventStream = EventStreamService()
    val autoPatch = AutoPatchService()
    val dryRun = StrictDryRunService(config.pipelineProjectDir, config.pipelineDryRunCommand)
    val recovery = RecoveryService(config.workDir)
    val sotJson = this.environment.classLoader.getResource("sot/config.json")?.readText() ?: "{}"
    val pipeline = PipelineOrchestrator(autoPatch, dryRun, recovery, sotJson)
    val httpClient = HttpClient(CIO) {
        install(ClientContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
    }
    val telegramAuth = TelegramAuthValidatorJvm(
        TelegramInitDataValidatorConfig(config.telegramBotToken, config.telegramInitDataMaxAgeSeconds)
    )
    val whisper = WhisperService(httpClient, config.openAiApiKey, config.transcriptionModel)
    val ai = AiService(httpClient, config.geminiApiKey, config.geminiModel)
    val ffmpeg = FFmpegService(config.ffmpegBin, config.workDir)
    val bot = TelegramBotService(httpClient, config.telegramBotToken, config.telegramWebhookUrl, config.telegramWebhookSecret, adminService, flags, eventStream, config.workDir)

    install(CallLogging)
    install(ContentNegotiation) {
        json(Json { prettyPrint = false; ignoreUnknownKeys = true; encodeDefaults = true })
    }
    install(CORS) {
        config.corsAllowedOrigins.forEach { origin -> allowHost(origin.removePrefix("https://").removePrefix("http://"), schemes = listOf("http", "https")) }
        allowHeader(HttpHeaders.Authorization)
        allowHeader(HttpHeaders.ContentType)
        allowMethod(HttpMethod.Get)
        allowMethod(HttpMethod.Post)
        allowCredentials = false
    }
    install(StatusPages) {
        exception<IllegalArgumentException> { call, cause -> call.respond(HttpStatusCode.BadRequest, mapOf("error" to (cause.message ?: "BAD_REQUEST"))) }
        exception<Throwable> { call, cause -> log.error("Unhandled request error", cause); call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "INTERNAL_SERVER_ERROR")) }
    }
    install(WebSockets)

    MaintenanceInterceptor.install(this, systemRepo)

    routing {
        post("/telegram/webhook") {
            val expected = config.telegramWebhookSecret
            val supplied = call.request.headers["X-Telegram-Bot-Api-Secret-Token"].orEmpty()
            if (expected.toByteArray(Charsets.UTF_8).size < 32 ||
                !MessageDigest.isEqual(expected.toByteArray(Charsets.UTF_8), supplied.toByteArray(Charsets.UTF_8))) {
                call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "INVALID_TELEGRAM_WEBHOOK_SECRET"))
                return@post
            }
            val update = call.receive<com.example.server.service.TelegramUpdate>()
            bot.handle(update)
            call.respond(mapOf("ok" to true))
        }
        apiRoutes(config, flags, sessions, telegramAuth, whisper, ai, ffmpeg, eventStream, pipeline, autoPatch)
        get("/health") { call.respond(mapOf("ok" to true, "service" to "telegram-video-editor")) }
    }

    if (config.telegramRegisterWebhook) CoroutineScope(Dispatchers.IO).launch { bot.initialize() }
}
