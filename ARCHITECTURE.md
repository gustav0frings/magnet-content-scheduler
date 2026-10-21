# CONTENT SCHEDULER

Planifie des vidéos Magnet vers des téléphones (iOS / Android), filtrées par device et pays.

Les vidéos sont **construites dans Cursor / Claude** avec les scripts de `animations/` (content-machine, montage-green-screen, etc.). L’IA **pousse ensuite le fichier vers UploadThing** via le CLI, puis enregistre le créneau dans la mini-app.

Pas dans l’app Expo. Dossier dédié : `content-scheduler/`.

## Architecture

```text
animations/  →  CLI (AI)  →  UploadThing (fichier)
                    ↓
              content-scheduler API  →  schedule (JSON)
                    ↓
         webapp publique /d?device=…  +  raccourci iPhone
```

| Pièce | Rôle |
| --- | --- |
| Scripts `animations/` | Claude / Cursor produit le mp4 |
| CLI `content-scheduler` | L’IA upload le fichier chez UploadThing, puis enregistre le créneau |
| UploadThing | Stocke la vidéo, URL publique (`ufsUrl`) — même pattern que le projet Astro |
| Mini-app Vercel | UI + API qui **lisent** le schedule sur UploadThing (pas de stockage Vercel) |
| Téléphone | Ouvre le lien public, choisit son device ; raccourci iPhone peut auto-sauver dans Photos |

## Comptes

Un seul objet : le **compte** (UI). Fichier `magnet-devices.json`. Création : nom, `platform` (`instagram` | `tiktok`), pays, optionnel `warmupStartedAt`. Cookie pour le compte choisi. `/accounts` = la même liste.

Une vidéo → `deviceIds[]` (souvent IG + TT). CLI `--to a,b`.

### Routing langue → compte

- **EN** → compte US
- **FR** → compte FR
- **Warm-up** : ne jamais pousser vers un compte avec `warmupStartedAt` (encore en warm-up). `npm run send` refuse ces cibles. Uniquement les comptes prêts (`npm run devices` sans `warmup=`).

Exemples : `yanndtingcoach-fr`, `antoine-dating-us`, `corentin-nope-fr`, `kylliandatingexpert-fr`.

## Calendrier UI

Par défaut : **jour courant + 7 jours suivants** (8 jours au total).

Filtres : compte, pays.

**Publiée** : coche + libellé Publiée / Non publiée (EN : Published / Not published). Télécharger marque publiée et grise le bouton. La coche marque ou annule, sans télécharger. `publishedAt` sur l’item. `POST /api/items/published` `{ "id", "published" }`. Distinct de `savedAt`.

## Envoi (AI) — sans redeploy, sans Blob Vercel

La vidéo et le planning vivent sur **UploadThing** (plan free). Vercel n’héberge que le front.

```bash
cd /Users/slim/dev/magnet-content-scheduler
npm run send -- --to slim-fr --at "2026-10-21 09:00" --title "tinder reverse" ./video.mp4
```

1. CLI upload le mp4 → UploadThing (`ufsUrl` + `key`).
2. CLI lit/écrit `magnet-schedule.json` sur UploadThing avec `deviceId`, `country`, `title`, `publishAt`.
3. La webapp Vercel relit ce JSON à chaque requête. Aucun redeploy.

## Inbox téléphone

`GET /api/inbox/:deviceId` — vidéos de ce device dont `publishAt` est passé et pas encore `saved`.

```json
{ "items": [{ "id": "abc", "url": "https://xxxx.ufs.sh/f/…", "title": "…" }] }
```

`POST /api/inbox/:deviceId/done` — `{ "id": "abc" }` pour ne pas re-télécharger.

## iPhone (optionnel, auto Photos)

App **Raccourcis** (carré violet) :

1. GET `/api/inbox/<deviceId>`
2. Pour chaque item : télécharger l’URL → Enregistrer dans Récents
3. POST `/done`
4. Automatisation heure fixe, sans demander confirmation

## Env vars (requis pour push)

Fichier : `.env` (voir `.env.example`). Dupliqué aussi dans Magnet : `docs/CONTENT_SCHEDULER.md`.

| Variable | Où | Rôle |
| --- | --- | --- |
| `UPLOADTHING_TOKEN` | **CLI local** (obligatoire pour `npm run send`) + **Vercel** | Upload vidéo + lecture/écriture du schedule JSON. Même token que le projet Astro (dashboard UploadThing → API keys). |
| `INBOX_SECRET` | Optionnel | Protège `POST /api/items` si enregistrement via HTTP au lieu du CLI |

```bash
# .env
UPLOADTHING_TOKEN=eyJ…   # required to push
# INBOX_SECRET=…         # optional
```

Sans `UPLOADTHING_TOKEN`, `npm run send` échoue. Pas de Blob Vercel, pas de `SCHEDULER_URL`.

## Stack

- Astro + adapter Vercel (UI only)
- UploadThing : vidéos + `schedule.json` (`UTApi`, même pattern qu’Astro)
