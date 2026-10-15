package com.example.server

import com.example.core.data.InMemorySystemConfigRepository
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCallPipeline
import io.ktor.server.request.path
import io.ktor.server.response.respond

object MaintenanceInterceptor {
    fun install(app: Application, repo: InMemorySystemConfigRepository) {
        app.intercept(ApplicationCallPipeline.Plugins) {
            val path = call.request.path()
            val protectedUserApi = path.startsWith("/api/") &&
                path !in setOf("/api/status", "/api/auth/telegram") &&
                !path.startsWith("/api/admin/")
            if (repo.maintenance.value.enabled && protectedUserApi) {
                call.respond(HttpStatusCode.ServiceUnavailable, repo.maintenance.value)
                finish()
            }
        }
    }
}
