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
| Mini-app Vercel (`content-scheduler/`) | Calendrier, filtre device / pays, API inbox |
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

## Envoi (AI)

La vidéo ne passe **pas** par le body d’une fonction Vercel (limite 4,5 Mo). Même approche que Astro (`UTApi.uploadFiles` → `ufsUrl`) :

```bash
cd content-scheduler
npm run send -- --to slim-fr --at "2026-10-21 09:00" --title "tinder reverse" ../.claude/skills/montage-green-screen/out/reversed-tinder-7.mp4
```

1. CLI lit le mp4 local (sortie d’un script `animations/`).
2. `UTApi.uploadFiles` → UploadThing → `ufsUrl` + `key`.
3. `POST /api/items` (secret `INBOX_SECRET`) enregistre `{ deviceId, country, title, url, fileKey, publishAt }`.

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

- Astro + adapter Vercel
- UploadThing (`uploadthing/server`, `UTApi`) — miroir du flux Astro
- Schedule : fichier local `data/schedule.json` en dev ; Vercel Blob en prod si `BLOB_READ_WRITE_TOKEN` est set

## Ordre d’implémentation

1. Scaffold `content-scheduler/` + devices hardcodés + schedule store
2. API `items` / `inbox` + CLI `send`
3. UI calendrier (today + 7j) + sélecteur device
4. Raccourci iPhone de test
