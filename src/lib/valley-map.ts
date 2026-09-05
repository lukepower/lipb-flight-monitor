import { OPENSKY_BBOX } from "@/lib/constants";
import valleyGeo from "../../data/lipb-valley-map.json";

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

export function loadValleyMap(): ValleyFeatureCollection {
  return valleyGeo as unknown as ValleyFeatureCollection;
}

export function featuresByLayer(
  fc: ValleyFeatureCollection,
  layer: MapLayer,
): ValleyFeature[] {
  return fc.features.filter((f) => f.properties.layer === layer);
}

export const MAP_ATTRIBUTION =
  (valleyGeo as unknown as ValleyFeatureCollection).properties?.attribution ??
  "© OpenStreetMap contributors";
