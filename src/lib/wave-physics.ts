/**
 * Mountain-wave column physics: θ, N², stable layer, Froude, Scorer chips,
 * and ICON-2I vertical-velocity lee-transect signal.
 */

import { LIPB } from "@/lib/constants";
import {
  ALOFT_MIN_AGL_M,
  metersToFt,
  type SoundingHour,
  type SoundingLevel,
} from "@/lib/sounding";
import {
  crossRidgeComponentKt,
  LIPB_RIDGE_AXIS_DEG,
  RIDGE_LEVEL_HPA,
  WAVE_DETECTION_TOP_HPA,
  WAVE_PHYSICS,
  type WavePhysicsFlags,
} from "@/lib/turbulence-verdict-shared";

export const G_MS2 = 9.80665;
/** Pressure levels used for θ / N² between ridge and wave top. */
export const STABILITY_LEVELS_HPA = [850, 800, 750, 700, 600] as const;

/** Brenner crest — transect origin for Wipptal / Eisacktal lee sampling. */
export const BRENNER_CREST = { lat: 47.003, lon: 11.507 } as const;

/**
 * Dense ICON-2I lee transect (~14 pts × 2.5 km ≈ 35 km).
 * Valley axis ≈ N–S (perp. to ridge axis ~78°).
 * N-flow → lee south (Eisacktal); S-flow → lee north (Wipptal).
 */
export const LEE_TRANSECT = {
  count: 14,
  spacingKm: 2.5,
  /** Bearing from crest toward Eisacktal / Bozen (south-ish). */
  southBearingDeg: 188,
} as const;

export function potentialTemperatureK(
  tempC: number,
  pHpa: number,
): number {
  const tK = tempC + 273.15;
  return tK * (1000 / pHpa) ** 0.286;
}

export type StabilityLayer = {
  pLowerHpa: number;
  pUpperHpa: number;
  zLowerM: number;
  zUpperM: number;
  depthM: number;
  thetaLowerK: number;
  thetaUpperK: number;
  /** Brunt–Väisälä frequency N (s⁻¹), not N². */
  n: number;
  n2: number;
};

function levelMslM(level: SoundingLevel): number {
  return level.altFtMsl / 3.280839895;
}

/**
 * Levels above terrain+150 m with temperature + height, for stability.
 * Masks buried model levels under high terrain.
 */
export function stabilityLevels(
  sounding: SoundingHour,
  elevationM: number = LIPB.elevationM,
): SoundingLevel[] {
  const minFt = metersToFt(elevationM + ALOFT_MIN_AGL_M);
  return sounding.levels
    .filter(
      (l) =>
        STABILITY_LEVELS_HPA.includes(
          l.pHpa as (typeof STABILITY_LEVELS_HPA)[number],
        ) &&
        l.tempC !== null &&
        l.altFtMsl >= minFt &&
        Number.isFinite(l.tempC),
    )
    .sort((a, b) => b.pHpa - a.pHpa);
}

/** Layer N² between consecutive usable levels (high p → low p). */
export function bruntVaisalaLayers(
  levels: SoundingLevel[],
): StabilityLayer[] {
  const out: StabilityLayer[] = [];
  for (let i = 0; i < levels.length - 1; i += 1) {
    const lower = levels[i]!;
    const upper = levels[i + 1]!;
    if (lower.tempC === null || upper.tempC === null) continue;
    const z0 = levelMslM(lower);
    const z1 = levelMslM(upper);
    const dz = z1 - z0;
    if (dz <= 0) continue;
    const th0 = potentialTemperatureK(lower.tempC, lower.pHpa);
    const th1 = potentialTemperatureK(upper.tempC, upper.pHpa);
    const thetaMean = (th0 + th1) / 2;
    if (thetaMean <= 0) continue;
    const n2 = (G_MS2 / thetaMean) * ((th1 - th0) / dz);
    const n = n2 > 0 ? Math.sqrt(n2) : 0;
    out.push({
      pLowerHpa: lower.pHpa,
      pUpperHpa: upper.pHpa,
      zLowerM: z0,
      zUpperM: z1,
      depthM: dz,
      thetaLowerK: th0,
      thetaUpperK: th1,
      n,
      n2,
    });
  }
  return out;
}

/** Contiguous stable depth for layers with pLower ≤ 700 and pUpper ≥ 600. */
export function stableLayerRidgeTo600(
  layers: StabilityLayer[],
  nMin = WAVE_PHYSICS.nStable,
  minDepthM = WAVE_PHYSICS.stableLayerMinM,
): { found: boolean; depthM: number; nMax: number | null } {
  let depth = 0;
  let nMax: number | null = null;
  let bestDepth = 0;
  let bestN: number | null = null;

  for (const layer of layers) {
    const inBand =
      layer.pLowerHpa <= RIDGE_LEVEL_HPA &&
      layer.pUpperHpa >= WAVE_DETECTION_TOP_HPA;
    if (!inBand) continue;
    if (layer.n >= nMin) {
      depth += layer.depthM;
      nMax = nMax === null ? layer.n : Math.max(nMax, layer.n);
    } else {
      if (depth > bestDepth) {
        bestDepth = depth;
        bestN = nMax;
      }
      depth = 0;
      nMax = null;
    }
  }
  if (depth > bestDepth) {
    bestDepth = depth;
    bestN = nMax;
  }
  return {
    found: bestDepth >= minDepthM,
    depthM: bestDepth,
    nMax: bestN,
  };
}

export function froudeNumber(
  uCrossMs: number,
  n: number,
  hM: number = WAVE_PHYSICS.ridgeHeightM,
): number | null {
  if (!(n > 0) || !(hM > 0) || !Number.isFinite(uCrossMs)) return null;
  return uCrossMs / (n * hM);
}

/** Scorer parameter l² ≈ N²/U²; chip when l² decreases with height. */
export function scorerDecreasesWithHeight(
  layers: StabilityLayer[],
  windByP: Map<number, number>,
): boolean | null {
  const samples: { z: number; l2: number }[] = [];
  for (const layer of layers) {
    const uLower = windByP.get(layer.pLowerHpa);
    const uUpper = windByP.get(layer.pUpperHpa);
    if (uLower == null || uUpper == null) continue;
    const uKt = (uLower + uUpper) / 2;
    const uMs = uKt * 0.514444;
    if (uMs < 2) continue;
    const l2 = layer.n2 / (uMs * uMs);
    samples.push({ z: (layer.zLowerM + layer.zUpperM) / 2, l2 });
  }
  if (samples.length < 2) return null;
  samples.sort((a, b) => a.z - b.z);
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  return last.l2 < first.l2;
}

export function windDirDeltaDeg(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Wind increasing with height 700→600: ≥ +3 kt (or ≥ +10%) AND
 * direction change ≤ 30°.
 */
export function windIncreasing700to600(
  wind700Kt: number | null,
  wind600Kt: number | null,
  dir700Deg: number | null = null,
  dir600Deg: number | null = null,
): boolean {
  if (wind700Kt === null || wind600Kt === null) return false;
  const delta = wind600Kt - wind700Kt;
  const needKt = Math.max(
    WAVE_PHYSICS.windIncreaseMinKt,
    wind700Kt * WAVE_PHYSICS.windIncreaseMinFrac,
  );
  if (delta < needKt) return false;
  if (
    dir700Deg !== null &&
    dir600Deg !== null &&
    Number.isFinite(dir700Deg) &&
    Number.isFinite(dir600Deg)
  ) {
    if (windDirDeltaDeg(dir700Deg, dir600Deg) > WAVE_PHYSICS.windDirChangeMaxDeg) {
      return false;
    }
  }
  return true;
}

export function assessWavePhysics(
  sounding: SoundingHour,
  elevationM: number = LIPB.elevationM,
  omega?: { omegaWave: boolean | null; omegaAvailable: boolean },
): WavePhysicsFlags {
  const levels = stabilityLevels(sounding, elevationM);
  const layers = bruntVaisalaLayers(levels);
  const stable = stableLayerRidgeTo600(layers);

  const ridge = sounding.levels.find((l) => l.pHpa === RIDGE_LEVEL_HPA);
  const top = sounding.levels.find((l) => l.pHpa === WAVE_DETECTION_TOP_HPA);
  const wind700 = ridge?.windKt ?? null;
  const wind600 = top?.windKt ?? null;
  const increasing = windIncreasing700to600(
    wind700,
    wind600,
    ridge?.windDir ?? null,
    top?.windDir ?? null,
  );

  const windByP = new Map<number, number>();
  for (const l of sounding.levels) {
    if (l.windKt !== null) windByP.set(l.pHpa, l.windKt);
  }

  let froude: number | null = null;
  if (
    ridge?.windKt != null &&
    ridge.windDir != null &&
    stable.nMax != null &&
    stable.nMax > 0
  ) {
    const crossKt = crossRidgeComponentKt(
      ridge.windKt,
      ridge.windDir,
      LIPB_RIDGE_AXIS_DEG,
    );
    const uMs = crossKt * 0.514444;
    froude = froudeNumber(uMs, stable.nMax);
  }

  const scorer = scorerDecreasesWithHeight(layers, windByP);

  return {
    stableLayer: stable.found,
    windIncreasing700to600: increasing,
    omegaWave: omega?.omegaWave ?? null,
    omegaAvailable: omega?.omegaAvailable ?? false,
    froude: froude !== null ? Math.round(froude * 100) / 100 : null,
    scorerDecreasesWithHeight: scorer,
    nMax: stable.nMax !== null ? Math.round(stable.nMax * 1000) / 1000 : null,
    stableDepthM: stable.found ? Math.round(stable.depthM) : null,
  };
}

/** Offset a lat/lon by distanceKm along a bearing (degrees). */
export function destinationPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceKm: number,
): { lat: number; lon: number } {
  const R = 6371;
  const δ = distanceKm / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return {
    lat: (φ2 * 180) / Math.PI,
    lon: (((λ2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

export type LeeSide = "north" | "south";

/**
 * Lee side from 700 hPa wind direction (meteorological: from).
 * Northerly flow → lee south (Eisacktal); southerly → lee north (Wipptal).
 */
export function leeSideFromWindDirDeg(windDirDeg: number | null): LeeSide {
  if (windDirDeg === null || !Number.isFinite(windDirDeg)) return "south";
  const d = ((windDirDeg % 360) + 360) % 360;
  // From south (SE–SW) → lee north; otherwise prefer south lee.
  if (d >= 135 && d <= 225) return "north";
  return "south";
}

export type TransectPoint = {
  id: string;
  lat: number;
  lon: number;
  /** 0 = nearest crest, increasing downstream. */
  index: number;
  side: LeeSide;
};

/** Dense lee-side transect points for ICON-2I ω (both sides for one fetch). */
export function leeTransectPoints(
  side: LeeSide = "south",
  count = LEE_TRANSECT.count,
  spacingKm = LEE_TRANSECT.spacingKm,
): TransectPoint[] {
  const bearing =
    side === "south"
      ? LEE_TRANSECT.southBearingDeg
      : (LEE_TRANSECT.southBearingDeg + 180) % 360;
  const points: TransectPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    // Start ~½ spacing downstream of crest so the first sample is clearly lee.
    const dist = (i + 0.5) * spacingKm;
    const { lat, lon } = destinationPoint(
      BRENNER_CREST.lat,
      BRENNER_CREST.lon,
      bearing,
      dist,
    );
    points.push({
      id: `lee-${side}-${i}`,
      lat: Math.round(lat * 10000) / 10000,
      lon: Math.round(lon * 10000) / 10000,
      index: i,
      side,
    });
  }
  return points;
}

/** Both lee sides in one Open-Meteo multi-point request. */
export function allLeeTransectPoints(): TransectPoint[] {
  return [...leeTransectPoints("south"), ...leeTransectPoints("north")];
}

export type OmegaCellHour = {
  id: string;
  lat: number;
  lon: number;
  atIso: string;
  /** Vertical velocity at 700 hPa (m/s); Open-Meteo sign: + up. */
  w700: number | null;
  w600: number | null;
  /** Optional convection guards (from ICON-2I or LIPB column). */
  cape?: number | null;
  precipMm?: number | null;
  /** Index along lee transect (0 = nearest crest). */
  transectIndex?: number;
  side?: LeeSide;
};

export type OmegaHourResult = {
  omegaWave: boolean;
  omegaAvailable: boolean;
};

function representativeW(c: OmegaCellHour): number | null {
  const vals = [c.w700, c.w600].filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (vals.length === 0) return null;
  return vals.reduce(
    (best, v) => (Math.abs(v) > Math.abs(best) ? v : best),
    vals[0]!,
  );
}

export function isConvectiveOmegaHour(
  cape: number | null | undefined,
  precipMm: number | null | undefined,
): boolean {
  if (cape != null && cape > WAVE_PHYSICS.omegaCapeMaxJkg) return true;
  if (precipMm != null && precipMm > WAVE_PHYSICS.omegaPrecipMaxMm) return true;
  return false;
}

/**
 * Per-hour lee-wave ω signal: max |w| ≥ threshold with sign alternation
 * along the lee transect for that hour only.
 * No temporal sign-flip criterion (lee waves are quasi-stationary).
 */
export function detectOmegaWaveSignalForHour(
  cells: OmegaCellHour[],
  options: {
    windDir700Deg?: number | null;
    cape?: number | null;
    precipMm?: number | null;
    absThreshold?: number;
  } = {},
): OmegaHourResult {
  const absThreshold = options.absThreshold ?? WAVE_PHYSICS.omegaAbsMs;
  if (cells.length === 0) {
    return { omegaWave: false, omegaAvailable: false };
  }

  const anyFinite = cells.some(
    (c) =>
      (c.w700 !== null && Number.isFinite(c.w700)) ||
      (c.w600 !== null && Number.isFinite(c.w600)),
  );
  if (!anyFinite) {
    return { omegaWave: false, omegaAvailable: false };
  }

  const cape =
    options.cape ??
    cells.find((c) => c.cape != null)?.cape ??
    null;
  const precip =
    options.precipMm ??
    cells.find((c) => c.precipMm != null)?.precipMm ??
    null;
  if (isConvectiveOmegaHour(cape, precip)) {
    return { omegaWave: false, omegaAvailable: true };
  }

  const side = leeSideFromWindDirDeg(options.windDir700Deg ?? null);
  const lee = cells
    .filter((c) => (c.side ?? side) === side)
    .slice()
    .sort(
      (a, b) =>
        (a.transectIndex ?? 0) - (b.transectIndex ?? 0) ||
        a.id.localeCompare(b.id),
    );

  const ordered = lee.length > 0 ? lee : cells.slice().sort((a, b) => a.id.localeCompare(b.id));

  const signs: number[] = [];
  let maxAbs = 0;
  for (const c of ordered) {
    const w = representativeW(c);
    if (w === null) continue;
    maxAbs = Math.max(maxAbs, Math.abs(w));
    if (Math.abs(w) >= absThreshold) {
      signs.push(Math.sign(w) || 1);
    }
  }

  if (maxAbs < absThreshold || signs.length < 2) {
    return { omegaWave: false, omegaAvailable: true };
  }

  let alternates = false;
  for (let i = 1; i < signs.length; i += 1) {
    if (signs[i] !== signs[i - 1]) {
      alternates = true;
      break;
    }
  }
  return { omegaWave: alternates, omegaAvailable: true };
}

/**
 * Evaluate each forecast hour independently. A signal at +20 h must not
 * affect "now".
 */
export function detectOmegaByHour(
  cells: OmegaCellHour[],
  windDirByHour: Map<string, number | null> = new Map(),
  capeByHour: Map<string, number | null> = new Map(),
  precipByHour: Map<string, number | null> = new Map(),
): Map<string, OmegaHourResult> {
  const byHour = new Map<string, OmegaCellHour[]>();
  for (const c of cells) {
    const list = byHour.get(c.atIso) ?? [];
    list.push(c);
    byHour.set(c.atIso, list);
  }
  const out = new Map<string, OmegaHourResult>();
  for (const [atIso, hourCells] of byHour) {
    out.set(
      atIso,
      detectOmegaWaveSignalForHour(hourCells, {
        windDir700Deg: windDirByHour.get(atIso) ?? null,
        cape: capeByHour.get(atIso) ?? null,
        precipMm: precipByHour.get(atIso) ?? null,
      }),
    );
  }
  return out;
}

/** @deprecated Use detectOmegaWaveSignalForHour / detectOmegaByHour. */
export function detectOmegaWaveSignal(
  cells: OmegaCellHour[],
  absThreshold = WAVE_PHYSICS.omegaAbsMs,
): OmegaHourResult {
  // Back-compat for tests: treat as a single-hour spatial transect.
  return detectOmegaWaveSignalForHour(cells, { absThreshold });
}

/** Open-Meteo ICON-2I ω hourly params (+ convection guards). */
export function icon2iOmegaHourlyParams(): string {
  return [
    "vertical_velocity_700hPa",
    "vertical_velocity_600hPa",
    "cape",
    "precipitation",
  ].join(",");
}

/** Call-weight for ICON-2I ω: 4 vars × locations / 10. */
export function icon2iOmegaCallWeight(locationCount: number): number {
  return Math.round(locationCount * 0.4 * 10) / 10;
}

/**
 * Build a near-ISA (6.5 K/km) sounding between 700 and 600 hPa.
 * Should NOT pass the stable-layer gate at nStable=0.013.
 */
export function standardAtmosphereTemps700to600(): {
  p: number;
  zM: number;
  tC: number;
}[] {
  // ISA: T decreases ~6.5 K/km; z700≈3000 m, z600≈4200 m → Δz≈1200 m → ΔT≈−7.8 K
  return [
    { p: 850, zM: 1450, tC: 5.5 },
    { p: 800, zM: 1950, tC: 2.2 },
    { p: 750, zM: 2500, tC: -1.3 },
    { p: 700, zM: 3000, tC: -4.5 },
    { p: 600, zM: 4200, tC: -12.3 },
  ];
}
