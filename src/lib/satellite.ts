import { LIPB } from "@/lib/constants";

const WMS_BASE = "https://view.eumetsat.int/geoserver/wms";
const CACHE_TTL_MS = 5 * 60_000;
const FRAME_STEP_MS = 10 * 60_000;
const LOOP_MS = 60 * 60_000;
const WIDTH = 900;
const HEIGHT = 675;

/** Alps box around LIPB — WMS 1.3.0 EPSG:4326 order is minLat,minLon,maxLat,maxLon. */
export const ALPS_BBOX = {
  minLat: 44.2,
  minLon: 8.2,
  maxLat: 48.0,
  maxLon: 14.2,
} as const;

export type SatLayerId = "geocolour" | "ir105";

export type SatLayerConfig = {
  id: SatLayerId;
  label: string;
  layer: string;
  format: "image/jpeg" | "image/png";
};

/** Prefer daytime Geo Colour; IR as night-friendly fallback. */
export const SAT_LAYERS: SatLayerConfig[] = [
  {
    id: "geocolour",
    label: "Geo Colour",
    layer: "mtg_fd:rgb_geocolour",
    format: "image/jpeg",
  },
  {
    id: "ir105",
    label: "IR 10.5",
    layer: "mtg_fd:ir105_hrfi",
    format: "image/png",
  },
];

export type SatFrame = {
  timeIso: string;
  url: string;
};

export type SatelliteBundle = {
  frames: SatFrame[];
  layerId: SatLayerId | null;
  layerLabel: string | null;
  fetchedAt: string;
  attribution: string;
  error?: string;
};

const cache = new Map<string, { at: number; value: SatelliteBundle }>();

async function cached(
  key: string,
  ttlMs: number,
  fn: () => Promise<SatelliteBundle>,
): Promise<SatelliteBundle> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Floor an instant to the previous 10-minute UTC slot (MTG cadence). */
export function floorToStep(date: Date, stepMs = FRAME_STEP_MS): Date {
  const t = date.getTime();
  return new Date(Math.floor(t / stepMs) * stepMs);
}

/** Last ~1 h of UTC timestamps ending at `end` (inclusive), oldest first. */
export function satelliteTimeSteps(
  end: Date,
  loopMs = LOOP_MS,
  stepMs = FRAME_STEP_MS,
): Date[] {
  const last = floorToStep(end, stepMs);
  const first = last.getTime() - loopMs;
  const out: Date[] = [];
  for (let t = first; t <= last.getTime(); t += stepMs) {
    out.push(new Date(t));
  }
  return out;
}

export function formatWmsTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

export function satelliteGetMapUrl(
  layer: SatLayerConfig,
  time: Date,
  bbox = ALPS_BBOX,
): string {
  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.3.0",
    REQUEST: "GetMap",
    LAYERS: layer.layer,
    STYLES: "",
    CRS: "EPSG:4326",
    BBOX: `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`,
    WIDTH: String(WIDTH),
    HEIGHT: String(HEIGHT),
    FORMAT: layer.format,
    TIME: formatWmsTime(time),
    EXCEPTIONS: "INIMAGE",
  });
  if (layer.format === "image/png") {
    params.set("TRANSPARENT", "TRUE");
  }
  return `${WMS_BASE}?${params.toString()}`;
}

export function framesForLayer(
  layer: SatLayerConfig,
  end: Date,
): SatFrame[] {
  return satelliteTimeSteps(end).map((time) => ({
    timeIso: time.toISOString(),
    url: satelliteGetMapUrl(layer, time),
  }));
}

async function layerResponds(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", next: { revalidate: 300 } });
    if (!res.ok) return false;
    const type = res.headers.get("content-type") ?? "";
    // Some gateways omit content-type on HEAD; treat 200 as enough.
    return type === "" || type.startsWith("image/");
  } catch {
    return false;
  }
}

export async function fetchSatellite(now = new Date()): Promise<SatelliteBundle> {
  return cached("satellite", CACHE_TTL_MS, async () => {
    const fetchedAt = now.toISOString();
    const attribution = "Satellite © EUMETSAT";
    // Imagery lags a few minutes — use ~20 min ago as the loop end
    const end = new Date(now.getTime() - 20 * 60_000);

    try {
      for (const layer of SAT_LAYERS) {
        const frames = framesForLayer(layer, end);
        const probe = frames[frames.length - 1];
        if (!probe) continue;
        const ok = await layerResponds(probe.url);
        if (!ok) continue;
        return {
          frames,
          layerId: layer.id,
          layerLabel: layer.label,
          fetchedAt,
          attribution,
        };
      }
      return {
        frames: [],
        layerId: null,
        layerLabel: null,
        fetchedAt,
        attribution,
        error: "No EUMETView satellite layer available",
      };
    } catch (error) {
      return {
        frames: [],
        layerId: null,
        layerLabel: null,
        fetchedAt,
        attribution,
        error: error instanceof Error ? error.message : "Satellite unavailable",
      };
    }
  });
}

/** Marker position of LIPB inside the Alps bbox (0–1, top-left origin for CSS). */
export function lipbMarkerInBbox(bbox = ALPS_BBOX): { leftPct: number; topPct: number } {
  const leftPct =
    ((LIPB.lon - bbox.minLon) / (bbox.maxLon - bbox.minLon)) * 100;
  const topPct =
    ((bbox.maxLat - LIPB.lat) / (bbox.maxLat - bbox.minLat)) * 100;
  return { leftPct, topPct };
}
