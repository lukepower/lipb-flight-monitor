import { OPENSKY_BBOX } from "@/lib/constants";

const WFS_URL =
  "https://sdigeo-free.austrocontrol.at/geoserver/free/ows" +
  "?service=WFS&version=2.0.0&request=GetFeature&typeNames=GAFOR_ROUTE" +
  "&outputFormat=application/json&srsName=EPSG:4326" +
  "&CQL_FILTER=" +
  encodeURIComponent("id_no=50 OR id_no=51");

export const GAFOR_ROUTES_ATTRIBUTION =
  "GAFOR routes © Austro Control (geometry only — not O/D/M/X colours)";

const CACHE_TTL_MS = 6 * 60 * 60_000;
/** Routes that terminate at LIPB. */
export const LIPB_GAFOR_ROUTE_IDS = [50, 51] as const;

export type GaforRoute = {
  id: number;
  routing: string;
  refHeightFt: number;
  /** Full LineString lon/lat. */
  coordinates: [number, number][];
  /** Segments clipped to the valley / OpenSky bbox (may be empty). */
  valleyCoordinates: [number, number][];
  aipLink: string | null;
};

export type GaforRoutesBundle = {
  routes: GaforRoute[];
  fetchedAt: string;
  attribution: string;
  error?: string;
};

type WfsFeature = {
  properties?: {
    id_no?: number;
    routing?: string;
    ref_height?: number;
    aip_link?: string;
  };
  geometry?: {
    type?: string;
    coordinates?: number[][];
  };
};

const cache = new Map<string, { at: number; value: GaforRoutesBundle }>();

async function cached(
  key: string,
  ttlMs: number,
  fn: () => Promise<GaforRoutesBundle>,
): Promise<GaforRoutesBundle> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function inOpenskyBbox(lon: number, lat: number): boolean {
  const { lamin, lamax, lomin, lomax } = OPENSKY_BBOX;
  return lon >= lomin && lon <= lomax && lat >= lamin && lat <= lamax;
}

/**
 * Keep consecutive runs of points inside the valley bbox (drop exterior
 * stretches). Returns the longest interior run for drawing.
 */
export function clipLineToOpenskyBbox(
  coords: [number, number][],
): [number, number][] {
  const runs: [number, number][][] = [];
  let current: [number, number][] = [];
  for (const c of coords) {
    if (inOpenskyBbox(c[0], c[1])) {
      current.push(c);
    } else if (current.length) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);
  if (runs.length === 0) return [];
  return runs.reduce((a, b) => (b.length > a.length ? b : a));
}

export function routesFromWfsFeatures(features: WfsFeature[]): GaforRoute[] {
  const routes: GaforRoute[] = [];
  for (const f of features) {
    const id = f.properties?.id_no;
    if (id == null || !LIPB_GAFOR_ROUTE_IDS.includes(id as 50 | 51)) continue;
    if (f.geometry?.type !== "LineString") continue;
    const raw = f.geometry.coordinates ?? [];
    const coordinates = raw
      .filter((c) => Array.isArray(c) && c.length >= 2)
      .map((c) => [Number(c[0]), Number(c[1])] as [number, number])
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
    if (coordinates.length < 2) continue;
    routes.push({
      id,
      routing: f.properties?.routing ?? `Route ${id}`,
      refHeightFt: f.properties?.ref_height ?? 0,
      coordinates,
      valleyCoordinates: clipLineToOpenskyBbox(coordinates),
      aipLink: f.properties?.aip_link ?? null,
    });
  }
  return routes.sort((a, b) => a.id - b.id);
}

/** Alps-ish equirectangular projection for the Sky mini-map. */
export const ALPS_GAFOR_BBOX = {
  minLon: 10.2,
  maxLon: 12.6,
  minLat: 45.9,
  maxLat: 47.5,
} as const;

export const ALPS_GAFOR_MAP = { width: 640, height: 420 } as const;

export function projectAlpsGafor(
  lon: number,
  lat: number,
  bbox = ALPS_GAFOR_BBOX,
  size = ALPS_GAFOR_MAP,
): { x: number; y: number } {
  const x =
    ((lon - bbox.minLon) / (bbox.maxLon - bbox.minLon)) * size.width;
  const y =
    ((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat)) * size.height;
  return { x, y };
}

export function alpsGaforLinePath(
  coords: [number, number][],
  bbox = ALPS_GAFOR_BBOX,
  size = ALPS_GAFOR_MAP,
): string {
  if (coords.length === 0) return "";
  return coords
    .map(([lon, lat], i) => {
      const { x, y } = projectAlpsGafor(lon, lat, bbox, size);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export async function fetchGaforRoutes(
  now = new Date(),
): Promise<GaforRoutesBundle> {
  return cached("gafor-routes-50-51", CACHE_TTL_MS, async () => {
    const fetchedAt = now.toISOString();
    try {
      const res = await fetch(WFS_URL, {
        headers: { Accept: "application/json" },
        next: { revalidate: 21600 },
      });
      if (!res.ok) {
        return {
          routes: [],
          fetchedAt,
          attribution: GAFOR_ROUTES_ATTRIBUTION,
          error: `ACG WFS HTTP ${res.status}`,
        };
      }
      const data = (await res.json()) as { features?: WfsFeature[] };
      const routes = routesFromWfsFeatures(data.features ?? []);
      if (routes.length === 0) {
        return {
          routes: [],
          fetchedAt,
          attribution: GAFOR_ROUTES_ATTRIBUTION,
          error: "No GAFOR routes 50/51 from Austro Control WFS",
        };
      }
      return {
        routes,
        fetchedAt,
        attribution: GAFOR_ROUTES_ATTRIBUTION,
      };
    } catch (error) {
      return {
        routes: [],
        fetchedAt,
        attribution: GAFOR_ROUTES_ATTRIBUTION,
        error:
          error instanceof Error ? error.message : "GAFOR routes unavailable",
      };
    }
  });
}
