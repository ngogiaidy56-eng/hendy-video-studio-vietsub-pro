package com.example.composeapp

import com.example.core.data.InMemorySessionRepository
import com.example.core.data.InMemorySubtitleRepository
import com.example.core.data.InMemorySystemConfigRepository
import com.example.core.network.SubtitleApiClient
import io.ktor.client.HttpClient
import org.koin.core.module.Module
import org.koin.dsl.module

fun appModule(baseUrl: String): Module = module {
    single { HttpClient() }
    single { InMemorySubtitleRepository() }
    single { InMemorySystemConfigRepository() }
    single { InMemorySessionRepository() }
    single { SubtitleApiClient(get(), baseUrl) }
}
