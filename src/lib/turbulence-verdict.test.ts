import { describe, expect, it, vi } from "vitest";
import {
  applyFoehnBias,
  computeFoehnBiasOffsetHpa,
  computeFoehnTrend,
  crossRidgeComponentKt,
  findTrendBaselinePair,
  foehnFromDeltaHpa,
  formatFoehnTimelineLabel,
  formatFoehnWords,
  levelFromInputs,
  LIPB_RIDGE_AXIS_DEG,
  maxVerdictLevel,
  observedMetarsFresh,
  RIDGE_LEVEL_HPA,
  severityToVerdictLevel,
  VERDICT_LABELS,
  VERDICT_THRESHOLDS,
  VERTICAL_VELOCITY_SPIKE,
  WAVE_DETECTION_FL150_HPA,
  WAVE_DETECTION_TOP_FL,
  WAVE_DETECTION_TOP_HPA,
  worstVerdictForWindow,
  type VerdictTimelineSlot,
} from "@/lib/turbulence-verdict-shared";
import { computeTurbulenceVerdict } from "@/lib/turbulence-verdict";
import { computeFoehnGradient } from "@/lib/weather";
import type { AlpineWindBundle } from "@/lib/alpine-wind";
import type { WxAdvisory } from "@/lib/sigmet";

vi.mock("node:fs/promises", () => ({
  appendFile: vi.fn(async () => {}),
  mkdir: vi.fn(async () => {}),
}));

const emptyAlpine: AlpineWindBundle = {
  stations: [],
  fetchedAt: new Date().toISOString(),
};

function advisory(
  raw: string,
  opts: { alpine?: boolean; verdict?: boolean } = {},
): WxAdvisory {
  return {
    id: "t",
    kind: "sigmet",
    fir: "LIMM",
    locationCode: null,
    raw,
    validFrom: null,
    validTo: null,
    mapUrl: null,
    source: "awc",
    alpineRelevant: opts.alpine ?? true,
    verdictRelevant: opts.verdict ?? true,
    polygon: [],
  };
}

function hour(
  atIso: string,
  partial: Partial<{
    severity: "quiet" | "shear" | "wave";
    shearKtPer1000ft: number | null;
    midWindKt: number | null;
    ridgeWindKt: number | null;
    ridgeWindDirDeg: number | null;
    ridgeCrossKt: number | null;
    wind600Kt: number | null;
  }> = {},
) {
  const ridgeWindKt = partial.ridgeWindKt ?? null;
  const ridgeWindDirDeg = partial.ridgeWindDirDeg ?? null;
  return {
    atIso,
    severity: partial.severity ?? ("quiet" as const),
    shearKtPer1000ft: partial.shearKtPer1000ft ?? null,
    midWindKt: partial.midWindKt ?? null,
    midPHpa: 700,
    ridgeWindKt,
    ridgeWindDirDeg,
    ridgeCrossKt:
      partial.ridgeCrossKt ??
      (ridgeWindKt != null && ridgeWindDirDeg != null
        ? crossRidgeComponentKt(ridgeWindKt, ridgeWindDirDeg)
        : null),
    wind600Kt: partial.wind600Kt ?? null,
    physics: null,
  };
}

describe("turbulence verdict thresholds", () => {
  it("uses the three approved wording labels (no Smooth)", () => {
    expect(VERDICT_LABELS.none).toBe("No turbulence signal");
    expect(VERDICT_LABELS.possible).toBe("Turbulence possible");
    expect(VERDICT_LABELS.wave).toBe("Mountain wave & rotor likely");
  });

  it("keeps numeric gates in one module", () => {
    expect(VERDICT_THRESHOLDS.shearPossibleKtPer1000ft).toBe(20);
    expect(VERDICT_THRESHOLDS.shearWaveKtPer1000ft).toBe(15);
    expect(VERDICT_THRESHOLDS.midWindWaveKt).toBe(30);
    expect(VERDICT_THRESHOLDS.foehnModerateHpa).toBe(4);
    expect(VERDICT_THRESHOLDS.foehnStrongHpa).toBe(6);
    expect(VERDICT_THRESHOLDS.crossRidgeWaveKt).toBe(20);
    expect(VERDICT_THRESHOLDS.foehnWindSupportKt).toBe(15);
    expect(RIDGE_LEVEL_HPA).toBe(700);
  });

  it("labels 600 hPa as FL140 and points at 500 hPa for FL150", () => {
    expect(WAVE_DETECTION_TOP_HPA).toBe(600);
    expect(WAVE_DETECTION_TOP_FL).toBe(140);
    expect(WAVE_DETECTION_FL150_HPA).toBe(500);
  });

  it("records ω spike pass/fail — only ICON-2I may drive wave via ω", () => {
    expect(VERTICAL_VELOCITY_SPIKE.allowedModels).toEqual([
      "italia_meteo_arpae_icon_2i",
    ]);
    expect(VERTICAL_VELOCITY_SPIKE.failedHighRes).toContain("icon_d2");
    expect(VERTICAL_VELOCITY_SPIKE.wiredIntoVerdict).toBe(true);
  });
});

describe("formatFoehnTimelineLabel", () => {
  it("shows below-threshold Δp with one decimal so 3.7 never labels as 4", () => {
    expect(formatFoehnTimelineLabel(-3)).toBe("S 3 hPa · below Föhn threshold");
    expect(formatFoehnTimelineLabel(-3.7)).toBe(
      "S 3.7 hPa · below Föhn threshold",
    );
    expect(formatFoehnTimelineLabel(5)).toBe("N-Föhn 5 hPa");
    expect(formatFoehnTimelineLabel(-4.2, { biasCorrected: true })).toBe(
      "S-Föhn 4.2 hPa · bias-corrected",
    );
    expect(formatFoehnTimelineLabel(0)).toBe("Δp ~0 hPa");
  });

  it("formatFoehnWords only accepts N/S directions", () => {
    expect(formatFoehnWords("north", 5)).toBe("N-Föhn 5 hPa");
    expect(formatFoehnWords("south", 3)).toBe("S-Föhn 3 hPa");
  });

  it("foehnFromDeltaHpa strength uses raw |Δp|, not rounded", () => {
    const below = foehnFromDeltaHpa(-3.7);
    expect(below.strength).toBe("none");
    expect(below.label).toMatch(/below Föhn threshold/);
    const at = foehnFromDeltaHpa(-4.0);
    expect(at.strength).toBe("moderate");
    expect(at.label).toBe("S-Föhn 4 hPa");
  });
});

describe("Föhn bias correction", () => {
  it("pins bias-correction sign: corrected = model − (model_now − obs_now)", () => {
    const modelNow = -1.3;
    const obsNow = 0;
    const modelLater = -4.0;
    const offset = computeFoehnBiasOffsetHpa(modelNow, obsNow);
    // offset = model_now − obs_now = −1.3
    expect(offset).toBeCloseTo(modelNow - obsNow);
    const corrected = applyFoehnBias(modelLater, offset);
    // corrected = model − offset = −4.0 − (−1.3) = −2.7
    expect(corrected).toBeCloseTo(modelLater - (modelNow - obsNow));
    expect(corrected).toBeCloseTo(-2.7);
  });

  it("today's case: obs 0, model −1.3 → −4.0 does not yield possible from Föhn alone", () => {
    const offset = computeFoehnBiasOffsetHpa(-1.3, 0);
    expect(offset).toBeCloseTo(-1.3);
    const corrected = applyFoehnBias(-4.0, offset);
    expect(corrected).toBeCloseTo(-2.7);

    const now = new Date("2026-10-18T08:30:00Z"); // morning, before 11 LT wind gate
    const verdict = computeTurbulenceVerdict({
      now,
      lipbCell: null,
      lipbHours: [
        hour("2026-10-18T08:00:00.000Z"),
        hour("2026-10-18T09:00:00.000Z"),
        hour("2026-10-18T10:00:00.000Z"),
        hour("2026-10-18T11:00:00.000Z"),
        hour("2026-10-18T12:00:00.000Z"),
      ],
      foehnObserved: computeFoehnGradient(1015, 1015),
      observedMetarFresh: true,
      foehnForecast: [
        {
          atIso: "2026-10-18T08:00:00.000Z",
          innsbruckHpa: 1013.7,
          bozenHpa: 1015,
        }, // Δp = −1.3
        {
          atIso: "2026-10-18T12:00:00.000Z",
          innsbruckHpa: 1011,
          bozenHpa: 1015,
        }, // Δp = −4.0 raw
      ],
      foehnTrend: { label: "Trend →", gap: false, detail: "ok" },
      alpine: emptyAlpine,
      advisories: [],
    });

    expect(verdict.foehnBiasOffsetHpa).toBeCloseTo(-1.3);
    const noon = verdict.timeline.find((s) =>
      s.atIso.startsWith("2026-10-18T12"),
    );
    expect(noon?.foehnBiasCorrected).toBe(true);
    expect(noon?.foehnLabel).toMatch(/below Föhn threshold/);
    expect(noon?.level).toBe("none");
    expect(verdict.now.level).toBe("none");
  });
});

describe("crossRidgeComponentKt", () => {
  it("uses the fixed LIPB ridge axis (~78°)", () => {
    expect(LIPB_RIDGE_AXIS_DEG).toBe(78);
    expect(crossRidgeComponentKt(40, 315, 78)).toBeGreaterThan(30);
    expect(crossRidgeComponentKt(40, 78, 78)).toBeLessThan(1);
  });
});

describe("levelFromInputs", () => {
  it("maps severity and applies Föhn / SIGMET / shear gates", () => {
    expect(severityToVerdictLevel("quiet")).toBe("none");
    expect(maxVerdictLevel("none", "possible")).toBe("possible");

    expect(
      levelFromInputs({
        severity: "quiet",
        shearKtPer1000ft: 22,
        midWindKt: 15,
        crossRidgeKt: 5,
        crestStrong: false,
        foehn: null,
        mtwSigmet: false,
        turbSigmet: false,
      }),
    ).toBe("possible");

    const strongFoehn = computeFoehnGradient(1010, 1018);
    expect(
      levelFromInputs({
        severity: "quiet",
        shearKtPer1000ft: null,
        midWindKt: null,
        crossRidgeKt: null,
        crestStrong: false,
        foehn: strongFoehn,
        foehnRaisesLevel: false,
        mtwSigmet: false,
        turbSigmet: false,
      }),
    ).toBe("none");
  });
});

describe("computeFoehnTrend", () => {
  it("compares against the paired sample closest to now − 3 h", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    const pairs = [
      { at: new Date("2026-10-18T08:00:00Z"), lipbQnh: 1015, lowiQnh: 1018 },
      { at: new Date("2026-10-18T09:00:00Z"), lipbQnh: 1015, lowiQnh: 1019 },
      { at: new Date("2026-10-18T10:00:00Z"), lipbQnh: 1014, lowiQnh: 1019 },
      { at: new Date("2026-10-18T11:30:00Z"), lipbQnh: 1014, lowiQnh: 1020 },
    ];
    const baseline = findTrendBaselinePair(pairs, now);
    expect(baseline?.at.toISOString()).toBe("2026-10-18T09:00:00.000Z");
    const trend = computeFoehnTrend(pairs, now, computeFoehnGradient(1014, 1020), {
      lipbAgeMin: 20,
      lowiAgeMin: 20,
    });
    expect(trend.gap).toBe(false);
    expect(trend.detail).toMatch(/now − 3 h/);
  });

  it("ignores overnight gaps outside now−3 h … now (10:28 with hourly since 06:50)", () => {
    const now = new Date("2026-10-18T08:28:00Z"); // 10:28 Rome (CEST)
    const pairs = [
      { at: new Date("2026-10-17T18:00:00Z"), lipbQnh: 1015, lowiQnh: 1020 },
      { at: new Date("2026-10-18T04:50:00Z"), lipbQnh: 1014, lowiQnh: 1019 }, // 06:50 LT
      { at: new Date("2026-10-18T05:50:00Z"), lipbQnh: 1014, lowiQnh: 1019 },
      { at: new Date("2026-10-18T06:50:00Z"), lipbQnh: 1014, lowiQnh: 1020 },
      { at: new Date("2026-10-18T07:50:00Z"), lipbQnh: 1013, lowiQnh: 1020 },
    ];
    const trend = computeFoehnTrend(pairs, now, computeFoehnGradient(1013, 1020));
    expect(trend.gap).toBe(false);
    expect(trend.detail).not.toMatch(/~8 h/);
  });

  it("states LIPB METAR age when that is why the trend is cautioned", () => {
    const staleNow = new Date("2026-10-18T14:00:00Z");
    const stale = computeFoehnTrend(
      [
        { at: new Date("2026-10-18T09:00:00Z"), lipbQnh: 1015, lowiQnh: 1020 },
        { at: new Date("2026-10-18T11:00:00Z"), lipbQnh: 1014, lowiQnh: 1020 },
      ],
      staleNow,
      null,
      { lipbAgeMin: 120, lowiAgeMin: 20 },
    );
    expect(stale.gap).toBe(true);
    expect(stale.detail).toMatch(/LIPB METAR 120 min old/);
    expect(stale.detail).not.toMatch(/[Pp]airing gap/);
  });

  it("only calls a pairing gap at ≥ 2 h (1 h hole is fine)", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    const trend = computeFoehnTrend(
      [
        { at: new Date("2026-10-18T09:00:00Z"), lipbQnh: 1015, lowiQnh: 1019 },
        { at: new Date("2026-10-18T10:00:00Z"), lipbQnh: 1014, lowiQnh: 1019 },
        { at: new Date("2026-10-18T11:00:00Z"), lipbQnh: 1014, lowiQnh: 1020 },
      ],
      now,
      computeFoehnGradient(1014, 1020),
      { lipbAgeMin: 30, lowiAgeMin: 30 },
    );
    expect(trend.gap).toBe(false);
  });

  it("states pairing gap hours when the hole is ≥ 2 h", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    const trend = computeFoehnTrend(
      [
        { at: new Date("2026-10-18T09:00:00Z"), lipbQnh: 1015, lowiQnh: 1019 },
        { at: new Date("2026-10-18T11:30:00Z"), lipbQnh: 1014, lowiQnh: 1020 },
      ],
      now,
      computeFoehnGradient(1014, 1020),
      { lipbAgeMin: 20, lowiAgeMin: 20 },
    );
    // 09:00 → 11:30 = 2.5 h hole inside now−3h…now
    expect(trend.gap).toBe(true);
    expect(trend.detail).toMatch(/[Pp]airing gap ~/);
    expect(trend.label).toMatch(/pairing gap/);
  });
});

describe("observedMetarsFresh", () => {
  it("requires both METARs ≤ 90 min", () => {
    expect(observedMetarsFresh(30, 40)).toBe(true);
    expect(observedMetarsFresh(30, 120)).toBe(false);
    expect(observedMetarsFresh(null, 10)).toBe(false);
  });
});

describe("computeTurbulenceVerdict hour-0 Föhn", () => {
  it("uses fcst when METARs are not fresh", () => {
    const now = new Date("2026-10-18T10:30:00Z");
    const verdict = computeTurbulenceVerdict({
      now,
      lipbCell: null,
      lipbHours: [
        hour("2026-10-18T10:00:00.000Z", {
          severity: "quiet",
          shearKtPer1000ft: 5,
          ridgeWindKt: 10,
          ridgeWindDirDeg: 320,
        }),
      ],
      foehnObserved: computeFoehnGradient(1012, 1018),
      observedMetarFresh: false,
      foehnForecast: [
        {
          atIso: "2026-10-18T10:00:00.000Z",
          innsbruckHpa: 1016,
          bozenHpa: 1014,
        },
      ],
      foehnTrend: { label: "Trend n/a", gap: true, detail: "gap" },
      alpine: emptyAlpine,
      advisories: [],
    });
    expect(verdict.timeline[0]?.foehnSource).toBe("forecast");
    expect(verdict.timeline[0]?.foehnLabel).toMatch(/below Föhn threshold|N-Föhn|S-Föhn|Δp/);
  });

  it("ignores alpine-list SIGMETs that are not verdictRelevant", () => {
    const now = new Date("2026-10-18T10:30:00Z");
    const verdict = computeTurbulenceVerdict({
      now,
      lipbCell: null,
      lipbHours: [hour("2026-10-18T10:00:00.000Z")],
      foehnObserved: null,
      observedMetarFresh: false,
      foehnForecast: [],
      foehnTrend: { label: "n/a", gap: true, detail: "" },
      alpine: emptyAlpine,
      advisories: [
        advisory("LIMM SIGMET MTW MOD", { alpine: true, verdict: false }),
      ],
    });
    expect(verdict.now.level).toBe("none");
  });

  it("forecast mode never marks Föhn source as observed", () => {
    const now = new Date("2026-10-19T08:00:00Z");
    const verdict = computeTurbulenceVerdict({
      now,
      lipbCell: null,
      lipbHours: [
        hour("2026-10-19T08:00:00.000Z", {
          shearKtPer1000ft: 5,
          ridgeWindKt: 10,
          ridgeWindDirDeg: 320,
        }),
      ],
      foehnObserved: computeFoehnGradient(1012, 1018),
      observedMetarFresh: true,
      foehnForecast: [
        {
          atIso: "2026-10-19T08:00:00.000Z",
          innsbruckHpa: 1018,
          bozenHpa: 1012,
        },
      ],
      foehnTrend: { label: "Trend ↑", gap: false, detail: "" },
      alpine: emptyAlpine,
      advisories: [],
      mode: "forecast",
      timelineStart: new Date("2026-10-19T06:00:00Z"),
      timelineEnd: new Date("2026-10-19T17:00:00Z"),
      logScope: false,
    });
    expect(verdict.timeline.every((s) => s.foehnSource !== "observed")).toBe(
      true,
    );
    expect(verdict.foehnObserved).toBeNull();
    expect(verdict.timeline.length).toBeGreaterThan(8);
  });
});

describe("worstVerdictForWindow", () => {
  function slot(
    atIso: string,
    level: "none" | "possible" | "wave",
    reasons: string[] = [],
  ): VerdictTimelineSlot {
    return {
      atIso,
      level,
      label: VERDICT_LABELS[level],
      foehnSource: "forecast",
      foehnLabel: reasons[0] ?? null,
      foehnBiasCorrected: false,
      shearKtPer1000ft: null,
      midWindKt: null,
      reasons,
    };
  }

  it("returns turbulence n/a when the hole is outside the timeline", () => {
    const result = worstVerdictForWindow(
      new Date("2026-10-18T18:00:00Z"),
      new Date("2026-10-18T19:00:00Z"),
      [slot("2026-10-18T08:00:00.000Z", "none")],
    );
    expect(result.coverage).toBe("none");
    expect(result.level).toBeNull();
    expect(result.label).toBe("turbulence n/a");
  });

  it("never treats a missing gap as No turbulence signal", () => {
    const result = worstVerdictForWindow(
      new Date("2026-10-18T10:00:00Z"),
      new Date("2026-10-18T12:30:00Z"),
      [
        slot("2026-10-18T10:00:00.000Z", "none"),
        slot("2026-10-18T11:00:00.000Z", "none"),
        // 12:00–12:30 uncovered
      ],
    );
    expect(result.coverage).toBe("partial");
    expect(result.label).toBe("turbulence n/a");
    expect(result.label).not.toContain("No turbulence signal");
  });

  it("folds the worst overlapping slot when coverage is full", () => {
    const result = worstVerdictForWindow(
      new Date("2026-10-18T10:00:00Z"),
      new Date("2026-10-18T12:00:00Z"),
      [
        slot("2026-10-18T10:00:00.000Z", "none"),
        slot("2026-10-18T11:00:00.000Z", "possible", ["S-Föhn 4 hPa"]),
      ],
    );
    expect(result.coverage).toBe("full");
    expect(result.level).toBe("possible");
    expect(result.label).toContain("Turbulence possible");
    expect(result.label).toContain("S-Föhn 4 hPa");
  });
});
