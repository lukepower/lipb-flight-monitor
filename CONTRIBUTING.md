# Contributing

`main` is always deployable. Work on a short-lived branch and open a pull request against GitHub (`lukepower/lipb-flight-monitor`). Direct pushes and force-pushes to `main` are blocked.

## Setup

Needs Node 22+.

```bash
npm install
npm test
npm run dev
```

`npm install` also installs a Git **pre-push** hook (Husky) that runs `npm test` and `npm run lint`. A failing suite blocks the push.

Open [http://127.0.0.1:43147](http://127.0.0.1:43147). Product overview and the high-level data-source table live in [README.md](README.md).

## External APIs

All third-party fetches run **on the server** (RSC / route handlers / `src/lib/*`). Prefer extending an existing module over adding a new client-side fetch. Helpers use the shared `TtlCache` in [`src/lib/cache.ts`](src/lib/cache.ts) (with single-flight promise deduplication and optional stale-peek fallback) plus `fetch(..., { next: { revalidate } })`.

### Traffic and ops

| Provider | Call | Notes | Code |
| --- | --- | --- | --- |
| FlightAware (direct HTML board) | `GET https://www.flightaware.com/live/airport/LIPB` | Override with `FLIGHTAWARE_LIPB_URL`. HTML tables (or jina markdown) → ARR/DEP movements. | [`src/lib/ops-flights.ts`](src/lib/ops-flights.ts) |
| adsb.lol | `GET https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{nm}` | Primary live tracks (~35 NM), then filtered to `OPENSKY_BBOX` / ≤ FL160. | [`src/lib/opensky.ts`](src/lib/opensky.ts) |
| OpenSky Network | `GET https://opensky-network.org/api/states/all?lamin&lomin&lamax&lomax` | Fallback if adsb.lol fails. | [`src/lib/opensky.ts`](src/lib/opensky.ts) |

### Aviation weather (official)

| Provider | Call | Notes | Code |
| --- | --- | --- | --- |
| aviationweather.gov | `GET …/api/data/metar?ids=LIPB,LOWI&format=json` | Decoded LIPB METAR + flight category, plus LOWI QNH for Brenner Föhn ΔQNH. | [`src/lib/weather.ts`](src/lib/weather.ts) |
| aviationweather.gov | `GET …/api/data/taf?ids=LIPB&format=json` | TAF periods for hole quality while valid. | [`src/lib/weather.ts`](src/lib/weather.ts) |
| aviationweather.gov | `GET …/api/data/isigmet?format=json` | International SIGMETs; keep Alpine FIRs (`LIMM`, `LOVV`, `LSAS`, …). | [`src/lib/sigmet.ts`](src/lib/sigmet.ts) |
| MeteoAM CMS | `GET https://cm.meteoam.it/content/published/api/v1.1/items?channelToken=…&fields=all` | Italy SWLL GIFs, FBIY61 zone GAFOR, SIGMET/AIRMET bodies (+ map assets). Text fields may be a string or `{ value }`. | [`swll.ts`](src/lib/swll.ts), [`italy-gafor.ts`](src/lib/italy-gafor.ts), [`sigmet.ts`](src/lib/sigmet.ts), [`meteoam-cms.ts`](src/lib/meteoam-cms.ts) |
| Austro Control SDI | `GET …/geoserver/free/ows?service=WFS&…&typeNames=GAFOR_ROUTE&CQL_FILTER=id_no=50 OR id_no=51` | Route geometry only (Brenner / Pustertal → LIPB). Live colours stay behind pilot login. | [`gafor-routes.ts`](src/lib/gafor-routes.ts), [`/api/gafor-routes`](src/app/api/gafor-routes/route.ts) |

### Model weather (Open-Meteo)

| Call | Notes | Code |
| --- | --- | --- |
| `GET https://api.open-meteo.com/v1/forecast?latitude={LIPB}&longitude={LIPB}&hourly=…` | Surface hours beyond TAF + full pressure-level sounding for Skew-T / hole hazards (gust, wind, shear, CAPE, wave). | [`weather.ts`](src/lib/weather.ts), [`sounding.ts`](src/lib/sounding.ts) |
| Same path with **comma-separated** `latitude` / `longitude` | Dual grid: dense **5×4** in `WAVE_RISK_BBOX` (30 min TTL, hangar strip) + coarse Alps grid in `ALPS_BBOX` with Tyrol overlap dropped **before fetch** (60 min TTL, Sky map). Batched (~20 pts), stale-on-error via `TtlCache.peek` ≤ 3 h. Hourly vars ≤ ~3500 m MSL (`waveRiskHourlyParams`). Call weight logged (~2.4 / location). | [`wave-risk.ts`](src/lib/wave-risk.ts) |

Wave / shear scoring: levels with geopotential ≤ **3500 m**; shear ≥ 20 kt/1000 ft; mountain-wave when mid-level (850–700 hPa) wind ≥ ~30 kt **and** shear ≥ ~15 kt/1000 ft, **or** strong crest (≥ 25 kt) within ~40 km of a cell (LIPB / hangar hazards use crests within ~100 km of LIPB only). Columns with fewer than 2 valid levels are `data: "insufficient"` (severity stays quiet; excluded from worst/flagged). Labels must stay “inferred”, never “CAT confirmed”.

### Alpine crest wind (Föhn check)

| Provider | Base | Code |
| --- | --- | --- |
| SIAG (Südtirol) | `https://geoservices.buergernetz.bz.it/services/meteo/v1` | [`alpine-wind.ts`](src/lib/alpine-wind.ts) |
| MeteoSwiss SwissMetNet | STAC `ch.meteoschweiz.ogd-smn` → per-station `*_t_now.csv` (10-min; `fu3010z0` / `fu3010z1` km/h) | [`alpine-wind.ts`](src/lib/alpine-wind.ts) |
| GeoSphere Austria | `https://dataset.api.hub.geosphere.at/v1/station` | same |
| Meteotrentino | `https://dati.meteotrentino.it/service.asmx/ultimiDatiStazione` | same |

Station list and thresholds: `ALPINE_STATIONS`, `ALPINE_WIND_STRONG_KT` in that module. Used on Sky and as input to wave-risk.

### Imagery and webcams

| Provider | Call | Notes | Code |
| --- | --- | --- | --- |
| RainViewer | `GET https://api.rainviewer.com/public/weather-maps.json` + tile URLs | Past radar frames centred on LIPB. | [`radar.ts`](src/lib/radar.ts) |
| CARTO (optional) | `https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?key=…` | Radar basemap mosaic when `CARTO_API_KEY` is set; otherwise radar still works without underlay. | [`radar.ts`](src/lib/radar.ts) |
| EUMETSAT EUMETView WMS | `GET https://view.eumetsat.int/geoserver/wms` | Layers `mtg_fd:rgb_geocolour`, `mtg_fd:ir105_hrfi` over `ALPS_BBOX`. | [`satellite.ts`](src/lib/satellite.ts) |
| Open Data Hub | `GET https://tourism.api.opendatahub.com/v1/WebcamInfo/{id}` | Webcam stills; each cam has a static image/link fallback. | [`webcams.ts`](src/lib/webcams.ts) |

### When adding a new API

1. Put the fetch in `src/lib/…` with typed results, TTL cache, and a graceful empty/error bundle (pages must still render).
2. Wire it through `loadHangar` / `loadSky` / `loadWeek` in [`board.ts`](src/lib/board.ts) — do not fetch from client components.
3. Add Vitest coverage next to the module; update the README data-sources table and this section.
4. Keep disclaimers accurate (model vs observation; official METAR/TAF vs Open-Meteo).

## Checks

| Command | When |
| --- | --- |
| `npm test` | Unit tests (Vitest). Run locally; also on every push via the hook. |
| `npm run lint` | ESLint. Same hook. |
| `npm run typecheck` | `tsc --noEmit`. Required in CI. |
| `npm run validate:schedule` | Programmazione + official monthly JSON sanity (diff warnings). Required in CI. |
| `npm run import:official` | Import a SkyAlps “Voli schedulati” PDF into `data/official-schedules/` + `public/schedules/`. |
| `npm run test:e2e` | Playwright Chromium smokes against a production build. CI only on the hook path; run locally when you change pages or navigation. |
| `npm run build` | Production build. Required before local e2e if a server is not already running. |

GitHub Actions runs **quality** (lint, typecheck, Vitest, schedule) and **e2e** on every pull request. Both must be green before merge.

## Pull requests

1. Branch from `main` (`feature/…`, `fix/…`, `chore/…`).
2. Keep the change reviewable. Tests for new logic go next to the module (`*.test.ts`).
3. Push the branch to **GitHub** and open a PR targeting `main`.
4. Wait for CI. Merge when the checks pass.

Do not push to `main` on GitHub. The Cursor `origin` remote is a different host and does not enforce these rules.
