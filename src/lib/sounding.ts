import { LIPB, SOUNDING_MAX_ALT_M } from "@/lib/constants";
import { fromZonedLocal } from "@/lib/time";

/** Full column for LIPB Skew-T (includes levels above the wave/shear ceiling). */
export const SOUNDING_LEVELS_HPA = [
  950, 925, 900, 850, 800, 700, 600, 500,
] as const;

/** Pressure levels used for mountain-wave / shear risk (≈ ≤ 3500 m). */
export const WAVE_RISK_LEVELS_HPA = [
  950, 925, 900, 850, 800, 700,
] as const;

export function metersToFt(m: number): number {
  return Math.round(m * 3.280839895);
}

export const SOUNDING_GUST_KT = 25;
export const SOUNDING_WIND_KT = 25;
export const SOUNDING_WIND_MAX_FT = metersToFt(SOUNDING_MAX_ALT_M);
export const SOUNDING_SHEAR_KT_PER_1000FT = 20;
export const SOUNDING_WAVE_WIND_KT = 30;
export const SOUNDING_WAVE_SHEAR_KT_PER_1000FT = 15;
export const SOUNDING_CAPE = 500;
export const SOUNDING_MID_LEVEL_HPA = [850, 800, 700] as const;

export type SoundingLevel = {
  pHpa: number;
  altFtMsl: number;
  windKt: number | null;
  windDir: number | null;
  tempC: number | null;
  dewC: number | null;
};

export type SoundingHour = {
  atIso: string;
  cape: number | null;
  freezingLevelFt: number | null;
  gustKt: number | null;
  surfacePressureHpa: number | null;
  levels: SoundingLevel[];
};

export type SoundingHazardKind = "gust" | "wind" | "shear" | "wave" | "cape";

export type SoundingHazard = {
  kind: SoundingHazardKind;
  label: string;
  detail: string;
  pHpa?: number;
  pHpaTo?: number;
};

export type OpenMeteoHourly = {
  time: string[];
  [key: string]: (number | null)[] | string[] | undefined;
};

export type SkewTView = {
  width: number;
  height: number;
  pad: { top: number; right: number; bottom: number; left: number };
  pMax: number;
  pMin: number;
  tMin: number;
  tMax: number;
  skew: number;
};

export const DEFAULT_SKEW_T_VIEW: SkewTView = {
  width: 360,
  height: 280,
  pad: { top: 14, right: 52, bottom: 26, left: 34 },
  pMax: 1000,
  pMin: 500,
  tMin: -30,
  tMax: 40,
  skew: 72,
};

export function kmhToKt(kmh: number | null | undefined): number | null {
  if (kmh === null || kmh === undefined || !Number.isFinite(kmh)) return null;
  return Math.round(kmh / 1.852);
}

export function hydrostaticSurfaceHpa(elevationM: number): number {
  return Math.round(1013.25 * Math.exp(-elevationM / 8400) * 10) / 10;
}

export function levelsWithinAlt(
  levels: SoundingLevel[],
  maxFt = SOUNDING_WIND_MAX_FT,
): SoundingLevel[] {
  return levels.filter((level) => level.altFtMsl <= maxFt);
}

function hourlyNumber(
  hourly: OpenMeteoHourly,
  key: string,
  index: number,
): number | null {
  const col = hourly[key];
  if (!col) return null;
  const value = col[index];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function parseModelSoundings(
  hourly: OpenMeteoHourly,
  elevationM: number = LIPB.elevationM,
): SoundingHour[] {
  return hourly.time.map((stamp, index) => {
    const [date, time] = stamp.split("T");
    const at = fromZonedLocal(date, (time ?? "00:00").slice(0, 5));
    const surfacePressureHpa =
      hourlyNumber(hourly, "surface_pressure", index) ??
      hydrostaticSurfaceHpa(elevationM);
    const freezingM = hourlyNumber(hourly, "freezing_level_height", index);
    const surface: SoundingLevel = {
      pHpa: surfacePressureHpa,
      altFtMsl: metersToFt(elevationM),
      windKt: kmhToKt(hourlyNumber(hourly, "wind_speed_10m", index)),
      windDir: hourlyNumber(hourly, "wind_direction_10m", index),
      tempC: hourlyNumber(hourly, "temperature_2m", index),
      dewC: hourlyNumber(hourly, "dew_point_2m", index),
    };
    const aloft: SoundingLevel[] = [];
    for (const pHpa of SOUNDING_LEVELS_HPA) {
      const heightM = hourlyNumber(hourly, `geopotential_height_${pHpa}hPa`, index);
      if (heightM === null || heightM < elevationM) continue;
      aloft.push({
        pHpa,
        altFtMsl: metersToFt(heightM),
        windKt: kmhToKt(hourlyNumber(hourly, `wind_speed_${pHpa}hPa`, index)),
        windDir: hourlyNumber(hourly, `wind_direction_${pHpa}hPa`, index),
        tempC: hourlyNumber(hourly, `temperature_${pHpa}hPa`, index),
        dewC: hourlyNumber(hourly, `dew_point_${pHpa}hPa`, index),
      });
    }
    const levels = [surface, ...aloft].sort((a, b) => b.pHpa - a.pHpa);
    return {
      atIso: at.toISOString(),
      cape: hourlyNumber(hourly, "cape", index),
      freezingLevelFt: freezingM === null ? null : metersToFt(freezingM),
      gustKt: kmhToKt(hourlyNumber(hourly, "wind_gusts_10m", index)),
      surfacePressureHpa,
      levels,
    };
  });
}

export function soundingForInstant(
  at: Date,
  hours: SoundingHour[],
): SoundingHour | null {
  return (
    hours.find((hour) => {
      const start = new Date(hour.atIso);
      return at >= start && at < new Date(start.getTime() + 60 * 60 * 1000);
    }) ?? null
  );
}

export function windUv(
  kt: number,
  dirDeg: number,
): { u: number; v: number } {
  const rad = (dirDeg * Math.PI) / 180;
  return {
    u: -kt * Math.sin(rad),
    v: -kt * Math.cos(rad),
  };
}

export function shearKtPer1000ft(
  lower: SoundingLevel,
  upper: SoundingLevel,
): number | null {
  if (
    lower.windKt === null ||
    upper.windKt === null ||
    lower.windDir === null ||
    upper.windDir === null
  ) {
    return null;
  }
  const dAlt = upper.altFtMsl - lower.altFtMsl;
  if (dAlt <= 0) return null;
  const a = windUv(lower.windKt, lower.windDir);
  const b = windUv(upper.windKt, upper.windDir);
  const vectorKt = Math.hypot(b.u - a.u, b.v - a.v);
  return vectorKt / (dAlt / 1000);
}

export function worstShearInColumn(
  levels: SoundingLevel[],
): { value: number; lower: SoundingLevel; upper: SoundingLevel } | null {
  let worst: { value: number; lower: SoundingLevel; upper: SoundingLevel } | null =
    null;
  for (let i = 0; i < levels.length - 1; i += 1) {
    const lower = levels[i];
    const upper = levels[i + 1];
    const value = shearKtPer1000ft(lower, upper);
    if (value === null) continue;
    if (!worst || value > worst.value) {
      worst = { value, lower, upper };
    }
  }
  return worst;
}

export function midLevelMaxWind(
  levels: SoundingLevel[],
): SoundingLevel | null {
  const mid = levels.filter(
    (level) =>
      (SOUNDING_MID_LEVEL_HPA as readonly number[]).includes(level.pHpa) &&
      level.altFtMsl <= SOUNDING_WIND_MAX_FT &&
      level.windKt !== null,
  );
  if (!mid.length) return null;
  return mid.reduce((best, level) =>
    (level.windKt ?? 0) > (best.windKt ?? 0) ? level : best,
  );
}

export type SoundingHazardOptions = {
  /** Crest / Föhn station already strong — enables wave when shear is elevated. */
  crestStrong?: boolean;
};

export function soundingHazards(
  sounding: SoundingHour,
  options: SoundingHazardOptions = {},
): SoundingHazard[] {
  const hazards: SoundingHazard[] = [];
  const capped = levelsWithinAlt(sounding.levels);

  if (sounding.gustKt !== null && sounding.gustKt >= SOUNDING_GUST_KT) {
    hazards.push({
      kind: "gust",
      label: `Gusts ${sounding.gustKt} kt`,
      detail: "10 m surface gusts only",
      pHpa: sounding.levels[0]?.pHpa,
    });
  }

  const strong = capped.filter(
    (level) => level.windKt !== null && level.windKt >= SOUNDING_WIND_KT,
  );
  if (strong.length) {
    const max = strong.reduce((best, level) =>
      (level.windKt ?? 0) > (best.windKt ?? 0) ? level : best,
    );
    hazards.push({
      kind: "wind",
      label: `Wind ${max.windKt} kt`,
      detail: `${max.pHpa} hPa · ${max.altFtMsl} ft · ≤ ${SOUNDING_MAX_ALT_M} m`,
      pHpa: max.pHpa,
    });
  }

  const worstShear = worstShearInColumn(capped);
  if (worstShear && worstShear.value >= SOUNDING_SHEAR_KT_PER_1000FT) {
    hazards.push({
      kind: "shear",
      label: `Shear ${Math.round(worstShear.value)} kt/1000 ft`,
      detail: `${worstShear.lower.pHpa}–${worstShear.upper.pHpa} hPa · ≤ ${SOUNDING_MAX_ALT_M} m · inferred, not observed turbulence`,
      pHpa: worstShear.lower.pHpa,
      pHpaTo: worstShear.upper.pHpa,
    });
  }

  const mid = midLevelMaxWind(capped);
  const shearForWave = worstShear?.value ?? null;
  const modelWave =
    mid?.windKt != null &&
    mid.windKt >= SOUNDING_WAVE_WIND_KT &&
    shearForWave !== null &&
    shearForWave >= SOUNDING_WAVE_SHEAR_KT_PER_1000FT;
  const crestWave =
    options.crestStrong === true &&
    shearForWave !== null &&
    shearForWave >= SOUNDING_WAVE_SHEAR_KT_PER_1000FT;
  if (modelWave || crestWave) {
    const parts = [
      mid?.windKt != null ? `mid ${mid.windKt} kt @ ${mid.pHpa} hPa` : null,
      shearForWave !== null
        ? `shear ${Math.round(shearForWave)} kt/1000 ft`
        : null,
      options.crestStrong ? "crest strong" : null,
    ].filter(Boolean);
    hazards.push({
      kind: "wave",
      label: "Mountain-wave risk",
      detail: `${parts.join(" · ")} · ≤ ${SOUNDING_MAX_ALT_M} m · inferred, not observed turbulence`,
      pHpa: mid?.pHpa ?? worstShear?.lower.pHpa,
      pHpaTo: worstShear?.upper.pHpa,
    });
  }

  if (sounding.cape !== null && sounding.cape >= SOUNDING_CAPE) {
    hazards.push({
      kind: "cape",
      label: `CAPE ${Math.round(sounding.cape)}`,
      detail: "Convective energy (model)",
    });
  }

  return hazards;
}

export function plotInner(view: SkewTView) {
  return {
    innerWidth: view.width - view.pad.left - view.pad.right,
    innerHeight: view.height - view.pad.top - view.pad.bottom,
  };
}

export function skewTPoint(
  pHpa: number,
  tempC: number,
  view: SkewTView = DEFAULT_SKEW_T_VIEW,
): { x: number; y: number } {
  const { innerWidth, innerHeight } = plotInner(view);
  const yFrac =
    (Math.log(pHpa) - Math.log(view.pMin)) /
    (Math.log(view.pMax) - Math.log(view.pMin));
  const y = view.pad.top + yFrac * innerHeight;
  const tFrac = (tempC - view.tMin) / (view.tMax - view.tMin);
  const x = view.pad.left + tFrac * innerWidth + view.skew * (1 - yFrac);
  return { x, y };
}

export function windStripX(
  kt: number,
  width: number,
  padLeft: number,
  padRight: number,
  ktMax = 60,
): number {
  const inner = width - padLeft - padRight;
  return padLeft + (Math.max(0, Math.min(kt, ktMax)) / ktMax) * inner;
}

export function soundingHourlyParams(): string {
  const aloft = SOUNDING_LEVELS_HPA.flatMap((p) => [
    `temperature_${p}hPa`,
    `dew_point_${p}hPa`,
    `wind_speed_${p}hPa`,
    `wind_direction_${p}hPa`,
    `geopotential_height_${p}hPa`,
  ]);
  return [
    "weather_code",
    "visibility",
    "cloud_cover",
    "cloud_cover_low",
    "precipitation",
    "wind_speed_10m",
    "wind_gusts_10m",
    "wind_direction_10m",
    "temperature_2m",
    "dew_point_2m",
    "surface_pressure",
    "cape",
    "freezing_level_height",
    ...aloft,
  ].join(",");
}

/** Slimmer hourly set for the regional wave/shear grid (≤ ~3500 m levels). */
export function waveRiskHourlyParams(): string {
  const aloft = WAVE_RISK_LEVELS_HPA.flatMap((p) => [
    `wind_speed_${p}hPa`,
    `wind_direction_${p}hPa`,
    `geopotential_height_${p}hPa`,
  ]);
  return [
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "temperature_2m",
    "dew_point_2m",
    "surface_pressure",
    ...aloft,
  ].join(",");
}
