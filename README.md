# Content Scheduler

Public calendar for Magnet phone drops. Videos are built with Cursor/Claude via Magnet `animations/` scripts; the AI pushes them to UploadThing with the CLI (same `UTApi` pattern as Astro).

See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Setup

```bash
cp .env.example .env   # UPLOADTHING_TOKEN + INBOX_SECRET
npm install
npm run dev
```

Edit phones in `src/lib/devices.ts`.

## Deploy (Vercel)

Import **this** repo on Vercel (Framework: Astro). Set env vars:

- `UPLOADTHING_TOKEN`
- `INBOX_SECRET`
- optional: `BLOB_READ_WRITE_TOKEN` (durable schedule on serverless)

Root directory = repo root (not a subfolder).

## Push a video

```bash
npm run send -- --to slim-fr --at "2026-10-21 09:00" --title "tinder reverse" \
  /path/to/video.mp4
```

Without `SCHEDULER_URL`, the CLI writes `data/schedule.json` (gitignored). With `SCHEDULER_URL` + `INBOX_SECRET`, it POSTs to the deployed API.

## Phone

Open the webapp, pick your device (stored in `localStorage`). Calendar = today + 7 days.

Shortcuts inbox: `GET /api/inbox/<deviceId>`.
