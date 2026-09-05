# LIPB VFR windows

Hangar board for **Bolzano / Bozen (LIPB)**. It turns the published SkyAlps seasonal timetable **plus a live FlightAware arrivals/departures overlay** into ATZ holes and Valle Adige sector occupancy, overlays decoded METAR/TAF, and publishes a subscribeable calendar of the best VFR slots.

Planning aid only. Confirm with Bolzano AFIU **120.600**, AIP and NOTAM. Night VFR is not allowed at LIPB. Local VFR circuits are filtered out; the season heatmap is still SkyAlps-only.

## What you get

- **Today / tomorrow** — METAR + TAF decoded, SkyAlps + live FlightAware IFR, traffic timeline, green VFR holes
- **Week** — same, with TAF where it is still valid and Open-Meteo (labelled as a model) after that
- **Season** — weekday × hour heatmap of traffic-free daylight
- **Calendars** — `/api/calendar/vfr-windows.ics` and `/api/calendar/ifr.ics`

Occupancy rules (conservative, named constants):

- Arrival Valle Adige: last **12 minutes** before STA
- Arrival ATZ: STA − 8 to + 5 minutes
- Departure ATZ: STD − 5 to + 8 minutes
- Departure sector: STD to + 10 minutes

## Run locally

```bash
npm install
npm test
npm run dev
```

Open [http://127.0.0.1:43147](http://127.0.0.1:43147).

## Railway

Single service, no database. The image is a Next.js standalone build (`Dockerfile`).

Project **lipb-vfr-windows** is already created (service `web`, timezone Europe/Rome, healthcheck `/api/health`). Public URL reserved: `https://web-production-d5959.up.railway.app`.

This workspace has no GitHub remote, so the first image must be uploaded from a machine where you are logged into the Railway CLI:

```bash
railway login
railway link --project 933c9090-4a2f-4751-aafe-54f522b8920d
railway up
```

Or attach a GitHub repo to `web` in the Railway dashboard. After that, git-push deploys. The process listens on `PORT` / `0.0.0.0`. IaC: [`.railway/railway.ts`](.railway/railway.ts).

## Updating the season

SkyAlps summer 2026 is in [`data/lipb-schedule.json`](data/lipb-schedule.json), generated from [`scripts/build-schedule.mjs`](scripts/build-schedule.mjs) using the [published PDF](https://www.skyalps.com/images/pdfs/SCHEDULED%20FLIGHTS%20SUMMER%202026.pdf). Extra known IFR (a charter, for example) can be appended to [`data/extra-movements.json`](data/extra-movements.json).

Today / week also fetch FlightAware’s public LIPB board (via a markdown proxy) about every three minutes. Ops time wins when the same flight is on the timetable; unmatched IFR (NetJets, Georgian, Goldeck, Aliserio, Jetfly, Luxwing, state) is added. The season view stays on the published PDF so far-ahead planning is stable.
