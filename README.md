# LIPB VFR hangar board

A hangar board for **Bolzano / Bozen (LIPB)** so VFR pilots can see when the ATZ and the Valle Adige sector are free between IFR movements.

It merges the published SkyAlps seasonal timetable with the live FlightAware arrivals/departures board, draws the resulting holes on a timeline, overlays decoded METAR/TAF, and publishes subscribeable calendars. Shared club use — no accounts, no database.

Planning aid only. Confirm with Bolzano AFIU **120.600**, AIP and NOTAM. Night VFR is not allowed at LIPB.

## Why this exists

At LIPB, VFR is not allowed in the ATZ while an IFR arrival or departure is in progress. Inbound IFR also occupies the Valle Adige VFR sector for the last stretch of the approach. The published SkyAlps PDF is enough for a seasonal picture, but today’s board is incomplete without charters, bizjets and state flights. This app is the hangar answer: one screen for “when can we go?”, with clocks in **Bolzano local time (Europe/Rome)**, not UTC.

## What you get

| Page | What it shows |
| --- | --- |
| **Today / tomorrow** (`/`) | Decoded METAR + TAF, SkyAlps + live IFR, runway timeline, green VFR holes |
| **Week** (`/week`) | Same day boards for the next seven days. TAF while it is still valid; Open-Meteo (labelled as a model) after that |
| **History** (`/history`) | Past days from archived FlightAware ops snapshots + SkyAlps timetable (no live weather) |
| **Season** (`/season`) | Weekday × hour heatmap of traffic-free daylight from the published SkyAlps PDF only |

Also:

- **Min hole** (header): 20 / 30 / 45 / 60 / 90 minutes. Default **45**. Saved in the browser (`lipb-vfr-hole-min`) and overridable with `?min=`.
- **Calendars**: [`/api/calendar/vfr-windows.ics`](./src/app/api/calendar/vfr-windows.ics/route.ts) and [`/api/calendar/ifr.ics`](./src/app/api/calendar/ifr.ics/route.ts). The VFR feed respects `?min=`.
- **Live ATZ strip**: ADS-B around the valley (adsb.lol, OpenSky fallback), filtered to the ATZ / Valle Adige box and ≤ FL160. The home page shows a realistic SVG map of the Valle Adige corridor (OSM-derived roads, Adige, urban footprints, LIPB runway/apron, ATZ ring) with airborne and on-ground tracks plotted; a compact list remains underneath. Geometry lives in [`data/lipb-valley-map.json`](./data/lipb-valley-map.json) (© OpenStreetMap contributors — simplified extract, not for navigation).

### Timeline

The graph is a runway picture, not an “ATZ closed” banner.

| Track | Meaning |
| --- | --- |
| **Hole** | Green VFR window (civil daylight ∩ airport hours, minus busy ATZ + sector) |
| **ARR** | 15-minute approach ending in a stronger landing bar |
| **DEP** | 5-minute taxi, takeoff tick, then **3 minutes** still occupied |
| **Sec** | Passenger security queue **STD−40 to STD−20**, only when **two or more** departures overlap that window |
| **Valley** | Valle Adige sector (amber) |

VFR hole math still uses the AIP-style occupancy buffers below. The board says **runway busy**, not ATZ closed.

### Movement pills

- **LIVE** — the aircraft is enroute or taxiing **today** (Bolzano date). Next-day rows from FlightAware’s “En Route / Scheduled” table do not get this badge.
- **extra** — IFR that is not on the SkyAlps timetable (charter, bizjet, state). Hover: *Not on the SkyAlps timetable — added from the airport board.*
- **ARR** / **DEP** — rose for arrivals, sky blue for departures.
- **sched HH:MM** — published SkyAlps time when live ops time differs.

## Occupancy model

All times are Bolzano local. Night VFR is out: holes are clipped to civil daylight **and** airport hours **04:30–22:00**.

| Buffer | Window |
| --- | --- |
| Arrival, Valle Adige sector | STA − 12 min → STA |
| Arrival, ATZ | STA − 8 min → STA + 5 min |
| Departure, ATZ | STD − 5 min → STD + 8 min |
| Departure, Valle Adige sector | STD → STD + 10 min |

A hole is any remaining interval at least as long as the chosen minimum (server computes from a 20-minute floor; the client filters). Constants live in [`src/lib/constants.ts`](src/lib/constants.ts); the invert logic is in [`src/lib/occupancy.ts`](src/lib/occupancy.ts).

## Data sources

| Source | Role | Refresh |
| --- | --- | --- |
| [`data/lipb-schedule.json`](data/lipb-schedule.json) | SkyAlps Summer 2026 pairs (67), from the [published PDF](https://www.skyalps.com/images/pdfs/SCHEDULED%20FLIGHTS%20SUMMER%202026.pdf) | Rebuild when SkyAlps republishes |
| [`data/extra-movements.json`](data/extra-movements.json) | Known extras you type in by hand (still `[]` by default) | Commit |
| FlightAware LIPB board (markdown proxy) | Live ARR/DEP overlay for today / tomorrow / week | ~3 minutes |
| History JSON (`HISTORY_DIR`) | Archived ops from cron snapshots (forward-only from deploy) | Cron every 5–15 min |
| aviationweather.gov | Official METAR + TAF for LIPB | On each page load (server-cached) |
| Open-Meteo | Hourly model beyond TAF validity | On each page load |
| [adsb.lol](https://api.adsb.lol) → OpenSky | Live tracks in the valley box | ~30 seconds |
| [`data/lipb-valley-map.json`](data/lipb-valley-map.json) | Simplified OSM valley/airport geometry for the live SVG map | Rebuild when geography needs refresh |

### How live IFR is merged

Ops time wins when the same ident + direction + date is within 3 hours. Otherwise a same-airport + same-direction match within 90 minutes is accepted (this is how `BQ2344` vs `SWU1938` Preveza still lines up). Unmatched IFR (NetJets, Goldeck, Aliserio, Jetfly, Luxwing, Georgian, state, …) is added as **extra**.

Local circuits are dropped: LIPB–LIPB, “Near Bolzano”, `FIAMM*`, `VOLP*`.

Display codes: `SWU1906` → `BQ1906`, `TGZ1777` → `A91777`.

The **season** heatmap stays on the published PDF so far-ahead planning does not jump when today’s charter list changes.

## Run locally

Needs Node 22+ (the Docker image is `node:22-alpine`).

```bash
npm install
npm test
npm run dev
```

Open [http://127.0.0.1:43147](http://127.0.0.1:43147).

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js on `0.0.0.0:43147` |
| `npm test` | Vitest (occupancy, ops parser, holes, weather, time, ADS-B, history, daylight, ICS, schedule) |
| `npm run test:e2e` | Playwright Chromium smokes (`/`, `/week`, `/history`, `/season`, `/api/health`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` / `npm start` | Production standalone server, same port |
| `npm run validate:schedule` | Sanity-check SkyAlps pair ids, weekdays and `BQnnnn` numbers |
| `npm run lint` | ESLint |

No `.env` is required for the hangar board itself. Optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `FLIGHTAWARE_LIPB_URL` | `https://r.jina.ai/http://www.flightaware.com/live/airport/LIPB` | Override the FlightAware markdown proxy |
| `HISTORY_DIR` | `data/history` locally; `/data/history` on Railway | Directory for one JSON file per Bolzano-local day |
| `CRON_SECRET` | unset (snapshot disabled) | Bearer token for `POST /api/history/snapshot` |
| `TZ` | `Europe/Rome` in Docker / Railway | Process timezone (display math uses `Europe/Rome` regardless) |
| `PORT` | `3000` in Docker, `43147` in npm scripts | Listen port |
| `RAILWAY_PUBLIC_DOMAIN` | request `Host` | Absolute URLs inside the `.ics` feeds |

If FlightAware or ADS-B is down, the board still renders the SkyAlps timetable and says so.

### History archive

Live pages never write history. Production uses the Railway **`history-cron`** service (every 10 minutes) to call the protected snapshot endpoint. You can also trigger it manually:

```bash
curl -X POST "$PUBLIC_URL/api/history/snapshot" \
  -H "Authorization: Bearer $CRON_SECRET"
```

- Writes only **today** and **tomorrow** (Rome) from the live FlightAware parse.
- Atomic JSON files under `HISTORY_DIR` (`YYYY-MM-DD.json`), retention **180 days**.
- Browse at [`/history`](./src/app/history/page.tsx). Invalid `?date=` values are rejected (no path traversal).
- Forward-only from deploy — there is no FlightAware backfill in v1.
- `CRON_SECRET` must be set on `web` (referenced by `history-cron`). Without it, the snapshot route returns **401**.

Weekday/hour “extra traffic” prediction can be built later from these files; it is out of scope for v1.

## Deploy

Single service plus a **volume** for history JSON (still no database / accounts). The image is a Next.js **standalone** build ([`Dockerfile`](Dockerfile)): `npm ci` → `next build` → `node server.js` as user `nextjs` (uid 1001), `HOSTNAME=0.0.0.0`, `TZ=Europe/Rome`. The volume mounts at `/data`; `HISTORY_DIR=/data/history`. Set `RAILWAY_RUN_UID=0` on `web` so the process can write to the root-owned volume (Dockerfile still runs as `nextjs` otherwise).

Healthcheck: [`GET /api/health`](src/app/api/health/route.ts) (does **not** scrape FlightAware).

Railway IaC is in [`.railway/railway.ts`](.railway/railway.ts) (project `lipb-vfr-windows`, service `web`, volume `history-data`, cron service `history-cron`). After this repo is attached to the service, a git push deploys.

**History cron:** `history-cron` runs every **10 minutes** (UTC, `*/10 * * * *`) with image `alpine:3.21`, POSTs to `https://${{web.RAILWAY_PUBLIC_DOMAIN}}/api/history/snapshot` with Bearer `CRON_SECRET`, then exits (`restartPolicy: NEVER`). Set `CRON_SECRET` on `web`; `history-cron` references `${{web.CRON_SECRET}}`.

From a machine logged into the Railway CLI:

```bash
railway login
railway link
railway up
```

The process must listen on `PORT` / `0.0.0.0`.

## Updating the season

1. Edit the pairs in [`scripts/build-schedule.mjs`](scripts/build-schedule.mjs) from the new SkyAlps PDF.
2. Generate JSON:

   ```bash
   node scripts/build-schedule.mjs
   ```

3. Check it:

   ```bash
   npm run validate:schedule
   ```

4. For a one-off charter that should appear even without FlightAware, append to [`data/extra-movements.json`](data/extra-movements.json):

   ```json
   [
     {
       "id": "nje-saturday-ibiza",
       "flightNumber": "NJE123A",
       "direction": "departure",
       "otherAirport": "IBZ",
       "otherCity": "Ibiza",
       "dateLocal": "2026-09-12",
       "timeLocal": "14:30",
       "note": "NetJets, from the handling desk"
     }
   ]
   ```

## Project layout

```
data/                  SkyAlps JSON, extra movements, FlightAware fixture
data/history/          Local archived ops JSON (gitignored; volume on Railway)
scripts/               schedule builder + validator
src/app/               Today, week, history, season pages + API routes
src/components/        Hangar UI (timeline, weather, live strip)
src/lib/               Occupancy, merge, history store, weather, ADS-B, ICS, clocks
```

Stack: Next.js 16, TypeScript, Tailwind, shadcn/ui. Tests: Vitest + Playwright.

## Contributing

GitHub `main` only accepts pull requests. A pre-push hook runs unit tests and lint; GitHub Actions must pass before merge. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). You may use, copy, modify, merge, publish, distribute, sublicense, and sell this software, provided the copyright notice and permission notice stay with it. It is provided as-is, without warranty.

That license does not make the board operational advice. See the disclaimer below.

## Disclaimer

This is a hangar planning board, not ATC and not a substitute for AIP / NOTAM / briefing. Valle Adige / Cles can also be hot from Trento or Cles HEMS. TAF is official aviation weather; Open-Meteo hours are a model. Clock times on the board are Bolzano local (CET/CEST). Only the raw METAR/TAF string is UTC.
