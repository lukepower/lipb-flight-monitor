import { describe, expect, it } from "vitest";
import { ALPS_BBOX, LIPB } from "@/lib/constants";
import {
  buildWaveBasemap,
  projectWaveLonLat,
  WAVE_BASEMAP_ZOOM,
  WAVE_TILE_PX,
} from "@/lib/wave-map";

describe("wave basemap", () => {
  it("builds an OpenTopoMap tile mosaic covering ALPS_BBOX", () => {
    const basemap = buildWaveBasemap();
    expect(basemap.z).toBe(WAVE_BASEMAP_ZOOM);
    expect(basemap.tiles.length).toBeGreaterThan(4);
    expect(basemap.width).toBeGreaterThan(WAVE_TILE_PX);
    expect(basemap.height).toBeGreaterThan(WAVE_TILE_PX);
    expect(basemap.tiles[0]?.url).toContain("tile.opentopomap.org");
  });

  it("places LIPB inside the canvas", () => {
    const basemap = buildWaveBasemap();
    const p = projectWaveLonLat(LIPB.lon, LIPB.lat, basemap);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(basemap.width);
    expect(p.y).toBeGreaterThan(0);
    expect(p.y).toBeLessThan(basemap.height);
  });

  it("maps Alps NW/SE corners to the canvas edges", () => {
    const basemap = buildWaveBasemap();
    const nw = projectWaveLonLat(ALPS_BBOX.lomin, ALPS_BBOX.lamax, basemap);
    const se = projectWaveLonLat(ALPS_BBOX.lomax, ALPS_BBOX.lamin, basemap);
    expect(nw.x).toBeCloseTo(0, 5);
    expect(nw.y).toBeCloseTo(0, 5);
    expect(se.x).toBeCloseTo(basemap.width, 5);
    expect(se.y).toBeCloseTo(basemap.height, 5);
  });
});
