import { OPENSKY_BBOX } from "@/lib/constants";

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

type Cache = { at: number; tracks: LiveTrack[]; error?: string };
let cache: Cache | null = null;

export async function fetchLiveTraffic(): Promise<{
  tracks: LiveTrack[];
  error?: string;
  fetchedAt: number;
}> {
  if (cache && Date.now() - cache.at < 30_000) {
    return { tracks: cache.tracks, error: cache.error, fetchedAt: cache.at };
  }
  const { lamin, lamax, lomin, lomax } = OPENSKY_BBOX;
  const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      cache = { at: Date.now(), tracks: cache?.tracks ?? [], error: `OpenSky HTTP ${res.status}` };
      return { tracks: cache.tracks, error: cache.error, fetchedAt: cache.at };
    }
    const data = (await res.json()) as {
      states?: Array<(string | number | boolean | null)[]>;
    };
    const tracks: LiveTrack[] = (data.states ?? []).flatMap((row) => {
      const lon = typeof row[5] === "number" ? row[5] : null;
      const lat = typeof row[6] === "number" ? row[6] : null;
      if (lon === null || lat === null) return [];
      const altM = typeof row[7] === "number" ? row[7] : null;
      const velMs = typeof row[9] === "number" ? row[9] : null;
      return [
        {
          icao24: String(row[0] ?? ""),
          callsign: String(row[1] ?? "").trim() || "unknown",
          originCountry: String(row[2] ?? ""),
          lon,
          lat,
          altitudeFt: altM === null ? null : Math.round(altM * 3.28084),
          velocityKt: velMs === null ? null : Math.round(velMs * 1.94384),
          onGround: Boolean(row[8]),
        },
      ];
    });
    cache = { at: Date.now(), tracks };
    return { tracks, fetchedAt: cache.at };
  } catch (error) {
    cache = {
      at: Date.now(),
      tracks: cache?.tracks ?? [],
      error: error instanceof Error ? error.message : "OpenSky unavailable",
    };
    return { tracks: cache.tracks, error: cache.error, fetchedAt: cache.at };
  }
}
