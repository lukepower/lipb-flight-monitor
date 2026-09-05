import { describe, expect, it } from "vitest";
import {
  ceilingFromClouds,
  decodeMetar,
  decodeTaf,
  flightCategoryFrom,
  parseVisibility,
  qualityFromCategory,
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
});
