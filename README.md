# Content Scheduler

Public calendar for Magnet phone drops. Videos are built in Magnet (`animations/` / montage skills); the AI pushes them here with the CLI.

**Storage:** UploadThing only (videos + a single `schedule.json`). No Vercel Blob, no redeploy when you push a video. Vercel just hosts the UI/API that *reads* UploadThing.

See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Setup

```bash
cp .env.example .env   # UPLOADTHING_TOKEN
npm install
npm run dev
```

On Vercel: set `UPLOADTHING_TOKEN` only. Framework Astro, root `/`.

Edit phones in `src/lib/devices.ts`.

## Push a video (no redeploy)

```bash
npm run send -- --to slim-fr --at "2026-10-21 09:00" --title "tinder reverse" \
  /path/to/video.mp4
```

`--to` picks the device (and its country). `--at` is publish time. That updates the schedule file on UploadThing; the live site picks it up on the next load.

## Phone

Open the webapp, pick your device (`localStorage`). Calendar = today + 7 days.

Shortcuts inbox: `GET /api/inbox/<deviceId>`.
