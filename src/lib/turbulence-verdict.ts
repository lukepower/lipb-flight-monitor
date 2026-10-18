/**
 * Server-only turbulence verdict: fetch, compute, JSONL log.
 * Client-safe types/helpers: `@/lib/turbulence-verdict-shared`.
 */

import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { TtlCache } from "@/lib/cache";
import { LIPB } from "@/lib/constants";
import type { AlpineWindBundle } from "@/lib/alpine-wind";
import { getHistoryDir } from "@/lib/history";
import type { WxAdvisory } from "@/lib/sigmet";
import {
  levelsAloftForWaveRisk,
  midLevelMaxWind,
  parseModelSoundings,
  waveRiskHourlyParams,
  type OpenMeteoHourly,
} from "@/lib/sounding";
import { fromZonedLocal } from "@/lib/time";
import type { FoehnGradient } from "@/lib/weather";
import {
  allLeeTransectPoints,
  assessWavePhysics,
  detectOmegaByHour,
  icon2iOmegaCallWeight,
  icon2iOmegaHourlyParams,
  type OmegaCellHour,
  type OmegaHourResult,
} from "@/lib/wave-physics";
import {
  isLocalCrestStrong,
  localStrongCrestStations,
  scoreSoundingSeverity,
  type WaveRiskCell,
} from "@/lib/wave-risk";
import {
  advisoryIsMtw,
  advisoryIsMtwOrTurb,
  applyFoehnBias,
  buildReasonChips,
  computeFoehnBiasOffsetHpa,
  computeFoehnTrend,
  crossRidgeComponentKt,
  describeFoehnWindSupport,
  foehnFromDeltaHpa,
  formatFoehnTimelineLabel,
  inFoehnWindSupportWindow,
  levelFromInputs,
  LIPB_RIDGE_AXIS_DEG,
  maxVerdictLevel,
  observedMetarsFresh,
  rawForecastDeltaHpa,
  RIDGE_LEVEL_HPA,
  VERTICAL_VELOCITY_SPIKE,
  WAVE_DETECTION_FL150_HPA,
  WAVE_DETECTION_TOP_FL,
  WAVE_DETECTION_TOP_HPA,
  WAVE_PHYSICS,
  type FoehnForecastHour,
  type LipbHourScore,
  type MetarFoehnPair,
  type TurbulenceVerdict,
  type VerdictTimelineSlot,
  type WavePhysicsFlags,
  VERDICT_LABELS,
  VERDICT_THRESHOLDS,
} from "@/lib/turbulence-verdict-shared";

export * from "@/lib/turbulence-verdict-shared";

const INNSBRUCK = { lat: 47.26, lon: 11.35 } as const;
const BOZEN = { lat: LIPB.lat, lon: LIPB.lon } as const;

const foehnCache = new TtlCache<{ hours: FoehnForecastHour[] }>();
const lipbColumnCache = new TtlCache<{
  elevationM: number;
  hourly: OpenMeteoHourly;
}>();
const metarHistCache = new TtlCache<MetarFoehnPair[]>();
const omegaCache = new TtlCache<{
  cells: OmegaCellHour[];
  capeByHour: Map<string, number | null>;
  precipByHour: Map<string, number | null>;
  callWeight: number;
}>();

/** In-process dedupe for JSONL (hour + level). */
let lastVerdictLogKey: string | null = null;

function scoreLipbHours(
  hourly: OpenMeteoHourly,
  elevationM: number,
  omegaForHour?: (atIso: string) => {
    omegaWave: boolean | null;
    omegaAvailable: boolean;
  },
): LipbHourScore[] {
  const hours = parseModelSoundings(hourly, elevationM);
  return hours.map((h) => {
    const scored = scoreSoundingSeverity(h, false, elevationM);
    const aloft = levelsAloftForWaveRisk(h.levels, elevationM);
    const mid = midLevelMaxWind(aloft);
    const ridge =
      aloft.find((l) => l.pHpa === RIDGE_LEVEL_HPA) ??
      h.levels.find((l) => l.pHpa === RIDGE_LEVEL_HPA) ??
      null;
    const lvl600 = h.levels.find((l) => l.pHpa === WAVE_DETECTION_TOP_HPA);
    const ridgeWindKt = ridge?.windKt ?? null;
    const ridgeWindDirDeg = ridge?.windDir ?? null;
    const ridgeCrossKt =
      ridgeWindKt !== null && ridgeWindDirDeg !== null
        ? crossRidgeComponentKt(ridgeWindKt, ridgeWindDirDeg)
        : null;
    const omega = omegaForHour?.(h.atIso);
    const physics = assessWavePhysics(h, elevationM, omega);
    return {
      atIso: h.atIso,
      severity: scored.severity,
      shearKtPer1000ft: scored.shearKtPer1000ft,
      midWindKt: scored.midWindKt,
      midPHpa: scored.midPHpa,
      ridgeWindKt,
      ridgeWindDirDeg,
      ridgeCrossKt,
      wind600Kt: lvl600?.windKt ?? null,
      physics,
    };
  });
}

function hourCovering<T extends { atIso: string }>(
  hours: T[],
  instant: Date,
): T | null {
  const t = instant.getTime();
  return (
    hours.find((h) => {
      const start = new Date(h.atIso).getTime();
      return t >= start && t < start + 60 * 60 * 1000;
    }) ?? null
  );
}

export function computeTurbulenceVerdict(input: {
  now?: Date;
  lipbCell: WaveRiskCell | null;
  lipbHours: LipbHourScore[];
  foehnObserved: FoehnGradient | null;
  observedMetarFresh?: boolean;
  foehnForecast: FoehnForecastHour[];
  foehnTrend: TurbulenceVerdict["foehnTrend"];
  alpine: AlpineWindBundle;
  advisories: WxAdvisory[];
  /** Per-hour ICON-2I ω (never one global flag across the forecast). */
  omegaByHour?: Map<string, OmegaHourResult>;
}): TurbulenceVerdict {
  const now = input.now ?? new Date();
  const crestStrong = isLocalCrestStrong(input.alpine);
  const crestNames = localStrongCrestStations(input.alpine).map((s) => s.name);
  const observedFresh = input.observedMetarFresh === true;

  const mtwOrTurb = input.advisories.filter(
    (a) => a.verdictRelevant && advisoryIsMtwOrTurb(a),
  );
  const mtwSigmet = mtwOrTurb.some(advisoryIsMtw);
  const turbSigmet = mtwOrTurb.length > 0;

  const covering = hourCovering(input.lipbHours, now);

  const shear =
    covering?.shearKtPer1000ft ?? input.lipbCell?.shearKtPer1000ft ?? null;
  const midWind = covering?.midWindKt ?? input.lipbCell?.midWindKt ?? null;
  const ridgeWind = covering?.ridgeWindKt ?? null;
  const ridgeDir = covering?.ridgeWindDirDeg ?? null;
  const ridgeCross =
    covering?.ridgeCrossKt ??
    (ridgeWind !== null && ridgeDir !== null
      ? crossRidgeComponentKt(ridgeWind, ridgeDir)
      : null);
  const severity = covering?.severity ?? input.lipbCell?.severity ?? "quiet";

  const omegaForAtIso = (atIso: string | undefined): OmegaHourResult | null => {
    if (!atIso || !input.omegaByHour) return null;
    return input.omegaByHour.get(atIso) ?? null;
  };

  const mergePhysics = (
    base: WavePhysicsFlags | null | undefined,
    atIso: string | undefined,
  ): WavePhysicsFlags | null => {
    const hourOmega = omegaForAtIso(atIso);
    if (!base && !hourOmega) return base ?? null;
    const omegaAvailable = hourOmega
      ? hourOmega.omegaAvailable
      : (base?.omegaAvailable ?? false);
    const omegaWave = hourOmega
      ? hourOmega.omegaAvailable
        ? hourOmega.omegaWave
        : null
      : (base?.omegaWave ?? null);
    if (!base) {
      return {
        stableLayer: false,
        windIncreasing700to600: false,
        omegaWave,
        omegaAvailable,
        froude: null,
        scorerDecreasesWithHeight: null,
        nMax: null,
        stableDepthM: null,
      };
    }
    return {
      ...base,
      omegaAvailable,
      omegaWave,
    };
  };

  const nowPhysics = mergePhysics(covering?.physics, covering?.atIso);

  const modelNow = hourCovering(input.foehnForecast, now);
  let biasOffset: number | null = null;
  if (observedFresh && input.foehnObserved && modelNow) {
    biasOffset = computeFoehnBiasOffsetHpa(
      rawForecastDeltaHpa(modelNow),
      input.foehnObserved.deltaHpa,
    );
  }

  const forecastNowRaw = modelNow ? rawForecastDeltaHpa(modelNow) : null;
  const forecastNowUncorrected =
    forecastNowRaw !== null ? foehnFromDeltaHpa(forecastNowRaw) : null;

  const hour0UseObs = observedFresh && Boolean(input.foehnObserved);
  const hour0Foehn = hour0UseObs
    ? input.foehnObserved
    : forecastNowUncorrected;
  const hour0Source: VerdictTimelineSlot["foehnSource"] = hour0UseObs
    ? "observed"
    : forecastNowUncorrected
      ? "forecast"
      : "none";

  const nowLevel = levelFromInputs({
    severity,
    shearKtPer1000ft: shear,
    midWindKt: midWind,
    crossRidgeKt: ridgeCross,
    crestStrong,
    foehn: hour0Foehn,
    foehnRaisesLevel: true,
    mtwSigmet,
    turbSigmet,
    wavePhysics: nowPhysics,
  });

  const chips = buildReasonChips({
    foehn:
      hour0Foehn && hour0Foehn.strength !== "none" ? hour0Foehn : null,
    foehnTrend: input.foehnTrend,
    ridge: {
      axisDeg: LIPB_RIDGE_AXIS_DEG,
      windKt: ridgeWind,
      windDirDeg: ridgeDir,
      crossRidgeKt: ridgeCross,
      pHpa: RIDGE_LEVEL_HPA,
    },
    shearKtPer1000ft: shear,
    crestNames,
    mtwOrTurbLabels: mtwOrTurb.map(
      (a) => `${a.kind.toUpperCase()} ${a.fir ?? ""}`.trim(),
    ),
    wavePhysics: nowPhysics,
  });

  const timeline: VerdictTimelineSlot[] = [];
  let nextLevel = nowLevel;

  for (let h = 0; h < VERDICT_THRESHOLDS.timelineHours; h += 1) {
    const slotStart = new Date(now.getTime() + h * 60 * 60 * 1000);
    const hourScore = hourCovering(input.lipbHours, slotStart);
    const forecast = hourCovering(input.foehnForecast, slotStart);
    const isCurrentHour = h === 0;

    const slotRidgeKt = hourScore?.ridgeWindKt ?? null;
    const slotRidgeDir = hourScore?.ridgeWindDirDeg ?? null;
    const slotCross =
      hourScore?.ridgeCrossKt ??
      (slotRidgeKt !== null && slotRidgeDir !== null
        ? crossRidgeComponentKt(slotRidgeKt, slotRidgeDir)
        : null);
    const slotShear = hourScore?.shearKtPer1000ft ?? null;
    const slotMid = hourScore?.midWindKt ?? null;
    const slotPhysics = mergePhysics(
      hourScore?.physics,
      hourScore?.atIso ?? forecast?.atIso,
    );

    let foehnForSlot: FoehnGradient | null = null;
    let foehnSource: VerdictTimelineSlot["foehnSource"] = "none";
    let biasCorrected = false;
    let displayDelta: number | null = null;

    if (isCurrentHour) {
      foehnForSlot = hour0Foehn;
      foehnSource = hour0Source;
      displayDelta = hour0Foehn?.deltaHpa ?? null;
      biasCorrected = false;
    } else if (forecast) {
      const raw = rawForecastDeltaHpa(forecast);
      const corrected = applyFoehnBias(raw, biasOffset);
      biasCorrected = biasOffset !== null;
      displayDelta = corrected;
      foehnForSlot = foehnFromDeltaHpa(corrected);
      foehnSource = "forecast";
    }

    let foehnRaisesLevel = true;
    let windSupportReason: string | null = null;
    if (
      foehnSource === "forecast" &&
      foehnForSlot &&
      foehnForSlot.strength !== "none" &&
      inFoehnWindSupportWindow(slotStart)
    ) {
      const support = describeFoehnWindSupport({
        alpine: input.alpine,
        foehnDirection: foehnForSlot.direction,
        ridgeCrossKt: slotCross,
      });
      foehnRaisesLevel = support.supported;
      windSupportReason = support.reason;
    }

    const slotLevel = levelFromInputs({
      severity: hourScore?.severity ?? "quiet",
      shearKtPer1000ft: slotShear,
      midWindKt: slotMid,
      crossRidgeKt: slotCross,
      crestStrong: isCurrentHour ? crestStrong : false,
      foehn: foehnForSlot,
      foehnRaisesLevel,
      mtwSigmet: isCurrentHour && mtwSigmet,
      turbSigmet: isCurrentHour && turbSigmet,
      wavePhysics: slotPhysics,
    });
    nextLevel = maxVerdictLevel(nextLevel, slotLevel);

    const reasons: string[] = [];
    if (displayDelta !== null) {
      // Source (obs/fcst) is shown as a separate tag above the reason line.
      reasons.push(
        formatFoehnTimelineLabel(displayDelta, { biasCorrected }),
      );
      if (
        !foehnRaisesLevel &&
        foehnForSlot &&
        foehnForSlot.strength !== "none"
      ) {
        reasons.push("no midday wind support");
      } else if (windSupportReason) {
        reasons.push(windSupportReason);
      }
    }
    if (
      slotShear !== null &&
      slotShear >= VERDICT_THRESHOLDS.shearPossibleKtPer1000ft
    ) {
      reasons.push(`shear ${Math.round(slotShear)}`);
    }
    if (
      slotCross !== null &&
      slotCross >= VERDICT_THRESHOLDS.crossRidgeWaveKt
    ) {
      reasons.push(`cross-ridge ${Math.round(slotCross)} kt`);
    }
    if (slotPhysics?.stableLayer) {
      reasons.push("stable layer");
    }
    if (slotPhysics && !slotPhysics.omegaAvailable) {
      reasons.push("ω unavailable");
    }

    timeline.push({
      atIso: hourScore?.atIso ?? forecast?.atIso ?? slotStart.toISOString(),
      level: slotLevel,
      label: VERDICT_LABELS[slotLevel],
      foehnSource,
      foehnLabel:
        displayDelta !== null
          ? formatFoehnTimelineLabel(displayDelta, { biasCorrected })
          : null,
      foehnBiasCorrected: biasCorrected,
      shearKtPer1000ft: slotShear,
      midWindKt: slotMid,
      reasons,
    });
  }

  const verdict: TurbulenceVerdict = {
    level: nowLevel,
    label: VERDICT_LABELS[nowLevel],
    now: {
      level: nowLevel,
      label: VERDICT_LABELS[nowLevel],
      chips,
    },
    nextHours: {
      hours: VERDICT_THRESHOLDS.timelineHours,
      level: nextLevel,
      label: VERDICT_LABELS[nextLevel],
    },
    timeline,
    foehnObserved: input.foehnObserved,
    foehnTrend: input.foehnTrend,
    foehnBiasOffsetHpa: biasOffset,
    ridge: {
      axisDeg: LIPB_RIDGE_AXIS_DEG,
      windKt: ridgeWind,
      windDirDeg: ridgeDir,
      crossRidgeKt: ridgeCross,
      pHpa: RIDGE_LEVEL_HPA,
    },
    verticalExtentNote: `VFR shear scored ≤ 3500 m MSL; wave detection may use up to ${WAVE_DETECTION_TOP_HPA} hPa (≈ FL${WAVE_DETECTION_TOP_FL}). Add ${WAVE_DETECTION_FL150_HPA} hPa if the UI says FL150.`,
    omegaSpikeNote: `ω spike: PASS ${VERTICAL_VELOCITY_SPIKE.allowedModelLabel}; FAIL ICON-D2/AROME (null). Coarse ω must not drive verdict. Wired=${VERTICAL_VELOCITY_SPIKE.wiredIntoVerdict}.`,
    computedAt: now.toISOString(),
  };

  void logTurbulenceVerdict(verdict);
  return verdict;
}

/** At most once per hour+level — JSONL under HISTORY_DIR. */
export async function logTurbulenceVerdict(
  verdict: TurbulenceVerdict,
): Promise<void> {
  const hourKey = verdict.computedAt.slice(0, 13);
  const key = `${hourKey}|${verdict.now.level}`;
  if (key === lastVerdictLogKey) return;
  lastVerdictLogKey = key;

  const line = JSON.stringify({
    at: verdict.computedAt,
    now: verdict.now.level,
    next12: verdict.nextHours.level,
    foehn: verdict.foehnObserved
      ? {
          dir: verdict.foehnObserved.direction,
          dHpa: verdict.foehnObserved.deltaHpa,
          trend: verdict.foehnTrend.label,
          gap: verdict.foehnTrend.gap,
          biasOffset: verdict.foehnBiasOffsetHpa,
        }
      : null,
    ridge: {
      kt: verdict.ridge.windKt,
      dir: verdict.ridge.windDirDeg,
      cross: verdict.ridge.crossRidgeKt,
      axis: verdict.ridge.axisDeg,
      pHpa: verdict.ridge.pHpa,
    },
    chips: verdict.now.chips.map((c) => c.label),
    timeline: verdict.timeline.map((s) => ({
      t: s.atIso,
      lvl: s.level,
      foehnSrc: s.foehnSource,
      foehn: s.foehnLabel,
      bias: s.foehnBiasCorrected,
      shear: s.shearKtPer1000ft,
      reasons: s.reasons,
    })),
  });

  try {
    const dir = getHistoryDir();
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, "turbulence-verdict.jsonl"), `${line}\n`, "utf8");
  } catch {
    // History dir may be read-only in some deploys — never break the page.
  }
}

export function resetVerdictLogDedupeForTests(): void {
  lastVerdictLogKey = null;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 180 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

export async function fetchFoehnPressureForecast(): Promise<
  FoehnForecastHour[]
> {
  return (
    await foehnCache.getOrFetch("foehn-pressure-msl", 30 * 60_000, async () => {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", `${INNSBRUCK.lat},${BOZEN.lat}`);
      url.searchParams.set("longitude", `${INNSBRUCK.lon},${BOZEN.lon}`);
      url.searchParams.set("hourly", "pressure_msl");
      url.searchParams.set("forecast_days", "2");
      url.searchParams.set("timezone", LIPB.timezone);
      const data = (await fetchJson(url.toString())) as
        | Array<{
            hourly?: {
              time?: string[];
              pressure_msl?: (number | null)[];
            };
          }>
        | {
            hourly?: {
              time?: string[];
              pressure_msl?: (number | null)[];
            };
          };
      const list = Array.isArray(data) ? data : [data];
      const inns = list[0]?.hourly;
      const boz = list[1]?.hourly ?? list[0]?.hourly;
      const times = inns?.time ?? [];
      const hours: FoehnForecastHour[] = [];
      for (let i = 0; i < times.length; i += 1) {
        const stamp = times[i]!;
        const [date, time] = stamp.split("T");
        const at = fromZonedLocal(date!, (time ?? "00:00").slice(0, 5));
        const ip = inns?.pressure_msl?.[i];
        const bp = boz?.pressure_msl?.[i];
        if (
          ip == null ||
          bp == null ||
          !Number.isFinite(ip) ||
          !Number.isFinite(bp)
        ) {
          continue;
        }
        hours.push({
          atIso: at.toISOString(),
          innsbruckHpa: ip,
          bozenHpa: bp,
        });
      }
      return { hours };
    })
  ).hours;
}

export async function fetchLipbVerdictColumn(
  omegaForHour?: (atIso: string) => {
    omegaWave: boolean | null;
    omegaAvailable: boolean;
  },
): Promise<{
  elevationM: number;
  hours: LipbHourScore[];
}> {
  const payload = await lipbColumnCache.getOrFetch(
    "lipb-verdict-column",
    30 * 60_000,
    async () => {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(LIPB.lat));
      url.searchParams.set("longitude", String(LIPB.lon));
      url.searchParams.set("hourly", waveRiskHourlyParams());
      url.searchParams.set("forecast_days", "2");
      url.searchParams.set("timezone", LIPB.timezone);
      const data = (await fetchJson(url.toString())) as {
        elevation?: number;
        hourly?: OpenMeteoHourly;
      };
      if (!data.hourly) throw new Error("LIPB column missing hourly");
      return {
        elevationM: Number(data.elevation ?? LIPB.elevationM),
        hourly: data.hourly,
      };
    },
  );
  return {
    elevationM: payload.elevationM,
    hours: scoreLipbHours(payload.hourly, payload.elevationM, omegaForHour),
  };
}

/**
 * ICON-2I vertical velocity along dense Wipptal/Eisacktal lee transects.
 * Never use coarse-model ω. Evaluated per hour (not one global flag).
 */
export async function fetchIcon2iOmega(
  windDirByHour: Map<string, number | null> = new Map(),
): Promise<{
  cells: OmegaCellHour[];
  byHour: Map<string, OmegaHourResult>;
  callWeight: number;
}> {
  const points = allLeeTransectPoints();
  const callWeight = icon2iOmegaCallWeight(points.length);
  console.info(
    `[wave-physics] ICON-2I ω call weight=${callWeight} (4 vars × ${points.length} lee-transect pts, TTL ${WAVE_PHYSICS.omegaTtlMs / 60_000} min)`,
  );

  const cached = await omegaCache.getOrFetch(
    "icon2i-omega-lee-transect",
    WAVE_PHYSICS.omegaTtlMs,
    async () => {
      const model = VERTICAL_VELOCITY_SPIKE.allowedModels[0];
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set(
        "latitude",
        points.map((p) => p.lat).join(","),
      );
      url.searchParams.set(
        "longitude",
        points.map((p) => p.lon).join(","),
      );
      url.searchParams.set("hourly", icon2iOmegaHourlyParams());
      url.searchParams.set("models", model);
      url.searchParams.set("forecast_days", "2");
      url.searchParams.set("timezone", LIPB.timezone);

      let data: unknown;
      try {
        data = await fetchJson(url.toString());
      } catch {
        return {
          cells: [],
          capeByHour: new Map(),
          precipByHour: new Map(),
          callWeight,
        };
      }

      const list = Array.isArray(data) ? data : [data];
      const cells: OmegaCellHour[] = [];
      const capeByHour = new Map<string, number | null>();
      const precipByHour = new Map<string, number | null>();

      for (let i = 0; i < list.length; i += 1) {
        const loc = list[i] as {
          hourly?: {
            time?: string[];
            vertical_velocity_700hPa?: (number | null)[];
            vertical_velocity_600hPa?: (number | null)[];
            cape?: (number | null)[];
            precipitation?: (number | null)[];
          };
        };
        const point = points[i];
        if (!point || !loc.hourly?.time) continue;
        const times = loc.hourly.time;
        for (let t = 0; t < times.length; t += 1) {
          const stamp = times[t]!;
          const [date, time] = stamp.split("T");
          const at = fromZonedLocal(date!, (time ?? "00:00").slice(0, 5));
          const atIso = at.toISOString();
          const w700 = loc.hourly.vertical_velocity_700hPa?.[t] ?? null;
          const w600 = loc.hourly.vertical_velocity_600hPa?.[t] ?? null;
          const cape = loc.hourly.cape?.[t] ?? null;
          const precip = loc.hourly.precipitation?.[t] ?? null;
          if (cape != null && Number.isFinite(cape)) {
            const prev = capeByHour.get(atIso);
            capeByHour.set(
              atIso,
              prev == null ? cape : Math.max(prev, cape),
            );
          }
          if (precip != null && Number.isFinite(precip)) {
            const prev = precipByHour.get(atIso);
            precipByHour.set(
              atIso,
              prev == null ? precip : Math.max(prev, precip),
            );
          }
          cells.push({
            id: point.id,
            lat: point.lat,
            lon: point.lon,
            atIso,
            w700:
              typeof w700 === "number" && Number.isFinite(w700) ? w700 : null,
            w600:
              typeof w600 === "number" && Number.isFinite(w600) ? w600 : null,
            cape: typeof cape === "number" && Number.isFinite(cape) ? cape : null,
            precipMm:
              typeof precip === "number" && Number.isFinite(precip)
                ? precip
                : null,
            transectIndex: point.index,
            side: point.side,
          });
        }
      }

      return { cells, capeByHour, precipByHour, callWeight };
    },
  );

  // Re-evaluate per hour with current 700 hPa wind dirs (cache stores cells only).
  const byHour = detectOmegaByHour(
    cached.cells,
    windDirByHour,
    cached.capeByHour,
    cached.precipByHour,
  );
  return {
    cells: cached.cells,
    byHour,
    callWeight: cached.callWeight,
  };
}

export async function fetchMetarFoehnHistory(): Promise<MetarFoehnPair[]> {
  return metarHistCache.getOrFetch("metar-foehn-hist", 10 * 60_000, async () => {
    const url = `https://aviationweather.gov/api/data/metar?ids=${LIPB.icao},LOWI&format=json&hours=18`;
    const data = (await fetchJson(url)) as Array<{
      icaoId?: string;
      obsTime?: number;
      altim?: number | null;
      rawOb?: string;
    }>;
    const byBucket = new Map<string, MetarFoehnPair>();
    for (const m of data) {
      if (m.obsTime == null) continue;
      const at = new Date(m.obsTime * 1000);
      if (Number.isNaN(at.getTime())) continue;
      const bucket =
        Math.floor(at.getTime() / (30 * 60_000)) * 30 * 60_000;
      const key = String(bucket);
      const row = byBucket.get(key) ?? {
        at: new Date(bucket),
        lipbQnh: null,
        lowiQnh: null,
      };
      const id = m.icaoId?.toUpperCase();
      const raw = m.rawOb ?? "";
      if (id === "LIPB" || raw.startsWith("LIPB")) {
        row.lipbQnh = m.altim ?? row.lipbQnh;
      }
      if (id === "LOWI" || raw.startsWith("LOWI")) {
        row.lowiQnh = m.altim ?? row.lowiQnh;
      }
      byBucket.set(key, row);
    }
    return [...byBucket.values()].sort(
      (a, b) => a.at.getTime() - b.at.getTime(),
    );
  });
}

export async function loadTurbulenceVerdict(input: {
  now?: Date;
  lipbCell: WaveRiskCell | null;
  foehnObserved: FoehnGradient | null;
  lipbMetarAgeMin?: number | null;
  lowiMetarAgeMin?: number | null;
  alpine: AlpineWindBundle;
  advisories: WxAdvisory[];
}): Promise<TurbulenceVerdict> {
  const now = input.now ?? new Date();
  const [foehnForecast, hist, columnDraft] = await Promise.all([
    fetchFoehnPressureForecast().catch(() => [] as FoehnForecastHour[]),
    fetchMetarFoehnHistory().catch(() => [] as MetarFoehnPair[]),
    fetchLipbVerdictColumn().catch(() => ({
      elevationM: LIPB.elevationM,
      hours: [] as LipbHourScore[],
    })),
  ]);

  const windDirByHour = new Map<string, number | null>();
  for (const h of columnDraft.hours) {
    windDirByHour.set(h.atIso, h.ridgeWindDirDeg);
  }

  const omega = await fetchIcon2iOmega(windDirByHour).catch(() => ({
    cells: [] as OmegaCellHour[],
    byHour: new Map<string, OmegaHourResult>(),
    callWeight: 0,
  }));

  const omegaLookup = (atIso: string) => {
    const hit = omega.byHour.get(atIso);
    if (!hit) {
      return {
        omegaWave: null as boolean | null,
        omegaAvailable: false,
      };
    }
    return {
      omegaWave: hit.omegaAvailable ? hit.omegaWave : null,
      omegaAvailable: hit.omegaAvailable,
    };
  };

  const hours = scoreLipbHoursForOmega(columnDraft.hours, omegaLookup);

  const trend = computeFoehnTrend(hist, now, input.foehnObserved);

  return computeTurbulenceVerdict({
    now,
    lipbCell: input.lipbCell,
    lipbHours: hours,
    foehnObserved: input.foehnObserved,
    observedMetarFresh: observedMetarsFresh(
      input.lipbMetarAgeMin,
      input.lowiMetarAgeMin,
    ),
    foehnForecast,
    foehnTrend: trend,
    alpine: input.alpine,
    advisories: input.advisories,
    omegaByHour: omega.byHour,
  });
}

/** Patch physics.omega onto already-scored hours without re-fetching the column. */
function scoreLipbHoursForOmega(
  hours: LipbHourScore[],
  omegaForHour: (atIso: string) => {
    omegaWave: boolean | null;
    omegaAvailable: boolean;
  },
): LipbHourScore[] {
  return hours.map((h) => {
    const omega = omegaForHour(h.atIso);
    if (!h.physics) {
      return {
        ...h,
        physics: {
          stableLayer: false,
          windIncreasing700to600: false,
          omegaWave: omega.omegaWave,
          omegaAvailable: omega.omegaAvailable,
          froude: null,
          scorerDecreasesWithHeight: null,
          nMax: null,
          stableDepthM: null,
        },
      };
    }
    return {
      ...h,
      physics: {
        ...h.physics,
        omegaWave: omega.omegaWave,
        omegaAvailable: omega.omegaAvailable,
      },
    };
  });
}
