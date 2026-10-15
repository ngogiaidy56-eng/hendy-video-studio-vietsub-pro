plugins {
    id("com.android.application")
    kotlin("android")
}

android {
    namespace = "com.example.androidapp"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.example.telegramvideoeditor"
        minSdk = 21
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }
}

dependencies {
    implementation(project(":composeApp"))
    implementation("androidx.activity:activity-compose:1.12.2")
    implementation("androidx.media3:media3-exoplayer:1.11.0")
    implementation("androidx.media3:media3-ui:1.11.0")
}
