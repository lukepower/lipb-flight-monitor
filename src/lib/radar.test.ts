import { describe, expect, it } from "vitest";
import {
  cartoDarkBasemapUrl,
  framesFromMaps,
  latLonToTile,
  lipbRadarTile,
  radarFrameUrl,
  radarTileUrl,
} from "@/lib/radar";

describe("radar helpers", () => {
  it("converts LIPB lat/lon to a stable mercator tile", () => {
    const { x, y } = latLonToTile(46.4603, 11.3264, 6);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(64);
    expect(y).toBeLessThan(64);
    expect(lipbRadarTile(6)).toEqual({ z: 6, x, y });
  });

  it("builds RainViewer tile and center-point URLs", () => {
    const host = "https://tilecache.rainviewer.com";
    const path = "/v2/radar/abc";
    const tile = { z: 6, x: 33, y: 22 };
    expect(radarTileUrl(host, path, tile)).toBe(
      "https://tilecache.rainviewer.com/v2/radar/abc/512/6/33/22/2/1_1.png",
    );
    expect(radarFrameUrl(host, path, { lat: 46.46, lon: 11.33, z: 6 })).toBe(
      "https://tilecache.rainviewer.com/v2/radar/abc/512/6/46.46/11.33/2/1_1.png",
    );
    expect(cartoDarkBasemapUrl(tile)).toContain("/dark_all/6/33/22@2x.png");
  });

  it("maps past frames and returns empty when past is missing", () => {
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
      { z: 6, x: 1, y: 2 },
    );
    expect(frames).toHaveLength(2);
    expect(frames[0]?.url).toContain("/v2/radar/a/512/6/1/2/2/1_1.png");
    expect(frames[0]?.timeIso).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });
});
