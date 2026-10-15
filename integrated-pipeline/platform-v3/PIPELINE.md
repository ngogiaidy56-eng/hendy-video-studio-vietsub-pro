# Sandbox & Auto-Link Translation Pipeline

Luồng triển khai thực tế của scaffold:

1. React Pipeline UI chạy trên Cloudflare Pages tại `/pipeline/`.
2. UI gọi same-origin `/api/pipeline/dry-run`, Pages Function chuyển request qua Service Binding `API_WORKER`, Worker proxy tới Ktor.
3. Ktor là sandbox executor: AutoPatch SOT -> Strict Dry-Run -> Recovery backup -> phát event WebSocket.
4. Local developer agent `pipeline-agent` lắng nghe `127.0.0.1:8799`; `extractor.ts` gọi `scrapy_extract.py` để bóc text từ URL. Browser chỉ kết nối `ws://127.0.0.1:8799` trong môi trường dev.
5. OCR ảnh dùng `POST /api/translate`/Gemini và transcription dùng `POST /api/transcribe`/Whisper đã có trong Ktor.
6. Release chỉ nên được gọi khi pipeline trả `NOMINAL`. CI có thể biến gate này thành required check trước deploy Pages.

## Secrets

Không đặt Bot Token, OpenAI key, Gemini key hoặc backend origin vào Git. Sử dụng Cloudflare secrets/GitHub Actions secrets/Ktor environment.

## Telegram

Worker nhận `/telegram/webhook`, `/start` và `/token`. `/token` sinh OTP 6 ký tự, TTL 60 giây trong KV. `MINI_APP_URL` và `ADMIN_ID` là biến cấu hình, không hard-code.

## R2 / video

Video lớn không nên đi xuyên qua Cloudflare Worker. Hãy dùng R2 direct upload/presigned flow hoặc Ktor storage. Worker phù hợp để chuyển manifest, trạng thái job và log; R2 binding có thể thêm vào `r2Storage.ts` ở bước triển khai thật.

## Release gate

CI/CD phải giữ deploy bị khóa khi dry-run thất bại. `scripts/release-gate.sh` / `.ps1` làm hard gate trước bước deploy nếu pipeline result không phải `NOMINAL` + `RELEASE_UNLOCKED`.
