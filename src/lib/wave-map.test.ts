import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WAVE_RISK_BBOX } from "@/lib/constants";
import {
  WAVE_MAP,
  WAVE_MAP_H,
  WAVE_MAP_PAD,
  WAVE_MAP_W,
  projectWaveLonLat,
  waveFeaturesByLayer,
  waveLinePath,
} from "@/lib/wave-map";

describe("wave map projection", () => {
  it("places LIPB inside the padded canvas", () => {
    const p = projectWaveLonLat(11.3264, 46.4603);
    expect(p.x).toBeGreaterThan(WAVE_MAP_PAD);
    expect(p.x).toBeLessThan(WAVE_MAP_W - WAVE_MAP_PAD);
    expect(p.y).toBeGreaterThan(WAVE_MAP_PAD);
    expect(p.y).toBeLessThan(WAVE_MAP_H - WAVE_MAP_PAD);
  });

  it("maps bbox corners to the padded edges", () => {
    const sw = projectWaveLonLat(WAVE_RISK_BBOX.lomin, WAVE_RISK_BBOX.lamin);
    const ne = projectWaveLonLat(WAVE_RISK_BBOX.lomax, WAVE_RISK_BBOX.lamax);
    expect(sw.x).toBeCloseTo(WAVE_MAP_PAD, 5);
    expect(sw.y).toBeCloseTo(WAVE_MAP_H - WAVE_MAP_PAD, 5);
    expect(ne.x).toBeCloseTo(WAVE_MAP_W - WAVE_MAP_PAD, 5);
    expect(ne.y).toBeCloseTo(WAVE_MAP_PAD, 5);
  });

  it("builds an SVG path from lon/lat vertices", () => {
    const d = waveLinePath([
      [11.0, 46.0],
      [11.5, 46.5],
      [12.0, 47.0],
    ]);
    expect(d.startsWith("M")).toBe(true);
    expect(d.includes(" L")).toBe(true);
  });
});

describe("wave map geojson", () => {
  it("includes orientation layers and place labels", () => {
    expect(waveFeaturesByLayer(WAVE_MAP, "border").length).toBeGreaterThan(0);
    expect(waveFeaturesByLayer(WAVE_MAP, "corridor").length).toBeGreaterThan(0);
    expect(waveFeaturesByLayer(WAVE_MAP, "label").length).toBeGreaterThanOrEqual(6);
  });

  it("matches the public asset copy", () => {
    const publicPath = resolve(__dirname, "../../public/lipb-wave-map.json");
    const dataPath = resolve(__dirname, "../../data/lipb-wave-map.json");
    const pub = readFileSync(publicPath, "utf8");
    const data = readFileSync(dataPath, "utf8");
    expect(pub).toBe(data);
  });
});
