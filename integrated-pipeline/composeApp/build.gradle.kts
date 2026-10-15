plugins {
    kotlin("multiplatform")
    id("org.jetbrains.compose")
    id("org.jetbrains.kotlin.plugin.compose")
}
kotlin { jvm() }
dependencies {
    add("jvmMainImplementation", compose.desktop.currentOs)
    add("jvmMainImplementation", compose.material)
    add("jvmMainImplementation", project(":core"))
}
