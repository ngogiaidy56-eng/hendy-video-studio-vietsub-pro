# Integrated pipeline (Kotlin Multiplatform)

This folder contains a separate native-app build scaffold alongside the Node/React monorepo. It is not included in npm workspaces. The JVM/Kotlin modules provide shared model and player integration points; iOS archive builds require an Xcode project and signing secrets.

- `core/`: shared models and timeline primitives.
- `composeApp/`: shared Compose screen.
- `androidApp/`: Android launcher with Media3 dependency.
- `iosApp/`: AVKit player adapter and Fastlane lane scaffold.
- `desktopApp/`: JVM desktop launcher.
- `server-platform-vietsub-bot-hendy/`: existing Ktor backend starter.

Build Android from this directory with `gradle :androidApp:assembleDebug`. A Gradle wrapper is not included; use an installed Gradle or add a pinned wrapper before CI production use.
