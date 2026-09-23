import { describe, expect, it } from "vitest";
import {
  alpsGaforLinePath,
  clipLineToOpenskyBbox,
  inOpenskyBbox,
  routesFromWfsFeatures,
} from "@/lib/gafor-routes";

describe("gafor route geometry", () => {
  it("clips to OpenSky bbox", () => {
    expect(inOpenskyBbox(11.3, 46.5)).toBe(true);
    expect(inOpenskyBbox(14.0, 46.5)).toBe(false);
    const clipped = clipLineToOpenskyBbox([
      [11.0, 47.0],
      [11.2, 46.5],
      [11.3, 46.4],
      [12.0, 46.4],
    ]);
    expect(clipped.length).toBe(2);
    expect(clipped[0]?.[0]).toBe(11.2);
  });

  it("parses WFS features for routes 50/51", () => {
    const routes = routesFromWfsFeatures([
      {
        properties: {
          id_no: 50,
          routing: "LOWI-Brenner-LIPB",
          ref_height: 6400,
        },
        geometry: {
          type: "LineString",
          coordinates: [
            [11.4, 47.2],
            [11.35, 46.5],
            [11.32, 46.46],
          ],
        },
      },
      {
        properties: { id_no: 63, routing: "other" },
        geometry: {
          type: "LineString",
          coordinates: [
            [14, 46],
            [13, 46],
          ],
        },
      },
    ]);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.id).toBe(50);
    expect(routes[0]?.valleyCoordinates.length).toBeGreaterThanOrEqual(2);
    expect(alpsGaforLinePath(routes[0]!.coordinates)).toMatch(/^M/);
  });
});
