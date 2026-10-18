import { describe, expect, it } from "vitest";
import {
  ceilingFromClouds,
  computeFoehnGradient,
  decodeMetar,
  decodeModelHour,
  decodeTaf,
  estimateLclCeilingFt,
  flightCategoryFrom,
  pairLipbLowiSameObsSlot,
  parseVisibility,
  qualityFromCategory,
  tafIsAcceptableNow,
  tafValidityCoversNow,
  weatherForWindow,
} from "@/lib/weather";

describe("weather decode", () => {
  it("converts statute miles to km and handles plus/CAVOK", () => {
    expect(parseVisibility("10+").visPlus).toBe(true);
    expect(parseVisibility("CAVOK").cavok).toBe(true);
    expect(parseVisibility(6).visKm ?? 0).toBeCloseTo(9.656, 2);
  });

  it("reads ceiling from BKN/OVC", () => {
    expect(
      ceilingFromClouds([
        { cover: "FEW", base: 2000 },
        { cover: "BKN", base: 3500 },
        { cover: "OVC", base: 8000 },
      ]),
    ).toBe(3500);
    expect(ceilingFromClouds([{ cover: "SCT", base: 4000 }])).toBeNull();
  });

  it("classifies FAA flight categories", () => {
    expect(flightCategoryFrom(16, null, true)).toBe("VFR");
    expect(flightCategoryFrom(8, 2500, false)).toBe("MVFR");
    expect(flightCategoryFrom(4, 800, false)).toBe("IFR");
    expect(flightCategoryFrom(1, 300, false)).toBe("LIFR");
  });

  it("flags LIPB vis under 5 km as not good", () => {
    expect(qualityFromCategory("VFR", 4)).toBe("marginal");
    expect(qualityFromCategory("VFR", 10)).toBe("good");
    expect(qualityFromCategory("IFR", 8)).toBe("poor");
  });

  it("decodes a METAR payload", () => {
    const decoded = decodeMetar({
      rawOb: "LIPB 051150Z 18006KT CAVOK 22/12 Q1021",
      obsTime: Math.floor(Date.now() / 1000) - 12 * 60,
      wdir: 180,
      wspd: 6,
      visib: "CAVOK",
      altim: 1021,
      temp: 22,
      dewp: 12,
      clouds: [],
      fltCat: "VFR",
      metarType: "METAR",
    });
    expect(decoded.cavok).toBe(true);
    expect(decoded.flightCategory).toBe("VFR");
    expect(decoded.qnhHpa).toBe(1021);
    expect(decoded.metarType).toBe("METAR");
    expect(decoded.summary).toContain("VFR");
  });

  it("keeps TEMPO as an overlay period", () => {
    const taf = decodeTaf({
      rawTAF: "TAF LIPB",
      validTimeFrom: 1_000_000,
      validTimeTo: 1_100_000,
      fcsts: [
        {
          timeFrom: 1_000_000,
          timeTo: 1_100_000,
          fcstChange: "FM",
          visib: "6+",
          wspd: 5,
          wdir: 180,
          clouds: [{ cover: "FEW", base: 4000 }],
        },
        {
          timeFrom: 1_020_000,
          timeTo: 1_040_000,
          fcstChange: "TEMPO",
          visib: 2,
          wspd: 12,
          wdir: 180,
          clouds: [{ cover: "BKN", base: 800 }],
        },
      ],
    });
    expect(taf.periods[0].prevailing).toBe(true);
    expect(taf.periods[1].prevailing).toBe(false);
    expect(taf.periods[1].flightCategory).toBe("IFR");
  });

  it("rejects TAFs older than 30 h even if validity dates look current", () => {
    const stale = decodeTaf({
      rawTAF: "TAF LIPB 220500Z 2206/2312 18005KT CAVOK",
      issueTime: "2026-09-22T05:00:00.000Z",
      validTimeFrom: Math.floor(Date.parse("2026-09-22T06:00:00.000Z") / 1000),
      validTimeTo: Math.floor(Date.parse("2026-09-23T12:00:00.000Z") / 1000),
      fcsts: [
        {
          timeFrom: Math.floor(Date.parse("2026-09-22T06:00:00.000Z") / 1000),
          timeTo: Math.floor(Date.parse("2026-09-23T12:00:00.000Z") / 1000),
          wspd: 5,
          wdir: 180,
          visib: "CAVOK",
          clouds: [],
        },
      ],
    });
    const now = new Date("2026-10-18T08:00:00.000Z");
    expect(tafIsAcceptableNow(stale, now)).toBe(false);
    expect(tafValidityCoversNow(stale, now)).toBe(false);
    expect(tafIsAcceptableNow(stale, new Date("2026-09-22T12:00:00.000Z"))).toBe(
      true,
    );
    expect(tafValidityCoversNow(stale, new Date("2026-09-22T12:00:00.000Z"))).toBe(
      true,
    );
  });

  it("accepts a TAF in the hour between issue and validity start", () => {
    const taf = decodeTaf({
      rawTAF: "TAF LIPB 181100Z 1812/1912 18005KT CAVOK",
      issueTime: "2026-10-18T11:00:00.000Z",
      validTimeFrom: Math.floor(Date.parse("2026-10-18T12:00:00.000Z") / 1000),
      validTimeTo: Math.floor(Date.parse("2026-10-19T12:00:00.000Z") / 1000),
      fcsts: [
        {
          timeFrom: Math.floor(Date.parse("2026-10-18T12:00:00.000Z") / 1000),
          timeTo: Math.floor(Date.parse("2026-10-19T12:00:00.000Z") / 1000),
          wspd: 5,
          wdir: 180,
          visib: "CAVOK",
          clouds: [],
        },
      ],
    });
    const now = new Date("2026-10-18T11:26:00.000Z");
    expect(tafValidityCoversNow(taf, now)).toBe(false);
    expect(tafIsAcceptableNow(taf, now)).toBe(true);
    expect(taf.periods.length).toBeGreaterThan(0);
  });


  it("computes LOWI–LIPB Föhn pressure gradient as integer hPa", () => {
    expect(computeFoehnGradient(1015, null)).toBeNull();
    const north = computeFoehnGradient(1012, 1018.5);
    expect(north?.direction).toBe("north");
    expect(north?.strength).toBe("strong");
    expect(north?.deltaHpa).toBe(7);
    expect(north?.label).toBe("N-Föhn 7 hPa");

    const south = computeFoehnGradient(1020, 1015.5);
    expect(south?.direction).toBe("south");
    expect(south?.strength).toBe("moderate");
    expect(south?.deltaHpa).toBe(-4);
    expect(south?.label).toBe("S-Föhn 4 hPa");

    const quiet = computeFoehnGradient(1016, 1016);
    expect(quiet?.direction).toBe("none");
    expect(quiet?.strength).toBe("none");
    expect(quiet?.label).toBe("Δp 0 hPa");
  });

  it("estimates LCL ceiling from temperature-dewpoint spread when low cloud cover is present", () => {
    expect(estimateLclCeilingFt(20, null)).toBe(1500);
    expect(estimateLclCeilingFt(16, 14)).toBe(800);
    expect(estimateLclCeilingFt(22, 10)).toBe(3000);

    const h = decodeModelHour({
      at: new Date("2026-09-05T10:00:00Z"),
      weatherCode: 3,
      visibilityM: 10000,
      cloudCover: 90,
      cloudCoverLow: 70,
      precipitationMm: 0,
      windKmh: 10,
      gustKmh: 15,
      windDir: 180,
      tempC: 15,
      dewC: 13,
    });
    expect(h.ceilingFt).toBe(800);
    expect(h.flightCategory).toBe("IFR");
  });

  it("evaluates worst weather across all overlapping model hours and reports category trends", () => {
    const h1 = decodeModelHour({
      at: new Date("2026-09-05T08:00:00Z"),
      weatherCode: 0,
      visibilityM: 10000,
      cloudCover: 10,
      cloudCoverLow: 0,
      precipitationMm: 0,
      windKmh: 10,
      gustKmh: 12,
      windDir: 180,
      tempC: 20,
    });
    const h2 = decodeModelHour({
      at: new Date("2026-09-05T09:00:00Z"),
      weatherCode: 0,
      visibilityM: 10000,
      cloudCover: 10,
      cloudCoverLow: 0,
      precipitationMm: 0,
      windKmh: 10,
      gustKmh: 12,
      windDir: 180,
      tempC: 21,
    });
    const h3 = decodeModelHour({
      at: new Date("2026-09-05T10:00:00Z"),
      weatherCode: 45,
      visibilityM: 2000,
      cloudCover: 90,
      cloudCoverLow: 80,
      precipitationMm: 0,
      windKmh: 8,
      gustKmh: 10,
      windDir: 180,
      tempC: 14,
      dewC: 13,
    });
    const wx = weatherForWindow(
      new Date("2026-09-05T08:00:00Z"),
      new Date("2026-09-05T11:00:00Z"),
      null,
      [h1, h2, h3],
    );
    expect(wx.quality).toBe("poor");
    expect(wx.decoded?.flightCategory).toBe("IFR");
    expect(wx.decoded?.summary).toContain("trend VFR→IFR");
  });
});

describe("pairLipbLowiSameObsSlot", () => {
  it("pairs the latest common :50 slot (not latest-of-each)", () => {
    // LOWI 10:50Z Q1019 vs LIPB 09:50Z Q1022 would falsely give S 3;
    // same-slot 09:50 is LOWI 1020 / LIPB 1022 → S 2.
    const t0950 = Date.UTC(2026, 9, 18, 9, 50, 0) / 1000;
    const t1050 = Date.UTC(2026, 9, 18, 10, 50, 0) / 1000;
    const pair = pairLipbLowiSameObsSlot([
      { icaoId: "LIPB", obsTime: t0950, altim: 1022 },
      { icaoId: "LOWI", obsTime: t0950, altim: 1020 },
      { icaoId: "LOWI", obsTime: t1050, altim: 1019 },
    ]);
    expect(pair).not.toBeNull();
    expect(pair!.lipb.altim).toBe(1022);
    expect(pair!.lowi.altim).toBe(1020);
    const g = computeFoehnGradient(pair!.lipb.altim, pair!.lowi.altim);
    expect(g?.deltaHpa).toBe(-2);
  });

  it("returns null when no shared slot exists", () => {
    const t0950 = Date.UTC(2026, 9, 18, 9, 50, 0) / 1000;
    const t1050 = Date.UTC(2026, 9, 18, 10, 50, 0) / 1000;
    expect(
      pairLipbLowiSameObsSlot([
        { icaoId: "LIPB", obsTime: t0950, altim: 1022 },
        { icaoId: "LOWI", obsTime: t1050, altim: 1019 },
      ]),
    ).toBeNull();
  });
});
