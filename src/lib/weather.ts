import { TtlCache } from "@/lib/cache";
import { CAT_VFR_MIN_VIS_KM, LIPB } from "@/lib/constants";
import { fromZonedLocal } from "@/lib/time";
import {
  parseModelSoundings,
  soundingHourlyParams,
  type SoundingHour,
} from "@/lib/sounding";

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

export type FoehnGradient = {
  lipbQnhHpa: number;
  lowiQnhHpa: number;
  /** LOWI QNH minus LIPB QNH in hPa (+ = North Föhn gradient, − = South Föhn gradient). */
  deltaHpa: number;
  direction: "north" | "south" | "none";
  strength: "none" | "moderate" | "strong";
  label: string;
};

export type MetarBundle = {
  raw: string;
  decoded: DecodedWx;
  lowiQnhHpa?: number | null;
  /** Age of LOWI METAR in minutes (for Föhn freshness). */
  lowiAgeMin?: number | null;
  foehn?: FoehnGradient | null;
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

export type ModelForecast = {
  hours: ModelHour[];
  soundings: SoundingHour[];
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

/** Minimal METAR fields needed to pair LIPB+LOWI for Föhn Δp. */
export type MetarQnhSample = {
  icaoId?: string;
  rawOb?: string;
  obsTime?: number;
  altim?: number | null;
};

/** Half-hour synoptic slot (xx:20 / xx:50 METARs share a bucket). */
export function metarHalfHourSlotSec(obsTimeSec: number): number {
  return Math.floor(obsTimeSec / 1_800) * 1_800;
}

function metarIcao(m: MetarQnhSample): string | null {
  const id = m.icaoId?.toUpperCase();
  if (id === "LIPB" || id === "LOWI") return id;
  const raw = m.rawOb?.trim().toUpperCase() ?? "";
  if (raw.startsWith("LIPB")) return "LIPB";
  if (raw.startsWith("LOWI")) return "LOWI";
  return id ?? null;
}

/**
 * Latest half-hour slot where both LIPB and LOWI report QNH.
 * Avoids mixing LOWI 10:50 with LIPB 09:50 (false S 3 vs true S 2).
 */
export function pairLipbLowiSameObsSlot(
  samples: MetarQnhSample[],
): { lipb: MetarQnhSample; lowi: MetarQnhSample; slotSec: number } | null {
  const bySlot = new Map<
    number,
    { lipb?: MetarQnhSample; lowi?: MetarQnhSample }
  >();
  for (const m of samples) {
    if (m.obsTime == null || m.altim == null || !Number.isFinite(m.altim)) {
      continue;
    }
    const icao = metarIcao(m);
    if (icao !== "LIPB" && icao !== "LOWI") continue;
    const slot = metarHalfHourSlotSec(m.obsTime);
    const row = bySlot.get(slot) ?? {};
    // Prefer the sample closest to the slot centre when duplicates exist.
    const prev = icao === "LIPB" ? row.lipb : row.lowi;
    if (
      !prev ||
      Math.abs((m.obsTime ?? 0) - slot) <= Math.abs((prev.obsTime ?? 0) - slot)
    ) {
      if (icao === "LIPB") row.lipb = m;
      else row.lowi = m;
    }
    bySlot.set(slot, row);
  }
  const complete = [...bySlot.entries()]
    .filter(([, v]) => v.lipb && v.lowi)
    .sort((a, b) => b[0] - a[0]);
  if (complete.length === 0) return null;
  const [slotSec, pair] = complete[0]!;
  return { lipb: pair.lipb!, lowi: pair.lowi!, slotSec };
}

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

const TAF_MAX_AGE_MS = 30 * 60 * 60_000;

/**
 * True when a TAF is acceptable for display/use at `now`:
 * issuedAt ≤ now ≤ validTo and not older than 30 h from issue.
 * Includes the hour between issue and validity start.
 */
export function tafIsAcceptableNow(
  taf: Pick<TafBundle, "issuedAt" | "validFrom" | "validTo">,
  now = new Date(),
): boolean {
  if (!taf.issuedAt || !taf.validTo) return false;
  const t = now.getTime();
  const issued = taf.issuedAt.getTime();
  const to = taf.validTo.getTime();
  if (!Number.isFinite(issued) || !Number.isFinite(to)) return false;
  if (t < issued || t > to) return false;
  if (issued < t - TAF_MAX_AGE_MS) return false;
  return true;
}

/** @deprecated Prefer {@link tafIsAcceptableNow}; kept for callers that only check the validity window. */
export function tafValidityCoversNow(
  taf: Pick<TafBundle, "validFrom" | "validTo">,
  now = new Date(),
): boolean {
  if (!taf.validFrom || !taf.validTo) return false;
  const t = now.getTime();
  const from = taf.validFrom.getTime();
  const to = taf.validTo.getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  return t >= from && t <= to;
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

export const FOEHN_MODERATE_HPA = 4;
export const FOEHN_STRONG_HPA = 6;

/**
 * Compute North/South Föhn pressure difference across the Brenner crest (LOWI − LIPB).
 * Positive Δp (LOWI > LIPB) drives North Föhn; negative Δp (LIPB > LOWI) drives South Föhn.
 */
export function computeFoehnGradient(
  lipbQnhHpa: number | null | undefined,
  lowiQnhHpa: number | null | undefined,
): FoehnGradient | null {
  if (
    lipbQnhHpa === null ||
    lipbQnhHpa === undefined ||
    !Number.isFinite(lipbQnhHpa) ||
    lowiQnhHpa === null ||
    lowiQnhHpa === undefined ||
    !Number.isFinite(lowiQnhHpa)
  ) {
    return null;
  }
  // METAR QNH is integer hPa — keep Δp as an integer for the Föhn chip.
  // Sign: Δp = LOWI − LIPB; display uses words only (N-Föhn / S-Föhn), never a signed number.
  const deltaHpa = Math.round(lowiQnhHpa - lipbQnhHpa);
  const abs = Math.abs(deltaHpa);
  const strength: FoehnGradient["strength"] =
    abs >= FOEHN_STRONG_HPA
      ? "strong"
      : abs >= FOEHN_MODERATE_HPA
        ? "moderate"
        : "none";
  const direction: FoehnGradient["direction"] =
    strength === "none" ? "none" : deltaHpa > 0 ? "north" : "south";
  const label =
    direction === "north"
      ? `N-Föhn ${abs} hPa`
      : direction === "south"
        ? `S-Föhn ${abs} hPa`
        : `Δp ${abs} hPa`;
  return {
    lipbQnhHpa: Math.round(lipbQnhHpa),
    lowiQnhHpa: Math.round(lowiQnhHpa),
    deltaHpa,
    direction,
    strength,
    label,
  };
}

/**
 * Estimate low cloud base (ft AGL) from surface T and Td using Espy's LCL formula
 * (~400 ft per °C of spread), clamped to [500, 3000] ft. Falls back to 1500 ft when Td is absent.
 */
export function estimateLclCeilingFt(
  tempC: number | null | undefined,
  dewC: number | null | undefined,
): number {
  if (
    tempC === null ||
    tempC === undefined ||
    !Number.isFinite(tempC) ||
    dewC === null ||
    dewC === undefined ||
    !Number.isFinite(dewC)
  ) {
    return 1500;
  }
  const spread = Math.max(0, tempC - dewC);
  const lcl = Math.round((spread * 400) / 100) * 100;
  return Math.max(500, Math.min(3000, lcl));
}

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
  dewC?: number | null;
}): ModelHour {
  const visKm =
    input.visibilityM === null ? null : input.visibilityM / 1000;
  const ceilingFt =
    input.cloudCoverLow !== null && input.cloudCoverLow >= 50
      ? estimateLclCeilingFt(input.tempC, input.dewC)
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
    dewp: input.dewC ?? null,
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

export function tafForInterval(
  taf: TafBundle | null,
  start: Date,
  end: Date,
): { prevailing: TafPeriod[]; overlays: TafPeriod[] } {
  if (!taf) return { prevailing: [], overlays: [] };
  const overlapping = taf.periods.filter((p) => {
    if (!p.start || !p.end) return false;
    return p.start < end && p.end > start;
  });
  return {
    prevailing: overlapping.filter((p) => p.prevailing),
    overlays: overlapping.filter((p) => !p.prevailing),
  };
}

function compareWorstWx(a: DecodedWx, b: DecodedWx): number {
  const rankDiff = qualityRank(a.flightCategory) - qualityRank(b.flightCategory);
  if (rankDiff !== 0) return rankDiff;
  const visA = a.visKm ?? Number.POSITIVE_INFINITY;
  const visB = b.visKm ?? Number.POSITIVE_INFINITY;
  if (visA !== visB) return visA - visB;
  const ceilA = a.ceilingFt ?? Number.POSITIVE_INFINITY;
  const ceilB = b.ceilingFt ?? Number.POSITIVE_INFINITY;
  return ceilA - ceilB;
}

export function weatherForWindow(
  start: Date,
  end: Date,
  taf: TafBundle | null,
  modelHours: ModelHour[],
): { decoded: DecodedWx | null; source: WeatherSource | "none"; quality: WeatherQuality } {
  const mid = new Date((start.getTime() + end.getTime()) / 2);
  if (taf?.validFrom && taf.validTo && mid >= taf.validFrom && mid <= taf.validTo) {
    const interval = tafForInterval(taf, start, end);
    const instant = tafForInstant(taf, mid);
    const prevailingList =
      interval.prevailing.length > 0
        ? interval.prevailing
        : instant.prevailing
          ? [instant.prevailing]
          : [];
    const overlays =
      interval.overlays.length > 0 ? interval.overlays : instant.overlays;
    const candidates = [...prevailingList, ...overlays];
    const worst = [...candidates].sort(compareWorstWx)[0];
    if (worst) {
      const firstPrev = prevailingList[0];
      const lastPrev = prevailingList.at(-1);
      const trend =
        firstPrev &&
        lastPrev &&
        firstPrev.flightCategory !== lastPrev.flightCategory
          ? ` · trend ${firstPrev.flightCategory}→${lastPrev.flightCategory}`
          : "";
      const extra = overlays.length
        ? ` · TEMPO/PROB: ${overlays.map((o) => o.summary).join(" / ")}`
        : "";
      return {
        decoded: { ...worst, summary: `${worst.summary}${trend}${extra}` },
        source: "taf",
        quality: qualityFromCategory(worst.flightCategory, worst.visKm),
      };
    }
  }
  const overlappingHours = modelHours.filter((h) => {
    const hEnd = new Date(h.at.getTime() + 60 * 60 * 1000);
    return h.at < end && hEnd > start;
  });
  const candidates =
    overlappingHours.length > 0
      ? overlappingHours
      : modelHours.filter(
          (h) => mid >= h.at && mid < new Date(h.at.getTime() + 60 * 60 * 1000),
        );
  if (candidates.length > 0) {
    const worst = [...candidates].sort(compareWorstWx)[0]!;
    const first = candidates[0]!;
    const last = candidates.at(-1)!;
    const trend =
      first.flightCategory !== last.flightCategory
        ? ` · trend ${first.flightCategory}→${last.flightCategory}`
        : "";
    return {
      decoded: trend ? { ...worst, summary: `${worst.summary}${trend}` } : worst,
      source: "model",
      quality: qualityFromCategory(worst.flightCategory, worst.visKm),
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

const wxCache = new TtlCache<unknown>();

export function resetWeatherCacheForTests(): void {
  wxCache.clear();
}

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  return wxCache.getOrFetch(key, ttlMs, fn);
}

export async function fetchMetar(): Promise<MetarBundle> {
  return cached("metar", 60_000, async () => {
    try {
      // hours=6 so we can pair LIPB+LOWI at the same :20/:50 slot (not latest-of-each).
      const res = await fetch(
        `https://aviationweather.gov/api/data/metar?ids=${LIPB.icao},LOWI&format=json&hours=6`,
        { headers: { Accept: "application/json" }, next: { revalidate: 60 } },
      );
      if (!res.ok) {
        return { raw: "", decoded: emptyDecoded("metar"), error: `METAR HTTP ${res.status}` };
      }
      const data = (await res.json()) as AwcMetar[];
      const lipbReports = data
        .filter((m) => metarIcao(m) === "LIPB")
        .sort((a, b) => (b.obsTime ?? 0) - (a.obsTime ?? 0));
      const lipbRaw = lipbReports[0];
      if (!lipbRaw) {
        return { raw: "", decoded: emptyDecoded("metar"), error: "No METAR for LIPB" };
      }
      const decoded = decodeMetar(lipbRaw);
      const sameSlot = pairLipbLowiSameObsSlot(data);
      const lowiForFoehn = sameSlot?.lowi ?? null;
      const lowiQnhHpa = lowiForFoehn?.altim ?? null;
      const lowiObs = lowiForFoehn?.obsTime
        ? new Date(lowiForFoehn.obsTime * 1000)
        : null;
      const lowiAgeMin = lowiObs
        ? Math.round((Date.now() - lowiObs.getTime()) / 60_000)
        : null;
      // Δp from same-slot pair only (e.g. both 09:50 → S 2, not LOWI 10:50 vs LIPB 09:50 → S 3).
      const foehn = sameSlot
        ? computeFoehnGradient(sameSlot.lipb.altim, sameSlot.lowi.altim)
        : null;
      return {
        raw: lipbRaw.rawOb ?? "",
        decoded,
        lowiQnhHpa,
        lowiAgeMin,
        foehn,
      };
    } catch (error) {
      return {
        raw: "",
        decoded: emptyDecoded("metar"),
        error: error instanceof Error ? error.message : "METAR unavailable",
      };
    }
  });
}

export async function fetchTaf(now = new Date()): Promise<TafBundle> {
  const bundle = await cached("taf", 5 * 60_000, async () => {
    try {
      // Avoid long-lived Next fetch-cache serving a TAF from days ago.
      const res = await fetch(
        `https://aviationweather.gov/api/data/taf?ids=${LIPB.icao}&format=json`,
        { headers: { Accept: "application/json" }, cache: "no-store" },
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

  if (bundle.error) return bundle;
  if (!tafIsAcceptableNow(bundle, now)) {
    return {
      raw: bundle.raw,
      issuedAt: bundle.issuedAt,
      validFrom: bundle.validFrom,
      validTo: bundle.validTo,
      periods: [],
      error: "TAF unavailable/stale",
    };
  }
  return bundle;
}

export async function fetchModelForecast(): Promise<ModelForecast> {
  return cached("model-sounding", 30 * 60_000, async () => {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(LIPB.lat));
      url.searchParams.set("longitude", String(LIPB.lon));
      url.searchParams.set("timezone", LIPB.timezone);
      url.searchParams.set("forecast_days", "7");
      url.searchParams.set("hourly", soundingHourlyParams());
      const res = await fetch(url, { next: { revalidate: 1800 } });
      if (!res.ok) return { hours: [], soundings: [] };
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
          dew_point_2m?: (number | null)[];
          [key: string]: (number | null)[] | string[] | undefined;
        };
      };
      const h = data.hourly;
      if (!h) return { hours: [], soundings: [] };
      const hours = h.time.map((t, i) => {
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
          dewC: h.dew_point_2m?.[i] ?? null,
        });
      });
      return { hours, soundings: parseModelSoundings(h) };
    } catch {
      return { hours: [], soundings: [] };
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
