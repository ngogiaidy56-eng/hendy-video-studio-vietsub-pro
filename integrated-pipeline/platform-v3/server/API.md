# API contract

## Telegram auth

`POST /api/auth/telegram`

```json
{ "initData": "query_id=...&user=...&auth_date=...&hash=..." }
```

Returns a short-lived application token. The backend validates the signature and `auth_date` first.

## Status

`GET /api/status`

## Translate

`POST /api/translate` with `Authorization: Bearer <token>`

```json
{
  "text": "Hello world",
  "sourceLanguage": "en",
  "targetLanguage": "vi",
  "context": "video subtitle"
}
```

## Transcribe

`POST /api/transcribe` multipart field `file`.

## Render

`POST /api/render` multipart fields `video` and `srt`. Returns the rendered MP4 bytes.

## Admin

`POST /api/admin/maintenance` and `POST /api/admin/features`, admin token required.

## WebSocket

`WS /ws/events?token=<session>` sends JSON `WsEvent` messages. The server rejects missing or expired session tokens.
