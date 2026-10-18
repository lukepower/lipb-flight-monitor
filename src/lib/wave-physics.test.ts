import { describe, expect, it } from "vitest";
import type { SoundingHour, SoundingLevel } from "@/lib/sounding";
import {
  assessWavePhysics,
  bruntVaisalaLayers,
  detectOmegaWaveSignal,
  froudeNumber,
  potentialTemperatureK,
  stableLayerRidgeTo600,
  windIncreasing700to600,
} from "@/lib/wave-physics";
import { levelFromInputs } from "@/lib/turbulence-verdict-shared";

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

/** Build a column with prescribed θ lapse (via temp) between 700 and 600. */
function soundingFromLayers(
  temps: { p: number; zM: number; tC: number; windKt?: number }[],
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
        lvl(t.p, t.zM, t.tC, t.windKt ?? 30, 315),
      ),
    ],
  };
}

describe("potentialTemperatureK / N²", () => {
  it("flags a stable layer for a strong θ increase 700→600", () => {
    // ~1200 m between 700 and 600; large θ increase → N ≫ 0.01
    const s = soundingFromLayers([
      { p: 850, zM: 1500, tC: 5, windKt: 20 },
      { p: 800, zM: 2000, tC: 2, windKt: 22 },
      { p: 750, zM: 2500, tC: -1, windKt: 25 },
      { p: 700, zM: 3000, tC: -4, windKt: 28 },
      { p: 600, zM: 4200, tC: -2, windKt: 40 }, // warmer aloft → very stable
    ]);
    const levels = s.levels.filter((l) => [850, 800, 750, 700, 600].includes(l.pHpa));
    const layers = bruntVaisalaLayers(levels);
    const ridgeLayer = layers.find(
      (l) => l.pLowerHpa === 700 && l.pUpperHpa === 600,
    );
    expect(ridgeLayer).toBeTruthy();
    expect(ridgeLayer!.n).toBeGreaterThan(0.01);
    const stable = stableLayerRidgeTo600(layers);
    expect(stable.found).toBe(true);
    expect(stable.depthM).toBeGreaterThanOrEqual(500);
  });

  it("does not flag stable for a near-neutral / unstable 700→600 layer", () => {
    const s = soundingFromLayers([
      { p: 850, zM: 1500, tC: 5 },
      { p: 800, zM: 2000, tC: 1 },
      { p: 750, zM: 2500, tC: -3 },
      { p: 700, zM: 3000, tC: -7 },
      // dry adiabatic-ish cool-off: θ roughly flat or decreasing
      { p: 600, zM: 4200, tC: -18 },
    ]);
    const levels = s.levels.filter((l) =>
      [850, 800, 750, 700, 600].includes(l.pHpa),
    );
    const layers = bruntVaisalaLayers(levels);
    const stable = stableLayerRidgeTo600(layers);
    expect(stable.found).toBe(false);
  });

  it("θ increases with T at fixed p", () => {
    expect(potentialTemperatureK(0, 700)).toBeGreaterThan(
      potentialTemperatureK(-10, 700),
    );
  });
});

describe("Froude number chip", () => {
  it("marks blocked flow when Fr ≪ 1", () => {
    const fr = froudeNumber(5, 0.02, 2000); // U=5 m/s, N=0.02, h=2000 → Fr=0.125
    expect(fr).toBeCloseTo(0.125);
    expect(fr!).toBeLessThan(0.5);
  });
});

describe("wind increasing 700→600", () => {
  it("requires 600 hPa stronger than 700", () => {
    expect(windIncreasing700to600(25, 40)).toBe(true);
    expect(windIncreasing700to600(40, 25)).toBe(false);
    expect(windIncreasing700to600(null, 40)).toBe(false);
  });
});

describe("ICON-2I ω detection", () => {
  it("returns unavailable when all null", () => {
    const r = detectOmegaWaveSignal([
      {
        id: "a",
        lat: 46.5,
        lon: 11.3,
        atIso: "2026-10-18T12:00:00.000Z",
        w700: null,
        w600: null,
      },
    ]);
    expect(r.omegaAvailable).toBe(false);
    expect(r.omegaWave).toBe(false);
  });

  it("flags alternating strong |w| between neighbours", () => {
    const r = detectOmegaWaveSignal([
      {
        id: "a",
        lat: 46.5,
        lon: 11.3,
        atIso: "2026-10-18T12:00:00.000Z",
        w700: 1.5,
        w600: 1.2,
      },
      {
        id: "b",
        lat: 46.5,
        lon: 11.5,
        atIso: "2026-10-18T12:00:00.000Z",
        w700: -1.4,
        w600: -1.1,
      },
    ]);
    expect(r.omegaAvailable).toBe(true);
    expect(r.omegaWave).toBe(true);
  });
});

describe("wave gate vs shear-only", () => {
  it("shear + mid wind without stability/cross does not yield Mountain wave", () => {
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

  it("ICON-2I null fallback keeps shear at possible and marks ω unavailable via flags", () => {
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
    expect(
      levelFromInputs({
        severity: "shear",
        shearKtPer1000ft: 22,
        midWindKt: 15,
        crossRidgeKt: 8,
        crestStrong: false,
        foehn: null,
        mtwSigmet: false,
        turbSigmet: false,
        wavePhysics: phys,
      }),
    ).toBe("possible");
  });
});
