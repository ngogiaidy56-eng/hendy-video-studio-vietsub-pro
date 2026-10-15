package com.example.server.config

import java.io.File

data class AppConfig(
    val port: Int,
    val publicBaseUrl: String,
    val corsAllowedOrigins: List<String>,
    val databaseUrl: String,
    val postgresHost: String,
    val postgresPort: Int,
    val postgresDb: String,
    val postgresUser: String,
    val postgresPassword: String,
    val redisUrl: String,
    val telegramBotToken: String,
    val telegramWebhookUrl: String,
    val telegramWebhookSecret: String,
    val telegramAdminIds: Set<Long>,
    val miniAppUrl: String,
    val webAppUrl: String,
    val coreBackendUrl: String,
    val openAiApiKey: String,
    val transcriptionModel: String,
    val geminiApiKey: String,
    val geminiModel: String,
    val ffmpegBin: String,
    val workDir: File,
    val telegramInitDataMaxAgeSeconds: Long,
    val telegramRegisterWebhook: Boolean,
    val pipelineProjectDir: File,
    val pipelineDryRunCommand: String,
    val edgeSharedSecret: String,
) {
    companion object {
        fun fromEnv(): AppConfig {
            val production = System.getenv("APP_ENV")?.equals("production", ignoreCase = true) == true
            if (production) {
                require(!System.getenv("POSTGRES_PASSWORD").isNullOrBlank()) { "POSTGRES_PASSWORD is required when APP_ENV=production" }
                val edgeSecret = System.getenv("EDGE_SHARED_SECRET").orEmpty()
                require(edgeSecret.toByteArray(Charsets.UTF_8).size >= 32) { "EDGE_SHARED_SECRET must be at least 32 bytes when APP_ENV=production" }
                if (!System.getenv("TELEGRAM_BOT_TOKEN").isNullOrBlank()) {
                    require(System.getenv("TELEGRAM_WEBHOOK_SECRET").orEmpty().toByteArray(Charsets.UTF_8).size >= 32) { "TELEGRAM_WEBHOOK_SECRET must be at least 32 bytes when Telegram bot is enabled in production" }
                }
            }
            return AppConfig(
            port = env("PORT", "8080").toInt(),
            publicBaseUrl = env("PUBLIC_BASE_URL", "http://localhost:8080"),
            corsAllowedOrigins = env("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:3000").split(',').map { it.trim() }.filter { it.isNotEmpty() },
            databaseUrl = env("DATABASE_URL", "jdbc:postgresql://postgres:5432/hendy_vietsub_db"),
            postgresHost = env("POSTGRES_HOST", "postgres"),
            postgresPort = env("POSTGRES_PORT", "5432").toIntOrNull() ?: 5432,
            postgresDb = env("POSTGRES_DB", "hendy_vietsub_db"),
            postgresUser = env("POSTGRES_USER", "hendy_admin"),
            postgresPassword = env("POSTGRES_PASSWORD", ""),
            redisUrl = env("REDIS_URL", "redis://redis:6379"),
            telegramBotToken = env("TELEGRAM_BOT_TOKEN", ""),
            telegramWebhookUrl = env("TELEGRAM_WEBHOOK_URL", ""),
            telegramWebhookSecret = env("TELEGRAM_WEBHOOK_SECRET", ""),
            telegramAdminIds = env("TELEGRAM_ADMIN_IDS", "").split(',').mapNotNull { it.trim().toLongOrNull() }.toSet(),
            miniAppUrl = env("MINI_APP_URL", "http://localhost:5173"),
            webAppUrl = env("WEB_APP_URL", "http://localhost:5173"),
            coreBackendUrl = env("CORE_BACKEND_URL", "http://localhost:8080"),
            openAiApiKey = env("OPENAI_API_KEY", ""),
            transcriptionModel = env("OPENAI_TRANSCRIPTION_MODEL", "whisper-1"),
            geminiApiKey = env("GEMINI_API_KEY", ""),
            geminiModel = env("GEMINI_MODEL", "gemini-3.5-flash"),
            ffmpegBin = env("FFMPEG_BIN", "ffmpeg"),
            workDir = File(env("WORK_DIR", "./server/data")).apply { mkdirs() },
            telegramInitDataMaxAgeSeconds = env("TELEGRAM_INITDATA_MAX_AGE_SECONDS", "86400").toLong(),
            telegramRegisterWebhook = env("TELEGRAM_REGISTER_WEBHOOK", "false").toBoolean(),
            pipelineProjectDir = File(env("PIPELINE_PROJECT_DIR", ".")),
            pipelineDryRunCommand = env("PIPELINE_DRY_RUN_COMMAND", "npm run dry-run --prefix pipeline-ui"),
            edgeSharedSecret = env("EDGE_SHARED_SECRET", ""),
            )
        }

        private fun env(name: String, default: String) = System.getenv(name)?.takeIf { it.isNotBlank() } ?: default
    }
}
