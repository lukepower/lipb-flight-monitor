import { describe, expect, it } from "vitest";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  featuresByLayer,
  linePath,
  loadValleyMap,
  projectLonLat,
  runwayPolygon,
} from "@/lib/valley-map";
import { LIPB, OPENSKY_BBOX } from "@/lib/constants";

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
    const fc = loadValleyMap();
    expect(featuresByLayer(fc, "runway").length).toBeGreaterThanOrEqual(1);
    expect(featuresByLayer(fc, "river").length).toBeGreaterThan(0);
    expect(featuresByLayer(fc, "motorway").length).toBeGreaterThan(0);
    expect(featuresByLayer(fc, "atz").length).toBe(1);
    const labels = featuresByLayer(fc, "label").map((f) => f.properties.name);
    expect(labels).toEqual(expect.arrayContaining(["LIPB", "Bolzano / Bozen", "Trento"]));
  });
});
