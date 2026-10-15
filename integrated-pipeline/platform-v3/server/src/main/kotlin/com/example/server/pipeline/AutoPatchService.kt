package com.example.server.pipeline

import com.example.core.model.AutoPatchResponse
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

class AutoPatchService(private val json: Json = Json { prettyPrint = true; encodeDefaults = true }) {
    private val hex = Regex("^#[0-9a-fA-F]{6}$")

    fun patch(raw: String): AutoPatchResponse {
        val changes = mutableListOf<String>()
        val root = json.parseToJsonElement(raw).jsonObject.toMutableMap()

        val previousFont = root["fontFamily"]?.jsonPrimitive?.contentOrNull
        root["fontFamily"] = JsonPrimitive("CapCut Sans Text")
        if (previousFont != "CapCut Sans Text") changes += "fontFamily -> CapCut Sans Text"

        root.entries.toList().forEach { (key, element) ->
            val value = element.jsonPrimitiveOrNull() ?: return@forEach
            if (key.contains("endpoint", ignoreCase = true) || key.endsWith("url", ignoreCase = true)) {
                val normalized = value.trimEnd('/')
                if (normalized != value) {
                    root[key] = JsonPrimitive(normalized)
                    changes += "$key: bỏ dấu '/' cuối endpoint"
                }
            }
        }

        val colors = root["colors"]?.let { runCatching { it.jsonObject }.getOrNull() }?.toMutableMap() ?: mutableMapOf()
        val defaults = mapOf(
            "--dark-background-color" to "#17171a",
            "--dark-container-background-color" to "#232324",
        )
        defaults.forEach { (key, fallback) ->
            val current = colors[key]?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }
            if (current == null || !hex.matches(current)) {
                colors[key] = JsonPrimitive(fallback)
                changes += "$key: HEX không hợp lệ -> $fallback"
            }
        }
        root["colors"] = JsonObject(colors)

        val normalized = JsonObject(root)
        return AutoPatchResponse(
            valid = true,
            patchedConfig = json.encodeToString(JsonObject.serializer(), normalized),
            changes = changes.distinct(),
        )
    }

    private fun kotlinx.serialization.json.JsonElement.jsonPrimitiveOrNull(): String? =
        runCatching { jsonPrimitive.contentOrNull }.getOrNull()
}
