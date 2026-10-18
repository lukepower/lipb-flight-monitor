/**
 * Mountain-wave column physics: θ, N², stable layer, Froude, Scorer chips,
 * and ICON-2I vertical-velocity wave signal.
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

/** Scorer parameter l² ≈ N²/U² − (1/U)·d²U/dz²; we use N²/U² decrease with height. */
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

export function windIncreasing700to600(
  wind700Kt: number | null,
  wind600Kt: number | null,
): boolean {
  if (wind700Kt === null || wind600Kt === null) return false;
  return wind600Kt > wind700Kt;
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
  const increasing = windIncreasing700to600(wind700, wind600);

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

export type OmegaCellHour = {
  id: string;
  lat: number;
  lon: number;
  atIso: string;
  /** Vertical velocity at 700 hPa (m/s); Open-Meteo sign: + up. */
  w700: number | null;
  w600: number | null;
};

/**
 * Wave signal when |w| ≥ threshold at 700–600 hPa with alternating sign
 * between neighbouring cells or consecutive hours downstream of the ridge.
 */
export function detectOmegaWaveSignal(
  cells: OmegaCellHour[],
  absThreshold = WAVE_PHYSICS.omegaAbsMs,
): { omegaWave: boolean; omegaAvailable: boolean } {
  const usable = cells.filter(
    (c) =>
      (c.w700 !== null && Number.isFinite(c.w700)) ||
      (c.w600 !== null && Number.isFinite(c.w600)),
  );
  if (usable.length === 0) {
    return { omegaWave: false, omegaAvailable: false };
  }

  const strong = (c: OmegaCellHour): number | null => {
    const vals = [c.w700, c.w600].filter(
      (v): v is number => v !== null && Number.isFinite(v),
    );
    if (vals.length === 0) return null;
    const maxAbs = vals.reduce(
      (best, v) => (Math.abs(v) > Math.abs(best) ? v : best),
      vals[0]!,
    );
    return Math.abs(maxAbs) >= absThreshold ? Math.sign(maxAbs) || 1 : null;
  };

  const byId = new Map<string, OmegaCellHour[]>();
  for (const c of usable) {
    const list = byId.get(c.id) ?? [];
    list.push(c);
    byId.set(c.id, list);
  }
  for (const list of byId.values()) {
    list.sort((a, b) => a.atIso.localeCompare(b.atIso));
    for (let i = 1; i < list.length; i += 1) {
      const a = strong(list[i - 1]!);
      const b = strong(list[i]!);
      if (a !== null && b !== null && a !== b) {
        return { omegaWave: true, omegaAvailable: true };
      }
    }
  }

  // Spatial: same hour, neighbouring cells (≈0.2–0.5°).
  const byHour = new Map<string, OmegaCellHour[]>();
  for (const c of usable) {
    const list = byHour.get(c.atIso) ?? [];
    list.push(c);
    byHour.set(c.atIso, list);
  }
  for (const list of byHour.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i]!;
        const b = list[j]!;
        const dLat = Math.abs(a.lat - b.lat);
        const dLon = Math.abs(a.lon - b.lon);
        if (dLat > 0.55 || dLon > 0.55) continue;
        if (dLat < 0.05 && dLon < 0.05) continue;
        const sa = strong(a);
        const sb = strong(b);
        if (sa !== null && sb !== null && sa !== sb) {
          return { omegaWave: true, omegaAvailable: true };
        }
      }
    }
  }

  return { omegaWave: false, omegaAvailable: true };
}

/** Open-Meteo ICON-2I ω hourly params (m/s). */
export function icon2iOmegaHourlyParams(): string {
  return "vertical_velocity_700hPa,vertical_velocity_600hPa";
}

/** Call-weight for ICON-2I ω: 2 vars × locations / 10. */
export function icon2iOmegaCallWeight(locationCount: number): number {
  return Math.round(locationCount * 0.2 * 10) / 10;
}
