import { cmsFieldText, type CmsTextField } from "@/lib/meteoam-cms";

const SIGMET_TOKEN = "751e525e64c445389043bc1cf6bc0b74";
const AIRMET_TOKEN = "f2e045c739f841179a0c9601efd7903c";
const AWC_ISIGMET_URL =
  "https://aviationweather.gov/api/data/isigmet?format=json";

export const SIGMET_SOURCE_URL = "https://www.meteoam.it/it/sigmet";
export const AIRMET_SOURCE_URL = "https://www.meteoam.it/it/airmet";

const CACHE_TTL_MS = 5 * 60_000;

/** FIRs relevant to LIPB / Alpine VFR. */
export const ALPINE_FIRS = [
  "LIMM",
  "LIRR",
  "LIBB",
  "LOVV",
  "LSAS",
  "EDMM",
  "LIPP",
] as const;

export type AdvisoryKind = "sigmet" | "airmet";

export type WxAdvisory = {
  id: string;
  kind: AdvisoryKind;
  fir: string | null;
  locationCode: string | null;
  raw: string;
  validFrom: string | null;
  validTo: string | null;
  mapUrl: string | null;
  source: "meteoam" | "awc";
  alpineRelevant: boolean;
};

export type AdvisoryBundle = {
  advisories: WxAdvisory[];
  fetchedAt: string;
  attribution: string;
  sigmetSourceUrl: string;
  airmetSourceUrl: string;
  error?: string;
};

type CmsItem = {
  id?: string;
  name?: string;
  fields?: {
    date?: { value?: string };
    startdate?: { value?: string };
    enddate?: { value?: string };
    location?: string;
    body?: CmsTextField;
    mapimage?: { id?: string };
  };
};

type AwcISigmet = {
  icaoId?: string;
  firId?: string;
  firName?: string;
  validTimeFrom?: number;
  validTimeTo?: number;
  hazard?: string;
  qualifier?: string;
  rawSigmet?: string;
  seriesId?: string;
};

const cache = new Map<string, { at: number; value: AdvisoryBundle }>();

async function cached(
  key: string,
  ttlMs: number,
  fn: () => Promise<AdvisoryBundle>,
): Promise<AdvisoryBundle> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function meteoamMapUrl(
  assetId: string | undefined,
  channelToken: string,
): string | null {
  if (!assetId) return null;
  return (
    `https://cm.meteoam.it/content/published/api/v1.1/assets/${assetId}/native` +
    `?channelToken=${channelToken}`
  );
}

export function extractFir(raw: string): string | null {
  const m = raw.match(/\b(LI[MRB][MBR]|LOVV|LSAS|EDMM|LIPP)\b/);
  return m ? m[1] : null;
}

export function isAlpineFir(fir: string | null): boolean {
  if (!fir) return false;
  return (ALPINE_FIRS as readonly string[]).includes(fir);
}

export function isAdvisoryValidNow(
  validFrom: string | null,
  validTo: string | null,
  now: Date,
): boolean {
  const t = now.getTime();
  if (validTo) {
    const end = new Date(validTo).getTime();
    if (Number.isFinite(end) && t > end) return false;
  }
  if (validFrom) {
    const start = new Date(validFrom).getTime();
    if (Number.isFinite(start) && t < start - 5 * 60_000) return false;
  }
  // If only end is missing, treat as not confidently valid.
  return Boolean(validTo);
}

function itemsUrl(token: string): string {
  return (
    `https://cm.meteoam.it/content/published/api/v1.1/items?channelToken=${token}` +
    `&fields=all&limit=12&orderBy=fields.date:desc`
  );
}

function fromCmsItem(
  item: CmsItem,
  kind: AdvisoryKind,
  token: string,
): WxAdvisory | null {
  const body = cmsFieldText(item.fields?.body);
  if (!body || !item.id) return null;
  const raw = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const fir = extractFir(raw);
  return {
    id: `${kind}-${item.id}`,
    kind,
    fir,
    locationCode: item.fields?.location ?? null,
    raw: raw.trim(),
    validFrom: item.fields?.startdate?.value ?? null,
    validTo: item.fields?.enddate?.value ?? null,
    mapUrl: meteoamMapUrl(item.fields?.mapimage?.id, token),
    source: "meteoam",
    alpineRelevant: isAlpineFir(fir) || /LIMM|MILANO/i.test(raw),
  };
}

function fromAwc(item: AwcISigmet, index: number): WxAdvisory | null {
  const raw = item.rawSigmet?.trim();
  if (!raw || !item.firId) return null;
  if (!isAlpineFir(item.firId)) return null;
  const validFrom =
    item.validTimeFrom != null
      ? new Date(item.validTimeFrom * 1000).toISOString()
      : null;
  const validTo =
    item.validTimeTo != null
      ? new Date(item.validTimeTo * 1000).toISOString()
      : null;
  return {
    id: `awc-${item.firId}-${item.seriesId ?? index}`,
    kind: "sigmet",
    fir: item.firId,
    locationCode: item.icaoId ?? null,
    raw,
    validFrom,
    validTo,
    mapUrl: null,
    source: "awc",
    alpineRelevant: true,
  };
}

async function fetchCmsKind(
  kind: AdvisoryKind,
  token: string,
): Promise<WxAdvisory[]> {
  const res = await fetch(itemsUrl(token), {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`MeteoAM ${kind} HTTP ${res.status}`);
  const data = (await res.json()) as { items?: CmsItem[] };
  return (data.items ?? [])
    .map((it) => fromCmsItem(it, kind, token))
    .filter((a): a is WxAdvisory => a != null);
}

async function fetchAwcAlpineSigmets(): Promise<WxAdvisory[]> {
  const res = await fetch(AWC_ISIGMET_URL, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
  });
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`AWC isigmet HTTP ${res.status}`);
  const data = (await res.json()) as AwcISigmet[];
  if (!Array.isArray(data)) return [];
  return data
    .map((it, i) => fromAwc(it, i))
    .filter((a): a is WxAdvisory => a != null);
}

export function selectActiveAdvisories(
  all: WxAdvisory[],
  now: Date,
): WxAdvisory[] {
  const active = all.filter((a) =>
    isAdvisoryValidNow(a.validFrom, a.validTo, now),
  );
  // Prefer alpine-relevant, then SIGMET over AIRMET, then newest end.
  return active.sort((a, b) => {
    if (a.alpineRelevant !== b.alpineRelevant) {
      return a.alpineRelevant ? -1 : 1;
    }
    if (a.kind !== b.kind) return a.kind === "sigmet" ? -1 : 1;
    const ae = a.validTo ? new Date(a.validTo).getTime() : 0;
    const be = b.validTo ? new Date(b.validTo).getTime() : 0;
    return be - ae;
  });
}

export async function fetchAdvisories(
  now = new Date(),
): Promise<AdvisoryBundle> {
  return cached("wx-advisories", CACHE_TTL_MS, async () => {
    const fetchedAt = now.toISOString();
    const attribution =
      "SIGMET/AIRMET © Servizio Meteorologico AM · AWC international SIGMETs";
    const errors: string[] = [];
    const collected: WxAdvisory[] = [];

    const results = await Promise.allSettled([
      fetchCmsKind("sigmet", SIGMET_TOKEN),
      fetchCmsKind("airmet", AIRMET_TOKEN),
      fetchAwcAlpineSigmets(),
    ]);

    for (const r of results) {
      if (r.status === "fulfilled") collected.push(...r.value);
      else {
        errors.push(
          r.reason instanceof Error ? r.reason.message : "fetch failed",
        );
      }
    }

    const advisories = selectActiveAdvisories(collected, now);
    return {
      advisories,
      fetchedAt,
      attribution,
      sigmetSourceUrl: SIGMET_SOURCE_URL,
      airmetSourceUrl: AIRMET_SOURCE_URL,
      error:
        advisories.length === 0 && errors.length > 0
          ? errors.join("; ")
          : undefined,
    };
  });
}
