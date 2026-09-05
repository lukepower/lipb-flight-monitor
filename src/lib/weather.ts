import { CAT_VFR_MIN_VIS_KM, LIPB } from "@/lib/constants";
import { fromZonedLocal } from "@/lib/time";

export type FlightCategory = "VFR" | "MVFR" | "IFR" | "LIFR" | "UNKNOWN";
export type WeatherQuality = "good" | "marginal" | "poor" | "unknown";
export type WeatherSource = "metar" | "taf" | "model";

export type CloudLayer = {
  cover: string;
  baseFt: number | null;
};

export type DecodedWx = {
  source: WeatherSource;
  change?: string | null;
  probability?: number | null;
  start?: Date | null;
  end?: Date | null;
  windDir: string;
  windKt: number | null;
  gustKt: number | null;
  visKm: number | null;
  visPlus: boolean;
  cavok: boolean;
  ceilingFt: number | null;
  clouds: CloudLayer[];
  qnhHpa: number | null;
  tempC: number | null;
  dewC: number | null;
  wx: string | null;
  flightCategory: FlightCategory;
  lipbVisLow: boolean;
  raw?: string;
  issuedAt?: Date | null;
  metarType?: string;
  ageMin?: number | null;
  summary: string;
};

export type MetarBundle = {
  raw: string;
  decoded: DecodedWx;
  error?: string;
};

export type TafPeriod = DecodedWx & {
  prevailing: boolean;
};

export type TafBundle = {
  raw: string;
  issuedAt: Date | null;
  validFrom: Date | null;
  validTo: Date | null;
  periods: TafPeriod[];
  error?: string;
};

export type ModelHour = DecodedWx & {
  at: Date;
};

type AwcCloud = {
  cover?: string;
  base?: number | null;
};

type AwcMetar = {
  icaoId?: string;
  rawOb?: string;
  obsTime?: number;
  reportTime?: string;
  temp?: number | null;
  dewp?: number | null;
  wdir?: number | string | null;
  wspd?: number | null;
  wgst?: number | null;
  visib?: number | string | null;
  altim?: number | null;
  wxString?: string | null;
  clouds?: AwcCloud[] | null;
  fltCat?: string;
  metarType?: string;
};

type AwcTafFcst = {
  timeFrom?: number;
  timeTo?: number;
  timeBec?: number | null;
  fcstChange?: string | null;
  probability?: number | null;
  wdir?: number | string | null;
  wspd?: number | null;
  wgst?: number | null;
  visib?: number | string | null;
  altim?: number | null;
  wxString?: string | null;
  clouds?: AwcCloud[] | null;
};

type AwcTaf = {
  rawTAF?: string;
  issueTime?: string;
  validTimeFrom?: number;
  validTimeTo?: number;
  fcsts?: AwcTafFcst[];
};

const SM_TO_KM = 1.609344;

export function parseVisibility(visib: number | string | null | undefined): {
  visKm: number | null;
  visPlus: boolean;
  cavok: boolean;
} {
  if (visib === null || visib === undefined) {
    return { visKm: null, visPlus: false, cavok: false };
  }
  const text = String(visib).trim().toUpperCase();
  if (text === "CAVOK") return { visKm: 10, visPlus: true, cavok: true };
  if (text.endsWith("+")) {
    const n = Number.parseFloat(text);
    return {
      visKm: Number.isFinite(n) ? n * SM_TO_KM : 10,
      visPlus: true,
      cavok: false,
    };
  }
  const n = Number.parseFloat(text);
  if (!Number.isFinite(n)) return { visKm: null, visPlus: false, cavok: false };
  return { visKm: n * SM_TO_KM, visPlus: n >= 6, cavok: false };
}

export function ceilingFromClouds(clouds: AwcCloud[] | CloudLayer[] | null | undefined): number | null {
  if (!clouds?.length) return null;
  let lowest: number | null = null;
  for (const layer of clouds) {
    const cover = ("cover" in layer ? layer.cover : "")?.toUpperCase() ?? "";
    const base =
      "baseFt" in layer
        ? layer.baseFt
        : "base" in layer
          ? (layer.base ?? null)
          : null;
    if (!base && base !== 0) continue;
    if (cover === "BKN" || cover === "OVC" || cover === "VV") {
      if (lowest === null || base < lowest) lowest = base;
    }
  }
  return lowest;
}

export function flightCategoryFrom(
  visKm: number | null,
  ceilingFt: number | null,
  cavok: boolean,
): FlightCategory {
  if (cavok) return "VFR";
  const visSm = visKm === null ? null : visKm / SM_TO_KM;
  const vis = visSm;
  const ceil = ceilingFt;
  if (vis === null && ceil === null) return "UNKNOWN";
  if ((vis !== null && vis < 1) || (ceil !== null && ceil < 500)) return "LIFR";
  if ((vis !== null && vis < 3) || (ceil !== null && ceil < 1000)) return "IFR";
  if ((vis !== null && vis <= 5) || (ceil !== null && ceil <= 3000)) return "MVFR";
  if (vis !== null || ceil !== null) return "VFR";
  return "UNKNOWN";
}

export function qualityFromCategory(
  category: FlightCategory,
  visKm: number | null,
): WeatherQuality {
  if (category === "UNKNOWN") return "unknown";
  if (category === "IFR" || category === "LIFR") return "poor";
  if (category === "MVFR" || (visKm !== null && visKm < CAT_VFR_MIN_VIS_KM)) {
    return "marginal";
  }
  return "good";
}

function mapClouds(clouds: AwcCloud[] | null | undefined): CloudLayer[] {
  return (clouds ?? [])
    .filter((c) => c.cover)
    .map((c) => ({ cover: String(c.cover), baseFt: c.base ?? null }));
}

function windLabel(dir: number | string | null | undefined, kt: number | null): string {
  if (dir === "VRB" || dir === "VRB") return kt ? `VRB ${kt} kt` : "VRB";
  if (dir === null || dir === undefined) return kt ? `${kt} kt` : "calm / missing";
  if (kt === 0 || (kt === null && dir === 0)) return "Calm";
  return `${dir}° / ${kt ?? "?"} kt`;
}

function summarize(decoded: Omit<DecodedWx, "summary">): string {
  const vis = decoded.cavok
    ? "CAVOK"
    : decoded.visKm === null
      ? "vis n/a"
      : `${decoded.visPlus ? ">" : ""}${decoded.visKm.toFixed(1)} km`;
  const ceil =
    decoded.ceilingFt === null ? "no ceiling" : `ceil ${decoded.ceilingFt} ft`;
  const gust = decoded.gustKt ? ` G${decoded.gustKt}` : "";
  const wx = decoded.wx ? ` ${decoded.wx}` : "";
  return `${decoded.flightCategory} · ${decoded.windDir}${gust} · ${vis} · ${ceil}${wx}`;
}

function decodeFields(input: {
  source: WeatherSource;
  wdir?: number | string | null;
  wspd?: number | null;
  wgst?: number | null;
  visib?: number | string | null;
  altim?: number | null;
  temp?: number | null;
  dewp?: number | null;
  wxString?: string | null;
  clouds?: AwcCloud[] | null;
  fltCat?: string;
  change?: string | null;
  probability?: number | null;
  start?: Date | null;
  end?: Date | null;
  raw?: string;
  issuedAt?: Date | null;
  metarType?: string;
  ageMin?: number | null;
}): DecodedWx {
  const vis = parseVisibility(input.visib);
  const clouds = mapClouds(input.clouds);
  const ceilingFt = ceilingFromClouds(input.clouds);
  const flightCategory =
    (input.fltCat as FlightCategory | undefined) &&
    ["VFR", "MVFR", "IFR", "LIFR"].includes(input.fltCat ?? "")
      ? (input.fltCat as FlightCategory)
      : flightCategoryFrom(vis.visKm, ceilingFt, vis.cavok);
  const partial: Omit<DecodedWx, "summary"> = {
    source: input.source,
    change: input.change,
    probability: input.probability ?? null,
    start: input.start ?? null,
    end: input.end ?? null,
    windDir: windLabel(input.wdir, input.wspd ?? null),
    windKt: input.wspd ?? null,
    gustKt: input.wgst ?? null,
    visKm: vis.visKm,
    visPlus: vis.visPlus,
    cavok: vis.cavok,
    ceilingFt,
    clouds,
    qnhHpa: input.altim ?? null,
    tempC: input.temp ?? null,
    dewC: input.dewp ?? null,
    wx: input.wxString ?? null,
    flightCategory,
    lipbVisLow: vis.visKm !== null && vis.visKm < CAT_VFR_MIN_VIS_KM,
    raw: input.raw,
    issuedAt: input.issuedAt ?? null,
    metarType: input.metarType,
    ageMin: input.ageMin ?? null,
  };
  return { ...partial, summary: summarize(partial) };
}

export function decodeMetar(raw: AwcMetar, now = new Date()): DecodedWx {
  const obs = raw.obsTime ? new Date(raw.obsTime * 1000) : null;
  return decodeFields({
    source: "metar",
    wdir: raw.wdir,
    wspd: raw.wspd,
    wgst: raw.wgst,
    visib: raw.visib,
    altim: raw.altim,
    temp: raw.temp,
    dewp: raw.dewp,
    wxString: raw.wxString,
    clouds: raw.clouds,
    fltCat: raw.fltCat,
    raw: raw.rawOb,
    issuedAt: obs,
    metarType: raw.metarType,
    ageMin: obs ? Math.round((now.getTime() - obs.getTime()) / 60_000) : null,
  });
}

export function decodeTaf(raw: AwcTaf): TafBundle {
  const periods: TafPeriod[] = (raw.fcsts ?? []).map((f) => {
    const decoded = decodeFields({
      source: "taf",
      wdir: f.wdir,
      wspd: f.wspd,
      wgst: f.wgst,
      visib: f.visib,
      altim: f.altim,
      wxString: f.wxString,
      clouds: f.clouds,
      change: f.fcstChange,
      probability: f.probability,
      start: f.timeFrom ? new Date(f.timeFrom * 1000) : null,
      end: f.timeTo ? new Date(f.timeTo * 1000) : null,
    });
    const prevailing =
      !f.fcstChange || f.fcstChange === "FM" || f.fcstChange === "BECMG";
    return { ...decoded, prevailing };
  });
  return {
    raw: raw.rawTAF ?? "",
    issuedAt: raw.issueTime ? new Date(raw.issueTime) : null,
    validFrom: raw.validTimeFrom ? new Date(raw.validTimeFrom * 1000) : null,
    validTo: raw.validTimeTo ? new Date(raw.validTimeTo * 1000) : null,
    periods,
  };
}

const WMO: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

export function decodeModelHour(input: {
  at: Date;
  weatherCode: number | null;
  visibilityM: number | null;
  cloudCover: number | null;
  cloudCoverLow: number | null;
  precipitationMm: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  windDir: number | null;
  tempC: number | null;
}): ModelHour {
  const visKm =
    input.visibilityM === null ? null : input.visibilityM / 1000;
  const ceilingFt =
    input.cloudCoverLow !== null && input.cloudCoverLow >= 50
      ? 1500
      : input.cloudCover !== null && input.cloudCover >= 80
        ? 4000
        : null;
  const windKt =
    input.windKmh === null ? null : Math.round(input.windKmh / 1.852);
  const gustKt =
    input.gustKmh === null ? null : Math.round(input.gustKmh / 1.852);
  const wx =
    [
      input.weatherCode !== null ? WMO[input.weatherCode] : null,
      input.precipitationMm && input.precipitationMm > 0.1
        ? `${input.precipitationMm.toFixed(1)} mm`
        : null,
    ]
      .filter(Boolean)
      .join(", ") || null;
  const decoded = decodeFields({
    source: "model",
    wdir: input.windDir,
    wspd: windKt,
    wgst: gustKt,
    visib: visKm === null ? null : visKm / SM_TO_KM,
    temp: input.tempC,
    wxString: wx,
    clouds:
      ceilingFt !== null
        ? [{ cover: "BKN", base: ceilingFt }]
        : input.cloudCover !== null && input.cloudCover > 20
          ? [{ cover: "SCT", base: 5000 }]
          : [],
    start: input.at,
    end: new Date(input.at.getTime() + 60 * 60 * 1000),
  });
  return { ...decoded, at: input.at };
}

export function tafForInstant(
  taf: TafBundle | null,
  at: Date,
): { prevailing: TafPeriod | null; overlays: TafPeriod[] } {
  if (!taf) return { prevailing: null, overlays: [] };
  const covering = taf.periods.filter((p) => {
    if (!p.start || !p.end) return false;
    return at >= p.start && at < p.end;
  });
  const prevailing =
    covering.filter((p) => p.prevailing).at(-1) ??
    covering.find((p) => p.prevailing) ??
    null;
  const overlays = covering.filter((p) => !p.prevailing);
  return { prevailing, overlays };
}

export function weatherForWindow(
  start: Date,
  end: Date,
  taf: TafBundle | null,
  modelHours: ModelHour[],
): { decoded: DecodedWx | null; source: WeatherSource | "none"; quality: WeatherQuality } {
  const mid = new Date((start.getTime() + end.getTime()) / 2);
  if (taf?.validFrom && taf.validTo && mid >= taf.validFrom && mid <= taf.validTo) {
    const { prevailing, overlays } = tafForInstant(taf, mid);
    const worst = [...(prevailing ? [prevailing] : []), ...overlays].sort(
      (a, b) => qualityRank(a.flightCategory) - qualityRank(b.flightCategory),
    )[0];
    if (worst) {
      const extra = overlays.length
        ? ` · TEMPO/PROB: ${overlays.map((o) => o.summary).join(" / ")}`
        : "";
      return {
        decoded: { ...worst, summary: `${worst.summary}${extra}` },
        source: "taf",
        quality: qualityFromCategory(worst.flightCategory, worst.visKm),
      };
    }
  }
  const hour = modelHours.find(
    (h) => mid >= h.at && mid < new Date(h.at.getTime() + 60 * 60 * 1000),
  );
  if (hour) {
    return {
      decoded: hour,
      source: "model",
      quality: qualityFromCategory(hour.flightCategory, hour.visKm),
    };
  }
  return { decoded: null, source: "none", quality: "unknown" };
}

function qualityRank(cat: FlightCategory): number {
  if (cat === "LIFR") return 0;
  if (cat === "IFR") return 1;
  if (cat === "MVFR") return 2;
  if (cat === "VFR") return 3;
  return 4;
}

type CacheEntry<T> = { at: number; value: T };

const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function fetchMetar(): Promise<MetarBundle> {
  return cached("metar", 60_000, async () => {
    try {
      const res = await fetch(
        `https://aviationweather.gov/api/data/metar?ids=${LIPB.icao}&format=json`,
        { headers: { Accept: "application/json" }, next: { revalidate: 60 } },
      );
      if (!res.ok) {
        return { raw: "", decoded: emptyDecoded("metar"), error: `METAR HTTP ${res.status}` };
      }
      const data = (await res.json()) as AwcMetar[];
      const first = data[0];
      if (!first) {
        return { raw: "", decoded: emptyDecoded("metar"), error: "No METAR for LIPB" };
      }
      return { raw: first.rawOb ?? "", decoded: decodeMetar(first) };
    } catch (error) {
      return {
        raw: "",
        decoded: emptyDecoded("metar"),
        error: error instanceof Error ? error.message : "METAR unavailable",
      };
    }
  });
}

export async function fetchTaf(): Promise<TafBundle> {
  return cached("taf", 5 * 60_000, async () => {
    try {
      const res = await fetch(
        `https://aviationweather.gov/api/data/taf?ids=${LIPB.icao}&format=json`,
        { headers: { Accept: "application/json" }, next: { revalidate: 300 } },
      );
      if (!res.ok) {
        return {
          raw: "",
          issuedAt: null,
          validFrom: null,
          validTo: null,
          periods: [],
          error: `TAF HTTP ${res.status}`,
        };
      }
      const data = (await res.json()) as AwcTaf[];
      const first = data[0];
      if (!first) {
        return {
          raw: "",
          issuedAt: null,
          validFrom: null,
          validTo: null,
          periods: [],
          error: "No TAF for LIPB",
        };
      }
      return decodeTaf(first);
    } catch (error) {
      return {
        raw: "",
        issuedAt: null,
        validFrom: null,
        validTo: null,
        periods: [],
        error: error instanceof Error ? error.message : "TAF unavailable",
      };
    }
  });
}

export async function fetchModelForecast(): Promise<ModelHour[]> {
  return cached("model", 30 * 60_000, async () => {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(LIPB.lat));
      url.searchParams.set("longitude", String(LIPB.lon));
      url.searchParams.set("timezone", LIPB.timezone);
      url.searchParams.set("forecast_days", "7");
      url.searchParams.set(
        "hourly",
        "weather_code,visibility,cloud_cover,cloud_cover_low,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m",
      );
      const res = await fetch(url, { next: { revalidate: 1800 } });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        hourly?: {
          time: string[];
          weather_code: (number | null)[];
          visibility: (number | null)[];
          cloud_cover: (number | null)[];
          cloud_cover_low: (number | null)[];
          precipitation: (number | null)[];
          wind_speed_10m: (number | null)[];
          wind_gusts_10m: (number | null)[];
          wind_direction_10m: (number | null)[];
          temperature_2m: (number | null)[];
        };
      };
      const h = data.hourly;
      if (!h) return [];
      return h.time.map((t, i) => {
        const [date, time] = t.split("T");
        return decodeModelHour({
          at: fromZonedLocal(date, (time ?? "00:00").slice(0, 5)),
          weatherCode: h.weather_code[i],
          visibilityM: h.visibility[i],
          cloudCover: h.cloud_cover[i],
          cloudCoverLow: h.cloud_cover_low[i],
          precipitationMm: h.precipitation[i],
          windKmh: h.wind_speed_10m[i],
          gustKmh: h.wind_gusts_10m[i],
          windDir: h.wind_direction_10m[i],
          tempC: h.temperature_2m[i],
        });
      });
    } catch {
      return [];
    }
  });
}

function emptyDecoded(source: WeatherSource): DecodedWx {
  const partial: Omit<DecodedWx, "summary"> = {
    source,
    windDir: "n/a",
    windKt: null,
    gustKt: null,
    visKm: null,
    visPlus: false,
    cavok: false,
    ceilingFt: null,
    clouds: [],
    qnhHpa: null,
    tempC: null,
    dewC: null,
    wx: null,
    flightCategory: "UNKNOWN",
    lipbVisLow: false,
  };
  return { ...partial, summary: "Weather unavailable" };
}
