/** High-altitude wind for Föhn awareness around LIPB. */

import { TtlCache } from "@/lib/cache";

export const MS_TO_KT = 1.943844;
export const ALPINE_WIND_STRONG_KT = 25;

export type AlpineRegion = "ST" | "TN" | "AT" | "CH";
export type AlpineSource = "siag" | "geosphere" | "meteotrentino" | "meteoswiss";

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
  {
    id: "sonnblick",
    name: "Sonnblick",
    elevM: 3109,
    region: "AT",
    source: "geosphere",
    /** TAWES id — not synop 11320 (Innsbruck Uni). */
    code: "11343",
    lat: 47.0542,
    lon: 12.9575,
  },
  {
    id: "feuerkogel",
    name: "Feuerkogel",
    elevM: 1618,
    region: "AT",
    source: "geosphere",
    /** TAWES id — not 11121 (Innsbruck airport). */
    code: "11155",
    lat: 47.8167,
    lon: 13.7178,
  },
  {
    id: "villacher-alpe",
    name: "Villacher Alpe",
    elevM: 2117,
    region: "AT",
    source: "geosphere",
    /** TAWES automatic — 11212 is not in tawes-v1-10min. */
    code: "11265",
    lat: 46.6036,
    lon: 13.6728,
  },
  {
    id: "saentis",
    name: "Säntis",
    elevM: 2502,
    region: "CH",
    source: "meteoswiss",
    code: "SAE",
    lat: 47.2494,
    lon: 9.3435,
  },
  {
    id: "guetsch",
    name: "Gütsch",
    elevM: 2287,
    region: "CH",
    source: "meteoswiss",
    code: "GUE",
    lat: 46.6525,
    lon: 8.6155,
  },
  {
    id: "jungfraujoch",
    name: "Jungfraujoch",
    elevM: 3580,
    region: "CH",
    source: "meteoswiss",
    code: "JUN",
    lat: 46.5476,
    lon: 7.9854,
  },
  {
    id: "corvatsch",
    name: "Piz Corvatsch",
    elevM: 3305,
    region: "CH",
    source: "meteoswiss",
    code: "COV",
    lat: 46.418,
    lon: 9.8213,
  },
];

const SIAG_BASE = "https://geoservices.buergernetz.bz.it/services/meteo/v1";
const GEOSPHERE_BASE = "https://dataset.api.hub.geosphere.at/v1/station";
const METEOTRENTINO_URL =
  "https://dati.meteotrentino.it/service.asmx/ultimiDatiStazione";
const METEOSWISS_STAC_ITEM =
  "https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-smn/items";

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

export function kmhToKt(kmh: number): number {
  return kmh / 1.852;
}

export function roundKt(ms: number | null | undefined): number | null {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return null;
  return Math.round(msToKt(ms));
}

export function roundKmhToKt(kmh: number | null | undefined): number | null {
  if (kmh === null || kmh === undefined || Number.isNaN(kmh)) return null;
  return Math.round(kmhToKt(kmh));
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

type GeoSphereFeature = {
  properties?: {
    station?: string | number;
    parameters?: Record<
      string,
      { data?: Array<number | null>; unit?: string }
    >;
  };
};

type GeoSphereFeatureCollection = {
  timestamps?: string[];
  features?: GeoSphereFeature[];
};

const geoSphereCache = new TtlCache<AlpineStationReading[]>();
/** On HTTP 429, serve stale GeoSphere batch up to this age. */
const GEOSPHERE_STALE_MAX_AGE_MS = 3 * 60 * 60_000;
const GEOSPHERE_CACHE_KEY = "geosphere-all";

function geoSphereFeatureForStation(
  data: GeoSphereFeatureCollection,
  code: string,
): GeoSphereFeature | undefined {
  const features = data.features ?? [];
  return (
    features.find((f) => String(f.properties?.station ?? "") === code) ??
    (features.length === 1 ? features[0] : undefined)
  );
}

function geoSphereLatest(
  data: GeoSphereFeatureCollection,
  code: string,
): {
  at: Date | null;
  ff: number | null;
  dd: number | null;
  ffx: number | null;
} {
  const stamps = data.timestamps ?? [];
  const feature = geoSphereFeatureForStation(data, code);
  const params = feature?.properties?.parameters ?? {};
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
  code: string,
  now: Date,
): WindSample[] {
  const stamps = data.timestamps ?? [];
  const feature = geoSphereFeatureForStation(data, code);
  const ff = feature?.properties?.parameters?.FF?.data ?? [];
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

function readingsFromGeospherePayload(
  cfgs: AlpineStationConfig[],
  current: GeoSphereFeatureCollection,
  history: GeoSphereFeatureCollection | null,
  now: Date,
  includeGust: boolean,
): AlpineStationReading[] {
  return cfgs.map((cfg) => {
    const latest = geoSphereLatest(current, cfg.code);
    if (latest.ff === null) return emptyReading(cfg, "No wind data");
    return {
      ...emptyReading(cfg),
      observedAt: latest.at,
      ageMin: ageMinutes(latest.at, now),
      windDirDeg: latest.dd,
      windKt: roundKt(latest.ff),
      gustKt: includeGust ? roundKt(latest.ffx) : null,
      history: history ? geoSphereHistory(history, cfg.code, now) : [],
    };
  });
}

async function fetchGeosphereJson(
  url: string,
): Promise<{ status: number; data: GeoSphereFeatureCollection | null }> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 180 },
  });
  if (res.status === 429) {
    throw new Error("GeoSphere HTTP 429");
  }
  if (!res.ok) {
    return { status: res.status, data: null };
  }
  return {
    status: res.status,
    data: (await res.json()) as GeoSphereFeatureCollection,
  };
}

/**
 * Fetch current (+ optional history) for a set of station ids.
 * On HTTP 400 (e.g. one bad id), falls back to per-station requests so a
 * single invalid id cannot wipe the whole AT crest set.
 */
export async function fetchGeosphereStationsUncached(
  cfgs: AlpineStationConfig[],
  now = new Date(),
): Promise<AlpineStationReading[]> {
  if (cfgs.length === 0) return [];

  const ids = cfgs.map((c) => c.code).join(",");
  const end = now.toISOString().slice(0, 16);
  const start = new Date(now.getTime() - HISTORY_MS)
    .toISOString()
    .slice(0, 16);
  const currentUrl = `${GEOSPHERE_BASE}/current/tawes-v1-10min?parameters=FF,DD,FFX&station_ids=${ids}`;
  const histUrl = `${GEOSPHERE_BASE}/historical/tawes-v1-10min?parameters=FF,DD&station_ids=${ids}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

  const [cur, hist] = await Promise.all([
    fetchGeosphereJson(currentUrl),
    fetchGeosphereJson(histUrl).catch(() => ({
      status: 0,
      data: null as GeoSphereFeatureCollection | null,
    })),
  ]);

  if (cur.status === 400 || (cur.status >= 400 && !cur.data)) {
    if (cfgs.length > 1) {
      const parts = await Promise.all(
        cfgs.map((cfg) => fetchGeosphereStationsUncached([cfg], now)),
      );
      return parts.flat();
    }
    // Retry single station without FFX (some stations omit gust)
    if (cur.status !== 400) {
      const retry = await fetchGeosphereJson(
        `${GEOSPHERE_BASE}/current/tawes-v1-10min?parameters=FF,DD&station_ids=${ids}`,
      );
      if (retry.data) {
        return readingsFromGeospherePayload(
          cfgs,
          retry.data,
          hist.data,
          now,
          false,
        );
      }
    }
    return cfgs.map((cfg) =>
      emptyReading(cfg, `GeoSphere HTTP ${cur.status || 400}`),
    );
  }

  if (!cur.data) {
    if (cfgs.length > 1) {
      const parts = await Promise.all(
        cfgs.map((cfg) => fetchGeosphereStationsUncached([cfg], now)),
      );
      return parts.flat();
    }
    const retry = await fetchGeosphereJson(
      `${GEOSPHERE_BASE}/current/tawes-v1-10min?parameters=FF,DD&station_ids=${ids}`,
    );
    if (retry.data) {
      return readingsFromGeospherePayload(
        cfgs,
        retry.data,
        hist.data,
        now,
        false,
      );
    }
    return cfgs.map((cfg) =>
      emptyReading(cfg, `GeoSphere HTTP ${cur.status}`),
    );
  }

  return readingsFromGeospherePayload(
    cfgs,
    cur.data,
    hist.data,
    now,
    true,
  );
}

/** Batched GeoSphere fetch with TTL cache and stale-on-429 fallback. */
export async function fetchGeosphereStations(
  cfgs: AlpineStationConfig[],
  now = new Date(),
): Promise<AlpineStationReading[]> {
  if (cfgs.length === 0) return [];
  try {
    return await geoSphereCache.getOrFetch(
      GEOSPHERE_CACHE_KEY,
      CACHE_TTL_MS,
      () => fetchGeosphereStationsUncached(cfgs, now),
    );
  } catch (error) {
    const peeked = geoSphereCache.peek(GEOSPHERE_CACHE_KEY);
    if (peeked && Date.now() - peeked.at <= GEOSPHERE_STALE_MAX_AGE_MS) {
      return peeked.value;
    }
    const msg =
      error instanceof Error ? error.message : "GeoSphere unavailable";
    return cfgs.map((cfg) => emptyReading(cfg, msg));
  }
}

export async function fetchGeosphereStation(
  cfg: AlpineStationConfig,
  now = new Date(),
): Promise<AlpineStationReading> {
  const [reading] = await fetchGeosphereStationsUncached([cfg], now);
  return reading ?? emptyReading(cfg, "GeoSphere unavailable");
}

/** Test helper: clear GeoSphere batch cache. */
export function clearGeosphereCache(): void {
  geoSphereCache.clear();
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

export type MeteoSwissCsvRow = {
  at: Date;
  windKmh: number | null;
  gustKmh: number | null;
  dirDeg: number | null;
};

/** Parse SwissMetNet 10-min CSV (`ogd-smn_*_t_now.csv`): semicolon, DD.MM.YYYY HH:mm UTC. */
export function parseMeteoSwissSmnCsv(csv: string): MeteoSwissCsvRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0]!.split(";").map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iTs = idx("reference_timestamp");
  const iWind = idx("fu3010z0");
  const iGust = idx("fu3010z1");
  const iDir = idx("dkl010z0");
  if (iTs < 0 || iWind < 0) return [];

  const rows: MeteoSwissCsvRow[] = [];
  for (let li = 1; li < lines.length; li += 1) {
    const cols = lines[li]!.split(";");
    const rawTs = cols[iTs]?.trim() ?? "";
    const at = parseMeteoSwissTimestamp(rawTs);
    if (!at) continue;
    rows.push({
      at,
      windKmh: num(cols[iWind]),
      gustKmh: iGust >= 0 ? num(cols[iGust]) : null,
      dirDeg: iDir >= 0 ? num(cols[iDir]) : null,
    });
  }
  return rows.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** `18.10.2026 00:40` → UTC Date (MeteoSwiss SwissMetNet timestamps are UTC). */
export function parseMeteoSwissTimestamp(raw: string): Date | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

type StacItem = {
  assets?: Record<string, { href?: string; type?: string }>;
};

export async function fetchMeteoSwissStation(
  cfg: AlpineStationConfig,
  now = new Date(),
): Promise<AlpineStationReading> {
  try {
    const code = cfg.code.toLowerCase();
    const itemRes = await fetch(`${METEOSWISS_STAC_ITEM}/${code}`, {
      headers: { Accept: "application/geo+json, application/json" },
      next: { revalidate: 180 },
    });
    if (!itemRes.ok) {
      return emptyReading(cfg, `MeteoSwiss STAC HTTP ${itemRes.status}`);
    }
    const item = (await itemRes.json()) as StacItem;
    const assetKey = `ogd-smn_${code}_t_now.csv`;
    const href =
      item.assets?.[assetKey]?.href ??
      Object.entries(item.assets ?? {}).find(([k]) =>
        k.includes("_t_now.csv"),
      )?.[1]?.href;
    if (!href) {
      return emptyReading(cfg, "MeteoSwiss t_now asset missing");
    }
    const csvRes = await fetch(href, {
      headers: { Accept: "text/csv, text/plain, */*" },
      next: { revalidate: 180 },
    });
    if (!csvRes.ok) {
      return emptyReading(cfg, `MeteoSwiss CSV HTTP ${csvRes.status}`);
    }
    const rows = parseMeteoSwissSmnCsv(await csvRes.text());
    if (rows.length === 0) {
      return emptyReading(cfg, "No wind data");
    }
    const withWind = [...rows].reverse().find((r) => r.windKmh !== null);
    if (!withWind || withWind.windKmh === null) {
      return emptyReading(cfg, "No wind data");
    }
    const history = filterHistory(
      rows
        .filter((r) => r.windKmh !== null)
        .map((r) => ({ at: r.at, windKt: kmhToKt(r.windKmh!) })),
      now,
    );
    return {
      ...emptyReading(cfg),
      observedAt: withWind.at,
      ageMin: ageMinutes(withWind.at, now),
      windDirDeg: withWind.dirDeg,
      windKt: roundKmhToKt(withWind.windKmh),
      gustKt: roundKmhToKt(withWind.gustKmh),
      history,
    };
  } catch (error) {
    return emptyReading(
      cfg,
      error instanceof Error ? error.message : "MeteoSwiss unavailable",
    );
  }
}

async function fetchNonGeosphereStation(
  cfg: AlpineStationConfig,
  now: Date,
): Promise<AlpineStationReading> {
  if (cfg.source === "siag") return fetchSiagStation(cfg, now);
  if (cfg.source === "meteoswiss") return fetchMeteoSwissStation(cfg, now);
  return fetchMeteotrentinoStation(cfg, now);
}

export async function fetchAlpineWind(now = new Date()): Promise<AlpineWindBundle> {
  return cached("alpine-wind", CACHE_TTL_MS, async () => {
    try {
      const geosphereCfgs = ALPINE_STATIONS.filter((c) => c.source === "geosphere");
      const otherCfgs = ALPINE_STATIONS.filter((c) => c.source !== "geosphere");
      const [geosphereReadings, otherReadings] = await Promise.all([
        fetchGeosphereStations(geosphereCfgs, now),
        Promise.all(otherCfgs.map((cfg) => fetchNonGeosphereStation(cfg, now))),
      ]);
      const byId = new Map<string, AlpineStationReading>();
      for (const r of [...geosphereReadings, ...otherReadings]) {
        byId.set(r.id, r);
      }
      const stations = ALPINE_STATIONS.map(
        (cfg) => byId.get(cfg.id) ?? emptyReading(cfg, "Missing reading"),
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
