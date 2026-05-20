# Pulsebox Stream Backend

A dedicated Node.js backend for long-lived YouTube audio extraction + proxy streaming.

## Why this exists

Serverless platforms often suspend long-running media proxy requests. This backend is designed to run on a persistent Node host (Render) so Android Chrome background playback is more stable.

## Endpoints

- `GET /health` -> health check
- `GET /api/youtube/audio/:videoId` -> returns `{ "url": "..." }`
- `GET /api/stream/:videoId` -> streams audio (supports `Range` header)

## Run locally

1. Copy `.env.example` to `.env`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start server:
   ```bash
   npm run dev
   ```

Default local port: `8080`.

## Render deploy

Use `render.yaml` from this folder or configure manually:

- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Node version: `20`

After deploy, set frontend env:

- `NEXT_PUBLIC_STREAM_BACKEND_URL=https://your-render-service.onrender.com`

Then restart your Next.js frontend.
