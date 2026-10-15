# Cloudflare Pages + Worker + Pipeline

- Pages: static KMP TMA + React `/pipeline/`.
- Pages Functions: `/api/*` và `/telegram/webhook` -> `API_WORKER` Service Binding.
- Worker: edge gateway -> Ktor `BACKEND_ORIGIN`.
- Worker KV: `BOT_STATE` OTP 60s + `CONFIG_SOT` SOT snapshot.
- Heavy compute (FFmpeg, Whisper, Scrapy, strict build dry-run) chạy ở Ktor/local pipeline agent, không chạy trực tiếp trong Workers runtime.

## Provision resource lần đầu

Sau khi `wrangler login`/đã có API token:

```bash
./scripts/provision-cloudflare.sh
```

hoặc PowerShell:

```powershell
./scripts/provision-cloudflare.ps1
```

Hai KV namespace và R2 bucket phải tồn tại trước khi deploy Worker vì Wrangler cần binding ID thật.

## Deploy order

1. Provision KV/R2 và thay binding IDs thật.
2. Tạo secrets `BACKEND_ORIGIN`, `BOT_TOKEN`, `EDGE_SHARED_SECRET`.
3. Deploy Worker.
4. Deploy Pages (KMP TMA + React `/pipeline/`).
5. Chạy `scripts/register-telegram-worker-webhook.sh` với URL Worker.
6. Chỉ mở release thật khi strict dry-run đạt `NOMINAL`.
