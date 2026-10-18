import { describe, expect, it } from "vitest";
import {
  extractFir,
  isAdvisoryValidNow,
  isAlpineFir,
  meteoamMapUrl,
  selectActiveAdvisories,
  type WxAdvisory,
} from "@/lib/sigmet";
import {
  advisoryPolygonNearLipb,
  parseAwcCoords,
  parseSigmetCoordsFromText,
  pointInPolygon,
  SIGMET_VERDICT_RADIUS_KM,
} from "@/lib/sigmet-geometry";
import { LIPB } from "@/lib/constants";

function adv(
  partial: Partial<WxAdvisory> & Pick<WxAdvisory, "id" | "raw">,
): WxAdvisory {
  return {
    kind: "sigmet",
    fir: "LIMM",
    locationCode: null,
    validFrom: null,
    validTo: null,
    mapUrl: null,
    source: "awc",
    alpineRelevant: false,
    verdictRelevant: false,
    polygon: [],
    ...partial,
  };
}

describe("sigmet helpers", () => {
  it("extracts FIR; LIRR/LIBB are not alpine for list/verdict FIR set", () => {
    expect(extractFir("LIMM MILANO FIR SEV TURB")).toBe("LIMM");
    expect(isAlpineFir("LIMM")).toBe(true);
    expect(isAlpineFir("LIRR")).toBe(false);
    expect(isAlpineFir("LIBB")).toBe(false);
    expect(isAlpineFir("FAJA")).toBe(false);
    expect(
      meteoamMapUrl("abc", "tok"),
    ).toContain("/assets/abc/native?channelToken=tok");
  });

  it("filters to currently valid advisories", () => {
    const now = new Date("2026-09-23T16:00:00.000Z");
    const sample: WxAdvisory[] = [
      adv({
        id: "1",
        kind: "airmet",
        fir: "LIRR",
        raw: "LIRR AIRMET",
        validFrom: "2026-09-23T15:00:00.000Z",
        validTo: "2026-09-23T17:30:00.000Z",
        source: "meteoam",
        alpineRelevant: false,
      }),
      adv({
        id: "2",
        kind: "sigmet",
        fir: "LIMM",
        raw: "LIMM SIGMET",
        validFrom: "2026-09-20T11:00:00.000Z",
        validTo: "2026-09-20T12:00:00.000Z",
        source: "meteoam",
        alpineRelevant: true,
      }),
    ];
    expect(isAdvisoryValidNow(sample[0]!.validFrom, sample[0]!.validTo, now)).toBe(
      true,
    );
    expect(selectActiveAdvisories(sample, now).map((a) => a.id)).toEqual(["1"]);
  });
});

describe("sigmet geometry", () => {
  it("parses compact ICAO coordinates from text", () => {
    const ring = parseSigmetCoordsFromText(
      "N4334 E01022 - N4400 E01100 - N4300 E01100 - N4334 E01022",
    );
    expect(ring.length).toBe(4);
    expect(ring[0]!.lat).toBeCloseTo(43 + 34 / 60, 4);
    expect(ring[0]!.lon).toBeCloseTo(10 + 22 / 60, 4);
  });

  it("parses AWC {lon,lat} coords", () => {
    const ring = parseAwcCoords([
      { lon: 11.3, lat: 46.4 },
      { lon: 11.5, lat: 46.4 },
      { lon: 11.5, lat: 46.6 },
      { lon: 11.3, lat: 46.6 },
      { lon: 11.3, lat: 46.4 },
    ]);
    expect(ring).toHaveLength(5);
    expect(
      pointInPolygon({ lat: LIPB.lat, lon: LIPB.lon }, ring),
    ).toBe(true);
  });

  it("marks polygons near LIPB within verdict radius", () => {
    expect(SIGMET_VERDICT_RADIUS_KM).toBe(50);
    // Far from LIPB (Tuscany box)
    expect(
      advisoryPolygonNearLipb({
        raw: "N4334 E01022 - N4340 E01030 - N4330 E01030 - N4334 E01022",
      }),
    ).toBe(false);
    // Box around Bolzano
    expect(
      advisoryPolygonNearLipb({
        awcCoords: [
          { lon: 11.2, lat: 46.3 },
          { lon: 11.5, lat: 46.3 },
          { lon: 11.5, lat: 46.6 },
          { lon: 11.2, lat: 46.6 },
          { lon: 11.2, lat: 46.3 },
        ],
        raw: "",
      }),
    ).toBe(true);
  });
});
