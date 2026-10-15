package com.example.core.network

import com.example.core.model.*
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.*
import io.ktor.client.request.forms.formData
import io.ktor.client.request.forms.submitFormWithBinaryData
import io.ktor.http.ContentType
import io.ktor.http.Headers
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType

class SubtitleApiClient(
    private val client: HttpClient,
    private val baseUrl: String,
) {
    suspend fun status(token: String? = null): AppStatus = client.get("$baseUrl/api/status") {
        token?.let { header(HttpHeaders.Authorization, "Bearer $it") }
    }.body()

    suspend fun authenticate(initData: String): AuthResponse = client.post("$baseUrl/api/auth/telegram") {
        contentType(ContentType.Application.Json)
        setBody(AuthRequest(initData))
    }.body()

    suspend fun translate(token: String, request: TranslationRequest): TranslationResponse = client.post("$baseUrl/api/translate") {
        bearerAuth(token)
        contentType(ContentType.Application.Json)
        setBody(request)
    }.body()


    suspend fun ocr(token: String, filename: String, bytes: ByteArray): ImageOcrResponse = client.submitFormWithBinaryData(
        url = "$baseUrl/api/ocr",
        formData = formData {
            append("file", bytes, Headers.build {
                append(HttpHeaders.ContentDisposition, "form-data; name=\"file\"; filename=\"$filename\"")
                append(HttpHeaders.ContentType, ContentType.Application.OctetStream.toString())
            })
        }
    ) { bearerAuth(token) }.body()

    suspend fun transcribe(token: String, filename: String, bytes: ByteArray): String = client.submitFormWithBinaryData(
        url = "$baseUrl/api/transcribe",
        formData = formData {
            append("file", bytes, Headers.build {
                append(HttpHeaders.ContentDisposition, "form-data; name=\"file\"; filename=\"$filename\"")
                append(HttpHeaders.ContentType, ContentType.Application.OctetStream.toString())
            })
        }
    ) { bearerAuth(token) }.body<Map<String, String>>()["text"].orEmpty()

    suspend fun render(token: String, videoFilename: String, videoBytes: ByteArray, srt: String): ByteArray = client.submitFormWithBinaryData(
        url = "$baseUrl/api/render",
        formData = formData {
            append("video", videoBytes, Headers.build {
                append(HttpHeaders.ContentDisposition, "form-data; name=\"video\"; filename=\"$videoFilename\"")
                append(HttpHeaders.ContentType, "video/mp4")
            })
            append("srt", srt.toByteArray(), Headers.build {
                append(HttpHeaders.ContentDisposition, "form-data; name=\"srt\"; filename=\"subtitle.srt\"")
                append(HttpHeaders.ContentType, "application/x-subrip")
            })
        }
    ) { bearerAuth(token) }.body<ByteArray>()

    suspend fun pipelineDryRun(token: String, request: PipelineRequest): PipelineResult = client.post("$baseUrl/api/pipeline/dry-run") {
        bearerAuth(token)
        contentType(ContentType.Application.Json)
        setBody(request)
    }.body()

    suspend fun pipelinePatch(token: String, request: AutoPatchRequest): AutoPatchResponse = client.post("$baseUrl/api/pipeline/patch") {
        bearerAuth(token)
        contentType(ContentType.Application.Json)
        setBody(request)
    }.body()

    suspend fun setMaintenance(token: String, request: AdminActionRequest): MaintenanceStatus = client.post("$baseUrl/api/admin/maintenance") {
        bearerAuth(token)
        contentType(ContentType.Application.Json)
        setBody(request)
    }.body()

    suspend fun setFeatures(token: String, request: FeatureToggleRequest): FeatureConfig = client.post("$baseUrl/api/admin/features") {
        bearerAuth(token)
        contentType(ContentType.Application.Json)
        setBody(request)
    }.body()
}
