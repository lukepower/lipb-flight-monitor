import { LIPB, OPENSKY_BBOX } from "@/lib/constants";

export type LiveTrack = {
  icao24: string;
  callsign: string;
  originCountry: string;
  lon: number;
  lat: number;
  altitudeFt: number | null;
  velocityKt: number | null;
  onGround: boolean;
};

type Cache = { at: number; tracks: LiveTrack[]; error?: string; source?: string };
let cache: Cache | null = null;

const FETCH_MS = 8_000;
const CACHE_MS = 30_000;
const ERROR_CACHE_MS = 15_000;
const UA = "lipb-vfr-windows/0.1 (LIPB hangar board)";
/** High airway traffic over the Alps is not "in the ATZ / Valle Adige". */
const VALLEY_ALT_FT = 16_000;
const RADIUS_NM = 35;

type AdsbLolAircraft = {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  gs?: number;
};

export function inLiveBox(lat: number, lon: number): boolean {
  const { lamin, lamax, lomin, lomax } = OPENSKY_BBOX;
  return lat >= lamin && lat <= lamax && lon >= lomin && lon <= lomax;
}

export function mapAdsbLol(ac: AdsbLolAircraft[]): LiveTrack[] {
  return ac.flatMap((row) => {
    const lat = typeof row.lat === "number" ? row.lat : null;
    const lon = typeof row.lon === "number" ? row.lon : null;
    if (lat === null || lon === null || !inLiveBox(lat, lon)) return [];
    const onGround = row.alt_baro === "ground";
    const altitudeFt =
      onGround ? 0 : typeof row.alt_baro === "number" ? Math.round(row.alt_baro) : null;
    if (!onGround && altitudeFt !== null && altitudeFt > VALLEY_ALT_FT) return [];
    return [
      {
        icao24: String(row.hex ?? ""),
        callsign: String(row.flight ?? "").trim() || "unknown",
        originCountry: "",
        lon,
        lat,
        altitudeFt,
        velocityKt: typeof row.gs === "number" ? Math.round(row.gs) : null,
        onGround,
      },
    ];
  });
}

async function fetchAdsbLol(): Promise<LiveTrack[]> {
  const url = `https://api.adsb.lol/v2/lat/${LIPB.lat}/lon/${LIPB.lon}/dist/${RADIUS_NM}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) throw new Error(`adsb.lol HTTP ${res.status}`);
  const data = (await res.json()) as { ac?: AdsbLolAircraft[] };
  return mapAdsbLol(data.ac ?? []);
}

async function fetchOpenSky(): Promise<LiveTrack[]> {
  const { lamin, lamax, lomin, lomax } = OPENSKY_BBOX;
  const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`);
  const data = (await res.json()) as {
    states?: Array<(string | number | boolean | null)[]>;
  };
  return (data.states ?? []).flatMap((row) => {
    const lon = typeof row[5] === "number" ? row[5] : null;
    const lat = typeof row[6] === "number" ? row[6] : null;
    if (lon === null || lat === null) return [];
    const altM = typeof row[7] === "number" ? row[7] : null;
    const velMs = typeof row[9] === "number" ? row[9] : null;
    const altitudeFt = altM === null ? null : Math.round(altM * 3.28084);
    const onGround = Boolean(row[8]);
    if (!onGround && altitudeFt !== null && altitudeFt > VALLEY_ALT_FT) return [];
    return [
      {
        icao24: String(row[0] ?? ""),
        callsign: String(row[1] ?? "").trim() || "unknown",
        originCountry: String(row[2] ?? ""),
        lon,
        lat,
        altitudeFt,
        velocityKt: velMs === null ? null : Math.round(velMs * 1.94384),
        onGround,
      },
    ];
  });
}

export async function fetchLiveTraffic(): Promise<{
  tracks: LiveTrack[];
  error?: string;
  source?: string;
  fetchedAt: number;
}> {
  const ttl = cache?.error ? ERROR_CACHE_MS : CACHE_MS;
  if (cache && Date.now() - cache.at < ttl) {
    return {
      tracks: cache.tracks,
      error: cache.error,
      source: cache.source,
      fetchedAt: cache.at,
    };
  }
  const errors: string[] = [];
  for (const [source, fn] of [
    ["adsb.lol", fetchAdsbLol],
    ["OpenSky", fetchOpenSky],
  ] as const) {
    try {
      const tracks = await fn();
      cache = { at: Date.now(), tracks, source };
      return { tracks, source, fetchedAt: cache.at };
    } catch (e) {
      errors.push(
        `${source}: ${e instanceof Error ? e.message : "unavailable"}`,
      );
    }
  }
  cache = {
    at: Date.now(),
    tracks: cache?.tracks ?? [],
    error: errors.join(" · "),
    source: cache?.source,
  };
  return {
    tracks: cache.tracks,
    error: cache.error,
    source: cache.source,
    fetchedAt: cache.at,
  };
}
