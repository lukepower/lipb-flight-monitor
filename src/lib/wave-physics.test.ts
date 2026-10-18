import { describe, expect, it } from "vitest";
import type { SoundingHour, SoundingLevel } from "@/lib/sounding";
import {
  assessWavePhysics,
  bruntVaisalaLayers,
  detectOmegaByHour,
  detectOmegaWaveSignalForHour,
  froudeNumber,
  icon2iOmegaCallWeight,
  icon2iOmegaHourlyParams,
  leeSideFromWindDirDeg,
  leeTransectPoints,
  potentialTemperatureK,
  stableLayerRidgeTo600,
  standardAtmosphereTemps700to600,
  windIncreasing700to600,
  type OmegaCellHour,
} from "@/lib/wave-physics";
import {
  levelFromInputs,
  WAVE_PHYSICS,
} from "@/lib/turbulence-verdict-shared";

function lvl(
  pHpa: number,
  altM: number,
  tempC: number,
  windKt: number | null = 25,
  windDir: number | null = 315,
): SoundingLevel {
  return {
    pHpa,
    altFtMsl: Math.round(altM * 3.280839895),
    windKt,
    windDir,
    tempC,
    dewC: tempC - 5,
  };
}

function soundingFromLayers(
  temps: { p: number; zM: number; tC: number; windKt?: number; windDir?: number }[],
): SoundingHour {
  return {
    atIso: "2026-10-18T12:00:00.000Z",
    cape: null,
    freezingLevelFt: null,
    gustKt: null,
    surfacePressureHpa: 1013,
    levels: [
      lvl(1013, 241, 15, 5, 180),
      ...temps.map((t) =>
        lvl(t.p, t.zM, t.tC, t.windKt ?? 30, t.windDir ?? 315),
      ),
    ],
  };
}

describe("potentialTemperatureK / N²", () => {
  it("flags a stable layer for a strong θ increase 700→600 (N ≫ 0.013)", () => {
    const s = soundingFromLayers([
      { p: 850, zM: 1500, tC: 5, windKt: 20 },
      { p: 800, zM: 2000, tC: 2, windKt: 22 },
      { p: 750, zM: 2500, tC: -1, windKt: 25 },
      { p: 700, zM: 3000, tC: -4, windKt: 28 },
      { p: 600, zM: 4200, tC: -2, windKt: 40 },
    ]);
    const levels = s.levels.filter((l) =>
      [850, 800, 750, 700, 600].includes(l.pHpa),
    );
    const layers = bruntVaisalaLayers(levels);
    const ridgeLayer = layers.find(
      (l) => l.pLowerHpa === 700 && l.pUpperHpa === 600,
    );
    expect(ridgeLayer).toBeTruthy();
    expect(ridgeLayer!.n).toBeGreaterThan(WAVE_PHYSICS.nStable);
    const stable = stableLayerRidgeTo600(layers);
    expect(stable.found).toBe(true);
  });

  it("does not flag the ISA (~6.5 K/km) as a stable layer", () => {
    expect(WAVE_PHYSICS.nStable).toBeCloseTo(0.013);
    const s = soundingFromLayers(standardAtmosphereTemps700to600());
    const levels = s.levels.filter((l) =>
      [850, 800, 750, 700, 600].includes(l.pHpa),
    );
    const layers = bruntVaisalaLayers(levels);
    const ridgeLayer = layers.find(
      (l) => l.pLowerHpa === 700 && l.pUpperHpa === 600,
    );
    expect(ridgeLayer).toBeTruthy();
    // ISA N ≈ 0.01 — below the 0.013 gate
    expect(ridgeLayer!.n).toBeLessThan(WAVE_PHYSICS.nStable);
    expect(stableLayerRidgeTo600(layers).found).toBe(false);
  });

  it("does not flag near-neutral / unstable 700→600", () => {
    const s = soundingFromLayers([
      { p: 850, zM: 1500, tC: 5 },
      { p: 800, zM: 2000, tC: 1 },
      { p: 750, zM: 2500, tC: -3 },
      { p: 700, zM: 3000, tC: -7 },
      { p: 600, zM: 4200, tC: -18 },
    ]);
    const levels = s.levels.filter((l) =>
      [850, 800, 750, 700, 600].includes(l.pHpa),
    );
    expect(stableLayerRidgeTo600(bruntVaisalaLayers(levels)).found).toBe(false);
  });

  it("θ increases with T at fixed p", () => {
    expect(potentialTemperatureK(0, 700)).toBeGreaterThan(
      potentialTemperatureK(-10, 700),
    );
  });
});

describe("Froude number chip", () => {
  it("marks blocked flow when Fr ≪ 1", () => {
    const fr = froudeNumber(5, 0.02, 2000);
    expect(fr).toBeCloseTo(0.125);
    expect(fr!).toBeLessThan(0.5);
  });
});

describe("wind increasing 700→600", () => {
  it("requires ≥ +3 kt (or +10%) and direction change ≤ 30°", () => {
    expect(windIncreasing700to600(25, 40, 180, 185)).toBe(true);
    expect(windIncreasing700to600(25, 27, 180, 185)).toBe(false); // only +2
    expect(windIncreasing700to600(40, 44, 180, 185)).toBe(true); // +10% of 40 = 4
    expect(windIncreasing700to600(25, 40, 180, 220)).toBe(false); // 40° turn
    expect(windIncreasing700to600(null, 40)).toBe(false);
  });
});

describe("lee transect side", () => {
  it("picks south lee for northerly flow and north lee for southerly", () => {
    expect(leeSideFromWindDirDeg(0)).toBe("south");
    expect(leeSideFromWindDirDeg(350)).toBe("south");
    expect(leeSideFromWindDirDeg(180)).toBe("north");
    expect(leeTransectPoints("south")).toHaveLength(14);
  });
});

describe("ICON-2I ω detection", () => {
  function cell(
    partial: Partial<OmegaCellHour> & { id: string; atIso: string },
  ): OmegaCellHour {
    return {
      lat: 46.9,
      lon: 11.5,
      w700: null,
      w600: null,
      transectIndex: 0,
      side: "south",
      ...partial,
    };
  }

  it("returns unavailable when all null", () => {
    const r = detectOmegaWaveSignalForHour([
      cell({
        id: "a",
        atIso: "2026-10-18T12:00:00.000Z",
        w700: null,
        w600: null,
      }),
    ]);
    expect(r.omegaAvailable).toBe(false);
    expect(r.omegaWave).toBe(false);
  });

  it("flags stationary alternating transect as wave (700 hPa only)", () => {
    const at = "2026-10-18T12:00:00.000Z";
    const r = detectOmegaWaveSignalForHour(
      [
        cell({
          id: "s0",
          atIso: at,
          transectIndex: 0,
          side: "south",
          w700: 2.0,
        }),
        cell({
          id: "s1",
          atIso: at,
          transectIndex: 1,
          side: "south",
          w700: -1.7,
        }),
        cell({
          id: "s2",
          atIso: at,
          transectIndex: 2,
          side: "south",
          w700: 1.9,
        }),
      ],
      { windDir700Deg: 350 },
    );
    expect(r.omegaAvailable).toBe(true);
    expect(r.omegaWave).toBe(true);
  });

  it("requests only 700 hPa ω (ICON-2I has no 600 hPa)", () => {
    expect(icon2iOmegaHourlyParams()).toBe(
      "vertical_velocity_700hPa,cape,precipitation",
    );
    expect(icon2iOmegaCallWeight(10)).toBe(3);
  });

  it("convective CAPE / precip → no wave", () => {
    const at = "2026-10-18T12:00:00.000Z";
    const cells = [
      cell({
        id: "s0",
        atIso: at,
        transectIndex: 0,
        side: "south",
        w700: 2.0,
        cape: 500,
      }),
      cell({
        id: "s1",
        atIso: at,
        transectIndex: 1,
        side: "south",
        w700: -2.0,
        cape: 500,
      }),
    ];
    expect(
      detectOmegaWaveSignalForHour(cells, { windDir700Deg: 0, cape: 500 })
        .omegaWave,
    ).toBe(false);
    expect(
      detectOmegaWaveSignalForHour(cells, {
        windDir700Deg: 0,
        precipMm: 1.5,
      }).omegaWave,
    ).toBe(false);
  });

  it("signal only at +20 h must not affect now", () => {
    const nowIso = "2026-10-18T10:00:00.000Z";
    const laterIso = "2026-10-19T06:00:00.000Z"; // +20 h
    const cells: OmegaCellHour[] = [
      cell({
        id: "s0",
        atIso: nowIso,
        transectIndex: 0,
        side: "south",
        w700: 0.2,
      }),
      cell({
        id: "s1",
        atIso: nowIso,
        transectIndex: 1,
        side: "south",
        w700: 0.1,
      }),
      cell({
        id: "s0",
        atIso: laterIso,
        transectIndex: 0,
        side: "south",
        w700: 2.2,
      }),
      cell({
        id: "s1",
        atIso: laterIso,
        transectIndex: 1,
        side: "south",
        w700: -2.1,
      }),
    ];
    const byHour = detectOmegaByHour(
      cells,
      new Map([
        [nowIso, 350],
        [laterIso, 350],
      ]),
    );
    expect(byHour.get(nowIso)?.omegaWave).toBe(false);
    expect(byHour.get(laterIso)?.omegaWave).toBe(true);
  });
});

describe("wave gate vs shear-only", () => {
  it("shear without stability/cross does not yield Mountain wave", () => {
    expect(
      levelFromInputs({
        severity: "wave",
        shearKtPer1000ft: 25,
        midWindKt: 40,
        crossRidgeKt: 5,
        crestStrong: true,
        foehn: null,
        mtwSigmet: false,
        turbSigmet: false,
        wavePhysics: {
          stableLayer: false,
          windIncreasing700to600: false,
          omegaWave: null,
          omegaAvailable: false,
          froude: null,
          scorerDecreasesWithHeight: null,
          nMax: null,
          stableDepthM: null,
        },
      }),
    ).toBe("possible");
  });

  it("cross-ridge + increasing + stable raises wave", () => {
    expect(
      levelFromInputs({
        severity: "quiet",
        shearKtPer1000ft: 10,
        midWindKt: 20,
        crossRidgeKt: 25,
        crestStrong: false,
        foehn: null,
        mtwSigmet: false,
        turbSigmet: false,
        wavePhysics: {
          stableLayer: true,
          windIncreasing700to600: true,
          omegaWave: false,
          omegaAvailable: true,
          froude: 0.8,
          scorerDecreasesWithHeight: true,
          nMax: 0.015,
          stableDepthM: 900,
        },
      }),
    ).toBe("wave");
  });

  it("ICON-2I null fallback keeps shear at possible", () => {
    const phys = assessWavePhysics(
      soundingFromLayers([
        { p: 700, zM: 3000, tC: -5, windKt: 20 },
        { p: 600, zM: 4200, tC: -20, windKt: 15 },
      ]),
      241,
      { omegaWave: null, omegaAvailable: false },
    );
    expect(phys.omegaAvailable).toBe(false);
    expect(phys.omegaWave).toBeNull();
  });
});
