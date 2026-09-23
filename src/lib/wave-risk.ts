/** Regional mountain-wave / shear risk around LIPB (model + crest, ≤ 3500 m). */

import {
  LIPB,
  SOUNDING_MAX_ALT_M,
  WAVE_RISK_BBOX,
  WAVE_RISK_GRID,
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

export type WaveRiskCell = {
  id: string;
  lat: number;
  lon: number;
  severity: WaveRiskSeverity;
  shearKtPer1000ft: number | null;
  midWindKt: number | null;
  midPHpa: number | null;
  isLipb: boolean;
};

export type WaveRiskBundle = {
  fetchedAt: string;
  hourIso: string | null;
  crestStrong: boolean;
  worstSeverity: WaveRiskSeverity;
  flaggedCellCount: number;
  cells: WaveRiskCell[];
  lipb: WaveRiskCell | null;
  lipbHazards: SoundingHazard[];
  error?: string;
};

type CacheEntry<T> = { at: number; value: T };
const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function waveRiskGridPoints(
  bbox: { lamin: number; lamax: number; lomin: number; lomax: number } = WAVE_RISK_BBOX,
  cols: number = WAVE_RISK_GRID.cols,
  rows: number = WAVE_RISK_GRID.rows,
): { lat: number; lon: number; id: string }[] {
  const points: { lat: number; lon: number; id: string }[] = [];
  for (let row = 0; row < rows; row += 1) {
    const latFrac = rows <= 1 ? 0.5 : row / (rows - 1);
    const lat = bbox.lamin + latFrac * (bbox.lamax - bbox.lamin);
    for (let col = 0; col < cols; col += 1) {
      const lonFrac = cols <= 1 ? 0.5 : col / (cols - 1);
      const lon = bbox.lomin + lonFrac * (bbox.lomax - bbox.lomin);
      points.push({
        lat: Math.round(lat * 10_000) / 10_000,
        lon: Math.round(lon * 10_000) / 10_000,
        id: `r${row}c${col}`,
      });
    }
  }
  return points;
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
  shearKtPer1000ft: number | null;
  midWindKt: number | null;
  midPHpa: number | null;
} {
  const capped = levelsWithinAlt(sounding.levels);
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
    return { severity: "wave", shearKtPer1000ft: shear, midWindKt, midPHpa };
  }
  if (shear !== null && shear >= SOUNDING_SHEAR_KT_PER_1000FT) {
    return { severity: "shear", shearKtPer1000ft: shear, midWindKt, midPHpa };
  }
  return { severity: "quiet", shearKtPer1000ft: shear, midWindKt, midPHpa };
}

export function isCrestStrong(alpine: AlpineWindBundle): boolean {
  return alpine.stations.some(
    (s) =>
      !s.error &&
      ((s.windKt !== null && s.windKt >= ALPINE_WIND_STRONG_KT) ||
        (s.gustKt !== null && s.gustKt >= ALPINE_WIND_STRONG_KT)),
  );
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
  id: string,
  lat: number,
  lon: number,
  sounding: SoundingHour | null,
  crestStrong: boolean,
  isLipb: boolean,
): WaveRiskCell {
  if (!sounding) {
    return {
      id,
      lat,
      lon,
      severity: "quiet",
      shearKtPer1000ft: null,
      midWindKt: null,
      midPHpa: null,
      isLipb,
    };
  }
  const scored = scoreSoundingSeverity(sounding, crestStrong && isLipb);
  return {
    id,
    lat,
    lon,
    severity: scored.severity,
    shearKtPer1000ft:
      scored.shearKtPer1000ft === null
        ? null
        : Math.round(scored.shearKtPer1000ft * 10) / 10,
    midWindKt: scored.midWindKt,
    midPHpa: scored.midPHpa,
    isLipb,
  };
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
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

type OpenMeteoLocation = {
  latitude: number;
  longitude: number;
  elevation?: number;
  hourly?: OpenMeteoHourly;
};

function asLocationList(data: unknown): OpenMeteoLocation[] {
  if (Array.isArray(data)) return data as OpenMeteoLocation[];
  if (data && typeof data === "object") return [data as OpenMeteoLocation];
  return [];
}

export function buildWaveRiskBundle(input: {
  locations: OpenMeteoLocation[];
  points: { lat: number; lon: number; id: string }[];
  alpine: AlpineWindBundle;
  now?: Date;
  fetchedAt?: Date;
}): WaveRiskBundle {
  const now = input.now ?? new Date();
  const crestStrong = isCrestStrong(input.alpine);
  const lipbIdx = pickLipbCellIndex(input.points);
  const cells: WaveRiskCell[] = [];

  for (let i = 0; i < input.points.length; i += 1) {
    const point = input.points[i];
    const loc = input.locations[i];
    const elevationM = Number(loc?.elevation ?? LIPB.elevationM);
    const hours = loc?.hourly
      ? parseModelSoundings(loc.hourly, elevationM)
      : [];
    const sounding = soundingForNow(hours, now);
    // Crest coupling: apply crestStrong to LIPB cell and to cells near strong stations.
    const nearCrest =
      crestStrong &&
      (i === lipbIdx ||
        ALPINE_STATIONS.some((s) => {
          const station = input.alpine.stations.find((r) => r.id === s.id);
          if (
            !station ||
            station.error ||
            ((station.windKt ?? 0) < ALPINE_WIND_STRONG_KT &&
              (station.gustKt ?? 0) < ALPINE_WIND_STRONG_KT)
          ) {
            return false;
          }
          return haversineKm(point.lat, point.lon, s.lat, s.lon) < 40;
        }));
    cells.push(
      cellFromSounding(
        point.id,
        point.lat,
        point.lon,
        sounding,
        nearCrest,
        i === lipbIdx,
      ),
    );
  }

  const lipb = cells.find((c) => c.isLipb) ?? null;
  let worstSeverity: WaveRiskSeverity = "quiet";
  let flaggedCellCount = 0;
  for (const cell of cells) {
    worstSeverity = maxSeverity(worstSeverity, cell.severity);
    if (cell.severity !== "quiet") flaggedCellCount += 1;
  }

  const lipbLoc = input.locations[lipbIdx];
  const lipbHours = lipbLoc?.hourly
    ? parseModelSoundings(
        lipbLoc.hourly,
        Number(lipbLoc.elevation ?? LIPB.elevationM),
      )
    : [];
  const lipbSounding = soundingForNow(lipbHours, now);
  const lipbHazards = lipbSounding
    ? soundingHazards(lipbSounding, { crestStrong })
    : [];

  return {
    fetchedAt: (input.fetchedAt ?? now).toISOString(),
    hourIso: lipbSounding?.atIso ?? null,
    crestStrong,
    worstSeverity,
    flaggedCellCount,
    cells,
    lipb,
    lipbHazards,
  };
}

export async function fetchWaveRisk(now = new Date()): Promise<WaveRiskBundle> {
  return cached("wave-risk", 30 * 60_000, async () => {
    const points = waveRiskGridPoints();
    try {
      const alpine = await fetchAlpineWind(now);
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", points.map((p) => p.lat).join(","));
      url.searchParams.set("longitude", points.map((p) => p.lon).join(","));
      url.searchParams.set("timezone", LIPB.timezone);
      url.searchParams.set("forecast_days", "2");
      url.searchParams.set("hourly", waveRiskHourlyParams());
      const res = await fetch(url.toString(), { next: { revalidate: 1800 } });
      if (!res.ok) {
        return {
          fetchedAt: now.toISOString(),
          hourIso: null,
          crestStrong: isCrestStrong(alpine),
          worstSeverity: "quiet" as const,
          flaggedCellCount: 0,
          cells: [],
          lipb: null,
          lipbHazards: [],
          error: `Open-Meteo HTTP ${res.status}`,
        };
      }
      const data = asLocationList(await res.json());
      return buildWaveRiskBundle({
        locations: data,
        points,
        alpine,
        now,
        fetchedAt: now,
      });
    } catch (error) {
      return {
        fetchedAt: now.toISOString(),
        hourIso: null,
        crestStrong: false,
        worstSeverity: "quiet",
        flaggedCellCount: 0,
        cells: [],
        lipb: null,
        lipbHazards: [],
        error: error instanceof Error ? error.message : "Wave risk unavailable",
      };
    }
  });
}

export { SOUNDING_MAX_ALT_M, WAVE_RISK_BBOX };
