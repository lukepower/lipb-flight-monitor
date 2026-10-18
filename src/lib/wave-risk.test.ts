import { describe, expect, it } from "vitest";
import { fromZonedLocal } from "@/lib/time";
import type { AlpineWindBundle } from "@/lib/alpine-wind";
import type { SoundingHour, SoundingLevel } from "@/lib/sounding";
import { LIPB, WAVE_RISK_GRID } from "@/lib/constants";
import {
  alpsWaveGridPoints,
  buildWaveRiskBundle,
  haversineKm,
  isCrestStrong,
  isLocalCrestStrong,
  localAtCrestIncomplete,
  localWaveBbox,
  localWaveGridPoints,
  maxSeverity,
  nearWaveRiskBbox,
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
    // Aloft levels above LIPB terrain+150 m and ≤ 3500 m (surface wind omitted).
    levels: [
      level({ pHpa: 850, altFtMsl: 4921, windKt: 12, windDir: 200, tempC: 8 }),
      level({ pHpa: 700, altFtMsl: 9882, windKt: 14, windDir: 210, tempC: 0 }),
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

/** Open-Meteo speeds are km/h. ~1000 ft gap + 90° turn → shear ≫ 20 kt/1000 ft. */
function shearHourly() {
  return {
    time: ["2026-09-20T10:00"],
    wind_speed_10m: [5],
    wind_direction_10m: [360],
    wind_gusts_10m: [8],
    temperature_2m: [12],
    dew_point_2m: [4],
    surface_pressure: [986],
    wind_speed_850hPa: [9],
    wind_direction_850hPa: [360],
    geopotential_height_850hPa: [550],
    wind_speed_700hPa: [52],
    wind_direction_700hPa: [90],
    geopotential_height_700hPa: [850],
  };
}

describe("waveRiskGridPoints / alps skip", () => {
  it("builds a cols×rows grid inside the bbox", () => {
    const points = waveRiskGridPoints(
      { lamin: 45, lamax: 47, lomin: 10, lomax: 12 },
      5,
      4,
    );
    expect(points).toHaveLength(20);
    expect(points[0]).toMatchObject({ id: "r0c0", lat: 45, lon: 10, scope: "local" });
  });

  it("centres the local grid on LIPB exactly", () => {
    const local = localWaveGridPoints();
    expect(local).toHaveLength(WAVE_RISK_GRID.cols * WAVE_RISK_GRID.rows);
    const centreId = `r${Math.floor(WAVE_RISK_GRID.rows / 2)}c${Math.floor(WAVE_RISK_GRID.cols / 2)}`;
    const centre = local.find((p) => p.id === centreId);
    expect(centre?.lat).toBe(LIPB.lat);
    expect(centre?.lon).toBe(LIPB.lon);
    expect(haversineKm(centre!.lat, centre!.lon, LIPB.lat, LIPB.lon)).toBe(0);
    expect(pickLipbCellIndex(local)).toBe(
      local.findIndex((p) => p.id === centreId),
    );
  });

  it("drops Alps points inside the LIPB-centred local box and a half-step halo", () => {
    const alps = alpsWaveGridPoints();
    const localBox = localWaveBbox();
    expect(alps.length).toBeGreaterThan(0);
    expect(alps.length).toBeLessThanOrEqual(45);
    expect(alps.every((p) => p.scope === "alps")).toBe(true);
    expect(alps.every((p) => !nearWaveRiskBbox(p.lat, p.lon))).toBe(true);
    expect(
      alps.every(
        (p) =>
          p.lon < localBox.lomin - 0.01 ||
          p.lon > localBox.lomax + 0.01 ||
          p.lat < localBox.lamin - 0.01 ||
          p.lat > localBox.lamax + 0.01,
      ),
    ).toBe(true);
  });
});

describe("scoreSoundingSeverity", () => {
  it("stays quiet in light columns", () => {
    expect(scoreSoundingSeverity(quietSounding()).severity).toBe("quiet");
    expect(scoreSoundingSeverity(quietSounding()).data).toBe("ok");
  });

  it("flags shear without wave", () => {
    const sounding = quietSounding({
      levels: [
        level({ pHpa: 850, altFtMsl: 1800, windKt: 5, windDir: 360 }),
        level({ pHpa: 700, altFtMsl: 2800, windKt: 28, windDir: 90 }),
      ],
    });
    expect(scoreSoundingSeverity(sounding, false, 200).severity).toBe("shear");
  });

  it("flags wave when mid wind and shear combine", () => {
    const sounding = quietSounding({
      levels: [
        level({ pHpa: 850, altFtMsl: 1800, windKt: 5, windDir: 360 }),
        level({ pHpa: 700, altFtMsl: 2800, windKt: 35, windDir: 90 }),
      ],
    });
    expect(scoreSoundingSeverity(sounding, false, 200).severity).toBe("wave");
  });

  it("marks high-terrain columns with fewer than 2 layers as insufficient", () => {
    const sounding = quietSounding({
      levels: [
        level({ pHpa: 700, altFtMsl: 10000, windKt: 40, windDir: 90 }),
        level({ pHpa: 600, altFtMsl: 14000, windKt: 55, windDir: 90 }),
      ],
    });
    const scored = scoreSoundingSeverity(sounding);
    expect(scored.data).toBe("insufficient");
    expect(scored.severity).toBe("quiet");
  });

  it("marks ~2500 m terrain when surface is the only extra layer as insufficient", () => {
    const elevM = 2500;
    const sounding = quietSounding({
      levels: [
        // Near-surface / below elev+150 m — must not count
        level({ pHpa: 750, altFtMsl: 8200, windKt: 15, windDir: 180 }),
        // One valid aloft layer within 3500 m
        level({ pHpa: 700, altFtMsl: 10000, windKt: 40, windDir: 90 }),
        // Above 3500 m ceiling
        level({ pHpa: 600, altFtMsl: 14000, windKt: 55, windDir: 90 }),
      ],
    });
    const scored = scoreSoundingSeverity(sounding, false, elevM);
    expect(scored.data).toBe("insufficient");
    expect(scored.severity).toBe("quiet");
    expect(scored.shearKtPer1000ft).toBeNull();
  });

  it("does not count the 10 m surface wind toward the two-layer minimum", () => {
    const sounding = quietSounding({
      levels: [
        level({ pHpa: 986, altFtMsl: 791, windKt: 8, windDir: 180 }),
        level({ pHpa: 850, altFtMsl: 4921, windKt: 12, windDir: 200 }),
      ],
    });
    // Only one aloft level above LIPB+150 m within the cap → insufficient
    expect(scoreSoundingSeverity(sounding).data).toBe("insufficient");
  });

  it("flags wave from crest + shear", () => {
    const sounding = quietSounding({
      levels: [
        level({ pHpa: 850, altFtMsl: 1800, windKt: 5, windDir: 360 }),
        level({ pHpa: 700, altFtMsl: 2800, windKt: 22, windDir: 90 }),
      ],
    });
    expect(scoreSoundingSeverity(sounding, false, 200).severity).toBe("shear");
    expect(scoreSoundingSeverity(sounding, true, 200).severity).toBe("wave");
  });
});

describe("maxSeverity / crest", () => {
  it("orders quiet < shear < wave", () => {
    expect(maxSeverity("quiet", "shear")).toBe("shear");
    expect(maxSeverity("wave", "shear")).toBe("wave");
  });

  it("flags incomplete near-LIPB AT crest data", () => {
    expect(localAtCrestIncomplete(emptyAlpine())).toBe(false);
    expect(
      localAtCrestIncomplete(
        emptyAlpine({
          stations: [
            {
              id: "patscherkofel",
              name: "Patscherkofel",
              elevM: 2251,
              region: "AT",
              source: "geosphere",
              lat: 47.2089,
              lon: 11.4622,
              observedAt: null,
              ageMin: null,
              windDirDeg: null,
              windKt: null,
              gustKt: null,
              history: [],
              error: "GeoSphere HTTP 400",
            },
          ],
        }),
      ),
    ).toBe(true);
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
  it("aggregates flagged cells and picks a LIPB cell from the local grid", () => {
    const localPoints = waveRiskGridPoints(
      { lamin: 46, lamax: 47, lomin: 11, lomax: 12 },
      2,
      2,
    );
    const lipbIdx = pickLipbCellIndex(localPoints);
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
      wind_speed_700hPa: [20],
      wind_direction_700hPa: [210],
      geopotential_height_700hPa: [3000],
    };
    const locations = localPoints.map((_, i) => ({
      latitude: localPoints[i]!.lat,
      longitude: localPoints[i]!.lon,
      elevation: 241,
      hourly: i === lipbIdx ? shearHourly() : quietHourly,
    }));
    const bundle = buildWaveRiskBundle({
      localLocations: locations,
      localPoints,
      alpine: emptyAlpine(),
      now,
    });
    expect(bundle.cells.filter((c) => c.scope === "local")).toHaveLength(4);
    expect(bundle.lipb?.isLipb).toBe(true);
    expect(bundle.localFlaggedCellCount).toBeGreaterThanOrEqual(1);
    expect(bundle.localWorstSeverity).not.toBe("quiet");
    expect(bundle.lipbHazards.some((h) => h.kind === "shear" || h.kind === "wave")).toBe(
      true,
    );
  });

  it("excludes insufficient cells from worst/flagged aggregation", () => {
    const localPoints = [
      { id: "r0c0", lat: 46.46, lon: 11.33, scope: "local" as const },
      { id: "r0c1", lat: 46.5, lon: 11.5, scope: "local" as const },
    ];
    const thinHourly = {
      time: ["2026-09-20T10:00"],
      wind_speed_10m: [5],
      wind_direction_10m: [180],
      wind_gusts_10m: [8],
      temperature_2m: [-5],
      dew_point_2m: [-8],
      surface_pressure: [700],
      // Only levels above 3500 m → insufficient after cap
      wind_speed_700hPa: [40],
      wind_direction_700hPa: [90],
      geopotential_height_700hPa: [4000],
      wind_speed_600hPa: [50],
      wind_direction_600hPa: [90],
      geopotential_height_600hPa: [5000],
    };
    const locations = localPoints.map((p) => ({
      latitude: p.lat,
      longitude: p.lon,
      elevation: 2800,
      hourly: thinHourly,
    }));
    const bundle = buildWaveRiskBundle({
      localLocations: locations,
      localPoints,
      alpine: emptyAlpine(),
      now: fromZonedLocal("2026-09-20", "10:15"),
    });
    expect(bundle.cells.every((c) => c.data === "insufficient")).toBe(true);
    expect(bundle.cells.every((c) => c.severity === "quiet")).toBe(true);
    expect(bundle.worstSeverity).toBe("quiet");
    expect(bundle.flaggedCellCount).toBe(0);
    expect(bundle.localFlaggedCellCount).toBe(0);
  });

  it("does not let a distant strong station force LIPB wave or lipbHazards wave", () => {
    const localPoints = [
      { id: "lipb", lat: 46.46, lon: 11.33, scope: "local" as const },
    ];
    const now = fromZonedLocal("2026-09-20", "10:15");
    const locations = [
      {
        latitude: 46.46,
        longitude: 11.33,
        elevation: 241,
        // Shear elevated but mid wind too light for model-wave without crest
        hourly: {
          time: ["2026-09-20T10:00"],
          wind_speed_10m: [5],
          wind_direction_10m: [360],
          wind_gusts_10m: [8],
          temperature_2m: [12],
          dew_point_2m: [4],
          surface_pressure: [986],
          wind_speed_850hPa: [9],
          wind_direction_850hPa: [360],
          geopotential_height_850hPa: [550],
          wind_speed_700hPa: [41],
          wind_direction_700hPa: [90],
          geopotential_height_700hPa: [850],
        },
      },
    ];
    const alpine = emptyAlpine({
      stations: [
        {
          id: "saentis",
          name: "Säntis",
          elevM: 2502,
          region: "CH",
          source: "meteoswiss",
          lat: 47.2494,
          lon: 9.3435,
          observedAt: now,
          ageMin: 5,
          windDirDeg: 270,
          windKt: 40,
          gustKt: 50,
          history: [],
        },
      ],
    });
    expect(isCrestStrong(alpine)).toBe(true);
    expect(isLocalCrestStrong(alpine)).toBe(false);

    const bundle = buildWaveRiskBundle({
      localLocations: locations,
      localPoints,
      alpine,
      now,
    });
    expect(bundle.lipb?.severity).toBe("shear");
    expect(bundle.lipb?.severity).not.toBe("wave");
    expect(bundle.localCrestStrong).toBe(false);
    expect(bundle.lipbHazards.some((h) => h.kind === "wave")).toBe(false);
  });

  it("applies crest coupling to cells near a strong local station", () => {
    const localPoints = [
      { id: "lipb", lat: 46.46, lon: 11.33, scope: "local" as const },
      { id: "near-plose", lat: 46.7, lon: 11.73, scope: "local" as const },
    ];
    const now = fromZonedLocal("2026-09-20", "10:15");
    const locations = localPoints.map((p) => ({
      latitude: p.lat,
      longitude: p.lon,
      elevation: 241,
      hourly: shearHourly(),
    }));
    const alpine = emptyAlpine({
      stations: [
        {
          id: "plose",
          name: "Plose",
          elevM: 2472,
          region: "ST",
          source: "siag",
          lat: 46.6986,
          lon: 11.7338,
          observedAt: now,
          ageMin: 5,
          windDirDeg: 180,
          windKt: 30,
          gustKt: 35,
          history: [],
        },
      ],
    });
    const withoutCrest = buildWaveRiskBundle({
      localLocations: locations,
      localPoints,
      alpine: emptyAlpine(),
      now,
    });
    expect(withoutCrest.cells.every((c) => c.severity === "shear")).toBe(true);

    const withCrest = buildWaveRiskBundle({
      localLocations: locations,
      localPoints,
      alpine,
      now,
    });
    expect(withCrest.localCrestStrong).toBe(true);
    expect(withCrest.cells.find((c) => c.id === "near-plose")?.severity).toBe(
      "wave",
    );
    expect(withCrest.cells.find((c) => c.id === "lipb")?.severity).toBe("wave");
  });

  it("keeps local summary independent of Alps cells", () => {
    const localPoints = [
      { id: "lipb", lat: 46.46, lon: 11.33, scope: "local" as const },
    ];
    const alpsPoints = [
      { id: "a0c0", lat: 45.0, lon: 9.0, scope: "alps" as const },
    ];
    const now = fromZonedLocal("2026-09-20", "10:15");
    const quiet = {
      time: ["2026-09-20T10:00"],
      wind_speed_10m: [8],
      wind_direction_10m: [180],
      wind_gusts_10m: [10],
      temperature_2m: [15],
      dew_point_2m: [6],
      surface_pressure: [986],
      wind_speed_850hPa: [12],
      wind_direction_850hPa: [200],
      geopotential_height_850hPa: [1500],
      wind_speed_700hPa: [14],
      wind_direction_700hPa: [210],
      geopotential_height_700hPa: [3000],
    };
    const bundle = buildWaveRiskBundle({
      localLocations: [
        {
          latitude: 46.46,
          longitude: 11.33,
          elevation: 241,
          hourly: quiet,
        },
      ],
      localPoints,
      alpsLocations: [
        {
          latitude: 45,
          longitude: 9,
          elevation: 200,
          hourly: shearHourly(),
        },
      ],
      alpsPoints,
      alpine: emptyAlpine(),
      now,
    });
    expect(bundle.localWorstSeverity).toBe("quiet");
    expect(bundle.localFlaggedCellCount).toBe(0);
    expect(bundle.worstSeverity).toBe("shear");
    expect(bundle.flaggedCellCount).toBe(1);
  });
});
