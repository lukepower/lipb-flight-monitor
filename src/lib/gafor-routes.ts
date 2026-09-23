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
 * Clip one segment to the OpenSky AABB (Liang–Barsky). Returns 0–2 points
 * on/inside the box, or null if the segment misses entirely.
 */
export function clipSegmentToOpenskyBbox(
  a: [number, number],
  b: [number, number],
): [[number, number], [number, number]] | null {
  const { lamin: ymin, lamax: ymax, lomin: xmin, lomax: xmax } = OPENSKY_BBOX;
  const [x0, y0] = a;
  const [x1, y1] = b;
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;

  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  if (
    !clip(-dx, x0 - xmin) ||
    !clip(dx, xmax - x0) ||
    !clip(-dy, y0 - ymin) ||
    !clip(dy, ymax - y0)
  ) {
    return null;
  }
  if (t1 < t0) return null;

  const outA: [number, number] = [x0 + t0 * dx, y0 + t0 * dy];
  const outB: [number, number] = [x0 + t1 * dx, y0 + t1 * dy];
  return [outA, outB];
}

/**
 * Clip a polyline to the valley bbox, inserting edge intersection endpoints so
 * boundary-crossing segments still draw (even with a single interior vertex).
 * Returns the longest continuous clipped run.
 */
export function clipLineToOpenskyBbox(
  coords: [number, number][],
): [number, number][] {
  const runs: [number, number][][] = [];
  let current: [number, number][] = [];

  const pushPoint = (p: [number, number]) => {
    const last = current[current.length - 1];
    if (
      last &&
      Math.abs(last[0] - p[0]) < 1e-9 &&
      Math.abs(last[1] - p[1]) < 1e-9
    ) {
      return;
    }
    current.push(p);
  };

  const endRun = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };

  for (let i = 0; i < coords.length - 1; i++) {
    const clipped = clipSegmentToOpenskyBbox(coords[i], coords[i + 1]);
    if (!clipped) {
      endRun();
      continue;
    }
    pushPoint(clipped[0]);
    pushPoint(clipped[1]);
    // If the shared vertex is outside the bbox, this segment exited at the
    // boundary. Ending the run here avoids joining two independent boundary
    // hits with a false in-bbox shortcut when the next segment also re-enters.
    if (
      i + 1 < coords.length - 1 &&
      !inOpenskyBbox(coords[i + 1][0], coords[i + 1][1])
    ) {
      endRun();
    }
  }
  endRun();

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
