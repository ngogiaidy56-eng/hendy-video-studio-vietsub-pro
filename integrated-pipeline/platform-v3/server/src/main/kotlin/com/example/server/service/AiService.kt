package com.example.server.service

import com.example.core.model.TranslationRequest
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.url
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Serializable
private data class GeminiResponse(val candidates: List<GeminiCandidate> = emptyList())
@Serializable
private data class GeminiCandidate(val content: GeminiContent? = null)
@Serializable
private data class GeminiContent(val parts: List<GeminiPart> = emptyList())
@Serializable
private data class GeminiPart(val text: String? = null)

class AiService(
    private val client: HttpClient,
    private val apiKey: String,
    private val model: String,
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun extractTextFromImage(bytes: ByteArray, mimeType: String): String {
        require(apiKey.isNotBlank()) { "GEMINI_API_KEY chưa được cấu hình" }
        val prompt = "OCR ảnh. Trích xuất nguyên văn toàn bộ chữ nhìn thấy, giữ dòng khi hợp lý. Chỉ trả về văn bản, không giải thích."
        val encoded = java.util.Base64.getEncoder().encodeToString(bytes)
        val body = buildJsonObject {
            put("contents", kotlinx.serialization.json.buildJsonArray {
                add(buildJsonObject {
                    put("parts", kotlinx.serialization.json.buildJsonArray {
                        add(buildJsonObject { put("text", prompt) })
                        add(buildJsonObject {
                            put("inline_data", buildJsonObject {
                                put("mime_type", mimeType)
                                put("data", encoded)
                            })
                        })
                    })
                })
            })
        }
        val response = client.post("https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent") {
            parameter("key", apiKey)
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val raw = response.body<String>()
        val parsed = json.decodeFromString<GeminiResponse>(raw)
        return parsed.candidates.firstOrNull()?.content?.parts?.firstOrNull()?.text?.trim()
            ?: error("Gemini OCR không trả về nội dung")
    }

    suspend fun translate(request: TranslationRequest): String {
        require(apiKey.isNotBlank()) { "GEMINI_API_KEY chưa được cấu hình" }
        val system = "Bạn là biên tập viên phụ đề. Dịch tự nhiên, giữ nguyên ngữ nghĩa, tên riêng và thuật ngữ. Chỉ trả về bản dịch, không giải thích."
        val prompt = buildString {
            append(system).append('\n')
            append("Ngôn ngữ nguồn: ").append(request.sourceLanguage).append('\n')
            append("Ngôn ngữ đích: ").append(request.targetLanguage).append('\n')
            if (request.context.isNotBlank()) append("Ngữ cảnh: ").append(request.context).append('\n')
            append("Văn bản: ").append(request.text)
        }
        val body = buildJsonObject {
            put("contents", kotlinx.serialization.json.buildJsonArray {
                add(buildJsonObject {
                    put("parts", kotlinx.serialization.json.buildJsonArray { add(buildJsonObject { put("text", prompt) }) })
                })
            })
        }
        val response = client.post("https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent") {
            parameter("key", apiKey)
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val raw = response.body<String>()
        val parsed = json.decodeFromString<GeminiResponse>(raw)
        return parsed.candidates.firstOrNull()?.content?.parts?.firstOrNull()?.text?.trim()
            ?: error("Gemini không trả về nội dung")
    }
}
