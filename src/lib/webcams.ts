/** Curated Bolzano-valley and alpine webcams via Open Data Hub WebcamInfo. */

export type WebcamGroup = "valley" | "alpine";

export type WebcamConfig = {
  id: string;
  /** Open Data Hub WebcamInfo id */
  odhId: string;
  name: string;
  elevM: number | null;
  group: WebcamGroup;
  /** Optional still URL if ODH has no ImageGallery */
  stillFallback?: string;
  /** Optional link-out if ODH Webcamurl is missing */
  linkFallback?: string;
};

export type WebcamReading = {
  id: string;
  name: string;
  elevM: number | null;
  group: WebcamGroup;
  stillUrl: string | null;
  linkUrl: string | null;
  error?: string;
};

export type WebcamBundle = {
  cams: WebcamReading[];
  fetchedAt: string;
  error?: string;
};

export const WEBCAM_CONFIG: WebcamConfig[] = [
  {
    id: "a22-bolzano-nord",
    odhId: "A22_77",
    name: "A22 Bolzano Nord",
    elevM: 260,
    group: "valley",
    stillFallback: "https://www.autobrennero.it/WebCamImg/km77.jpg",
  },
  {
    id: "kohlererbahn",
    odhId: "FERATEL_A66B1B19-E418-4F20-904A-69E22D93F02C_6259",
    name: "Kohlererbahn",
    elevM: 1130,
    group: "valley",
  },
  {
    id: "stadt-hotel-citta",
    odhId: "FERATEL_A66B1B19-E418-4F20-904A-69E22D93F02C_6257",
    name: "Bozen Zentrum",
    elevM: 265,
    group: "valley",
  },
  {
    id: "puflatsch",
    odhId: "FERATEL_70EE0BAF-A832-4414-84E9-49DE5F2A0FDB_6216",
    name: "Puflatsch",
    elevM: 2100,
    group: "alpine",
  },
  {
    id: "voels-panocam",
    odhId: "DSS_185068",
    name: "Völs am Schlern",
    elevM: 2050,
    group: "alpine",
    stillFallback: "https://voels.it-wms.com/panorama1.jpg",
  },
  {
    id: "kreuztal",
    odhId: "FERATEL_E744C0BE-36D7-4721-9514-B7040065CD99_6060",
    name: "Kreuztal / Plose",
    elevM: 2060,
    group: "alpine",
  },
  {
    id: "seceda",
    odhId: "DSS_6593501",
    name: "Seceda",
    elevM: 2450,
    group: "alpine",
    stillFallback: "https://panodata2.panomax.com/cams/1044/recent_reduced.jpg",
  },
  {
    id: "rittner-horn",
    odhId: "",
    name: "Rittner Horn",
    elevM: 2260,
    group: "alpine",
    stillFallback: "https://www.foto-webcam.eu/webcam/rittnerhorn/current/180.jpg",
    linkFallback: "https://www.foto-webcam.eu/webcam/rittnerhorn/",
  },
];

const ODH_BASE = "https://tourism.api.opendatahub.com/v1/WebcamInfo";
const CACHE_TTL_MS = 8 * 60_000;

type CacheEntry<T> = { at: number; value: T };
const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

type OdhWebcam = {
  Id?: string;
  Shortname?: string;
  Webcamurl?: string | null;
  Imageurl?: string | null;
  Streamurl?: string | null;
  ImageGallery?: Array<{ ImageUrl?: string | null }> | null;
  GpsInfo?: Array<{ Altitude?: number | null }> | null;
  Active?: boolean;
};

const IMAGE_EXT = /\.(jpe?g|png|webp|gif)(\?|$)/i;

export function isLikelyImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (IMAGE_EXT.test(url)) return true;
  if (/thumbnails?|panorama|current|recent_reduced|WebCamImg|smthumb/i.test(url)) {
    return true;
  }
  return false;
}

export function resolveStillUrl(
  odh: OdhWebcam | null,
  cfg: WebcamConfig,
): string | null {
  const gallery = odh?.ImageGallery?.find((g) => g.ImageUrl)?.ImageUrl ?? null;
  if (gallery && isLikelyImageUrl(gallery)) return gallery;
  if (odh?.Imageurl && isLikelyImageUrl(odh.Imageurl)) return odh.Imageurl;
  if (odh?.Webcamurl && isLikelyImageUrl(odh.Webcamurl)) return odh.Webcamurl;
  return cfg.stillFallback ?? null;
}

export function resolveLinkUrl(
  odh: OdhWebcam | null,
  cfg: WebcamConfig,
  stillUrl: string | null,
): string | null {
  if (odh?.Webcamurl) return odh.Webcamurl;
  if (cfg.linkFallback) return cfg.linkFallback;
  return stillUrl;
}

export function withCacheBust(url: string, fetchedAt: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${encodeURIComponent(fetchedAt)}`;
}

async function fetchOdhWebcam(odhId: string): Promise<OdhWebcam | null> {
  if (!odhId) return null;
  const res = await fetch(`${ODH_BASE}/${encodeURIComponent(odhId)}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 600 },
  });
  if (!res.ok) return null;
  return (await res.json()) as OdhWebcam;
}

async function fetchOne(cfg: WebcamConfig): Promise<WebcamReading> {
  try {
    const odh = cfg.odhId ? await fetchOdhWebcam(cfg.odhId) : null;
    const stillUrl = resolveStillUrl(odh, cfg);
    const linkUrl = resolveLinkUrl(odh, cfg, stillUrl);
    const elevFromOdh = odh?.GpsInfo?.find((g) => g.Altitude != null)?.Altitude;
    if (!stillUrl && !linkUrl) {
      return {
        id: cfg.id,
        name: cfg.name,
        elevM: cfg.elevM,
        group: cfg.group,
        stillUrl: null,
        linkUrl: null,
        error: "No image URL",
      };
    }
    return {
      id: cfg.id,
      name: odh?.Shortname?.trim() || cfg.name,
      elevM: elevFromOdh ?? cfg.elevM,
      group: cfg.group,
      stillUrl,
      linkUrl,
    };
  } catch (error) {
    return {
      id: cfg.id,
      name: cfg.name,
      elevM: cfg.elevM,
      group: cfg.group,
      stillUrl: cfg.stillFallback ?? null,
      linkUrl: cfg.linkFallback ?? cfg.stillFallback ?? null,
      error: error instanceof Error ? error.message : "Webcam unavailable",
    };
  }
}

export async function fetchWebcams(now = new Date()): Promise<WebcamBundle> {
  return cached("webcams", CACHE_TTL_MS, async () => {
    const fetchedAt = now.toISOString();
    try {
      const cams = await Promise.all(WEBCAM_CONFIG.map((cfg) => fetchOne(cfg)));
      const ok = cams.filter((c) => c.stillUrl || c.linkUrl);
      return {
        cams,
        fetchedAt,
        error: ok.length === 0 ? "No webcams available" : undefined,
      };
    } catch (error) {
      return {
        cams: WEBCAM_CONFIG.map((cfg) => ({
          id: cfg.id,
          name: cfg.name,
          elevM: cfg.elevM,
          group: cfg.group,
          stillUrl: cfg.stillFallback ?? null,
          linkUrl: cfg.linkFallback ?? cfg.stillFallback ?? null,
          error: error instanceof Error ? error.message : "Webcams unavailable",
        })),
        fetchedAt,
        error: error instanceof Error ? error.message : "Webcams unavailable",
      };
    }
  });
}
