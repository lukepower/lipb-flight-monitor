import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALPS_BBOX, LIPB } from "@/lib/constants";
import {
  buildTyrolBasemap,
  buildWaveBasemap,
  projectWaveLonLat,
  WAVE_BASEMAP_STATIC_URL,
  WAVE_BASEMAP_ZOOM,
  WAVE_TILE_PX,
  waveBasemapMetaFromSidecar,
} from "@/lib/wave-map";
import {
  basemapProjectionForBbox,
  projectLonLat,
} from "@/lib/web-mercator";
import basemapMeta from "@/lib/wave-basemap-meta.json";

/** Landmarks for registration (lon/lat WGS84). */
const LANDMARKS = [
  { name: "LIPB", lat: LIPB.lat, lon: LIPB.lon },
  { name: "Innsbruck", lat: 47.2692, lon: 11.4041 },
  { name: "Zürich", lat: 47.3769, lon: 8.5417 },
  { name: "Milano", lat: 45.4642, lon: 9.19 },
] as const;

describe("wave basemap", () => {
  it("sidecar bbox equals ALPS_BBOX and matches shared projection math", () => {
    const meta = waveBasemapMetaFromSidecar();
    expect(meta.bbox).toEqual({
      lamin: ALPS_BBOX.lamin,
      lamax: ALPS_BBOX.lamax,
      lomin: ALPS_BBOX.lomin,
      lomax: ALPS_BBOX.lomax,
    });
    expect(basemapMeta.projection).toBe("web-mercator");

    const live = basemapProjectionForBbox(
      ALPS_BBOX,
      WAVE_BASEMAP_ZOOM,
      WAVE_TILE_PX,
    );
    expect(meta.projection.width).toBe(live.width);
    expect(meta.projection.height).toBe(live.height);
    expect(meta.projection.originX).toBeCloseTo(live.originX, 10);
    expect(meta.projection.originY).toBeCloseTo(live.originY, 10);
  });

  it("uses the committed static OpenTopoMap mosaic for ALPS_BBOX", () => {
    const basemap = buildWaveBasemap();
    expect(basemap.z).toBe(WAVE_BASEMAP_ZOOM);
    expect(basemap.staticUrl).toBe(WAVE_BASEMAP_STATIC_URL);
    expect(basemap.tiles).toHaveLength(0);

    const jpg = readFileSync(
      resolve(__dirname, "../../public/maps/alps-wave-basemap.jpg"),
    );
    expect(jpg.byteLength).toBeGreaterThan(50_000);
    expect(basemap.width).toBe(basemapMeta.width);
    expect(basemap.height).toBe(basemapMeta.height);
  });

  it("maps Alps NW/SE corners near the canvas edges (Web Mercator)", () => {
    const basemap = buildWaveBasemap();
    const nw = projectWaveLonLat(ALPS_BBOX.lomin, ALPS_BBOX.lamax, basemap);
    const se = projectWaveLonLat(ALPS_BBOX.lomax, ALPS_BBOX.lamin, basemap);
    expect(Math.hypot(nw.x, nw.y)).toBeLessThan(2);
    expect(Math.abs(se.x - basemap.width)).toBeLessThan(2);
    expect(Math.abs(se.y - basemap.height)).toBeLessThan(2);
  });

  it("registers LIPB, Innsbruck, Zürich and Milano within ~5 px of expected mercator pixels", () => {
    const basemap = buildWaveBasemap();
    const expectedProj = basemapProjectionForBbox(
      ALPS_BBOX,
      WAVE_BASEMAP_ZOOM,
      WAVE_TILE_PX,
    );

    for (const place of LANDMARKS) {
      const got = projectWaveLonLat(place.lon, place.lat, basemap);
      const expected = projectLonLat(place.lon, place.lat, expectedProj);
      expect(
        Math.hypot(got.x - expected.x, got.y - expected.y),
        place.name,
      ).toBeLessThan(5);
      expect(got.x).toBeGreaterThan(0);
      expect(got.x).toBeLessThan(basemap.width);
      expect(got.y).toBeGreaterThan(0);
      expect(got.y).toBeLessThan(basemap.height);
    }

    const lipb = projectWaveLonLat(LIPB.lon, LIPB.lat, basemap);
    const innsbruck = projectWaveLonLat(11.4041, 47.2692, basemap);
    const zurich = projectWaveLonLat(8.5417, 47.3769, basemap);
    const milano = projectWaveLonLat(9.19, 45.4642, basemap);
    const ulm = projectWaveLonLat(9.99, 48.4, basemap);

    // Web Mercator Y increases south; Ulm (48.4°N) is north of the 48°N edge.
    expect(ulm.y).toBeLessThan(0);
    expect(innsbruck.y).toBeLessThan(lipb.y);
    expect(milano.y).toBeGreaterThan(lipb.y);
    expect(zurich.x).toBeLessThan(innsbruck.x);
    // LIPB is well south of Innsbruck (not near Kempten / northern fringe).
    expect(lipb.y - innsbruck.y).toBeGreaterThan(80);
  });

  it("registers Tyrol basemap landmarks inside WAVE_RISK_BBOX", () => {
    const basemap = buildTyrolBasemap();
    expect(basemap.z).toBe(9);
    expect(
      existsSync(resolve(__dirname, "../../public/maps/tyrol-wave-basemap.jpg")),
    ).toBe(true);
    const lipb = projectWaveLonLat(LIPB.lon, LIPB.lat, basemap);
    const innsbruck = projectWaveLonLat(11.4041, 47.2692, basemap);
    expect(lipb.x).toBeGreaterThan(0);
    expect(lipb.x).toBeLessThan(basemap.width);
    expect(lipb.y).toBeGreaterThan(0);
    expect(lipb.y).toBeLessThan(basemap.height);
    expect(innsbruck.y).toBeLessThan(lipb.y);
  });
});
