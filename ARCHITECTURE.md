# CONTENT SCHEDULER

Planifie des vidéos Magnet vers des comptes (TikTok / Instagram), filtrées par compte et pays.

Les vidéos sont **construites dans Cursor / Claude** avec les scripts de `animations/` (content-machine, montage-green-screen, etc.). L’IA **pousse ensuite le fichier vers UploadThing** via le CLI, enregistre le créneau dans la mini-app, et si le compte est lié à **Postiz**, planifie aussi la publication auto.

Pas dans l’app Expo. Dossier dédié : `magnet-content-scheduler/`. Doc miroir Magnet : `docs/CONTENT_SCHEDULER.md`.

## Architecture

```text
animations/  →  CLI (AI)  →  UploadThing (fichier + schedule.json)
                    │                  ↓
                    │         webapp Vercel (calendrier / inbox)
                    │
                    └─→  Postiz (si postizIntegrationId) → IG / TT
```

| Pièce | Rôle |
| --- | --- |
| Scripts `animations/` | Claude / Cursor produit le mp4 |
| CLI `send` | Upload UploadThing + schedule JSON (+ Postiz si lié) |
| UploadThing | Vidéos + `magnet-schedule.json` / `magnet-devices.json` |
| Postiz | Publication auto sur canaux connectés |
| Mini-app Vercel | UI + API lecture schedule ; badge **Postiz** sur comptes liés |
| Téléphone | Lien public / raccourci Photos (comptes non-Postiz ou secours) |

## Comptes

Objet **compte** dans `magnet-devices.json` : `name`, `platform`, `country`, `warmupStartedAt`, `postizIntegrationId`.

- Badge UI **Postiz** si `postizIntegrationId` renseigné.
- Lier : `npm run link-postiz -- --to <id> --integration <postizId>`
- **Warm-up** : `send` refuse les comptes avec `warmupStartedAt`.

## Créneaux (fuseau du pays)

`--at` = heure locale du compte. Uniquement **09:00** ou **19:00**.

| Pays | Fuseau |
| --- | --- |
| FR | `Europe/Paris` |
| US | `America/New_York` (ET) |
| UK | `Europe/London` |

Jamais deux vidéos au même slot sur le même compte. Max 2 / jour / compte.

```bash
npm run next-slot -- --to yanndatingcoach-fr   # Paris
npm run next-slot -- --to antoine-dating-us    # ET
```

## Envoi

```bash
cd /Users/slim/dev/magnet-content-scheduler
npm run send -- --to yanndatingcoach-fr --at "2026-10-21 09:00" --title "…" ./video.mp4
```

1. SHA-256 du mp4 → refuse si les **mêmes bits** sont déjà au schedule sur le même compte ou un autre compte de la **même plateforme** (TT×TT / IG×IG). TT + IG avec le même fichier = OK. Couvre le calendrier téléphone **et** le dual-schedule Postiz (refus avant tout upload).
2. Upload mp4 → UploadThing.
3. Append `magnet-schedule.json` (champ `contentHash`).
4. Si Postiz lié + `POSTIZ_API_KEY` → upload + `POST /public/v1/posts` au même `publishAt`, caption = `--title` + `#tinder` (`formatPostizCaption`).
5. Webapp relit le JSON. Aucun redeploy.

**Caption Postiz** : toujours le titre de la vidéo puis `#tinder` (deux paragraphes). Rafraîchir la queue entière : `npx tsx scripts/refresh-postiz-captions.ts` (supprime les QUEUE des comptes liés, puis `sync-postiz --keep-times`).

**Anti-doublon** : Postiz n’expose pas de hash média — la source de vérité est `contentHash` dans le schedule. Toujours passer par `npm run send` (pas un schedule Postiz MCP seul) pour garder la dédup.

## Env

| Variable | Rôle |
| --- | --- |
| `UPLOADTHING_TOKEN` | CLI + Vercel |
| `POSTIZ_API_KEY` | Dual-schedule Postiz **+** analytics web (`/api/analytics/*`, vues calendrier, `/performance`) — **CLI et Vercel** |
| `INBOX_SECRET` | Optionnel, `POST /api/items` |

### Analytics (Postiz)

- Calendrier : après paint, `GET /api/analytics/views?ids=…` (ne bloque pas le SSR).
- `/performance` : charts 7j — un par compte Postiz + total (`GET /api/analytics/performance?days=7`).
- Les nouveaux `send` / `sync-postiz` stockent `postizPostId` sur la ligne schedule pour matcher les vues.

## Stack

- Astro + adapter Vercel (UI)
- UploadThing (`UTApi`)
- Postiz Public API
