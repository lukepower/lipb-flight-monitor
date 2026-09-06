import { OPENSKY_BBOX } from "@/lib/constants";
import type { LiveTrack } from "@/lib/opensky";

export type MapLayer =
  | "urban"
  | "river"
  | "motorway"
  | "apron"
  | "taxiway"
  | "runway"
  | "atz"
  | "label";

export type ValleyFeatureProps = {
  layer: MapLayer;
  name?: string;
  kind?: string;
  ref?: string;
  icao?: string;
};

export type ValleyFeature = {
  type: "Feature";
  properties: ValleyFeatureProps;
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "Polygon"; coordinates: [number, number][][] };
};

export type ValleyFeatureCollection = {
  type: "FeatureCollection";
  features: ValleyFeature[];
  properties?: { attribution?: string; note?: string };
};

/** SVG canvas size; aspect matches mid-latitude equirectangular of OPENSKY_BBOX. */
export const MAP_WIDTH = 600;
export const MAP_HEIGHT = 1000;

/** Static asset path — kept out of the client JS bundle for independent caching. */
export const VALLEY_MAP_URL = "/lipb-valley-map.json";

export const MAP_ATTRIBUTION = "© OpenStreetMap contributors";

const { lamin, lamax, lomin, lomax } = OPENSKY_BBOX;
const MID_LAT = (lamin + lamax) / 2;
const COS_MID = Math.cos((MID_LAT * Math.PI) / 180);

export function projectLonLat(lon: number, lat: number): { x: number; y: number } {
  const x = ((lon - lomin) / (lomax - lomin)) * MAP_WIDTH;
  const y = ((lamax - lat) / (lamax - lamin)) * MAP_HEIGHT;
  return { x, y };
}

/** Correct horizontal scale for drawing circles (e.g. ATZ) in projected space. */
export function lonSpanToX(degLon: number): number {
  return (degLon / (lomax - lomin)) * MAP_WIDTH;
}

export function latSpanToY(degLat: number): number {
  return (degLat / (lamax - lamin)) * MAP_HEIGHT;
}

export function linePath(coords: [number, number][]): string {
  if (coords.length === 0) return "";
  return coords
    .map(([lon, lat], i) => {
      const { x, y } = projectLonLat(lon, lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function ringPath(ring: [number, number][]): string {
  const d = linePath(ring);
  return d ? `${d} Z` : "";
}

/**
 * Expand a runway centerline into a thin rectangle (lon/lat degrees).
 * widthM defaults to LIPB asphalt width (45 m).
 */
export function runwayPolygon(
  coords: [number, number][],
  widthM = 45,
): [number, number][] | null {
  if (coords.length < 2) return null;
  const [lon0, lat0] = coords[0];
  const [lon1, lat1] = coords[coords.length - 1];
  const dLon = lon1 - lon0;
  const dLat = lat1 - lat0;
  const len = Math.hypot(dLon * COS_MID, dLat);
  if (len === 0) return null;
  const halfWDegLat = widthM / 2 / 111_320;
  const nx = (-dLat / len) * halfWDegLat;
  const ny = ((dLon * COS_MID) / len) * halfWDegLat;
  const nLon = nx / COS_MID;
  return [
    [lon0 + nLon, lat0 + ny],
    [lon1 + nLon, lat1 + ny],
    [lon1 - nLon, lat1 - ny],
    [lon0 - nLon, lat0 - ny],
    [lon0 + nLon, lat0 + ny],
  ];
}

export function featuresByLayer(
  fc: ValleyFeatureCollection,
  layer: MapLayer,
): ValleyFeature[] {
  return fc.features.filter((f) => f.properties.layer === layer);
}

/** Stable React key for a live track (icao24 when present; else callsign + position). */
export function trackKey(track: LiveTrack, index: number): string {
  const id = track.icao24.trim();
  if (id) return id;
  const callsign = track.callsign.trim() || "unknown";
  return `${callsign}@${track.lat.toFixed(4)},${track.lon.toFixed(4)}#${index}`;
}

/**
 * Load valley geometry from `/lipb-valley-map.json` when available.
 * Falls back to a dynamic import of `data/lipb-valley-map.json` (separate chunk)
 * so the map still renders if the standalone image omitted `public/`.
 */
export async function fetchValleyMap(
  url: string = VALLEY_MAP_URL,
): Promise<ValleyFeatureCollection> {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (res.ok) return (await res.json()) as ValleyFeatureCollection;
  } catch {
    // Network / offline — try the bundled chunk below.
  }
  const mod = await import("../../data/lipb-valley-map.json");
  return (mod.default ?? mod) as unknown as ValleyFeatureCollection;
}
