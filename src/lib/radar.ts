import { LIPB } from "@/lib/constants";

const API_URL = "https://api.rainviewer.com/public/weather-maps.json";
const CACHE_TTL_MS = 4 * 60_000;
/** Universal Blue — only free colour scheme after RainViewer 2026 transition. */
const COLOR_SCHEME = 2;
/** RainViewer max native zoom; 7 is tight enough for the valley. */
const ZOOM = 7;
const SIZE = 512;
const OPTIONS = "1_1"; // smooth + snow

export type RadarFrame = {
  time: number;
  timeIso: string;
  url: string;
};

/** 2×2 CARTO mosaic shifted so LIPB sits at the viewport centre. */
export type RadarBasemap = {
  z: number;
  x0: number;
  y0: number;
  /** How far (in tile widths) the mosaic is shifted left/up relative to the viewport. */
  offsetX: number;
  offsetY: number;
  /** Row-major [NW, NE, SW, SE]. */
  tiles: [string, string, string, string];
};

export type RadarBundle = {
  frames: RadarFrame[];
  basemap: RadarBasemap | null;
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

/** Continuous mercator tile coordinates (not floored). */
export function latLonToTileFract(
  lat: number,
  lon: number,
  z: number,
): { x: number; y: number } {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** Web Mercator tile indices for a lat/lon at zoom z. */
export function latLonToTile(
  lat: number,
  lon: number,
  z: number,
): { x: number; y: number } {
  const { x, y } = latLonToTileFract(lat, lon, z);
  const n = 2 ** z;
  return {
    x: Math.min(n - 1, Math.max(0, Math.floor(x))),
    y: Math.min(n - 1, Math.max(0, Math.floor(y))),
  };
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

/** Center-point widget URL — LIPB sits in the middle of the image. */
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

export function cartoTileUrl(
  tile: { z: number; x: number; y: number },
  apiKey: string,
): string {
  // Dark Matter raster path is `dark_all` (not rastertiles/dark_matter — that 404s).
  return `https://basemaps.cartocdn.com/dark_all/${tile.z}/${tile.x}/${tile.y}.png?key=${encodeURIComponent(apiKey)}`;
}

/**
 * CARTO basemap tile (legacy single-tile helper).
 * Prefer {@link buildCartoBasemap} for a LIPB-centred underlay.
 */
export function cartoDarkBasemapUrl(
  tile: { z: number; x: number; y: number },
  apiKey = process.env.CARTO_API_KEY?.trim() ?? "",
): string | null {
  if (!apiKey) return null;
  return cartoTileUrl(tile, apiKey);
}

/**
 * 2×2 dark_all mosaic covering one tile of geography centred on LIPB
 * (matches RainViewer centre-point frames at the same zoom).
 */
export function buildCartoBasemap(
  lat: number = LIPB.lat,
  lon: number = LIPB.lon,
  z: number = ZOOM,
  apiKey: string = process.env.CARTO_API_KEY?.trim() ?? "",
): RadarBasemap | null {
  if (!apiKey) return null;
  const n = 2 ** z;
  const { x: cx, y: cy } = latLonToTileFract(lat, lon, z);
  const worldLeft = cx - 0.5;
  const worldTop = cy - 0.5;
  const x0 = Math.min(n - 2, Math.max(0, Math.floor(worldLeft)));
  const y0 = Math.min(n - 2, Math.max(0, Math.floor(worldTop)));
  const offsetX = worldLeft - x0;
  const offsetY = worldTop - y0;
  const tiles: [string, string, string, string] = [
    cartoTileUrl({ z, x: x0, y: y0 }, apiKey),
    cartoTileUrl({ z, x: x0 + 1, y: y0 }, apiKey),
    cartoTileUrl({ z, x: x0, y: y0 + 1 }, apiKey),
    cartoTileUrl({ z, x: x0 + 1, y: y0 + 1 }, apiKey),
  ];
  return { z, x0, y0, offsetX, offsetY, tiles };
}

export function lipbRadarTile(z = ZOOM): { z: number; x: number; y: number } {
  const { x, y } = latLonToTile(LIPB.lat, LIPB.lon, z);
  return { z, x, y };
}

export function framesFromMaps(
  data: RainViewerMaps,
  opts: { z?: number; lat?: number; lon?: number } = {},
): RadarFrame[] {
  const host = (data.host ?? "").replace(/\/$/, "");
  const past = data.radar?.past ?? [];
  if (!host || past.length === 0) return [];
  const z = opts.z ?? ZOOM;
  const lat = opts.lat ?? LIPB.lat;
  const lon = opts.lon ?? LIPB.lon;
  return past.map((frame) => ({
    time: frame.time,
    timeIso: new Date(frame.time * 1000).toISOString(),
    url: radarFrameUrl(host, frame.path, { lat, lon, z }),
  }));
}

export async function fetchRadar(now = new Date()): Promise<RadarBundle> {
  return cached("radar-centered-v3-dark-all", CACHE_TTL_MS, async () => {
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
          basemap: null,
          host: "",
          tile,
          fetchedAt,
          attribution,
          error: `RainViewer HTTP ${res.status}`,
        };
      }
      const data = (await res.json()) as RainViewerMaps;
      const frames = framesFromMaps(data);
      const host = (data.host ?? "").replace(/\/$/, "");
      if (frames.length === 0) {
        return {
          frames: [],
          basemap: null,
          host,
          tile,
          fetchedAt,
          attribution,
          error: "No radar frames available",
        };
      }
      return {
        frames,
        basemap: buildCartoBasemap(),
        host,
        tile,
        fetchedAt,
        attribution,
      };
    } catch (error) {
      return {
        frames: [],
        basemap: null,
        host: "",
        tile,
        fetchedAt,
        attribution,
        error: error instanceof Error ? error.message : "Radar unavailable",
      };
    }
  });
}
