import { describe, expect, it } from "vitest";
import {
  extractFir,
  isAdvisoryValidNow,
  isAlpineFir,
  meteoamMapUrl,
  selectActiveAdvisories,
  type WxAdvisory,
} from "@/lib/sigmet";

describe("sigmet helpers", () => {
  it("extracts FIR and alpine relevance", () => {
    expect(extractFir("LIMM MILANO FIR SEV TURB")).toBe("LIMM");
    expect(isAlpineFir("LIMM")).toBe(true);
    expect(isAlpineFir("FAJA")).toBe(false);
    expect(
      meteoamMapUrl("abc", "tok"),
    ).toContain("/assets/abc/native?channelToken=tok");
  });

  it("filters to currently valid advisories", () => {
    const now = new Date("2026-09-23T16:00:00.000Z");
    const sample: WxAdvisory[] = [
      {
        id: "1",
        kind: "airmet",
        fir: "LIRR",
        locationCode: null,
        raw: "LIRR AIRMET",
        validFrom: "2026-09-23T15:00:00.000Z",
        validTo: "2026-09-23T17:30:00.000Z",
        mapUrl: null,
        source: "meteoam",
        alpineRelevant: false,
      },
      {
        id: "2",
        kind: "sigmet",
        fir: "LIMM",
        locationCode: null,
        raw: "LIMM SIGMET",
        validFrom: "2026-09-20T11:00:00.000Z",
        validTo: "2026-09-20T12:00:00.000Z",
        mapUrl: null,
        source: "meteoam",
        alpineRelevant: true,
      },
    ];
    expect(isAdvisoryValidNow(sample[0].validFrom, sample[0].validTo, now)).toBe(
      true,
    );
    expect(selectActiveAdvisories(sample, now).map((a) => a.id)).toEqual(["1"]);
  });
});
