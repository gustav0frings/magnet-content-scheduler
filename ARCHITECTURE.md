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

## Devices (hardcodés)

Pas de tokens secrets dans l’URL. Les devices sont une liste fixe dans le code (`src/lib/devices.ts`), avec un **pays**.

Exemple :

| id | name | country |
| --- | --- | --- |
| `slim-fr` | Slim FR | FR |
| `lea-us` | Lea US | US |

L’URL de l’app est **publique**. Sur le web, la personne choisit quel device elle est ; le calendrier filtre automatiquement. Le choix est mémorisé en `localStorage`.

Chaque item de contenu porte `deviceId` + `country` (label / filtre).

## Calendrier UI

Par défaut : **jour courant + 7 jours suivants** (8 jours au total).

Filtres :

- device (sélecteur principal)
- pays (optionnel, dérivé des devices)

## Envoi (AI) — sans redeploy, sans Blob Vercel

La vidéo et le planning vivent sur **UploadThing** (plan free). Vercel n’héberge que le front.

```bash
cd /Users/slim/dev/magnet-content-scheduler
npm run send -- --to slim-fr --at "2026-10-21 09:00" --title "tinder reverse" ./video.mp4
```

1. CLI upload le mp4 → UploadThing (`ufsUrl` + `key`).
2. CLI lit/écrit le JSON de schedule sur UploadThing (`customId`: `magnet-content-schedule`) avec `deviceId`, `country`, `title`, `publishAt`.
3. La webapp Vercel fetch ce JSON à chaque requête. Aucun redeploy.

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

## Stack

- Astro + adapter Vercel (UI only)
- UploadThing : vidéos + `schedule.json` (`UTApi`, même pattern qu’Astro)
