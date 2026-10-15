plugins {
    id("org.jetbrains.compose")
    kotlin("jvm")
    application
}

kotlin { jvmToolchain(21) }
application { mainClass.set("com.example.desktopApp.MainKt") }

dependencies {
    implementation(project(":composeApp"))
    implementation(compose.desktop.currentOs)
}
