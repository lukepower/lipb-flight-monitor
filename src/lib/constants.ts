export const LIPB = {
  icao: "LIPB",
  iata: "BZO",
  nameEn: "Bolzano",
  nameDe: "Bozen",
  lat: 46.4603,
  lon: 11.3264,
  elevationM: 241,
  timezone: "Europe/Rome",
} as const;

export const OCCUPANCY = {
  arrivalSectorBeforeMin: 12,
  arrivalAtzBeforeMin: 8,
  arrivalAtzAfterMin: 5,
  departureAtzBeforeMin: 5,
  departureAtzAfterMin: 8,
  departureSectorAfterMin: 10,
} as const;

/** Per-movement runway strip on the hangar graph (not the AIP ATZ buffer). */
export const RUNWAY = {
  arrivalApproachMin: 15,
  departureTaxiMin: 5,
  departureAfterMin: 3,
  eventBarMin: 2,
} as const;

/** Passenger security queue: STD−40 to STD−20, only when 2+ departures overlap. */
export const SECURITY = {
  beforeMin: 40,
  untilMin: 20,
} as const;

export const MIN_WINDOW_MINUTES = 45;
export const HOLE_THRESHOLDS = [20, 30, 45, 60, 90] as const;
export type HoleThreshold = (typeof HOLE_THRESHOLDS)[number];
export const HOLE_FLOOR = HOLE_THRESHOLDS[0];

export const AIRPORT_OPEN = { hour: 4, minute: 30 } as const;
export const AIRPORT_CLOSE = { hour: 22, minute: 0 } as const;

/** Bolzano ATZ + Valle Adige toward Trento */
export const OPENSKY_BBOX = {
  lamin: 45.95,
  lamax: 46.65,
  lomin: 10.95,
  lomax: 11.55,
} as const;

/**
 * Span of the dense local mountain-wave / shear grid (centred on LIPB at
 * runtime — see `localWaveGridPoints`). Roughly 80–100+ km Tyrol box.
 */
export const WAVE_RISK_BBOX = {
  lamin: 45.7,
  lamax: 47.3,
  lomin: 10.3,
  lomax: 12.2,
} as const;

/**
 * Alps frame (shared with satellite) — west edge covers Valais / Savoie
 * (~5.8°E). Coarse wave map uses this minus the Tyrol box (plus a
 * half-step halo) so overlap is never fetched twice.
 */
export const ALPS_BBOX = {
  lamin: 44.2,
  lamax: 48.0,
  lomin: 5.8,
  lomax: 14.2,
} as const;

/** Model / hazard analysis ceiling for mountain-wave and shear (MSL). */
export const SOUNDING_MAX_ALT_M = 3500;

/** Odd × odd so the centre node sits exactly on LIPB (46.46°N 11.33°E). */
export const WAVE_RISK_GRID = {
  cols: 5,
  rows: 5,
} as const;

/** Coarse Alps map grid (~50–70 km). Tyrol-overlap points are dropped before fetch. */
export const ALPS_WAVE_GRID = {
  cols: 7,
  rows: 6,
} as const;

/** Crest stations within this radius of LIPB feed localCrestStrong / LIPB hazards. */
export const LOCAL_CREST_RADIUS_KM = 100;

/** Map cells couple to a strong crest station within this radius. */
export const CREST_CELL_RADIUS_KM = 40;

/**
 * Open-Meteo call weight ≈ vars/10.
 * waveRiskHourlyParams: 6 surface + 8×3 (wind/dir/z) + 5 temps = 35 → 3.5.
 * ICON-2I ω is a separate request (logged via icon2iOmegaCallWeight).
 */
export const OPEN_METEO_CALL_WEIGHT_PER_LOCATION = 3.5;

export const WAVE_LOCAL_CACHE_TTL_MS = 30 * 60_000;
export const WAVE_ALPS_CACHE_TTL_MS = 60 * 60_000;
/** Stale-on-error peek() older than this is treated as a missing batch. */
export const WAVE_STALE_MAX_AGE_MS = 3 * 60 * 60_000;
export const WAVE_BATCH_SIZE = 20;

export const AFIU_FREQ = "120.600";
export const CAT_VFR_MIN_VIS_KM = 5;
