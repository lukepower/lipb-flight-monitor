import { describe, expect, it } from "vitest";
import { fromZonedLocal } from "@/lib/time";
import type { AlpineWindBundle } from "@/lib/alpine-wind";
import type { SoundingHour, SoundingLevel } from "@/lib/sounding";
import {
  buildWaveRiskBundle,
  isCrestStrong,
  maxSeverity,
  pickLipbCellIndex,
  scoreSoundingSeverity,
  waveRiskGridPoints,
} from "@/lib/wave-risk";

function level(
  partial: Partial<SoundingLevel> & Pick<SoundingLevel, "pHpa" | "altFtMsl">,
): SoundingLevel {
  return {
    windKt: null,
    windDir: null,
    tempC: null,
    dewC: null,
    ...partial,
  };
}

function quietSounding(overrides: Partial<SoundingHour> = {}): SoundingHour {
  return {
    atIso: fromZonedLocal("2026-09-20", "10:00").toISOString(),
    cape: 50,
    freezingLevelFt: 10500,
    gustKt: 12,
    surfacePressureHpa: 986,
    levels: [
      level({ pHpa: 986, altFtMsl: 791, windKt: 8, windDir: 180, tempC: 18 }),
      level({ pHpa: 850, altFtMsl: 4921, windKt: 12, windDir: 200, tempC: 8 }),
    ],
    ...overrides,
  };
}

function emptyAlpine(overrides: Partial<AlpineWindBundle> = {}): AlpineWindBundle {
  return {
    stations: [],
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("waveRiskGridPoints", () => {
  it("builds a cols×rows grid inside the bbox", () => {
    const points = waveRiskGridPoints(
      { lamin: 45, lamax: 47, lomin: 10, lomax: 12 },
      5,
      4,
    );
    expect(points).toHaveLength(20);
    expect(points[0]).toMatchObject({ id: "r0c0", lat: 45, lon: 10 });
    expect(points[points.length - 1]).toMatchObject({
      id: "r3c4",
      lat: 47,
      lon: 12,
    });
  });
});

describe("scoreSoundingSeverity", () => {
  it("stays quiet in light columns", () => {
    expect(scoreSoundingSeverity(quietSounding()).severity).toBe("quiet");
  });

  it("flags shear without wave", () => {
    const sounding = quietSounding({
      levels: [
        level({ pHpa: 986, altFtMsl: 800, windKt: 5, windDir: 360 }),
        level({ pHpa: 850, altFtMsl: 1800, windKt: 28, windDir: 90 }),
      ],
    });
    expect(scoreSoundingSeverity(sounding).severity).toBe("shear");
  });

  it("flags wave when mid wind and shear combine", () => {
    const sounding = quietSounding({
      levels: [
        level({ pHpa: 986, altFtMsl: 800, windKt: 5, windDir: 360 }),
        level({ pHpa: 700, altFtMsl: 2800, windKt: 35, windDir: 90 }),
      ],
    });
    expect(scoreSoundingSeverity(sounding).severity).toBe("wave");
  });

  it("ignores shear only above 3500 m", () => {
    const sounding = quietSounding({
      levels: [
        level({ pHpa: 986, altFtMsl: 791, windKt: 8, windDir: 180 }),
        level({ pHpa: 600, altFtMsl: 14000, windKt: 5, windDir: 360 }),
        level({ pHpa: 500, altFtMsl: 18000, windKt: 55, windDir: 90 }),
      ],
    });
    expect(scoreSoundingSeverity(sounding).severity).toBe("quiet");
  });

  it("flags wave from crest + shear", () => {
    const sounding = quietSounding({
      levels: [
        level({ pHpa: 986, altFtMsl: 800, windKt: 5, windDir: 360 }),
        level({ pHpa: 850, altFtMsl: 1800, windKt: 22, windDir: 90 }),
      ],
    });
    expect(scoreSoundingSeverity(sounding).severity).toBe("shear");
    expect(scoreSoundingSeverity(sounding, true).severity).toBe("wave");
  });
});

describe("maxSeverity / crest", () => {
  it("orders quiet < shear < wave", () => {
    expect(maxSeverity("quiet", "shear")).toBe("shear");
    expect(maxSeverity("wave", "shear")).toBe("wave");
  });

  it("detects strong crest stations", () => {
    expect(isCrestStrong(emptyAlpine())).toBe(false);
    expect(
      isCrestStrong(
        emptyAlpine({
          stations: [
            {
              id: "plose",
              name: "Plose",
              elevM: 2472,
              region: "ST",
              source: "siag",
              lat: 46.7,
              lon: 11.7,
              observedAt: new Date(),
              ageMin: 5,
              windDirDeg: 180,
              windKt: 30,
              gustKt: 35,
              history: [],
            },
          ],
        }),
      ),
    ).toBe(true);
  });
});

describe("buildWaveRiskBundle", () => {
  it("aggregates flagged cells and picks a LIPB cell", () => {
    const points = waveRiskGridPoints(
      { lamin: 46, lamax: 47, lomin: 11, lomax: 12 },
      2,
      2,
    );
    const lipbIdx = pickLipbCellIndex(points);
    const now = fromZonedLocal("2026-09-20", "10:15");
    const quietHourly = {
      time: ["2026-09-20T10:00"],
      wind_speed_10m: [10],
      wind_direction_10m: [180],
      wind_gusts_10m: [12],
      temperature_2m: [18],
      dew_point_2m: [8],
      surface_pressure: [986],
      wind_speed_850hPa: [18],
      wind_direction_850hPa: [200],
      geopotential_height_850hPa: [1500],
    };
    const shearHourly = {
      ...quietHourly,
      wind_speed_10m: [5],
      wind_direction_10m: [360],
      wind_speed_850hPa: [120],
      wind_direction_850hPa: [90],
      geopotential_height_850hPa: [900],
    };
    const locations = points.map((_, i) => ({
      latitude: points[i].lat,
      longitude: points[i].lon,
      elevation: 241,
      hourly: i === lipbIdx ? shearHourly : quietHourly,
    }));
    const bundle = buildWaveRiskBundle({
      locations,
      points,
      alpine: emptyAlpine(),
      now,
    });
    expect(bundle.cells).toHaveLength(4);
    expect(bundle.lipb?.isLipb).toBe(true);
    expect(bundle.flaggedCellCount).toBeGreaterThanOrEqual(1);
    expect(bundle.worstSeverity).not.toBe("quiet");
    expect(bundle.lipbHazards.some((h) => h.kind === "shear" || h.kind === "wave")).toBe(
      true,
    );
  });

  it("returns empty quiet bundle when locations missing", () => {
    const points = waveRiskGridPoints(
      { lamin: 46, lamax: 47, lomin: 11, lomax: 12 },
      2,
      2,
    );
    const bundle = buildWaveRiskBundle({
      locations: [],
      points,
      alpine: emptyAlpine(),
    });
    expect(bundle.worstSeverity).toBe("quiet");
    expect(bundle.flaggedCellCount).toBe(0);
    expect(bundle.lipbHazards).toEqual([]);
  });
});
