const CHANNEL_TOKEN = "98b13e8e1bae4b9baf957b0062164421";
const ITEMS_URL =
  `https://cm.meteoam.it/content/published/api/v1.1/items` +
  `?channelToken=${CHANNEL_TOKEN}&fields=all&limit=24&orderBy=fields.date:desc`;
const SOURCE_URL = "https://www.meteoam.it/it/swll";
const CACHE_TTL_MS = 20 * 60_000;
const MAX_CHARTS = 4;
/** Chart is bold/valid within VT ±3 h on the MeteoAM page. */
export const SWLL_VALIDITY_HALF_MS = 3 * 60 * 60_000;

export type SwllChart = {
  id: string;
  /** Preferred display URL (JPG/WebP when available). */
  url: string;
  /** Native GIF (or same as url) for open-in-new-tab. */
  nativeUrl: string;
  /** Validity time (VT) from CMS forecastdate / date. */
  validAt: string;
  name: string;
};

export type SwllBundle = {
  charts: SwllChart[];
  fetchedAt: string;
  attribution: string;
  sourceUrl: string;
  error?: string;
};

type CmsLink = { href?: string };

type CmsRendition = {
  name?: string;
  formats?: Array<{
    format?: string;
    links?: CmsLink[];
  }>;
};

type CmsItem = {
  id?: string;
  name?: string;
  fields?: {
    date?: { value?: string };
    forecastdate?: { value?: string };
    native?: { links?: CmsLink[] };
    renditions?: CmsRendition[];
  };
};

type CmsItemsResponse = {
  items?: CmsItem[];
};

const cache = new Map<string, { at: number; value: SwllBundle }>();

async function cached(
  key: string,
  ttlMs: number,
  fn: () => Promise<SwllBundle>,
): Promise<SwllBundle> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** True for MeteoAM CNMC fax low-level SIGWX charts (not WAIY advisories). */
export function isSwllChartName(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.toUpperCase();
  return n.includes("CNMC_FAX") && n.includes("ITALIA_SW");
}

export function isSwllValidAt(validAt: Date, now: Date): boolean {
  const delta = Math.abs(now.getTime() - validAt.getTime());
  return delta <= SWLL_VALIDITY_HALF_MS;
}

function firstHref(links: CmsLink[] | undefined): string | null {
  const href = links?.[0]?.href;
  return href && href.length > 0 ? href : null;
}

/**
 * Prefer Large/Medium WebP then JPG; fall back to native GIF.
 * Rendition order matches typical CMS gallery sizing.
 */
export function pickSwllImageUrl(item: CmsItem): {
  url: string;
  nativeUrl: string;
} | null {
  const nativeUrl = firstHref(item.fields?.native?.links);
  if (!nativeUrl) return null;

  const renditions = item.fields?.renditions ?? [];
  const preferredNames = ["Large", "Medium"];
  const preferredFormats = ["webp", "jpg", "jpeg"];

  for (const name of preferredNames) {
    const rendition = renditions.find(
      (r) => (r.name ?? "").toLowerCase() === name.toLowerCase(),
    );
    if (!rendition?.formats) continue;
    for (const fmt of preferredFormats) {
      const format = rendition.formats.find(
        (f) => (f.format ?? "").toLowerCase() === fmt,
      );
      const href = firstHref(format?.links);
      if (href) return { url: href, nativeUrl };
    }
  }

  return { url: nativeUrl, nativeUrl };
}

export function chartsFromCmsItems(items: CmsItem[]): SwllChart[] {
  const charts: SwllChart[] = [];
  for (const item of items) {
    if (!isSwllChartName(item.name)) continue;
    const urls = pickSwllImageUrl(item);
    if (!urls || !item.id) continue;
    const validRaw =
      item.fields?.forecastdate?.value ?? item.fields?.date?.value;
    if (!validRaw) continue;
    const validAt = new Date(validRaw);
    if (Number.isNaN(validAt.getTime())) continue;
    charts.push({
      id: item.id,
      url: urls.url,
      nativeUrl: urls.nativeUrl,
      validAt: validAt.toISOString(),
      name: item.name ?? item.id,
    });
  }
  charts.sort(
    (a, b) => new Date(b.validAt).getTime() - new Date(a.validAt).getTime(),
  );
  return charts.slice(0, MAX_CHARTS);
}

export async function fetchSwll(now = new Date()): Promise<SwllBundle> {
  return cached("swll", CACHE_TTL_MS, async () => {
    const fetchedAt = now.toISOString();
    const attribution = "SWLL © Servizio Meteorologico AM";
    try {
      const res = await fetch(ITEMS_URL, {
        headers: { Accept: "application/json" },
        next: { revalidate: 1200 },
      });
      if (!res.ok) {
        return {
          charts: [],
          fetchedAt,
          attribution,
          sourceUrl: SOURCE_URL,
          error: `MeteoAM CMS HTTP ${res.status}`,
        };
      }
      const data = (await res.json()) as CmsItemsResponse;
      const charts = chartsFromCmsItems(data.items ?? []);
      if (charts.length === 0) {
        return {
          charts: [],
          fetchedAt,
          attribution,
          sourceUrl: SOURCE_URL,
          error: "No SWLL charts in MeteoAM gallery",
        };
      }
      return {
        charts,
        fetchedAt,
        attribution,
        sourceUrl: SOURCE_URL,
      };
    } catch (error) {
      return {
        charts: [],
        fetchedAt,
        attribution,
        sourceUrl: SOURCE_URL,
        error: error instanceof Error ? error.message : "SWLL unavailable",
      };
    }
  });
}
