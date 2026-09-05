# LIPB VFR windows

Hangar board for **Bolzano / Bozen (LIPB)**. It turns the published SkyAlps seasonal timetable into ATZ holes and Valle Adige sector occupancy, overlays decoded METAR/TAF, and publishes a subscribeable calendar of the best VFR slots.

Planning aid only. Confirm with Bolzano AFIU **120.600**, AIP and NOTAM. Night VFR is not allowed at LIPB. GA, state and HEMS IFR are often missing from the SkyAlps PDF.

## What you get

- **Today / tomorrow** — METAR + TAF decoded, traffic timeline, green VFR holes
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

```bash
railway link   # or create the project
railway up
```

Infrastructure lives in [`.railway/railway.ts`](.railway/railway.ts). The process listens on `PORT` / `0.0.0.0`. Healthcheck: `GET /api/health`.

## Updating the season

SkyAlps summer 2026 is in [`data/lipb-schedule.json`](data/lipb-schedule.json), generated from [`scripts/build-schedule.mjs`](scripts/build-schedule.mjs) using the [published PDF](https://www.skyalps.com/images/pdfs/SCHEDULED%20FLIGHTS%20SUMMER%202026.pdf). Extra known IFR (a charter, for example) can be appended to [`data/extra-movements.json`](data/extra-movements.json).
