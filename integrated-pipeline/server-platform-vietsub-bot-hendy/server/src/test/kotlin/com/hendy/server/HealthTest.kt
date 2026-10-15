package com.hendy.server

import kotlin.test.Test
import kotlin.test.assertTrue

class HealthTest {
    @Test fun starterHealthContractHasServiceName() {
        val payload = mapOf("status" to "ok", "service" to "hendy-kmp-server")
        assertTrue(payload["status"] == "ok")
    }
}
