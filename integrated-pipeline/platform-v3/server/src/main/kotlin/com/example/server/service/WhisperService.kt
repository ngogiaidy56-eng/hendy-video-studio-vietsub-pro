package com.example.server.service

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.ContentType
import io.ktor.http.content.PartData
import io.ktor.http.content.HeadersBuilder
import kotlinx.serialization.Serializable
import java.io.File

@Serializable
private data class TranscriptionResponse(val text: String = "")

class WhisperService(
    private val client: HttpClient,
    private val apiKey: String,
    private val model: String,
) {
    suspend fun transcribe(audio: File): String {
        require(apiKey.isNotBlank()) { "OPENAI_API_KEY chưa được cấu hình" }
        val response: TranscriptionResponse = client.submitFormWithBinaryData(
            url = "https://api.openai.com/v1/audio/transcriptions",
            formData = formData {
                append("model", model)
                append("response_format", "json")
                append("file", audio.readBytes(), Headers.build {
                    append(HttpHeaders.ContentDisposition, "form-data; name=\"file\"; filename=\"${audio.name}\"")
                    append(HttpHeaders.ContentType, ContentType.Application.OctetStream.toString())
                })
            }
        ) {
            header(HttpHeaders.Authorization, "Bearer $apiKey")
        }.body()
        return response.text.trim()
    }
}
