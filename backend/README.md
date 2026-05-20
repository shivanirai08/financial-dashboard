# Pulsebox Stream Backend

A persistent Node.js backend for YouTube audio URL extraction using `yt-dlp-wrap`.

## Architecture

- Extract with `yt-dlp` (`-J`, best audio format filter)
- Pick mobile-friendly audio-only format (prefers m4a/webm)
- Validate URL before returning
- Return direct `streamUrl` for frontend playback

## Endpoints

- `GET /health` -> health + extractor info
- `GET /api/youtube/audio/:videoId` -> returns `{ "streamUrl": "...", "url": "..." }`
- `GET /api/stream/:videoId` -> compatibility proxy stream route (supports `Range`)

## Notes

- `streamUrl` links are short-lived; cache TTL is intentionally limited.
- Backend revalidates cached URLs before reuse to reduce stale-link 404s.
- Frontend should use direct playback (`audio.src = streamUrl`) from `/api/youtube/audio/:videoId`.

## Bot Challenge Handling

If yt-dlp returns `Sign in to confirm you're not a bot`, provide YouTube cookies:

- `YTDLP_COOKIES_FILE`: absolute path to a cookies.txt file
- `YTDLP_COOKIES_B64`: base64-encoded cookies.txt contents (backend writes to `/tmp/yt-cookies.txt`)

The API returns status `503` with code `YOUTUBE_BOT_CHALLENGE` when this challenge is detected.

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start server:
   ```bash
   npm run dev
   ```

Default port: `8080`.

## Render deploy

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Node version: `20`

Set frontend env:

- `NEXT_PUBLIC_STREAM_BACKEND_URL=https://your-render-service.onrender.com`
