import { describe, expect, it } from "vitest";
import {
  buildCartoBasemap,
  cartoDarkBasemapUrl,
  framesFromMaps,
  latLonToTile,
  latLonToTileFract,
  lipbRadarTile,
  radarFrameUrl,
  radarTileUrl,
} from "@/lib/radar";

describe("radar helpers", () => {
  it("converts LIPB lat/lon to a stable mercator tile", () => {
    const { x, y } = latLonToTile(46.4603, 11.3264, 7);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(128);
    expect(y).toBeLessThan(128);
    expect(lipbRadarTile(7)).toEqual({ z: 7, x, y });
    const fract = latLonToTileFract(46.4603, 11.3264, 7);
    expect(fract.x).toBeGreaterThan(x);
    expect(fract.x).toBeLessThan(x + 1);
  });

  it("builds RainViewer tile and center-point URLs", () => {
    const host = "https://tilecache.rainviewer.com";
    const path = "/v2/radar/abc";
    const tile = { z: 7, x: 67, y: 44 };
    expect(radarTileUrl(host, path, tile)).toBe(
      "https://tilecache.rainviewer.com/v2/radar/abc/512/7/67/44/2/1_1.png",
    );
    expect(radarFrameUrl(host, path, { lat: 46.46, lon: 11.33, z: 7 })).toBe(
      "https://tilecache.rainviewer.com/v2/radar/abc/512/7/46.46/11.33/2/1_1.png",
    );
    expect(cartoDarkBasemapUrl(tile, "")).toBeNull();
    expect(cartoDarkBasemapUrl(tile, "test-key")).toBe(
      "https://basemaps.cartocdn.com/dark_all/7/67/44.png?key=test-key",
    );
  });

  it("builds a LIPB-centred 2x2 CARTO mosaic", () => {
    const basemap = buildCartoBasemap(46.4603, 11.3264, 7, "test-key");
    expect(basemap).not.toBeNull();
    expect(basemap!.tiles).toHaveLength(4);
    expect(basemap!.offsetX).toBeGreaterThanOrEqual(0);
    expect(basemap!.offsetX).toBeLessThan(1);
    expect(basemap!.tiles[0]).toContain(`/dark_all/7/${basemap!.x0}/${basemap!.y0}.png`);
    expect(basemap!.tiles[0]).toContain("key=test-key");
    expect(buildCartoBasemap(46.46, 11.33, 7, "")).toBeNull();
  });

  it("maps past frames as centre-point URLs and returns empty when past is missing", () => {
    expect(framesFromMaps({})).toEqual([]);
    expect(framesFromMaps({ host: "https://h.example", radar: { past: [] } })).toEqual(
      [],
    );
    const frames = framesFromMaps(
      {
        host: "https://h.example/",
        radar: {
          past: [
            { time: 1_700_000_000, path: "/v2/radar/a" },
            { time: 1_700_000_600, path: "/v2/radar/b" },
          ],
        },
      },
      { z: 7, lat: 46.46, lon: 11.33 },
    );
    expect(frames).toHaveLength(2);
    expect(frames[0]?.url).toContain("/v2/radar/a/512/7/46.46/11.33/2/1_1.png");
    expect(frames[0]?.timeIso).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });
});
