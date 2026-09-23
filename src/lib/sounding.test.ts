import { describe, expect, it } from "vitest";
import { buildDayBoard } from "@/lib/board";
import { fromZonedLocal, formatLocalHm } from "@/lib/time";
import {
  DEFAULT_SKEW_T_VIEW,
  kmhToKt,
  metersToFt,
  parseModelSoundings,
  shearKtPer1000ft,
  skewTPoint,
  soundingForInstant,
  soundingHazards,
  type OpenMeteoHourly,
  type SoundingHour,
  type SoundingLevel,
} from "@/lib/sounding";

function hourlyFixture(overrides: Partial<OpenMeteoHourly> = {}): OpenMeteoHourly {
  return {
    time: ["2026-09-20T10:00", "2026-09-20T11:00"],
    temperature_2m: [18, 19],
    dew_point_2m: [8, 9],
    wind_speed_10m: [11.1, 7.4],
    wind_direction_10m: [180, 190],
    wind_gusts_10m: [27.8, 14.8],
    surface_pressure: [986, 985],
    cape: [120, 80],
    freezing_level_height: [3200, 3300],
    temperature_950hPa: [16, 16],
    dew_point_950hPa: [6, 6],
    wind_speed_950hPa: [18.5, 18.5],
    wind_direction_950hPa: [200, 200],
    geopotential_height_950hPa: [540, 540],
    temperature_850hPa: [8, 8],
    dew_point_850hPa: [-2, -2],
    wind_speed_850hPa: [37, 37],
    wind_direction_850hPa: [250, 250],
    geopotential_height_850hPa: [1500, 1500],
    temperature_700hPa: [-4, -4],
    dew_point_700hPa: [-12, -12],
    wind_speed_700hPa: [55.6, 55.6],
    wind_direction_700hPa: [270, 270],
    geopotential_height_700hPa: [3000, 3000],
    temperature_500hPa: [-18, -18],
    dew_point_500hPa: [-28, -28],
    wind_speed_500hPa: [74, 74],
    wind_direction_500hPa: [280, 280],
    geopotential_height_500hPa: [5600, 5600],
    ...overrides,
  };
}

function level(partial: Partial<SoundingLevel> & Pick<SoundingLevel, "pHpa" | "altFtMsl">): SoundingLevel {
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
      level({ pHpa: 986, altFtMsl: 791, windKt: 8, windDir: 180, tempC: 18, dewC: 8 }),
      level({ pHpa: 850, altFtMsl: 4921, windKt: 12, windDir: 200, tempC: 8, dewC: -2 }),
    ],
    ...overrides,
  };
}

describe("sounding parse", () => {
  it("converts km/h to knots and metres to feet", () => {
    expect(kmhToKt(18.52)).toBe(10);
    expect(kmhToKt(null)).toBeNull();
    expect(metersToFt(241)).toBe(791);
  });

  it("drops pressure levels below airport elevation and keeps surface", () => {
    const hours = parseModelSoundings(
      hourlyFixture({
        geopotential_height_950hPa: [100, 100],
      }),
      241,
    );
    expect(hours).toHaveLength(2);
    const first = hours[0];
    expect(first.levels[0]?.pHpa).toBe(986);
    expect(first.levels[0]?.altFtMsl).toBe(791);
    expect(first.levels.some((l) => l.pHpa === 950)).toBe(false);
    expect(first.levels.some((l) => l.pHpa === 850)).toBe(true);
    expect(first.gustKt).toBe(15);
    expect(first.levels.find((l) => l.pHpa === 850)?.windKt).toBe(20);
    expect(first.freezingLevelFt).toBe(metersToFt(3200));
  });

  it("sorts levels from high pressure to low", () => {
    const [hour] = parseModelSoundings(hourlyFixture(), 241);
    const pressures = hour.levels.map((l) => l.pHpa);
    expect(pressures).toEqual([...pressures].sort((a, b) => b - a));
  });
});

describe("soundingForInstant", () => {
  it("picks the hour covering the window midpoint", () => {
    const hours = parseModelSoundings(hourlyFixture(), 241);
    const mid = fromZonedLocal("2026-09-20", "10:30");
    const hit = soundingForInstant(mid, hours);
    expect(hit?.atIso).toBe(hours[0].atIso);
    expect(soundingForInstant(fromZonedLocal("2026-09-20", "09:59"), hours)).toBeNull();
  });
});

describe("soundingHazards", () => {
  it("stays quiet in light winds", () => {
    expect(soundingHazards(quietSounding())).toEqual([]);
  });

  it("flags surface gusts", () => {
    const hazards = soundingHazards(quietSounding({ gustKt: 28 }));
    expect(hazards.some((h) => h.kind === "gust" && h.label === "Gusts 28 kt")).toBe(true);
  });

  it("flags strong wind below 3500 m but not only above that", () => {
    const low = soundingHazards(
      quietSounding({
        levels: [
          level({ pHpa: 986, altFtMsl: 791, windKt: 8, windDir: 180 }),
          level({ pHpa: 850, altFtMsl: 5000, windKt: 32, windDir: 250 }),
        ],
      }),
    );
    expect(low.some((h) => h.kind === "wind" && h.label === "Wind 32 kt")).toBe(true);

    const highOnly = soundingHazards(
      quietSounding({
        levels: [
          level({ pHpa: 986, altFtMsl: 791, windKt: 8, windDir: 180 }),
          level({ pHpa: 500, altFtMsl: 18000, windKt: 55, windDir: 270 }),
        ],
      }),
    );
    expect(highOnly.some((h) => h.kind === "wind")).toBe(false);
  });

  it("ignores shear and wind above the 3500 m ceiling", () => {
    const lower = level({ pHpa: 600, altFtMsl: 14000, windKt: 5, windDir: 360 });
    const upper = level({ pHpa: 500, altFtMsl: 15000, windKt: 55, windDir: 90 });
    expect(shearKtPer1000ft(lower, upper)).toBeGreaterThan(20);
    const hazards = soundingHazards(
      quietSounding({
        levels: [
          level({ pHpa: 986, altFtMsl: 791, windKt: 8, windDir: 180 }),
          lower,
          upper,
        ],
      }),
    );
    expect(hazards.some((h) => h.kind === "shear")).toBe(false);
    expect(hazards.some((h) => h.kind === "wind")).toBe(false);
  });

  it("flags vector shear between adjacent levels", () => {
    const lower = level({ pHpa: 986, altFtMsl: 800, windKt: 5, windDir: 360 });
    const upper = level({ pHpa: 850, altFtMsl: 1800, windKt: 30, windDir: 90 });
    expect(shearKtPer1000ft(lower, upper)).toBeGreaterThan(20);
    const hazards = soundingHazards(quietSounding({ levels: [lower, upper] }));
    expect(hazards.some((h) => h.kind === "shear")).toBe(true);
  });

  it("flags mountain-wave when mid-level wind and shear combine", () => {
    const surface = level({ pHpa: 986, altFtMsl: 800, windKt: 5, windDir: 360 });
    const mid = level({ pHpa: 700, altFtMsl: 2800, windKt: 35, windDir: 90 });
    const hazards = soundingHazards(quietSounding({ levels: [surface, mid] }));
    expect(hazards.some((h) => h.kind === "wave")).toBe(true);
  });

  it("flags mountain-wave from crest + shear without mid-level gale", () => {
    const lower = level({ pHpa: 986, altFtMsl: 800, windKt: 5, windDir: 360 });
    const upper = level({ pHpa: 850, altFtMsl: 1800, windKt: 22, windDir: 90 });
    const alone = soundingHazards(quietSounding({ levels: [lower, upper] }));
    expect(alone.some((h) => h.kind === "wave")).toBe(false);
    const withCrest = soundingHazards(quietSounding({ levels: [lower, upper] }), {
      crestStrong: true,
    });
    expect(withCrest.some((h) => h.kind === "wave")).toBe(true);
  });

  it("flags convective CAPE", () => {
    const hazards = soundingHazards(quietSounding({ cape: 900 }));
    expect(hazards.some((h) => h.kind === "cape" && h.label === "CAPE 900")).toBe(true);
  });
});

describe("skewTPoint", () => {
  it("puts higher pressure lower on the chart", () => {
    const surface = skewTPoint(1000, 10);
    const mid = skewTPoint(500, 10);
    expect(surface.y).toBeGreaterThan(mid.y);
  });

  it("puts warmer air to the right at the same pressure", () => {
    const cold = skewTPoint(850, -10);
    const warm = skewTPoint(850, 20);
    expect(warm.x).toBeGreaterThan(cold.x);
  });

  it("skews isotherms up and to the right", () => {
    const bottom = skewTPoint(1000, 0);
    const top = skewTPoint(500, 0);
    expect(top.x).toBeGreaterThan(bottom.x);
    expect(top.y).toBeLessThan(bottom.y);
    expect(top.x - bottom.x).toBeCloseTo(DEFAULT_SKEW_T_VIEW.skew, 5);
  });
});

describe("buildDayBoard sounding", () => {
  it("attaches the midpoint hour sounding and hazards to each VFR hole", () => {
    const emptyTaf = {
      raw: "",
      issuedAt: null,
      validFrom: null,
      validTo: null,
      periods: [],
    };
    const draft = buildDayBoard("2026-09-07", emptyTaf, []);
    const hole = draft.windows[0];
    expect(hole).toBeTruthy();
    const mid = new Date((Date.parse(hole.startIso) + Date.parse(hole.endIso)) / 2);
    const hourLocal = `${formatLocalHm(mid).slice(0, 2)}:00`;
    const sounding = quietSounding({
      atIso: fromZonedLocal(hole.dateLocal, hourLocal).toISOString(),
      gustKt: 30,
    });
    const board = buildDayBoard("2026-09-07", emptyTaf, {
      hours: [],
      soundings: [sounding],
    });
    const attached = board.windows.find((w) => w.startIso === hole.startIso);
    expect(attached?.sounding?.gustKt).toBe(30);
    expect(attached?.soundingHazards.some((h) => h.kind === "gust")).toBe(true);
  });

  it("applies crest coupling only to holes covering the crest observation hour", () => {
    const emptyTaf = {
      raw: "",
      issuedAt: null,
      validFrom: null,
      validTo: null,
      periods: [],
    };
    const draft = buildDayBoard("2026-09-07", emptyTaf, []);
    const hole = draft.windows[0];
    expect(hole).toBeTruthy();
    const mid = new Date((Date.parse(hole.startIso) + Date.parse(hole.endIso)) / 2);
    const hourLocal = `${formatLocalHm(mid).slice(0, 2)}:00`;
    const hourIso = fromZonedLocal(hole.dateLocal, hourLocal).toISOString();
    const laterHour = `${String((Number(hourLocal.slice(0, 2)) + 3) % 24).padStart(2, "0")}:00`;
    const laterIso = fromZonedLocal(hole.dateLocal, laterHour).toISOString();

    const shearLevels = [
      {
        pHpa: 986,
        altFtMsl: 800,
        windKt: 5,
        windDir: 360,
        tempC: 18,
        dewC: 8,
      },
      {
        pHpa: 850,
        altFtMsl: 1800,
        windKt: 22,
        windDir: 90,
        tempC: 8,
        dewC: -2,
      },
    ];
    const board = buildDayBoard(
      "2026-09-07",
      emptyTaf,
      {
        hours: [],
        soundings: [
          quietSounding({ atIso: hourIso, levels: shearLevels }),
          quietSounding({ atIso: laterIso, levels: shearLevels }),
        ],
      },
      [],
      { strong: true, hourIso },
    );
    const matching = board.windows.find((w) => {
      const m = new Date((Date.parse(w.startIso) + Date.parse(w.endIso)) / 2);
      return m >= new Date(hourIso) && m < new Date(Date.parse(hourIso) + 3_600_000);
    });
    expect(matching?.soundingHazards.some((h) => h.kind === "wave")).toBe(true);

    const later = board.windows.find((w) => {
      const m = new Date((Date.parse(w.startIso) + Date.parse(w.endIso)) / 2);
      return m >= new Date(laterIso) && m < new Date(Date.parse(laterIso) + 3_600_000);
    });
    if (later) {
      expect(later.soundingHazards.some((h) => h.kind === "wave")).toBe(false);
      expect(later.soundingHazards.some((h) => h.kind === "shear")).toBe(true);
    }
  });
});
