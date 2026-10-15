package com.example.server.pipeline

import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption

class RecoveryService(private val workDir: File) {
    fun backup(label: String, content: String): File {
        val dir = File(workDir, "recovery").apply { mkdirs() }
        val file = File(dir, "${sanitize(label)}-${System.currentTimeMillis()}.bak")
        file.writeText(content)
        return file
    }

    fun restore(backup: File, target: File): File {
        Files.copy(backup.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
        return target
    }

    private fun sanitize(value: String): String = value.replace(Regex("[^a-zA-Z0-9._-]"), "_").take(80)
}
