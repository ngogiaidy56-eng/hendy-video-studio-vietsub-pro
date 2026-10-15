package com.hendy.server

import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun main() {
    val port = System.getenv("KMP_SERVER_PORT")?.toIntOrNull() ?: 8081
    embeddedServer(Netty, port = port, host = "0.0.0.0", module = Application::module).start(wait = true)
}

fun Application.module() {
    routing {
        get("/health") { call.respond(mapOf("status" to "ok", "service" to "hendy-kmp-server")) }
        get("/api/v1/capabilities") {
            call.respond(mapOf("subtitle" to true, "renderQueue" to false, "telegram" to false,
                "note" to "Ktor starter endpoints; wire shared services before production."))
        }
    }
}
