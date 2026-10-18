/** Regional outline geometry for the mountain-wave / shear map (Alps frame). */

import { ALPS_BBOX } from "@/lib/constants";
import waveMapJson from "../../data/lipb-wave-map.json";

export type WaveMapLayer =
  | "border"
  | "corridor"
  | "river"
  | "ridge"
  | "label";

export type WaveMapFeatureProps = {
  layer: WaveMapLayer;
  name?: string;
  kind?: string;
  ref?: string;
};

export type WaveMapFeature = {
  type: "Feature";
  properties: WaveMapFeatureProps;
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: [number, number][] };
};

export type WaveMapFeatureCollection = {
  type: "FeatureCollection";
  features: WaveMapFeature[];
  properties?: { attribution?: string; note?: string };
};

/**
 * Canvas size matched to ground aspect of ALPS_BBOX at mid-latitude
 * (lon span × cos(φ) / lat span ≈ 1.09 → slightly wider than tall).
 */
export const WAVE_MAP_W = 640;
export const WAVE_MAP_H = 580;
export const WAVE_MAP_PAD = 20;

export const WAVE_MAP_URL = "/lipb-wave-map.json";
export const WAVE_MAP_ATTRIBUTION = "© OpenStreetMap contributors (simplified)";

export const WAVE_MAP: WaveMapFeatureCollection =
  waveMapJson as unknown as WaveMapFeatureCollection;

const { lamin, lamax, lomin, lomax } = ALPS_BBOX;

export function projectWaveLonLat(
  lon: number,
  lat: number,
  width: number = WAVE_MAP_W,
  height: number = WAVE_MAP_H,
  pad: number = WAVE_MAP_PAD,
): { x: number; y: number } {
  const x = pad + ((lon - lomin) / (lomax - lomin)) * (width - pad * 2);
  const y = pad + ((lamax - lat) / (lamax - lamin)) * (height - pad * 2);
  return { x, y };
}

export function waveLinePath(
  coords: [number, number][],
  width?: number,
  height?: number,
  pad?: number,
): string {
  if (coords.length === 0) return "";
  return coords
    .map(([lon, lat], i) => {
      const { x, y } = projectWaveLonLat(lon, lat, width, height, pad);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function waveFeaturesByLayer(
  fc: WaveMapFeatureCollection,
  layer: WaveMapLayer,
): WaveMapFeature[] {
  return fc.features.filter((f) => f.properties.layer === layer);
}
