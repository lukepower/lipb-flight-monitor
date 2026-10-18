/**
 * Client-safe turbulence verdict types, constants, and pure helpers.
 * No Node builtins — safe to import from "use client" components.
 *
 * Server fetch/log/fs live in turbulence-verdict.ts (`import "server-only"`).
 *
 * Sign convention for Föhn Δp:
 *   Δp = LOWI_QNH − LIPB_QNH  (hPa; forecast uses Innsbruck − Bozen pressure_msl)
 *   Δp > 0 → North Föhn · Δp < 0 → South Föhn
 */

import { LIPB, LOCAL_CREST_RADIUS_KM } from "@/lib/constants";
import {
  ALPINE_WIND_STRONG_KT,
  type AlpineWindBundle,
} from "@/lib/alpine-wind";
import type { WxAdvisory } from "@/lib/sigmet";
import {
  SOUNDING_SHEAR_KT_PER_1000FT,
  SOUNDING_WAVE_SHEAR_KT_PER_1000FT,
  SOUNDING_WAVE_WIND_KT,
} from "@/lib/sounding";
import { formatLocal } from "@/lib/time";
import {
  computeFoehnGradient,
  FOEHN_MODERATE_HPA,
  FOEHN_STRONG_HPA,
  type FoehnGradient,
} from "@/lib/weather";
import {
  haversineKm,
  type WaveRiskSeverity,
} from "@/lib/wave-risk";

/** Fixed main Alpine ridge orientation near LIPB only (~ENE–WSW). */
export const LIPB_RIDGE_AXIS_DEG = 78;
/** Explicit ridge-level pressure for chip + cross-ridge component. */
export const RIDGE_LEVEL_HPA = 700;

export const WAVE_DETECTION_TOP_HPA = 600;
export const WAVE_DETECTION_TOP_FL = 140;
export const WAVE_DETECTION_FL150_HPA = 500;

export const VERTICAL_VELOCITY_SPIKE = {
  evaluatedAt: "2026-10-18",
  allowedModels: ["italia_meteo_arpae_icon_2i"] as const,
  allowedModelLabel: "ItaliaMeteo ARPAE ICON-2I (~2.2 km)",
  failedHighRes: ["icon_d2", "arome_france", "arome_france_hd", "icon_eu"] as const,
  forbiddenCoarse: ["best_match", "ecmwf_ifs025", "gfs_seamless"] as const,
  /** Phase 2C: ICON-2I ω may raise the wave verdict; coarse ω must not. */
  wiredIntoVerdict: true,
} as const;

/** Physics thresholds for mountain-wave gate (chips + verdict). */
export const WAVE_PHYSICS = {
  /**
   * Stable when Brunt–Väisälä N ≥ this (s⁻¹).
   * ≈ dθ/dz 5 K/km — above the ISA (~6.5 K/km → N≈0.01) background.
   */
  nStable: 0.013,
  /** Minimum depth of stable layer (m) between ridge and 600 hPa. */
  stableLayerMinM: 500,
  /** Approximate ridge height for Froude (m). */
  ridgeHeightM: 2000,
  /** |w| threshold for ICON-2I lee-wave signal (m/s). */
  omegaAbsMs: 1.5,
  /** CAPE above this → treat ω as convection, not wave (J/kg). */
  omegaCapeMaxJkg: 300,
  /** Precipitation above this → ignore ω (mm). */
  omegaPrecipMaxMm: 0.1,
  /** Wind must strengthen 700→600 by at least this many knots. */
  windIncreaseMinKt: 3,
  /** …or by this fraction of the 700 hPa speed. */
  windIncreaseMinFrac: 0.1,
  /** Direction change 700→600 must stay within this many degrees. */
  windDirChangeMaxDeg: 30,
  /** ICON-2I ω cache TTL. */
  omegaTtlMs: 60 * 60_000,
  /** Froude band often associated with trapped lee waves (chip only). */
  frWaveFavourableMin: 0.5,
  frWaveFavourableMax: 1.5,
} as const;

export type WavePhysicsFlags = {
  stableLayer: boolean;
  windIncreasing700to600: boolean;
  /** Null when ICON-2I ω unavailable / outside horizon. */
  omegaWave: boolean | null;
  omegaAvailable: boolean;
  froude: number | null;
  scorerDecreasesWithHeight: boolean | null;
  nMax: number | null;
  stableDepthM: number | null;
};

export type TurbulenceVerdictLevel = "none" | "possible" | "wave";

export const VERDICT_LABELS: Record<TurbulenceVerdictLevel, string> = {
  none: "No turbulence signal",
  possible: "Turbulence possible",
  wave: "Mountain wave & rotor likely",
};

export const VERDICT_THRESHOLDS = {
  shearPossibleKtPer1000ft: SOUNDING_SHEAR_KT_PER_1000FT,
  shearWaveKtPer1000ft: SOUNDING_WAVE_SHEAR_KT_PER_1000FT,
  midWindWaveKt: SOUNDING_WAVE_WIND_KT,
  crossRidgeWaveKt: 20,
  foehnWindSupportKt: 15,
  foehnModerateHpa: FOEHN_MODERATE_HPA,
  foehnStrongHpa: FOEHN_STRONG_HPA,
  crestStrongKt: ALPINE_WIND_STRONG_KT,
  metarGapMaxAgeMin: 90,
  /** Max consecutive pairing hole inside the trend window before cautioning. */
  metarPairGapHours: 2,
  foehnTrendLookbackH: 3,
  foehnTrendWindowH: 1,
  foehnWindSupportLocalFrom: 11,
  foehnWindSupportLocalTo: 18,
  timelineHours: 12,
} as const;

export type VerdictReasonChip = {
  id: string;
  label: string;
  kind:
    | "foehn"
    | "ridge"
    | "shear"
    | "crest"
    | "sigmet"
    | "info"
    | "stability"
    | "omega";
  detail?: string;
};

export type VerdictTimelineSlot = {
  atIso: string;
  level: TurbulenceVerdictLevel;
  label: string;
  foehnSource: "observed" | "forecast" | "none";
  foehnLabel: string | null;
  foehnBiasCorrected: boolean;
  shearKtPer1000ft: number | null;
  midWindKt: number | null;
  reasons: string[];
};

export type TurbulenceVerdict = {
  level: TurbulenceVerdictLevel;
  label: string;
  now: {
    level: TurbulenceVerdictLevel;
    label: string;
    chips: VerdictReasonChip[];
  };
  nextHours: {
    hours: number;
    level: TurbulenceVerdictLevel;
    label: string;
  };
  timeline: VerdictTimelineSlot[];
  foehnObserved: FoehnGradient | null;
  foehnTrend: {
    label: string;
    gap: boolean;
    detail: string;
  };
  foehnBiasOffsetHpa: number | null;
  ridge: {
    axisDeg: number;
    windKt: number | null;
    windDirDeg: number | null;
    crossRidgeKt: number | null;
    pHpa: number | null;
  };
  verticalExtentNote: string;
  omegaSpikeNote: string;
  computedAt: string;
};

export type LipbHourScore = {
  atIso: string;
  severity: WaveRiskSeverity;
  shearKtPer1000ft: number | null;
  midWindKt: number | null;
  midPHpa: number | null;
  ridgeWindKt: number | null;
  ridgeWindDirDeg: number | null;
  ridgeCrossKt: number | null;
  /** Wind at 600 hPa for increasing-with-height gate. */
  wind600Kt: number | null;
  /** Column physics for this hour (θ/N² / Fr chips). */
  physics: WavePhysicsFlags | null;
};

export type FoehnForecastHour = {
  atIso: string;
  innsbruckHpa: number;
  bozenHpa: number;
};

export type MetarFoehnPair = {
  at: Date;
  lipbQnh: number | null;
  lowiQnh: number | null;
};

export function verdictRank(level: TurbulenceVerdictLevel): number {
  if (level === "wave") return 2;
  if (level === "possible") return 1;
  return 0;
}

export function maxVerdictLevel(
  a: TurbulenceVerdictLevel,
  b: TurbulenceVerdictLevel,
): TurbulenceVerdictLevel {
  return verdictRank(a) >= verdictRank(b) ? a : b;
}

/**
 * Model shear/wave severity alone may raise at most "possible".
 * "Mountain wave" requires the physics gate, MTW SIGMET, or ICON-2I ω.
 */
export function severityToVerdictLevel(
  severity: WaveRiskSeverity,
): TurbulenceVerdictLevel {
  if (severity === "wave" || severity === "shear") return "possible";
  return "none";
}

export function crossRidgeComponentKt(
  windKt: number,
  windDirDeg: number,
  ridgeAxisDeg: number = LIPB_RIDGE_AXIS_DEG,
): number {
  const rad = ((windDirDeg - ridgeAxisDeg) * Math.PI) / 180;
  return Math.abs(windKt * Math.sin(rad));
}

/** One decimal for display so labels never contradict the threshold (e.g. 3.7 ≠ "4"). */
export function formatHpaOneDecimal(absHpa: number): string {
  const v = Math.round(Math.abs(absHpa) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** At/above threshold display — never call with direction "none" and literal 0. */
export function formatFoehnWords(
  direction: "north" | "south",
  absDeltaHpa: number,
): string {
  const mag = formatHpaOneDecimal(absDeltaHpa);
  if (direction === "north") return `N-Föhn ${mag} hPa`;
  return `S-Föhn ${mag} hPa`;
}

/**
 * Timeline label including below-threshold wording.
 * Strength/threshold use raw |Δp| — never round across the moderate gate.
 */
export function formatFoehnTimelineLabel(
  deltaHpa: number,
  options: { biasCorrected?: boolean } = {},
): string {
  const abs = Math.abs(deltaHpa);
  if (abs < 0.05) {
    const base = "Δp ~0 hPa";
    return options.biasCorrected ? `${base} · bias-corrected` : base;
  }
  const dirLetter = deltaHpa > 0 ? "N" : "S";
  const direction: "north" | "south" = deltaHpa > 0 ? "north" : "south";
  const mag = formatHpaOneDecimal(abs);
  let label: string;
  if (abs >= VERDICT_THRESHOLDS.foehnModerateHpa) {
    label = formatFoehnWords(direction, abs);
  } else {
    label = `${dirLetter} ${mag} hPa · below Föhn threshold`;
  }
  return options.biasCorrected ? `${label} · bias-corrected` : label;
}

/**
 * Build a FöhnGradient from a (possibly fractional) Δp.
 * Strength uses raw |Δp| so 3.7 hPa stays below the 4 hPa moderate threshold.
 */
export function foehnFromDeltaHpa(deltaHpa: number): FoehnGradient {
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
    direction === "north" || direction === "south"
      ? formatFoehnWords(direction, abs)
      : formatFoehnTimelineLabel(deltaHpa);
  const stored = Math.round(deltaHpa * 10) / 10;
  return {
    lipbQnhHpa: 0,
    lowiQnhHpa: stored,
    deltaHpa: stored,
    direction,
    strength,
    label,
  };
}

export function rawForecastDeltaHpa(hour: FoehnForecastHour): number {
  return hour.innsbruckHpa - hour.bozenHpa;
}

export function computeFoehnBiasOffsetHpa(
  modelDeltaHpa: number,
  observedDeltaHpa: number,
): number {
  return modelDeltaHpa - observedDeltaHpa;
}

export function applyFoehnBias(
  modelDeltaHpa: number,
  biasOffsetHpa: number | null,
): number {
  if (biasOffsetHpa === null) return modelDeltaHpa;
  return modelDeltaHpa - biasOffsetHpa;
}

export function advisoryIsMtwOrTurb(advisory: WxAdvisory): boolean {
  return /\b(MTW|MOUNTAIN\s*WAVES?|TURB(?:ULENCE)?)\b/i.test(advisory.raw);
}

export function advisoryIsMtw(advisory: WxAdvisory): boolean {
  return /\b(MTW|MOUNTAIN\s*WAVES?)\b/i.test(advisory.raw);
}

export function localHourRome(date: Date): number {
  return Number(
    formatLocal(date, { hour: "2-digit", hourCycle: "h23" }, LIPB.timezone),
  );
}

export function inFoehnWindSupportWindow(date: Date): boolean {
  const h = localHourRome(date);
  return (
    h >= VERDICT_THRESHOLDS.foehnWindSupportLocalFrom &&
    h <= VERDICT_THRESHOLDS.foehnWindSupportLocalTo
  );
}

export function windFromFoehnSide(
  windDirDeg: number,
  foehnDirection: "north" | "south",
): boolean {
  const target = foehnDirection === "north" ? 0 : 180;
  const d = Math.abs(((windDirDeg - target + 540) % 360) - 180);
  return d <= 90;
}

export type FoehnWindSupport = {
  supported: boolean;
  /** Short reason for timeline slots, e.g. "wind support: Patscherkofel S 24 kt, obs persisted". */
  reason: string | null;
};

/** Prefer ridge cross-flow, else nearest strong crest obs from the Föhn side. */
export function describeFoehnWindSupport(input: {
  alpine: AlpineWindBundle;
  foehnDirection: "north" | "south" | "none";
  ridgeCrossKt: number | null;
}): FoehnWindSupport {
  if (
    input.ridgeCrossKt !== null &&
    input.ridgeCrossKt >= VERDICT_THRESHOLDS.foehnWindSupportKt
  ) {
    return {
      supported: true,
      reason: `wind support: ridge cross ${Math.round(input.ridgeCrossKt)} kt`,
    };
  }
  if (input.foehnDirection === "none") {
    return { supported: false, reason: null };
  }
  const foehnDir = input.foehnDirection;
  const dirLetter = foehnDir === "north" ? "N" : "S";
  let best: { name: string; windKt: number } | null = null;
  for (const s of input.alpine.stations) {
    if (s.error || s.windKt === null || s.windDirDeg === null) continue;
    if (haversineKm(LIPB.lat, LIPB.lon, s.lat, s.lon) > LOCAL_CREST_RADIUS_KM) {
      continue;
    }
    if (s.windKt < VERDICT_THRESHOLDS.foehnWindSupportKt) continue;
    if (!windFromFoehnSide(s.windDirDeg, foehnDir)) continue;
    if (!best || s.windKt > best.windKt) {
      best = { name: s.name, windKt: s.windKt };
    }
  }
  if (!best) return { supported: false, reason: null };
  return {
    supported: true,
    reason: `wind support: ${best.name} ${dirLetter} ${Math.round(best.windKt)} kt, obs persisted`,
  };
}

export function hasFoehnWindSupport(input: {
  alpine: AlpineWindBundle;
  foehnDirection: "north" | "south" | "none";
  ridgeCrossKt: number | null;
}): boolean {
  return describeFoehnWindSupport(input).supported;
}

export function levelFromInputs(input: {
  severity: WaveRiskSeverity;
  shearKtPer1000ft: number | null;
  midWindKt: number | null;
  crossRidgeKt: number | null;
  crestStrong: boolean;
  foehn: FoehnGradient | null;
  foehnRaisesLevel?: boolean;
  mtwSigmet: boolean;
  turbSigmet: boolean;
  /** Phase 2 wave gate + ICON-2I ω. */
  wavePhysics?: WavePhysicsFlags | null;
}): TurbulenceVerdictLevel {
  let level: TurbulenceVerdictLevel = severityToVerdictLevel(input.severity);

  if (input.mtwSigmet) level = maxVerdictLevel(level, "wave");
  else if (input.turbSigmet) level = maxVerdictLevel(level, "possible");

  const shear = input.shearKtPer1000ft;
  // Shear alone (with or without crest/mid wind) → at most "possible".
  if (
    shear !== null &&
    shear >= VERDICT_THRESHOLDS.shearPossibleKtPer1000ft
  ) {
    level = maxVerdictLevel(level, "possible");
  }

  const foehnRaises = input.foehnRaisesLevel !== false;
  if (
    foehnRaises &&
    (input.foehn?.strength === "strong" || input.foehn?.strength === "moderate")
  ) {
    level = maxVerdictLevel(level, "possible");
  }

  const phys = input.wavePhysics;
  const cross = input.crossRidgeKt;
  if (
    phys?.stableLayer &&
    phys.windIncreasing700to600 &&
    cross !== null &&
    cross >= VERDICT_THRESHOLDS.crossRidgeWaveKt
  ) {
    level = maxVerdictLevel(level, "wave");
  }
  if (phys?.omegaWave === true) {
    level = maxVerdictLevel(level, "wave");
  }

  return level;
}

export function buildReasonChips(input: {
  foehn: FoehnGradient | null;
  foehnTrend: TurbulenceVerdict["foehnTrend"];
  ridge: TurbulenceVerdict["ridge"];
  shearKtPer1000ft: number | null;
  crestNames: string[];
  mtwOrTurbLabels: string[];
  wavePhysics?: WavePhysicsFlags | null;
}): VerdictReasonChip[] {
  const chips: VerdictReasonChip[] = [];
  if (input.foehn && input.foehn.strength !== "none") {
    const dir = input.foehn.direction;
    chips.push({
      id: "foehn",
      kind: "foehn",
      label:
        dir === "north" || dir === "south"
          ? formatFoehnWords(dir, Math.abs(input.foehn.deltaHpa))
          : formatFoehnTimelineLabel(input.foehn.deltaHpa),
      detail: `${input.foehnTrend.label} · LOWI−LIPB (Δp = LOWI QNH − LIPB QNH)`,
    });
  }

  if (
    input.ridge.windKt !== null &&
    input.ridge.windDirDeg !== null &&
    input.ridge.crossRidgeKt !== null
  ) {
    const dir = Math.round(input.ridge.windDirDeg)
      .toString()
      .padStart(3, "0");
    chips.push({
      id: "ridge",
      kind: "ridge",
      label: `Ridge ${RIDGE_LEVEL_HPA} hPa ${dir}°/${input.ridge.windKt} kt`,
      detail: `Cross-ridge ${Math.round(input.ridge.crossRidgeKt)} kt vs axis ${input.ridge.axisDeg}°`,
    });
  }

  if (input.shearKtPer1000ft !== null) {
    chips.push({
      id: "shear",
      kind: "shear",
      label: `Shear ${Math.round(input.shearKtPer1000ft)} kt/1000 ft`,
      detail: `VFR evaluation ≤ 3500 m MSL · wave layers may reach ~FL${WAVE_DETECTION_TOP_FL} (600 hPa)`,
    });
  }

  if (input.crestNames.length > 0) {
    chips.push({
      id: "crest",
      kind: "crest",
      label: `Crest strong (${input.crestNames.join(", ")})`,
    });
  }

  const phys = input.wavePhysics;
  if (phys?.stableLayer && phys.stableDepthM != null) {
    const nBit =
      phys.nMax != null ? ` · N ${phys.nMax.toFixed(3)}` : "";
    chips.push({
      id: "stable",
      kind: "stability",
      label: `Stable ~${Math.round(phys.stableDepthM)} m${nBit}`,
      detail: `N ≥ ${WAVE_PHYSICS.nStable} s⁻¹ over ≥ ${WAVE_PHYSICS.stableLayerMinM} m (ridge→600 hPa)`,
    });
  }
  if (phys?.froude != null) {
    chips.push({
      id: "froude",
      kind: "stability",
      label: formatFroudeChipLabel(phys.froude),
      detail: "Froude = U_cross / (N·h), h≈2000 m (chip only)",
    });
  }
  if (phys?.scorerDecreasesWithHeight === true) {
    chips.push({
      id: "scorer",
      kind: "stability",
      label: "Scorer ↓ with height",
      detail: "l² decreasing aloft favours trapped lee waves (chip only)",
    });
  }
  // Always surface ω status (primary chip, not buried in Physics).
  if (phys) {
    if (!phys.omegaAvailable) {
      chips.push({
        id: "omega",
        kind: "omega",
        label: "ω unavailable",
        detail: "ICON-2I 700 hPa vertical velocity null or outside forecast horizon",
      });
    } else if (phys.omegaWave === true) {
      chips.push({
        id: "omega",
        kind: "omega",
        label: "ω 700 hPa (ICON-2I): wave signal",
        detail: `|w| ≥ ${WAVE_PHYSICS.omegaAbsMs} m/s at 700 hPa with lee-transect sign alternation`,
      });
    } else {
      chips.push({
        id: "omega",
        kind: "omega",
        label: "ω 700 hPa (ICON-2I): no signal",
        detail: "ICON-2I 700 hPa lee transect available; no alternating |w| pattern",
      });
    }
  }

  for (const label of input.mtwOrTurbLabels) {
    chips.push({ id: `sigmet-${label}`, kind: "sigmet", label });
  }

  return chips;
}

/** Primary hangar chips — exclude expand-only physics (N/Fr/Scorer). */
export function isPhysicsDetailChip(chip: VerdictReasonChip): boolean {
  return (
    chip.kind === "stability" ||
    chip.id === "stable" ||
    chip.id === "froude" ||
    chip.id === "scorer"
  );
}

export function formatFroudeChipLabel(fr: number): string {
  if (
    fr >= WAVE_PHYSICS.frWaveFavourableMin &&
    fr <= WAVE_PHYSICS.frWaveFavourableMax
  ) {
    return `Fr ${fr.toFixed(1)} · wave-favourable`;
  }
  if (fr < WAVE_PHYSICS.frWaveFavourableMin) {
    return `Fr ${fr.toFixed(1)} · blocked`;
  }
  return `Fr ${fr.toFixed(1)} · untrapped`;
}

/** Compact Δp for quiet timeline slots (e.g. "S 3.2" / "0"). */
export function formatFoehnSlotCompact(deltaHpa: number): string {
  const abs = Math.abs(deltaHpa);
  if (abs < 0.05) return "0";
  const letter = deltaHpa > 0 ? "N" : "S";
  return `${letter} ${formatHpaOneDecimal(abs)}`;
}

export function findTrendBaselinePair(
  pairs: MetarFoehnPair[],
  now: Date,
  lookbackH = VERDICT_THRESHOLDS.foehnTrendLookbackH,
  windowH = VERDICT_THRESHOLDS.foehnTrendWindowH,
): MetarFoehnPair | null {
  const usable = pairs.filter(
    (p) => p.lipbQnh !== null && p.lowiQnh !== null,
  );
  if (usable.length === 0) return null;
  const target = now.getTime() - lookbackH * 3_600_000;
  const windowMs = windowH * 3_600_000;
  let best: MetarFoehnPair | null = null;
  let bestDist = Infinity;
  for (const p of usable) {
    const dist = Math.abs(p.at.getTime() - target);
    if (dist <= windowMs && dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  return best;
}

export function computeFoehnTrend(
  pairs: MetarFoehnPair[],
  now: Date,
  current: FoehnGradient | null,
  ages?: {
    lipbAgeMin?: number | null;
    lowiAgeMin?: number | null;
  },
): TurbulenceVerdict["foehnTrend"] {
  const usable = pairs
    .filter((p) => p.lipbQnh !== null && p.lowiQnh !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  if (usable.length === 0) {
    return {
      label: "Trend n/a",
      gap: true,
      detail:
        "Not enough paired LIPB+LOWI METARs (LIPB often gaps overnight).",
    };
  }

  // Only gaps inside the trend window (now−lookback … now) — not the whole 18 h fetch.
  const windowStart =
    now.getTime() - VERDICT_THRESHOLDS.foehnTrendLookbackH * 3_600_000;
  const windowEnd = now.getTime();
  const inWindow = usable.filter(
    (p) => p.at.getTime() >= windowStart && p.at.getTime() <= windowEnd,
  );

  let maxGapH = 0;
  for (let i = 1; i < inWindow.length; i += 1) {
    const gapH =
      (inWindow[i]!.at.getTime() - inWindow[i - 1]!.at.getTime()) /
      3_600_000;
    maxGapH = Math.max(maxGapH, gapH);
  }
  const latest = usable[usable.length - 1]!;
  const pairAgeMin = (now.getTime() - latest.at.getTime()) / 60_000;
  const lipbAge =
    ages?.lipbAgeMin != null && Number.isFinite(ages.lipbAgeMin)
      ? ages.lipbAgeMin
      : pairAgeMin;
  const lowiAge =
    ages?.lowiAgeMin != null && Number.isFinite(ages.lowiAgeMin)
      ? ages.lowiAgeMin
      : pairAgeMin;

  // Pairing holes only count from ≥ 2 h; age caution is separate wording.
  const pairingGapped = maxGapH >= VERDICT_THRESHOLDS.metarPairGapHours;
  const lipbStale = lipbAge > VERDICT_THRESHOLDS.metarGapMaxAgeMin;
  const lowiStale = lowiAge > VERDICT_THRESHOLDS.metarGapMaxAgeMin;
  const ageStale = lipbStale || lowiStale;
  const gapped = pairingGapped || ageStale;

  let cautionDetail: string | null = null;
  if (lipbStale) {
    cautionDetail = `LIPB METAR ${Math.round(lipbAge)} min old; treat observed trend cautiously.`;
  } else if (lowiStale) {
    cautionDetail = `LOWI METAR ${Math.round(lowiAge)} min old; treat observed trend cautiously.`;
  } else if (pairingGapped) {
    cautionDetail = `Pairing gap ~${Math.round(maxGapH)} h in trend window; treat observed trend cautiously.`;
  }

  const baseline = findTrendBaselinePair(pairs, now);
  if (!baseline) {
    return {
      label: "Trend n/a",
      gap: true,
      detail: `No paired METAR near now − ${VERDICT_THRESHOLDS.foehnTrendLookbackH} h (± ${VERDICT_THRESHOLDS.foehnTrendWindowH} h).`,
    };
  }

  const prevG = computeFoehnGradient(baseline.lipbQnh, baseline.lowiQnh);
  const currG =
    current ?? computeFoehnGradient(latest.lipbQnh, latest.lowiQnh);
  if (!prevG || !currG) {
    return {
      label: "Trend n/a",
      gap: gapped,
      detail: cautionDetail ?? "Could not compute Δp trend from METAR pairs.",
    };
  }
  const d = currG.deltaHpa - prevG.deltaHpa;
  const arrow = d > 0 ? "↑" : d < 0 ? "↓" : "→";
  if (gapped && cautionDetail) {
    const reason = lipbStale
      ? `LIPB METAR ${Math.round(lipbAge)} min old`
      : lowiStale
        ? `LOWI METAR ${Math.round(lowiAge)} min old`
        : `pairing gap ~${Math.round(maxGapH)} h`;
    return {
      label: `Trend ${arrow} (${reason})`,
      gap: true,
      detail: cautionDetail,
    };
  }
  return {
    label: `Trend ${arrow} ${d === 0 ? "flat" : `${d > 0 ? "+" : ""}${d} hPa`}`,
    gap: false,
    detail: `Δp vs paired sample near now − ${VERDICT_THRESHOLDS.foehnTrendLookbackH} h: ${d > 0 ? "+" : ""}${d} hPa.`,
  };
}

export function observedMetarsFresh(
  lipbAgeMin: number | null | undefined,
  lowiAgeMin: number | null | undefined,
  maxAge = VERDICT_THRESHOLDS.metarGapMaxAgeMin,
): boolean {
  return (
    lipbAgeMin != null &&
    lowiAgeMin != null &&
    lipbAgeMin <= maxAge &&
    lowiAgeMin <= maxAge
  );
}
