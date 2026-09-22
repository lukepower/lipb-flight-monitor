import { LIPB } from "@/lib/constants";

const API_URL = "https://api.rainviewer.com/public/weather-maps.json";
const CACHE_TTL_MS = 4 * 60_000;
/** Universal Blue — only free colour scheme after RainViewer 2026 transition. */
const COLOR_SCHEME = 2;
const ZOOM = 6;
const SIZE = 512;
const OPTIONS = "1_1"; // smooth + snow

export type RadarFrame = {
  time: number;
  timeIso: string;
  url: string;
};

export type RadarBundle = {
  frames: RadarFrame[];
  basemapUrl: string | null;
  host: string;
  tile: { z: number; x: number; y: number };
  fetchedAt: string;
  attribution: string;
  error?: string;
};

type RainViewerMaps = {
  host?: string;
  radar?: {
    past?: Array<{ time: number; path: string }>;
  };
};

const cache = new Map<string, { at: number; value: RadarBundle }>();

async function cached(
  key: string,
  ttlMs: number,
  fn: () => Promise<RadarBundle>,
): Promise<RadarBundle> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Web Mercator tile indices for a lat/lon at zoom z. */
export function latLonToTile(
  lat: number,
  lon: number,
  z: number,
): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

export function radarTileUrl(
  host: string,
  path: string,
  tile: { z: number; x: number; y: number },
  opts: { size?: number; color?: number; options?: string } = {},
): string {
  const size = opts.size ?? SIZE;
  const color = opts.color ?? COLOR_SCHEME;
  const options = opts.options ?? OPTIONS;
  const base = host.replace(/\/$/, "");
  return `${base}${path}/${size}/${tile.z}/${tile.x}/${tile.y}/${color}/${options}.png`;
}

/** Center-point widget URL (lat/lon). Kept for tests / alternate use. */
export function radarFrameUrl(
  host: string,
  path: string,
  opts: {
    lat?: number;
    lon?: number;
    z?: number;
    size?: number;
    color?: number;
    options?: string;
  } = {},
): string {
  const lat = opts.lat ?? LIPB.lat;
  const lon = opts.lon ?? LIPB.lon;
  const z = opts.z ?? ZOOM;
  const size = opts.size ?? SIZE;
  const color = opts.color ?? COLOR_SCHEME;
  const options = opts.options ?? OPTIONS;
  const base = host.replace(/\/$/, "");
  return `${base}${path}/${size}/${z}/${lat}/${lon}/${color}/${options}.png`;
}

export function cartoDarkBasemapUrl(tile: {
  z: number;
  x: number;
  y: number;
}): string {
  return `https://basemaps.cartocdn.com/dark_all/${tile.z}/${tile.x}/${tile.y}@2x.png`;
}

export function lipbRadarTile(z = ZOOM): { z: number; x: number; y: number } {
  const { x, y } = latLonToTile(LIPB.lat, LIPB.lon, z);
  return { z, x, y };
}

export function framesFromMaps(
  data: RainViewerMaps,
  tile = lipbRadarTile(),
): RadarFrame[] {
  const host = (data.host ?? "").replace(/\/$/, "");
  const past = data.radar?.past ?? [];
  if (!host || past.length === 0) return [];
  return past.map((frame) => ({
    time: frame.time,
    timeIso: new Date(frame.time * 1000).toISOString(),
    url: radarTileUrl(host, frame.path, tile),
  }));
}

export async function fetchRadar(now = new Date()): Promise<RadarBundle> {
  return cached("radar", CACHE_TTL_MS, async () => {
    const fetchedAt = now.toISOString();
    const attribution = "Radar © RainViewer · basemap © CARTO";
    const tile = lipbRadarTile();
    try {
      const res = await fetch(API_URL, {
        headers: { Accept: "application/json" },
        next: { revalidate: 240 },
      });
      if (!res.ok) {
        return {
          frames: [],
          basemapUrl: null,
          host: "",
          tile,
          fetchedAt,
          attribution,
          error: `RainViewer HTTP ${res.status}`,
        };
      }
      const data = (await res.json()) as RainViewerMaps;
      const frames = framesFromMaps(data, tile);
      const host = (data.host ?? "").replace(/\/$/, "");
      if (frames.length === 0) {
        return {
          frames: [],
          basemapUrl: null,
          host,
          tile,
          fetchedAt,
          attribution,
          error: "No radar frames available",
        };
      }
      return {
        frames,
        basemapUrl: cartoDarkBasemapUrl(tile),
        host,
        tile,
        fetchedAt,
        attribution,
      };
    } catch (error) {
      return {
        frames: [],
        basemapUrl: null,
        host: "",
        tile,
        fetchedAt,
        attribution,
        error: error instanceof Error ? error.message : "Radar unavailable",
      };
    }
  });
}
