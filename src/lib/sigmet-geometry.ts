/**
 * Parse SIGMET/AIRMET coordinate polygons and test proximity to LIPB.
 * Text forms: N4334 E01022 · AWC JSON: { lon, lat }[].
 */

import { LIPB } from "@/lib/constants";

export type LonLat = { lat: number; lon: number };

const EARTH_KM = 6371;
/** Verdict relevance: polygon contains LIPB or comes within this distance. */
export const SIGMET_VERDICT_RADIUS_KM = 50;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

export function haversineKm(a: LonLat, b: LonLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(s));
}

/** Compact ICAO coords: N4334 E01022 or N1428 W09052. */
export function parseSigmetCoordsFromText(raw: string): LonLat[] {
  const re = /\b([NS])(\d{2})(\d{2})\s*([EW])(\d{3})(\d{2})\b/gi;
  const out: LonLat[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const lat =
      (Number(m[2]) + Number(m[3]) / 60) * (m[1]!.toUpperCase() === "S" ? -1 : 1);
    const lon =
      (Number(m[5]) + Number(m[6]) / 60) * (m[4]!.toUpperCase() === "W" ? -1 : 1);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      out.push({ lat, lon });
    }
  }
  return out;
}

/** AWC isigmet `coords` as `{lon,lat}[]` or `[lon,lat][]` / `[lat,lon][]`. */
export function parseAwcCoords(coords: unknown): LonLat[] {
  if (!Array.isArray(coords) || coords.length === 0) return [];
  const out: LonLat[] = [];
  for (const c of coords) {
    if (c && typeof c === "object" && !Array.isArray(c)) {
      const o = c as { lon?: number; lat?: number };
      if (
        typeof o.lon === "number" &&
        typeof o.lat === "number" &&
        Number.isFinite(o.lon) &&
        Number.isFinite(o.lat)
      ) {
        out.push({ lat: o.lat, lon: o.lon });
      }
      continue;
    }
    if (Array.isArray(c) && c.length >= 2) {
      const a = Number(c[0]);
      const b = Number(c[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      // Heuristic: |lon| can be > 90; if first abs > 90 treat as lon,lat.
      if (Math.abs(a) > 90) out.push({ lon: a, lat: b });
      else if (Math.abs(b) > 90) out.push({ lon: b, lat: a });
      else out.push({ lon: a, lat: b }); // GeoJSON order
    }
  }
  return out;
}

/** Ray-casting point-in-polygon (closed or open ring). */
export function pointInPolygon(point: LonLat, ring: LonLat[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]!.lon;
    const yi = ring[i]!.lat;
    const xj = ring[j]!.lon;
    const yj = ring[j]!.lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lon <
        ((xj - xi) * (point.lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distPointToSegmentKm(p: LonLat, a: LonLat, b: LonLat): number {
  // Local equirectangular for short Alpine segments.
  const x = (p.lon - a.lon) * Math.cos(toRad((a.lat + b.lat) / 2));
  const y = p.lat - a.lat;
  const dx = (b.lon - a.lon) * Math.cos(toRad((a.lat + b.lat) / 2));
  const dy = b.lat - a.lat;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return haversineKm(p, a);
  let t = (x * dx + y * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const proj: LonLat = {
    lon: a.lon + t * (b.lon - a.lon),
    lat: a.lat + t * (b.lat - a.lat),
  };
  return haversineKm(p, proj);
}

/** 0 if inside; else min distance to ring edges/vertices. */
export function distanceToPolygonKm(point: LonLat, ring: LonLat[]): number {
  if (ring.length === 0) return Infinity;
  if (ring.length === 1) return haversineKm(point, ring[0]!);
  if (ring.length === 2) return distPointToSegmentKm(point, ring[0]!, ring[1]!);
  if (pointInPolygon(point, ring)) return 0;
  let min = Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    min = Math.min(min, distPointToSegmentKm(point, a, b));
  }
  return min;
}

export function polygonNearLipb(
  ring: LonLat[],
  radiusKm = SIGMET_VERDICT_RADIUS_KM,
  lipb: LonLat = { lat: LIPB.lat, lon: LIPB.lon },
): boolean {
  if (ring.length === 0) return false;
  return distanceToPolygonKm(lipb, ring) <= radiusKm;
}

export function resolveAdvisoryPolygon(input: {
  raw: string;
  awcCoords?: unknown;
}): LonLat[] {
  const fromAwc = parseAwcCoords(input.awcCoords);
  if (fromAwc.length >= 3) return fromAwc;
  const fromText = parseSigmetCoordsFromText(input.raw);
  if (fromText.length >= 3) return fromText;
  // Point / line: still usable for distance test
  if (fromAwc.length > 0) return fromAwc;
  return fromText;
}

export function advisoryPolygonNearLipb(input: {
  raw: string;
  awcCoords?: unknown;
  radiusKm?: number;
}): boolean {
  const ring = resolveAdvisoryPolygon(input);
  return polygonNearLipb(ring, input.radiusKm ?? SIGMET_VERDICT_RADIUS_KM);
}
