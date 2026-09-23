import { describe, expect, it } from "vitest";
import {
  expandZoneToken,
  parseItalyGaforBody,
  parseZoneList,
} from "@/lib/italy-gafor";

describe("expandZoneToken / parseZoneList", () => {
  it("expands ranges and singles", () => {
    expect(expandZoneToken("8/9")).toEqual([8, 9]);
    expect(expandZoneToken("1/7")).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(expandZoneToken("13")).toEqual([13]);
    expect(parseZoneList("1/7, 10/12").zones).toEqual([
      1, 2, 3, 4, 5, 6, 7, 10, 11, 12,
    ]);
  });
});

describe("parseItalyGaforBody", () => {
  it("parses FBIY61 zone lines and alpine zone 13", () => {
    const body =
      "FBIY61 LIIB 230500\r\r\n" +
      "GAFOR LIIB  0612\r\r\n" +
      "BBBB   8/9          O ISOL D3 TSRA SHRA\r\r\n" +
      "BBBB   13           O LOC D2 SHRA\r\r\n" +
      "BBBB   1/7, 10/12   O=\r\r\n";
    const b = parseItalyGaforBody(body, "2026-09-23T05:00:00.000Z");
    expect(b.periodCode).toBe("0612");
    expect(b.validFrom).toBe("2026-09-23T06:00:00.000Z");
    expect(b.validTo).toBe("2026-09-23T12:00:00.000Z");
    expect(b.entries).toHaveLength(3);
    expect(b.alpine?.zones).toEqual([13]);
    expect(b.alpine?.category).toBe("O");
    expect(b.alpine?.remarks).toContain("SHRA");
    expect(b.entries[2]?.zones).toContain(12);
  });
});
