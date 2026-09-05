import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  featuresByLayer,
  linePath,
  projectLonLat,
  runwayPolygon,
  trackKey,
  type ValleyFeatureCollection,
} from "@/lib/valley-map";
import { LIPB, OPENSKY_BBOX } from "@/lib/constants";

function loadFixture(): ValleyFeatureCollection {
  const raw = readFileSync(
    resolve(__dirname, "../../data/lipb-valley-map.json"),
    "utf8",
  );
  return JSON.parse(raw) as ValleyFeatureCollection;
}

describe("valley map projection", () => {
  it("maps the SW corner to the bottom-left of the SVG", () => {
    const p = projectLonLat(OPENSKY_BBOX.lomin, OPENSKY_BBOX.lamin);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(MAP_HEIGHT, 5);
  });

  it("maps the NE corner to the top-right of the SVG", () => {
    const p = projectLonLat(OPENSKY_BBOX.lomax, OPENSKY_BBOX.lamax);
    expect(p.x).toBeCloseTo(MAP_WIDTH, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it("places LIPB inside the canvas", () => {
    const p = projectLonLat(LIPB.lon, LIPB.lat);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(MAP_WIDTH);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(MAP_HEIGHT);
  });

  it("builds an SVG path from lon/lat vertices", () => {
    const d = linePath([
      [OPENSKY_BBOX.lomin, OPENSKY_BBOX.lamax],
      [OPENSKY_BBOX.lomax, OPENSKY_BBOX.lamin],
    ]);
    expect(d.startsWith("M")).toBe(true);
    expect(d.includes(" L")).toBe(true);
  });

  it("expands a runway centerline into a closed polygon", () => {
    const poly = runwayPolygon([
      [11.325, 46.455],
      [11.328, 46.468],
    ]);
    expect(poly).not.toBeNull();
    expect(poly!.length).toBe(5);
    expect(poly![0]).toEqual(poly![4]);
  });
});

describe("valley map geojson", () => {
  it("loads OSM-derived layers for the live box", () => {
    const fc = loadFixture();
    expect(featuresByLayer(fc, "runway").length).toBeGreaterThanOrEqual(1);
    expect(featuresByLayer(fc, "river").length).toBeGreaterThan(0);
    expect(featuresByLayer(fc, "motorway").length).toBeGreaterThan(0);
    expect(featuresByLayer(fc, "atz").length).toBe(1);
    const labels = featuresByLayer(fc, "label").map((f) => f.properties.name);
    expect(labels).toEqual(
      expect.arrayContaining(["LIPB", "Bolzano / Bozen", "Trento"]),
    );
  });
});

describe("trackKey", () => {
  it("prefers icao24 when present", () => {
    expect(
      trackKey(
        {
          icao24: "abc123",
          callsign: "TEST1",
          originCountry: "",
          lon: 11.3,
          lat: 46.4,
          altitudeFt: 3000,
          velocityKt: 120,
          onGround: false,
          trackDeg: 10,
        },
        0,
      ),
    ).toBe("abc123");
  });

  it("falls back to callsign, position, and index when icao24 is empty", () => {
    const a = trackKey(
      {
        icao24: "  ",
        callsign: "TEST1",
        originCountry: "",
        lon: 11.3,
        lat: 46.4,
        altitudeFt: 3000,
        velocityKt: 120,
        onGround: false,
        trackDeg: 10,
      },
      0,
    );
    const b = trackKey(
      {
        icao24: "",
        callsign: "TEST1",
        originCountry: "",
        lon: 11.31,
        lat: 46.41,
        altitudeFt: 3000,
        velocityKt: 120,
        onGround: false,
        trackDeg: 10,
      },
      1,
    );
    expect(a).not.toBe(b);
    expect(a).toContain("TEST1");
    expect(b).toContain("#1");
  });
});
