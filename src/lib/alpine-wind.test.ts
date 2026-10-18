import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ageMinutes,
  ALPINE_STATIONS,
  clearGeosphereCache,
  fetchGeosphereStationsUncached,
  kmhToKt,
  msToKt,
  parseMeteoSwissSmnCsv,
  parseMeteoSwissTimestamp,
  parseMeteotrentinoWindXml,
  parseSiagDate,
  roundKmhToKt,
  roundKt,
  type AlpineStationConfig,
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

  it("uses current GeoSphere TAWES station ids for AT crest sites", () => {
    const byId = Object.fromEntries(
      ALPINE_STATIONS.filter((s) => s.source === "geosphere").map((s) => [
        s.id,
        s.code,
      ]),
    );
    expect(byId.patscherkofel).toBe("11126");
    expect(byId["brenner-neu"]).toBe("11129");
    expect(byId.sonnblick).toBe("11343");
    expect(byId.feuerkogel).toBe("11155");
    expect(byId["villacher-alpe"]).toBe("11265");
  });
});

describe("fetchGeosphereStationsUncached", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearGeosphereCache();
  });

  it("falls back to per-station requests when the batch returns HTTP 400", async () => {
    const sample = JSON.parse(
      readFileSync(
        resolve(__dirname, "fixtures/geosphere-current-sample.json"),
        "utf8",
      ),
    ) as {
      timestamps: string[];
      features: Array<{
        properties: {
          station: string;
          parameters: Record<string, { data: number[] }>;
        };
      }>;
    };

    const cfgs: AlpineStationConfig[] = [
      {
        id: "patscherkofel",
        name: "Patscherkofel",
        elevM: 2251,
        region: "AT",
        source: "geosphere",
        code: "11126",
        lat: 47.21,
        lon: 11.46,
      },
      {
        id: "brenner-neu",
        name: "Brenner Neu",
        elevM: 1412,
        region: "AT",
        source: "geosphere",
        code: "11129",
        lat: 47.01,
        lon: 11.51,
      },
    ];

    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/historical/")) {
          return new Response(JSON.stringify({ timestamps: [], features: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        // Batch (both ids) → 400 as when one id is invalid
        if (url.includes("station_ids=11126,11129")) {
          return new Response(
            JSON.stringify({ detail: "Station ids {'99999'} are not allowed" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        const match = /station_ids=(\d+)/.exec(url);
        const id = match?.[1];
        const feature = sample.features.find(
          (f) => f.properties.station === id,
        );
        if (!feature) {
          return new Response(JSON.stringify({ detail: "unknown" }), {
            status: 400,
          });
        }
        return new Response(
          JSON.stringify({
            timestamps: sample.timestamps,
            features: [feature],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const now = new Date("2026-10-18T06:30:00Z");
    const readings = await fetchGeosphereStationsUncached(cfgs, now);
    expect(readings).toHaveLength(2);
    expect(readings[0]?.windKt).not.toBeNull();
    expect(readings[1]?.windKt).not.toBeNull();
    expect(readings.every((r) => !r.error)).toBe(true);
    expect(calls.some((u) => u.includes("station_ids=11126,11129"))).toBe(true);
    expect(
      calls.some(
        (u) => u.includes("station_ids=11126") && !u.includes("11129"),
      ),
    ).toBe(true);
    expect(
      calls.some(
        (u) => u.includes("station_ids=11129") && !u.includes("11126"),
      ),
    ).toBe(true);
  });
});
