# LIPB VFR Hangar Board — Architecture & Improvements

## 1. Project Aim & Operational Context

**LIPB VFR Hangar Board** (`lipb-vfr-windows`) is a shared, zero-account, database-free flight-planning board for VFR pilots and flying clubs operating at **Bolzano / Bozen Airport (`LIPB` / `BZO`)**.

### Why It Exists
At `LIPB`, VFR operations are prohibited inside the **ATZ** while an IFR arrival or departure is active, and inbound/outbound IFR movements also occupy the **Valle Adige VFR sector** during approach and climb-out. Night VFR is prohibited. Because unscheduled ferry flights, charters, business jets (`NJE`, `JFA`, `TJD`, `GDK`, `BN`), and state flights (`IAM`) frequently operate alongside the commercial SkyAlps schedule, pilots need a single, Bolzano-local-time (`Europe/Rome`) board that merges:
1. **Static Airport Programmazione** (`data/lipb-day-movements.json` + `data/extra-movements.json`),
2. **Live FlightAware Airport Board** (`Arrivals`, `Departures`, `En Route`, `Scheduled`),
3. **Live Valley ADS-B Traffic** (`adsb.lol` primary + `OpenSky` fallback within `OPENSKY_BBOX` and $\le \text{FL160}$),
4. **Official & Model Aviation Weather** (`aviationweather.gov` METAR/TAF/ISIGMET, MeteoAM SWLL/GAFOR/SIGMET/AIRMET, Open-Meteo hourly surface & pressure-level soundings, regional mountain-wave/shear grid $\le 3500\text{ m}$ MSL, and Alpine crest stations from SIAG, GeoSphere Austria, and Meteotrentino).

---

## 2. Implemented Improvements

### 2.1 Shared Single-Flight & Stale-Resilient TTL Cache (`src/lib/cache.ts`)
- **Problem**: Individual data modules (`weather.ts`, `ops-flights.ts`, `opensky.ts`, `sigmet.ts`) maintained separate in-memory caches without single-flight promise deduplication. Concurrent requests on cold or expired caches triggered duplicate upstream HTTP calls. Furthermore, `fetchLiveOps` in `ops-flights.ts` overwrote valid cached movements with `[]` if a single FlightAware scrape returned zero rows.
- **Solution**:
  - Added [`src/lib/cache.ts`](../src/lib/cache.ts) providing `TtlCache<T>` with concurrent in-flight promise deduplication (`inflight` map) and last-known-good value retention (`peek`).
  - Updated [`fetchLiveOps`](../src/lib/ops-flights.ts) to preserve previously cached `movements` (`stale: true` with an explanatory `error` warning) when an upstream scrape fails or returns zero usable rows, preventing transient FlightAware blocks from wiping out live charter/ferry overlays.

### 2.2 Föhn Pressure-Gradient ($\Delta\text{QNH}$ `LOWI − LIPB`) Indicator (`src/lib/weather.ts`)
- **Problem**: Alpine VFR pilots check both crest winds and the north–south pressure difference ($\Delta\text{QNH}$ between Innsbruck `LOWI` and Bolzano `LIPB`) to detect North or South Föhn onset ($|\Delta p| \ge 4\text{ hPa}$ moderate, $|\Delta p| \ge 6\text{ hPa}$ strong).
- **Solution**:
  - Extended [`fetchMetar`](../src/lib/weather.ts) to request `ids=LIPB,LOWI` in the same `aviationweather.gov` call (zero extra network requests).
  - Added `computeFoehnGradient(lipbQnhHpa, lowiQnhHpa)` returning `deltaHpa` (`LOWI − LIPB`), `direction` (`"north" | "south" | "none"`), and `strength` (`"none" | "moderate" | "strong"`).
  - Surfaced the live $\Delta\text{QNH}$ badge in [`MetarStrip`](../src/components/metar-strip.tsx) and [`AlpineWindStrip`](../src/components/alpine-wind-strip.tsx).

### 2.3 Full-Window Weather, Sounding Hazard & LCL Cloud-Base Evaluation (`src/lib/weather.ts`, `src/lib/sounding.ts`, `src/lib/board.ts`)
- **Problem**:
  - [`weatherForWindow`](../src/lib/weather.ts) previously sampled only the midpoint (`mid`) of a VFR hole. On a multi-hour hole, deteriorating weather in the first or last hour was missed.
  - [`decodeModelHour`](../src/lib/weather.ts) used a fixed `1500 ft` ceiling whenever `cloudCoverLow >= 50%`, ignoring temperature–dewpoint spread.
  - [`loadHangar`](../src/lib/board.ts) evaluated `waveRisk` only at `now`, displaying right-now's wave risk on `/tomorrow`.
- **Solution**:
  - Updated [`weatherForWindow`](../src/lib/weather.ts) to evaluate all TAF periods and model hours overlapping `[start, end)`, selecting the worst flight category across the window and annotating category transitions (`· trend X→Y`) when conditions change during the window.
  - Enhanced [`decodeModelHour`](../src/lib/weather.ts) to estimate low cloud base from the Lifted Condensation Level ($\text{LCL}_{\text{ft}} \approx \text{round}((T - T_d) \times 400 / 100) \times 100$, clamped to `[500, 3000] ft` when `dewC` is provided, with `1500 ft` fallback when omitted).
  - Added [`soundingHazardsForInterval`](../src/lib/sounding.ts) and updated [`serWindow`](../src/lib/board.ts) to aggregate sounding hazards across all model hours overlapping the VFR hole, and added `tomorrowWaveRisk` in `loadHangar` targeted at tomorrow `12:00 LT` for `/tomorrow`.

### 2.4 Real-Time ADS-B Valley Match Details (`src/lib/ops-flights.ts`, `src/components/day-board.tsx`)
- **Problem**: [`isMovementInAtz`](../src/lib/ops-flights.ts) returned a boolean, without exposing the matched aircraft's live altitude, groundspeed, or on-ground state on the movement row.
- **Solution**:
  - Added [`matchMovementTrack`](../src/lib/ops-flights.ts) returning the matched `LiveTrack` when within $\pm 2\text{ h}$ of the movement.
  - Updated [`DayPanel`](../src/components/day-board.tsx) movement rows to display live track telemetry (`on ground` / `alt ft · kt`) when an IFR movement is actively tracked in the ATZ / Valle Adige box.

### 2.5 Historical "Extra IFR" Traffic Analysis (`src/lib/history.ts`, `src/components/season-board.tsx`)
- **Problem**: The `/season` heatmap only reflects scheduled programmazione, while unscheduled bizjets/charters are captured daily in `HISTORY_DIR`.
- **Solution**:
  - Added [`summarizeExtraHistory`](../src/lib/history.ts) and [`loadSeasonExtraHistory`](../src/lib/board.ts) to compare archived as-flown movements against `movementsOnDate(dateLocal)` and compute empirical unscheduled ("extra") IFR counts by weekday and hour.
  - Integrated the summary into `/season` and [`SeasonBoard`](../src/components/season-board.tsx) so clubs can see which weekdays/hours historically attract the most unscheduled IFR traffic.

### 2.6 Consistent Degraded-Source Handling & Hangar Kiosk Auto-Refresh (`src/components/hangar-auto-refresh.tsx`, `src/app/tomorrow/page.tsx`)
- **Problem**: `/tomorrow` did not mirror `/`'s `opsDown` handling, and wall-mounted hangar displays required manual browser reloads to refresh server-rendered METAR/TAF/FlightAware data.
- **Solution**:
  - Added [`HangarAutoRefresh`](../src/components/hangar-auto-refresh.tsx) inside [`SiteHeaderShell`](../src/components/site-header-shell.tsx) which triggers `router.refresh()` every 3 minutes while the tab is visible (`document.visibilityState === "visible"`).
  - Standardized `opsDown` and `<DataSourceStatus />` handling across `/` and `/tomorrow`.
