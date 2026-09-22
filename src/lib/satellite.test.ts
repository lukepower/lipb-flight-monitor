import { describe, expect, it } from "vitest";
import {
  ALPS_BBOX,
  floorToStep,
  formatWmsTime,
  framesForLayer,
  lipbMarkerInBbox,
  SAT_LAYERS,
  satelliteGetMapUrl,
  satelliteTimeSteps,
} from "@/lib/satellite";

describe("satellite helpers", () => {
  it("floors to 10-minute UTC slots", () => {
    expect(floorToStep(new Date("2026-09-22T12:57:30.000Z")).toISOString()).toBe(
      "2026-09-22T12:50:00.000Z",
    );
    expect(floorToStep(new Date("2026-09-22T12:50:00.000Z")).toISOString()).toBe(
      "2026-09-22T12:50:00.000Z",
    );
  });

  it("builds last-hour steps oldest-first", () => {
    const steps = satelliteTimeSteps(new Date("2026-09-22T12:50:00.000Z"));
    expect(steps).toHaveLength(7);
    expect(steps[0]?.toISOString()).toBe("2026-09-22T11:50:00.000Z");
    expect(steps.at(-1)?.toISOString()).toBe("2026-09-22T12:50:00.000Z");
  });

  it("formats WMS TIME and GetMap URLs", () => {
    const layer = SAT_LAYERS[0]!;
    const time = new Date("2026-09-22T12:40:00.000Z");
    expect(formatWmsTime(time)).toBe("2026-09-22T12:40:00.000Z");
    const url = satelliteGetMapUrl(layer, time);
    expect(url).toContain("view.eumetsat.int/geoserver/wms?");
    expect(url).toContain("LAYERS=mtg_fd%3Argb_geocolour");
    expect(url).toContain(
      `BBOX=${ALPS_BBOX.minLat}%2C${ALPS_BBOX.minLon}%2C${ALPS_BBOX.maxLat}%2C${ALPS_BBOX.maxLon}`,
    );
    expect(url).toContain("TIME=2026-09-22T12%3A40%3A00.000Z");
  });

  it("builds frames for a layer and a LIPB marker inside the bbox", () => {
    const frames = framesForLayer(SAT_LAYERS[1]!, new Date("2026-09-22T12:50:00.000Z"));
    expect(frames.length).toBe(7);
    expect(frames[0]?.url).toContain("mtg_fd%3Air105_hrfi");
    const marker = lipbMarkerInBbox();
    expect(marker.leftPct).toBeGreaterThan(20);
    expect(marker.leftPct).toBeLessThan(80);
    expect(marker.topPct).toBeGreaterThan(20);
    expect(marker.topPct).toBeLessThan(80);
  });
});
