/** High-altitude wind for Föhn awareness around LIPB. */

export const MS_TO_KT = 1.943844;
export const ALPINE_WIND_STRONG_KT = 25;

export type AlpineRegion = "ST" | "TN" | "AT";
export type AlpineSource = "siag" | "geosphere" | "meteotrentino";

export type AlpineStationConfig = {
  id: string;
  name: string;
  elevM: number;
  region: AlpineRegion;
  source: AlpineSource;
  /** Provider station code / id */
  code: string;
  lat: number;
  lon: number;
};

export type WindSample = {
  at: Date;
  windKt: number;
};

export type AlpineStationReading = {
  id: string;
  name: string;
  elevM: number;
  region: AlpineRegion;
  source: AlpineSource;
  lat: number;
  lon: number;
  observedAt: Date | null;
  ageMin: number | null;
  windDirDeg: number | null;
  windKt: number | null;
  gustKt: number | null;
  history: WindSample[];
  error?: string;
};

export type AlpineWindBundle = {
  stations: AlpineStationReading[];
  fetchedAt: string;
  error?: string;
};

export const ALPINE_STATIONS: AlpineStationConfig[] = [
  {
    id: "rittner-horn",
    name: "Rittner Horn",
    elevM: 2260,
    region: "ST",
    source: "siag",
    code: "82500WS",
    lat: 46.6156,
    lon: 11.4604,
  },
  {
    id: "jaufenkamm",
    name: "Jaufenkamm",
    elevM: 2145,
    region: "ST",
    source: "siag",
    code: "35100WS",
    lat: 46.8401,
    lon: 11.3184,
  },
  {
    id: "plose",
    name: "Plose",
    elevM: 2472,
    region: "ST",
    source: "siag",
    code: "69900MS",
    lat: 46.6986,
    lon: 11.7338,
  },
  {
    id: "signalgipfel",
    name: "Signalgipfel",
    elevM: 3399,
    region: "ST",
    source: "siag",
    code: "34200WS",
    lat: 46.9684,
    lon: 11.1929,
  },
  {
    id: "gantkofel",
    name: "Gantkofel",
    elevM: 1860,
    region: "ST",
    source: "siag",
    code: "90200MS",
    lat: 46.4939,
    lon: 11.209,
  },
  {
    id: "pens-tramintal",
    name: "Pens Tramintal",
    elevM: 2100,
    region: "ST",
    source: "siag",
    code: "80100SF",
    lat: 46.795,
    lon: 11.4774,
  },
  {
    id: "paganella",
    name: "Paganella",
    elevM: 1790,
    region: "TN",
    source: "meteotrentino",
    code: "T0406",
    lat: 46.143,
    lon: 11.0215,
  },
  {
    id: "patscherkofel",
    name: "Patscherkofel",
    elevM: 2251,
    region: "AT",
    source: "geosphere",
    code: "11126",
    lat: 47.2089,
    lon: 11.4622,
  },
  {
    id: "brenner-neu",
    name: "Brenner Neu",
    elevM: 1412,
    region: "AT",
    source: "geosphere",
    code: "11129",
    lat: 47.0072,
    lon: 11.5108,
  },
];

const SIAG_BASE = "https://geoservices.buergernetz.bz.it/services/meteo/v1";
const GEOSPHERE_BASE = "https://dataset.api.hub.geosphere.at/v1/station";
const METEOTRENTINO_URL =
  "https://dati.meteotrentino.it/service.asmx/ultimiDatiStazione";

const HISTORY_MS = 3 * 60 * 60 * 1000;
const CACHE_TTL_MS = 3 * 60_000;

type CacheEntry<T> = { at: number; value: T };
const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const promise = fn()
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      inflight.delete(key);
      return value;
    })
    .catch((error) => {
      inflight.delete(key);
      throw error;
    });
  inflight.set(key, promise);
  return promise;
}

export function msToKt(ms: number): number {
  return ms * MS_TO_KT;
}

export function roundKt(ms: number | null | undefined): number | null {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return null;
  return Math.round(msToKt(ms));
}

/** Parse SIAG timestamps like `2026-09-22T10:30:00CEST` or ISO with offset. */
export function parseSiagDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withOffset = trimmed
    .replace(/CEST$/i, "+02:00")
    .replace(/CET$/i, "+01:00")
    .replace(/CEST/i, "+02:00")
    .replace(/CET/i, "+01:00");
  const d = new Date(withOffset);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ageMinutes(observedAt: Date | null, now = new Date()): number | null {
  if (!observedAt) return null;
  return Math.max(0, Math.round((now.getTime() - observedAt.getTime()) / 60_000));
}

type SiagSensor = {
  SCODE?: string;
  TYPE?: string;
  DATE?: string;
  VALUE?: number | string | null;
};

type SiagSeriesPoint = {
  DATE?: string;
  VALUE?: number | string | null;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function emptyReading(
  cfg: AlpineStationConfig,
  error?: string,
): AlpineStationReading {
  return {
    id: cfg.id,
    name: cfg.name,
    elevM: cfg.elevM,
    region: cfg.region,
    source: cfg.source,
    lat: cfg.lat,
    lon: cfg.lon,
    observedAt: null,
    ageMin: null,
    windDirDeg: null,
    windKt: null,
    gustKt: null,
    history: [],
    error,
  };
}

function filterHistory(samples: WindSample[], now: Date): WindSample[] {
  const cut = now.getTime() - HISTORY_MS;
  return samples
    .filter((s) => s.at.getTime() >= cut)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

export async function fetchSiagStation(
  cfg: AlpineStationConfig,
  now = new Date(),
): Promise<AlpineStationReading> {
  try {
    const [sensorsRes, seriesRes] = await Promise.all([
      fetch(`${SIAG_BASE}/sensors?station_code=${encodeURIComponent(cfg.code)}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 180 },
      }),
      fetch(
        `${SIAG_BASE}/timeseries?station_code=${encodeURIComponent(cfg.code)}&sensor_code=WG`,
        { headers: { Accept: "application/json" }, next: { revalidate: 180 } },
      ),
    ]);

    if (!sensorsRes.ok) {
      return emptyReading(cfg, `SIAG sensors HTTP ${sensorsRes.status}`);
    }

    const sensors = (await sensorsRes.json()) as SiagSensor[];
    const byType = new Map(sensors.map((s) => [s.TYPE ?? "", s]));
    const wg = byType.get("WG");
    const wr = byType.get("WR");
    const gust = byType.get("WG.BOE");

    const observedAt =
      parseSiagDate(wg?.DATE ?? wr?.DATE ?? gust?.DATE ?? "") ?? null;

    let history: WindSample[] = [];
    if (seriesRes.ok) {
      const series = (await seriesRes.json()) as SiagSeriesPoint[];
      history = filterHistory(
        series
          .map((p) => {
            const at = parseSiagDate(p.DATE ?? "");
            const ms = num(p.VALUE);
            if (!at || ms === null) return null;
            return { at, windKt: msToKt(ms) };
          })
          .filter((x): x is WindSample => x !== null),
        now,
      );
    }

    const windMs = num(wg?.VALUE);
    if (windMs === null && history.length === 0) {
      return emptyReading(cfg, "No wind data");
    }

    return {
      ...emptyReading(cfg),
      observedAt,
      ageMin: ageMinutes(observedAt, now),
      windDirDeg: num(wr?.VALUE),
      windKt: roundKt(windMs),
      gustKt: roundKt(num(gust?.VALUE)),
      history,
    };
  } catch (error) {
    return emptyReading(
      cfg,
      error instanceof Error ? error.message : "SIAG unavailable",
    );
  }
}

type GeoSphereFeatureCollection = {
  timestamps?: string[];
  features?: Array<{
    properties?: {
      station?: string;
      parameters?: Record<
        string,
        { data?: Array<number | null>; unit?: string }
      >;
    };
  }>;
};

function geoSphereLatest(
  data: GeoSphereFeatureCollection,
): {
  at: Date | null;
  ff: number | null;
  dd: number | null;
  ffx: number | null;
} {
  const stamps = data.timestamps ?? [];
  const params = data.features?.[0]?.properties?.parameters ?? {};
  let lastIdx = -1;
  for (let i = stamps.length - 1; i >= 0; i--) {
    const ff = params.FF?.data?.[i];
    if (ff !== null && ff !== undefined && Number.isFinite(ff)) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx < 0) {
    return { at: null, ff: null, dd: null, ffx: null };
  }
  const at = new Date(stamps[lastIdx]!);
  return {
    at: Number.isNaN(at.getTime()) ? null : at,
    ff: num(params.FF?.data?.[lastIdx]),
    dd: num(params.DD?.data?.[lastIdx]),
    ffx: num(params.FFX?.data?.[lastIdx]),
  };
}

function geoSphereHistory(
  data: GeoSphereFeatureCollection,
  now: Date,
): WindSample[] {
  const stamps = data.timestamps ?? [];
  const ff = data.features?.[0]?.properties?.parameters?.FF?.data ?? [];
  const samples: WindSample[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const v = ff[i];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const at = new Date(stamps[i]!);
    if (Number.isNaN(at.getTime())) continue;
    samples.push({ at, windKt: msToKt(v) });
  }
  return filterHistory(samples, now);
}

export async function fetchGeosphereStation(
  cfg: AlpineStationConfig,
  now = new Date(),
): Promise<AlpineStationReading> {
  try {
    const end = now.toISOString().slice(0, 16);
    const start = new Date(now.getTime() - HISTORY_MS).toISOString().slice(0, 16);
    const currentUrl = `${GEOSPHERE_BASE}/current/tawes-v1-10min?parameters=FF,DD,FFX&station_ids=${cfg.code}`;
    const histUrl = `${GEOSPHERE_BASE}/historical/tawes-v1-10min?parameters=FF,DD&station_ids=${cfg.code}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

    const [curRes, histRes] = await Promise.all([
      fetch(currentUrl, {
        headers: { Accept: "application/json" },
        next: { revalidate: 180 },
      }),
      fetch(histUrl, {
        headers: { Accept: "application/json" },
        next: { revalidate: 180 },
      }),
    ]);

    if (!curRes.ok) {
      // FFX may be missing on some stations — retry without gust
      const retry = await fetch(
        `${GEOSPHERE_BASE}/current/tawes-v1-10min?parameters=FF,DD&station_ids=${cfg.code}`,
        { headers: { Accept: "application/json" }, next: { revalidate: 180 } },
      );
      if (!retry.ok) {
        return emptyReading(cfg, `GeoSphere HTTP ${curRes.status}`);
      }
      const data = (await retry.json()) as GeoSphereFeatureCollection;
      const latest = geoSphereLatest(data);
      let history: WindSample[] = [];
      if (histRes.ok) {
        history = geoSphereHistory(
          (await histRes.json()) as GeoSphereFeatureCollection,
          now,
        );
      }
      if (latest.ff === null) return emptyReading(cfg, "No wind data");
      return {
        ...emptyReading(cfg),
        observedAt: latest.at,
        ageMin: ageMinutes(latest.at, now),
        windDirDeg: latest.dd,
        windKt: roundKt(latest.ff),
        gustKt: null,
        history,
      };
    }

    const data = (await curRes.json()) as GeoSphereFeatureCollection;
    const latest = geoSphereLatest(data);
    let history: WindSample[] = [];
    if (histRes.ok) {
      history = geoSphereHistory(
        (await histRes.json()) as GeoSphereFeatureCollection,
        now,
      );
    }
    if (latest.ff === null) return emptyReading(cfg, "No wind data");
    return {
      ...emptyReading(cfg),
      observedAt: latest.at,
      ageMin: ageMinutes(latest.at, now),
      windDirDeg: latest.dd,
      windKt: roundKt(latest.ff),
      gustKt: roundKt(latest.ffx),
      history,
    };
  } catch (error) {
    return emptyReading(
      cfg,
      error instanceof Error ? error.message : "GeoSphere unavailable",
    );
  }
}

export type MeteotrentinoWindPoint = {
  at: Date;
  windMs: number;
  gustMs: number | null;
  dirDeg: number | null;
};

/** Parse Meteotrentino `venti` / `vento_al_suolo` blocks from XML text. */
export function parseMeteotrentinoWindXml(xml: string): MeteotrentinoWindPoint[] {
  const points: MeteotrentinoWindPoint[] = [];
  const re =
    /<vento_al_suolo\b[^>]*>[\s\S]*?<data>([^<]+)<\/data>[\s\S]*?<v>([^<]*)<\/v>[\s\S]*?<vmax>([^<]*)<\/vmax>[\s\S]*?<d>([^<]*)<\/d>[\s\S]*?<\/vento_al_suolo>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const at = new Date(m[1]!.trim());
    const windMs = num(m[2]);
    const gustMs = num(m[3]);
    const dirDeg = num(m[4]);
    if (Number.isNaN(at.getTime()) || windMs === null) continue;
    points.push({ at, windMs, gustMs, dirDeg });
  }
  return points.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export async function fetchMeteotrentinoStation(
  cfg: AlpineStationConfig,
  now = new Date(),
): Promise<AlpineStationReading> {
  try {
    const res = await fetch(
      `${METEOTRENTINO_URL}?codice=${encodeURIComponent(cfg.code)}`,
      { headers: { Accept: "application/xml, text/xml, */*" }, next: { revalidate: 180 } },
    );
    if (!res.ok) {
      return emptyReading(cfg, `Meteotrentino HTTP ${res.status}`);
    }
    const xml = await res.text();
    const points = parseMeteotrentinoWindXml(xml);
    if (points.length === 0) {
      return emptyReading(cfg, "No wind data");
    }
    const latest = points[points.length - 1]!;
    const history = filterHistory(
      points.map((p) => ({ at: p.at, windKt: msToKt(p.windMs) })),
      now,
    );
    return {
      ...emptyReading(cfg),
      observedAt: latest.at,
      ageMin: ageMinutes(latest.at, now),
      windDirDeg: latest.dirDeg,
      windKt: roundKt(latest.windMs),
      gustKt: roundKt(latest.gustMs),
      history,
    };
  } catch (error) {
    return emptyReading(
      cfg,
      error instanceof Error ? error.message : "Meteotrentino unavailable",
    );
  }
}

async function fetchStation(
  cfg: AlpineStationConfig,
  now: Date,
): Promise<AlpineStationReading> {
  if (cfg.source === "siag") return fetchSiagStation(cfg, now);
  if (cfg.source === "geosphere") return fetchGeosphereStation(cfg, now);
  return fetchMeteotrentinoStation(cfg, now);
}

export async function fetchAlpineWind(now = new Date()): Promise<AlpineWindBundle> {
  return cached("alpine-wind", CACHE_TTL_MS, async () => {
    try {
      const stations = await Promise.all(
        ALPINE_STATIONS.map((cfg) => fetchStation(cfg, now)),
      );
      const ok = stations.filter((s) => !s.error && s.windKt !== null);
      return {
        stations,
        fetchedAt: now.toISOString(),
        error: ok.length === 0 ? "No alpine wind stations available" : undefined,
      };
    } catch (error) {
      return {
        stations: ALPINE_STATIONS.map((cfg) =>
          emptyReading(
            cfg,
            error instanceof Error ? error.message : "Alpine wind unavailable",
          ),
        ),
        fetchedAt: now.toISOString(),
        error: error instanceof Error ? error.message : "Alpine wind unavailable",
      };
    }
  });
}
