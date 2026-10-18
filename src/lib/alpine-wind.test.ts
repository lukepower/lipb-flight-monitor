import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ageMinutes,
  kmhToKt,
  msToKt,
  parseMeteoSwissSmnCsv,
  parseMeteoSwissTimestamp,
  parseMeteotrentinoWindXml,
  parseSiagDate,
  roundKmhToKt,
  roundKt,
} from "@/lib/alpine-wind";

describe("alpine-wind helpers", () => {
  it("converts m/s to knots", () => {
    expect(msToKt(10)).toBeCloseTo(19.438, 2);
    expect(roundKt(10)).toBe(19);
    expect(roundKt(null)).toBeNull();
  });

  it("parses SIAG CEST / CET timestamps", () => {
    const cest = parseSiagDate("2026-09-22T10:30:00CEST");
    expect(cest).not.toBeNull();
    expect(cest!.toISOString()).toBe("2026-09-22T08:30:00.000Z");

    const cet = parseSiagDate("2026-01-15T10:00:00CET");
    expect(cet).not.toBeNull();
    expect(cet!.toISOString()).toBe("2026-01-15T09:00:00.000Z");

    expect(parseSiagDate("not-a-date")).toBeNull();
  });

  it("computes observation age in minutes", () => {
    const now = new Date("2026-09-22T10:00:00Z");
    expect(ageMinutes(new Date("2026-09-22T09:45:00Z"), now)).toBe(15);
    expect(ageMinutes(null, now)).toBeNull();
  });

  it("parses MeteoSwiss SwissMetNet 10-min CSV timestamps and wind", () => {
    const at = parseMeteoSwissTimestamp("18.10.2026 00:20");
    expect(at?.toISOString()).toBe("2026-10-18T00:20:00.000Z");
    expect(kmhToKt(18.52)).toBeCloseTo(10, 2);
    expect(roundKmhToKt(23.4)).toBe(13);

    const csv = readFileSync(
      resolve(__dirname, "fixtures/meteoswiss-sae-t-now.csv"),
      "utf8",
    );
    const rows = parseMeteoSwissSmnCsv(csv);
    expect(rows.length).toBe(4);
    expect(rows[0]?.windKmh).toBe(20.9);
    expect(rows[2]?.gustKmh).toBe(30.6);
    expect(rows[2]?.dirDeg).toBe(152);
  });

  it("parses Meteotrentino vento_al_suolo XML", () => {
    const xml = `<?xml version="1.0"?>
<datiOggi>
  <venti>
    <vento_al_suolo UM_VV="m/s" UM_VVMAX="m/s" UM_DV="gN">
      <data>2026-09-22T08:00:00</data>
      <v>1.2</v>
      <vmax>2.3</vmax>
      <d>239</d>
    </vento_al_suolo>
    <vento_al_suolo UM_VV="m/s" UM_VVMAX="m/s" UM_DV="gN">
      <data>2026-09-22T08:15:00</data>
      <v>4.5</v>
      <vmax>7.0</vmax>
      <d>10</d>
    </vento_al_suolo>
  </venti>
</datiOggi>`;
    const points = parseMeteotrentinoWindXml(xml);
    expect(points).toHaveLength(2);
    expect(points[0]!.windMs).toBe(1.2);
    expect(points[1]!.gustMs).toBe(7);
    expect(points[1]!.dirDeg).toBe(10);
  });
});
