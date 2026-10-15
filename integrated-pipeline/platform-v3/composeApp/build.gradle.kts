plugins {
    kotlin("multiplatform")
    id("com.android.library")
    id("org.jetbrains.compose")
    id("org.jetbrains.kotlin.plugin.compose")
}

kotlin {
    androidTarget()
    jvm()
    listOf(iosX64(), iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "ComposeApp"
            isStatic = true
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation(project(":core"))
            implementation(compose.runtime)
            implementation(compose.foundation)
            implementation(compose.material3)
            implementation(compose.ui)
            implementation("io.insert-koin:koin-core:4.2.2")
            implementation("io.insert-koin:koin-compose:4.2.2")
        }
        androidMain.dependencies {
            implementation("androidx.activity:activity-compose:1.12.2")
            implementation("io.ktor:ktor-client-okhttp:3.6.0")
        }
        jvmMain.dependencies {
            implementation("io.ktor:ktor-client-java:3.6.0")
        }
        iosMain.dependencies {
            implementation("io.ktor:ktor-client-darwin:3.6.0")
        }
    }
}

android {
    namespace = "com.example.composeapp"
    compileSdk = 36
    defaultConfig { minSdk = 21 }
}
