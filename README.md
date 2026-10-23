# Content Scheduler

Public calendar for Magnet phone drops. Videos are built in Magnet (`animations/` / montage skills); the AI pushes them here with the CLI.

**Storage:** UploadThing only (videos + a single `schedule.json`). No Vercel Blob, no redeploy when you push a video. Vercel just hosts the UI/API that *reads* UploadThing.

See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Setup

```bash
cp .env.example .env   # set UPLOADTHING_TOKEN (required to push)
npm install
npm run dev
```

### Env vars

| Variable | Required | Where |
| --- | --- | --- |
| `UPLOADTHING_TOKEN` | **Yes** (CLI push + Vercel) | Same token as Astro — UploadThing dashboard → API keys |
| `POSTIZ_API_KEY` | Dual-schedule + analytics | CLI `.env` **and** Vercel (calendar views, `/performance`) |
| `INBOX_SECRET` | No | Only if you call `POST /api/items` over HTTP |

```bash
# .env
UPLOADTHING_TOKEN=eyJ…
POSTIZ_API_KEY=…   # also set on Vercel for views / performance
# INBOX_SECRET=…   # optional
```

On Vercel: set `UPLOADTHING_TOKEN` + `POSTIZ_API_KEY`. Framework Astro, root `/`.

Edit phones in `src/lib/devices.ts`.

## Push a video (no redeploy)

Needs `UPLOADTHING_TOKEN` in `.env`.

List devices (defaults + those registered in the web UI — same list as UploadThing):

```bash
npm run devices
```

```bash
npm run send -- --to slim-fr --at "2026-10-21 09:00" --title "tinder reverse" \
  /path/to/video.mp4
```

`--to` is a device **id** from that list. `--at` is publish time. Updates UploadThing; live site picks it up on next load.

**Language → device:** English video → `…-us` device; French video → `…-fr` device (when both exist for the same person).

Every `send` also runs a routine purge of videos older than **7 days**. Manual:

```bash
npm run clear-old
npm run clear-old -- --days 14
npm run clear-old -- --dry-run
```

## Phone

Open the webapp, pick your device (`localStorage`). Calendar = today + 7 days.

Shortcuts inbox: `GET /api/inbox/<deviceId>`.
