# Content Scheduler

Public calendar for Magnet phone drops. Videos are built with Cursor/Claude via `animations/` scripts; the AI pushes them to UploadThing with the CLI (same `UTApi` pattern as the Astro project).

See [docs/CONTENT_SCHEDULER.md](../docs/CONTENT_SCHEDULER.md).

## Setup

```bash
cd content-scheduler
cp .env.example .env   # UPLOADTHING_TOKEN + INBOX_SECRET
npm install
npm run dev
```

Edit phones in `src/lib/devices.ts`.

## Push a video

```bash
npm run send -- --to slim-fr --at "2026-10-21 09:00" --title "tinder reverse" \
  ../.claude/skills/montage-green-screen/out/reversed-tinder-7.mp4
```

Without `SCHEDULER_URL`, the CLI writes `data/schedule.json` (gitignored). With `SCHEDULER_URL` + `INBOX_SECRET`, it POSTs to the deployed API.

## Phone

Open the webapp, pick your device (stored in `localStorage`). Calendar = today + 7 days.

Shortcuts inbox: `GET /api/inbox/<deviceId>`.
