/** Regional mountain-wave / shear risk around LIPB (model + crest, ≤ 3500 m). */

import { TtlCache } from "@/lib/cache";
import {
  ALPS_BBOX,
  ALPS_WAVE_GRID,
  CREST_CELL_RADIUS_KM,
  LIPB,
  LOCAL_CREST_RADIUS_KM,
  OPEN_METEO_CALL_WEIGHT_PER_LOCATION,
  SOUNDING_MAX_ALT_M,
  WAVE_ALPS_CACHE_TTL_MS,
  WAVE_BATCH_SIZE,
  WAVE_LOCAL_CACHE_TTL_MS,
  WAVE_RISK_BBOX,
  WAVE_RISK_GRID,
  WAVE_STALE_MAX_AGE_MS,
} from "@/lib/constants";
import {
  ALPINE_STATIONS,
  ALPINE_WIND_STRONG_KT,
  fetchAlpineWind,
  type AlpineWindBundle,
} from "@/lib/alpine-wind";
import {
  levelsWithinAlt,
  midLevelMaxWind,
  parseModelSoundings,
  SOUNDING_SHEAR_KT_PER_1000FT,
  SOUNDING_WAVE_SHEAR_KT_PER_1000FT,
  SOUNDING_WAVE_WIND_KT,
  soundingHazards,
  waveRiskHourlyParams,
  worstShearInColumn,
  type OpenMeteoHourly,
  type SoundingHazard,
  type SoundingHour,
} from "@/lib/sounding";

export type WaveRiskSeverity = "quiet" | "shear" | "wave";
export type WaveRiskDataQuality = "ok" | "insufficient";

export type WaveRiskCell = {
  id: string;
  lat: number;
  lon: number;
  severity: WaveRiskSeverity;
  /** High-terrain / thin column — severity stays quiet; excluded from worst/flagged. */
  data: WaveRiskDataQuality;
  shearKtPer1000ft: number | null;
  midWindKt: number | null;
  midPHpa: number | null;
  isLipb: boolean;
  /** Dense Tyrol grid vs coarse Alps map grid. */
  scope: "local" | "alps";
};

export type WaveRiskBundle = {
  fetchedAt: string;
  localFetchedAt: string | null;
  alpsFetchedAt: string | null;
  hourIso: string | null;
  crestStrong: boolean;
  localCrestStrong: boolean;
  worstSeverity: WaveRiskSeverity;
  flaggedCellCount: number;
  localWorstSeverity: WaveRiskSeverity;
  localFlaggedCellCount: number;
  cells: WaveRiskCell[];
  lipb: WaveRiskCell | null;
  lipbHazards: SoundingHazard[];
  partial?: boolean;
  error?: string;
  /** Open-Meteo call-weight estimate for this refresh (locations × 2.4). */
  callWeight?: { local: number; alps: number; total: number };
};

export type WaveGridPoint = {
  lat: number;
  lon: number;
  id: string;
  scope: "local" | "alps";
};

type OpenMeteoLocation = {
  latitude: number;
  longitude: number;
  elevation?: number;
  hourly?: OpenMeteoHourly;
};

type BatchPayload = {
  locations: OpenMeteoLocation[];
  fetchedAt: number;
};

const waveCache = new TtlCache<BatchPayload>();

export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

export function pointInBbox(
  lat: number,
  lon: number,
  bbox: { lamin: number; lamax: number; lomin: number; lomax: number },
): boolean {
  return (
    lat >= bbox.lamin &&
    lat <= bbox.lamax &&
    lon >= bbox.lomin &&
    lon <= bbox.lomax
  );
}

export function waveRiskGridPoints(
  bbox: { lamin: number; lamax: number; lomin: number; lomax: number } = WAVE_RISK_BBOX,
  cols: number = WAVE_RISK_GRID.cols,
  rows: number = WAVE_RISK_GRID.rows,
  idPrefix = "r",
  scope: "local" | "alps" = "local",
): WaveGridPoint[] {
  const points: WaveGridPoint[] = [];
  for (let row = 0; row < rows; row += 1) {
    const latFrac = rows <= 1 ? 0.5 : row / (rows - 1);
    const lat = bbox.lamin + latFrac * (bbox.lamax - bbox.lamin);
    for (let col = 0; col < cols; col += 1) {
      const lonFrac = cols <= 1 ? 0.5 : col / (cols - 1);
      const lon = bbox.lomin + lonFrac * (bbox.lomax - bbox.lomin);
      points.push({
        lat: Math.round(lat * 10_000) / 10_000,
        lon: Math.round(lon * 10_000) / 10_000,
        id: `${idPrefix}${row}c${col}`,
        scope,
      });
    }
  }
  return points;
}

/** Coarse Alps points with Tyrol-overlap removed before any Open-Meteo fetch. */
export function alpsWaveGridPoints(): WaveGridPoint[] {
  return waveRiskGridPoints(
    ALPS_BBOX,
    ALPS_WAVE_GRID.cols,
    ALPS_WAVE_GRID.rows,
    "a",
    "alps",
  ).filter((p) => !pointInBbox(p.lat, p.lon, WAVE_RISK_BBOX));
}

export function localWaveGridPoints(): WaveGridPoint[] {
  return waveRiskGridPoints(
    WAVE_RISK_BBOX,
    WAVE_RISK_GRID.cols,
    WAVE_RISK_GRID.rows,
    "r",
    "local",
  );
}

export function openMeteoCallWeight(locationCount: number): number {
  return Math.round(locationCount * OPEN_METEO_CALL_WEIGHT_PER_LOCATION * 10) / 10;
}

export function severityRank(severity: WaveRiskSeverity): number {
  if (severity === "wave") return 2;
  if (severity === "shear") return 1;
  return 0;
}

export function maxSeverity(
  a: WaveRiskSeverity,
  b: WaveRiskSeverity,
): WaveRiskSeverity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

export function scoreSoundingSeverity(
  sounding: SoundingHour,
  crestStrong = false,
): {
  severity: WaveRiskSeverity;
  data: WaveRiskDataQuality;
  shearKtPer1000ft: number | null;
  midWindKt: number | null;
  midPHpa: number | null;
} {
  const capped = levelsWithinAlt(sounding.levels);
  if (capped.length < 2) {
    return {
      severity: "quiet",
      data: "insufficient",
      shearKtPer1000ft: null,
      midWindKt: null,
      midPHpa: null,
    };
  }
  const worst = worstShearInColumn(capped);
  const shear = worst?.value ?? null;
  const mid = midLevelMaxWind(capped);
  const midWindKt = mid?.windKt ?? null;
  const midPHpa = mid?.pHpa ?? null;

  const modelWave =
    midWindKt !== null &&
    midWindKt >= SOUNDING_WAVE_WIND_KT &&
    shear !== null &&
    shear >= SOUNDING_WAVE_SHEAR_KT_PER_1000FT;
  const crestWave =
    crestStrong &&
    shear !== null &&
    shear >= SOUNDING_WAVE_SHEAR_KT_PER_1000FT;

  if (modelWave || crestWave) {
    return {
      severity: "wave",
      data: "ok",
      shearKtPer1000ft: shear,
      midWindKt,
      midPHpa,
    };
  }
  if (shear !== null && shear >= SOUNDING_SHEAR_KT_PER_1000FT) {
    return {
      severity: "shear",
      data: "ok",
      shearKtPer1000ft: shear,
      midWindKt,
      midPHpa,
    };
  }
  return {
    severity: "quiet",
    data: "ok",
    shearKtPer1000ft: shear,
    midWindKt,
    midPHpa,
  };
}

export function stationIsStrong(station: {
  error?: string;
  windKt: number | null;
  gustKt: number | null;
}): boolean {
  return (
    !station.error &&
    ((station.windKt !== null && station.windKt >= ALPINE_WIND_STRONG_KT) ||
      (station.gustKt !== null && station.gustKt >= ALPINE_WIND_STRONG_KT))
  );
}

export function isCrestStrong(alpine: AlpineWindBundle): boolean {
  return alpine.stations.some(stationIsStrong);
}

export function isLocalCrestStrong(
  alpine: AlpineWindBundle,
  radiusKm = LOCAL_CREST_RADIUS_KM,
): boolean {
  return alpine.stations.some((s) => {
    if (!stationIsStrong(s)) return false;
    return haversineKm(LIPB.lat, LIPB.lon, s.lat, s.lon) <= radiusKm;
  });
}

/** Prefer hour covering `now` using SoundingHour.atIso (timezone-correct from parseModelSoundings). */
export function soundingForNow(
  hours: SoundingHour[],
  now: Date,
): SoundingHour | null {
  if (!hours.length) return null;
  const covering = hours.find((hour) => {
    const start = new Date(hour.atIso);
    return now >= start && now < new Date(start.getTime() + 60 * 60 * 1000);
  });
  if (covering) return covering;
  return hours.reduce((best, hour) =>
    Math.abs(new Date(hour.atIso).getTime() - now.getTime()) <
    Math.abs(new Date(best.atIso).getTime() - now.getTime())
      ? hour
      : best,
  );
}

function cellFromSounding(
  point: WaveGridPoint,
  sounding: SoundingHour | null,
  crestStrong: boolean,
  isLipb: boolean,
): WaveRiskCell {
  if (!sounding) {
    return {
      id: point.id,
      lat: point.lat,
      lon: point.lon,
      severity: "quiet",
      data: "insufficient",
      shearKtPer1000ft: null,
      midWindKt: null,
      midPHpa: null,
      isLipb,
      scope: point.scope,
    };
  }
  const scored = scoreSoundingSeverity(sounding, crestStrong);
  return {
    id: point.id,
    lat: point.lat,
    lon: point.lon,
    severity: scored.severity,
    data: scored.data,
    shearKtPer1000ft:
      scored.shearKtPer1000ft === null
        ? null
        : Math.round(scored.shearKtPer1000ft * 10) / 10,
    midWindKt: scored.midWindKt,
    midPHpa: scored.midPHpa,
    isLipb,
    scope: point.scope,
  };
}

export function pickLipbCellIndex(
  points: { lat: number; lon: number }[],
): number {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const d = haversineKm(points[i].lat, points[i].lon, LIPB.lat, LIPB.lon);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function asLocationList(data: unknown): OpenMeteoLocation[] {
  if (Array.isArray(data)) return data as OpenMeteoLocation[];
  if (data && typeof data === "object") return [data as OpenMeteoLocation];
  return [];
}

function chunkPoints<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function fetchOpenMeteoBatch(
  points: WaveGridPoint[],
): Promise<OpenMeteoLocation[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", points.map((p) => p.lat).join(","));
  url.searchParams.set("longitude", points.map((p) => p.lon).join(","));
  url.searchParams.set("timezone", LIPB.timezone);
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("hourly", waveRiskHourlyParams());
  const res = await fetch(url.toString(), {
    next: { revalidate: Math.round(WAVE_LOCAL_CACHE_TTL_MS / 1000) },
  });
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }
  return asLocationList(await res.json());
}

/**
 * Fetch a batch with TTL cache. On failure, peek() stale ≤ WAVE_STALE_MAX_AGE_MS.
 * Never caches error sentinels.
 */
export async function fetchBatchWithStaleFallback(
  cacheKey: string,
  ttlMs: number,
  points: WaveGridPoint[],
  nowMs = Date.now(),
): Promise<{
  locations: OpenMeteoLocation[];
  fetchedAt: number | null;
  stale: boolean;
  missing: boolean;
}> {
  if (points.length === 0) {
    return { locations: [], fetchedAt: nowMs, stale: false, missing: false };
  }
  try {
    const payload = await waveCache.getOrFetch(cacheKey, ttlMs, async () => {
      const locations = await fetchOpenMeteoBatch(points);
      return { locations, fetchedAt: Date.now() };
    });
    return {
      locations: payload.locations,
      fetchedAt: payload.fetchedAt,
      stale: false,
      missing: false,
    };
  } catch {
    const peeked = waveCache.peek(cacheKey);
    if (peeked && nowMs - peeked.at <= WAVE_STALE_MAX_AGE_MS) {
      return {
        locations: peeked.value.locations,
        fetchedAt: peeked.value.fetchedAt,
        stale: true,
        missing: false,
      };
    }
    return {
      locations: points.map(() => ({
        latitude: 0,
        longitude: 0,
      })),
      fetchedAt: null,
      stale: false,
      missing: true,
    };
  }
}

async function fetchGridBatches(
  scope: "local" | "alps",
  points: WaveGridPoint[],
  ttlMs: number,
  nowMs: number,
): Promise<{
  locations: OpenMeteoLocation[];
  fetchedAt: number | null;
  partial: boolean;
}> {
  const batches = chunkPoints(points, WAVE_BATCH_SIZE);
  const results = await Promise.all(
    batches.map((batch, i) =>
      fetchBatchWithStaleFallback(`${scope}-batch-${i}`, ttlMs, batch, nowMs),
    ),
  );
  const locations: OpenMeteoLocation[] = [];
  let fetchedAt: number | null = null;
  let partial = false;
  for (const result of results) {
    locations.push(...result.locations);
    if (result.stale || result.missing) partial = true;
    if (result.fetchedAt != null) {
      fetchedAt =
        fetchedAt == null ? result.fetchedAt : Math.min(fetchedAt, result.fetchedAt);
    }
  }
  if (results.some((r) => r.missing)) {
    // Align length with points when a batch is fully missing (placeholders).
    while (locations.length < points.length) {
      locations.push({ latitude: 0, longitude: 0 });
    }
  }
  return { locations, fetchedAt, partial };
}

function cellUsesCrest(
  point: WaveGridPoint,
  isLipb: boolean,
  localCrestStrong: boolean,
  alpine: AlpineWindBundle,
): boolean {
  if (isLipb) return localCrestStrong;
  if (!isCrestStrong(alpine)) return false;
  return ALPINE_STATIONS.some((s) => {
    const station = alpine.stations.find((r) => r.id === s.id);
    if (!station || !stationIsStrong(station)) return false;
    return (
      haversineKm(point.lat, point.lon, s.lat, s.lon) < CREST_CELL_RADIUS_KM
    );
  });
}

export function buildWaveRiskBundle(input: {
  localLocations: OpenMeteoLocation[];
  localPoints: WaveGridPoint[];
  alpsLocations?: OpenMeteoLocation[];
  alpsPoints?: WaveGridPoint[];
  alpine: AlpineWindBundle;
  now?: Date;
  fetchedAt?: Date;
  localFetchedAt?: Date | null;
  alpsFetchedAt?: Date | null;
  partial?: boolean;
  callWeight?: WaveRiskBundle["callWeight"];
}): WaveRiskBundle {
  const now = input.now ?? new Date();
  const crestStrong = isCrestStrong(input.alpine);
  const localCrestStrong = isLocalCrestStrong(input.alpine);
  const localPoints = input.localPoints;
  const lipbIdx = pickLipbCellIndex(localPoints);

  const localCells: WaveRiskCell[] = [];
  for (let i = 0; i < localPoints.length; i += 1) {
    const point = localPoints[i]!;
    const loc = input.localLocations[i];
    const elevationM = Number(loc?.elevation ?? LIPB.elevationM);
    const hours = loc?.hourly
      ? parseModelSoundings(loc.hourly, elevationM)
      : [];
    const sounding = soundingForNow(hours, now);
    const isLipb = i === lipbIdx;
    localCells.push(
      cellFromSounding(
        point,
        sounding,
        cellUsesCrest(point, isLipb, localCrestStrong, input.alpine),
        isLipb,
      ),
    );
  }

  const alpsPoints = input.alpsPoints ?? [];
  const alpsLocations = input.alpsLocations ?? [];
  const alpsCells: WaveRiskCell[] = [];
  for (let i = 0; i < alpsPoints.length; i += 1) {
    const point = alpsPoints[i]!;
    const loc = alpsLocations[i];
    const elevationM = Number(loc?.elevation ?? LIPB.elevationM);
    const hours = loc?.hourly
      ? parseModelSoundings(loc.hourly, elevationM)
      : [];
    const sounding = soundingForNow(hours, now);
    alpsCells.push(
      cellFromSounding(
        point,
        sounding,
        cellUsesCrest(point, false, localCrestStrong, input.alpine),
        false,
      ),
    );
  }

  const cells = [...localCells, ...alpsCells];

  function aggregate(list: WaveRiskCell[]): {
    worst: WaveRiskSeverity;
    flagged: number;
  } {
    let worst: WaveRiskSeverity = "quiet";
    let flagged = 0;
    for (const cell of list) {
      if (cell.data !== "ok") continue;
      worst = maxSeverity(worst, cell.severity);
      if (cell.severity !== "quiet") flagged += 1;
    }
    return { worst, flagged };
  }

  const allAgg = aggregate(cells);
  const localAgg = aggregate(localCells);

  const lipb = localCells.find((c) => c.isLipb) ?? null;
  const lipbLoc = input.localLocations[lipbIdx];
  const lipbHours = lipbLoc?.hourly
    ? parseModelSoundings(
        lipbLoc.hourly,
        Number(lipbLoc.elevation ?? LIPB.elevationM),
      )
    : [];
  const lipbSounding = soundingForNow(lipbHours, now);
  const lipbHazards = lipbSounding
    ? soundingHazards(lipbSounding, { crestStrong: localCrestStrong })
    : [];

  const fetchedAt = input.fetchedAt ?? now;
  return {
    fetchedAt: fetchedAt.toISOString(),
    localFetchedAt: input.localFetchedAt
      ? input.localFetchedAt.toISOString()
      : null,
    alpsFetchedAt: input.alpsFetchedAt
      ? input.alpsFetchedAt.toISOString()
      : null,
    hourIso: lipbSounding?.atIso ?? null,
    crestStrong,
    localCrestStrong,
    worstSeverity: allAgg.worst,
    flaggedCellCount: allAgg.flagged,
    localWorstSeverity: localAgg.worst,
    localFlaggedCellCount: localAgg.flagged,
    cells,
    lipb,
    lipbHazards,
    partial: input.partial,
    callWeight: input.callWeight,
  };
}

function emptyBundle(
  now: Date,
  error?: string,
  extras: Partial<WaveRiskBundle> = {},
): WaveRiskBundle {
  return {
    fetchedAt: now.toISOString(),
    localFetchedAt: null,
    alpsFetchedAt: null,
    hourIso: null,
    crestStrong: false,
    localCrestStrong: false,
    worstSeverity: "quiet",
    flaggedCellCount: 0,
    localWorstSeverity: "quiet",
    localFlaggedCellCount: 0,
    cells: [],
    lipb: null,
    lipbHazards: [],
    error,
    ...extras,
  };
}

export async function fetchWaveRisk(
  now = new Date(),
  options: { alpine?: AlpineWindBundle; targetTime?: Date } = {},
): Promise<WaveRiskBundle> {
  const localPoints = localWaveGridPoints();
  const alpsPoints = alpsWaveGridPoints();
  const evalTime = options.targetTime ?? now;
  const nowMs = now.getTime();
  const useLiveCrest =
    Math.abs(evalTime.getTime() - now.getTime()) <= 3 * 60 * 60 * 1000;

  const callWeight = {
    local: openMeteoCallWeight(localPoints.length),
    alps: openMeteoCallWeight(alpsPoints.length),
    total: openMeteoCallWeight(localPoints.length + alpsPoints.length),
  };
  console.info(
    `[wave-risk] Open-Meteo call weight local=${callWeight.local} alps=${callWeight.alps} total=${callWeight.total} (locations ${localPoints.length}+${alpsPoints.length})`,
  );

  try {
    const [alpine, localRaw, alpsRaw] = await Promise.all([
      useLiveCrest
        ? (options.alpine ?? fetchAlpineWind(now))
        : Promise.resolve<AlpineWindBundle>({
            stations: [],
            fetchedAt: now.toISOString(),
          }),
      fetchGridBatches("local", localPoints, WAVE_LOCAL_CACHE_TTL_MS, nowMs),
      fetchGridBatches("alps", alpsPoints, WAVE_ALPS_CACHE_TTL_MS, nowMs),
    ]);

    if (
      localRaw.locations.every((l) => !l.hourly) &&
      alpsRaw.locations.every((l) => !l.hourly)
    ) {
      return emptyBundle(now, "Open-Meteo wave grid unavailable", {
        crestStrong: useLiveCrest ? isCrestStrong(alpine) : false,
        localCrestStrong: useLiveCrest ? isLocalCrestStrong(alpine) : false,
        partial: true,
        callWeight,
      });
    }

    const partial = localRaw.partial || alpsRaw.partial;
    return buildWaveRiskBundle({
      localLocations: localRaw.locations,
      localPoints,
      alpsLocations: alpsRaw.locations,
      alpsPoints,
      alpine,
      now: evalTime,
      fetchedAt: now,
      localFetchedAt: localRaw.fetchedAt
        ? new Date(localRaw.fetchedAt)
        : null,
      alpsFetchedAt: alpsRaw.fetchedAt ? new Date(alpsRaw.fetchedAt) : null,
      partial,
      callWeight,
    });
  } catch (error) {
    return emptyBundle(
      now,
      error instanceof Error ? error.message : "Wave risk unavailable",
      { callWeight },
    );
  }
}

/** Test helper: clear wave Open-Meteo batch cache. */
export function clearWaveRiskCache(): void {
  waveCache.clear();
}

export { SOUNDING_MAX_ALT_M, WAVE_RISK_BBOX, ALPS_BBOX };
