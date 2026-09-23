const CHANNEL_TOKEN = "8f518df69fcf4a51962113b025440251";
const ITEMS_URL =
  `https://cm.meteoam.it/content/published/api/v1.1/items` +
  `?channelToken=${CHANNEL_TOKEN}&fields=all&limit=4&orderBy=fields.date:desc`;
export const ITALY_GAFOR_SOURCE_URL = "https://www.meteoam.it/it/gafor";
const CACHE_TTL_MS = 15 * 60_000;

/** Northern Alpine zone — typically covers Alto Adige / Dolomites on Italian GAFOR maps. */
export const ITALY_GAFOR_ALPINE_ZONE = 13;

export type GaforCategory = "O" | "D" | "M" | "X";

export type ItalyGaforZoneEntry = {
  zones: number[];
  /** Raw zone token(s), e.g. "8/9" or "13". */
  zoneLabel: string;
  category: GaforCategory;
  /** Optional K subcategory digit after O/D/M/X. */
  k: number | null;
  remarks: string | null;
};

export type ItalyGaforBulletin = {
  raw: string;
  issuedAt: string | null;
  /** Validity window start/end as UTC ISO (date from issue day). */
  validFrom: string | null;
  validTo: string | null;
  /** HHMM period codes from the GAFOR header (e.g. 0612). */
  periodCode: string | null;
  entries: ItalyGaforZoneEntry[];
  alpine: ItalyGaforZoneEntry | null;
};

export type ItalyGaforBundle = {
  bulletin: ItalyGaforBulletin | null;
  fetchedAt: string;
  attribution: string;
  sourceUrl: string;
  error?: string;
};

type CmsItem = {
  name?: string;
  fields?: {
    date?: { value?: string };
    body?: string;
  };
};

const cache = new Map<string, { at: number; value: ItalyGaforBundle }>();

async function cached(
  key: string,
  ttlMs: number,
  fn: () => Promise<ItalyGaforBundle>,
): Promise<ItalyGaforBundle> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function expandZoneToken(token: string): number[] {
  const t = token.trim().toUpperCase().replace(/[NS]$/, "");
  const range = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(t);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a > b || b > 20) {
      return [];
    }
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  const single = /^(\d{1,2})$/.exec(t);
  if (single) {
    const n = Number(single[1]);
    return Number.isFinite(n) && n >= 1 && n <= 20 ? [n] : [];
  }
  return [];
}

export function parseZoneList(raw: string): { zones: number[]; label: string } {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const zones = parts.flatMap(expandZoneToken);
  return { zones: [...new Set(zones)].sort((a, b) => a - b), label: raw.trim() };
}

/**
 * Parse an FBIY61 / GAFOR LIIB bulletin body into zone entries.
 * Example line: `BBBB   8/9          O ISOL D3 TSRA SHRA`
 */
export function parseItalyGaforBody(
  body: string,
  issuedAtIso: string | null = null,
): ItalyGaforBulletin {
  const raw = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let periodCode: string | null = null;
  const periodMatch = raw.match(/\bGAFOR\s+LIIB\s+(\d{4})\b/i);
  if (periodMatch) periodCode = periodMatch[1];

  let issuedAt = issuedAtIso;
  const header = raw.match(/\bFBIY61\s+LIIB\s+(\d{2})(\d{2})(\d{2})\b/i);
  if (header && !issuedAt) {
    const day = Number(header[1]);
    const hour = Number(header[2]);
    const min = Number(header[3]);
    const now = new Date();
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hour, min, 0),
    );
    issuedAt = d.toISOString();
  }

  let validFrom: string | null = null;
  let validTo: string | null = null;
  if (periodCode && issuedAt) {
    const base = new Date(issuedAt);
    const fromH = Number(periodCode.slice(0, 2));
    const toH = Number(periodCode.slice(2, 4));
    const y = base.getUTCFullYear();
    const m = base.getUTCMonth();
    const day = base.getUTCDate();
    validFrom = new Date(Date.UTC(y, m, day, fromH, 0, 0)).toISOString();
    // Period end is exclusive clock hour; treat as that UTC hour.
    let endDay = day;
    let endH = toH;
    if (toH <= fromH) {
      endDay = day + 1;
    }
    validTo = new Date(Date.UTC(y, m, endDay, endH, 0, 0)).toISOString();
  }

  const entries: ItalyGaforZoneEntry[] = [];
  for (const line of lines) {
    if (/^FBIY61\b/i.test(line) || /^GAFOR\b/i.test(line)) continue;
    const cleaned = line.replace(/=\s*$/, "").trim();
    const m =
      /^(?:[A-Z]{2,4}\s+)?(.+?)\s+([ODMX])(\d)?(?:\s+(.*))?$/i.exec(cleaned);
    if (!m) continue;
    const { zones, label } = parseZoneList(m[1]);
    if (zones.length === 0) continue;
    const category = m[2].toUpperCase() as GaforCategory;
    const k = m[3] ? Number(m[3]) : null;
    const remarks = m[4]?.trim() ? m[4].trim() : null;
    entries.push({ zones, zoneLabel: label, category, k, remarks });
  }

  const alpine =
    entries.find((e) => e.zones.includes(ITALY_GAFOR_ALPINE_ZONE)) ?? null;

  return {
    raw,
    issuedAt,
    validFrom,
    validTo,
    periodCode,
    entries,
    alpine,
  };
}

export function categoryLabel(cat: GaforCategory): string {
  switch (cat) {
    case "O":
      return "Open";
    case "D":
      return "Difficult";
    case "M":
      return "Marginal";
    case "X":
      return "Closed";
  }
}

export async function fetchItalyGafor(
  now = new Date(),
): Promise<ItalyGaforBundle> {
  return cached("italy-gafor", CACHE_TTL_MS, async () => {
    const fetchedAt = now.toISOString();
    const attribution = "GAFOR IT © Servizio Meteorologico AM";
    try {
      const res = await fetch(ITEMS_URL, {
        headers: { Accept: "application/json" },
        next: { revalidate: 900 },
      });
      if (!res.ok) {
        return {
          bulletin: null,
          fetchedAt,
          attribution,
          sourceUrl: ITALY_GAFOR_SOURCE_URL,
          error: `MeteoAM GAFOR HTTP ${res.status}`,
        };
      }
      const data = (await res.json()) as { items?: CmsItem[] };
      const item = (data.items ?? []).find(
        (it) =>
          typeof it.fields?.body === "string" &&
          /FBIY61|GAFOR/i.test(it.fields.body),
      );
      if (!item?.fields?.body) {
        return {
          bulletin: null,
          fetchedAt,
          attribution,
          sourceUrl: ITALY_GAFOR_SOURCE_URL,
          error: "No Italy GAFOR bulletin in MeteoAM gallery",
        };
      }
      const bulletin = parseItalyGaforBody(
        item.fields.body,
        item.fields.date?.value ?? null,
      );
      if (bulletin.entries.length === 0) {
        return {
          bulletin,
          fetchedAt,
          attribution,
          sourceUrl: ITALY_GAFOR_SOURCE_URL,
          error: "Could not parse GAFOR zone lines",
        };
      }
      return {
        bulletin,
        fetchedAt,
        attribution,
        sourceUrl: ITALY_GAFOR_SOURCE_URL,
      };
    } catch (error) {
      return {
        bulletin: null,
        fetchedAt,
        attribution,
        sourceUrl: ITALY_GAFOR_SOURCE_URL,
        error:
          error instanceof Error ? error.message : "Italy GAFOR unavailable",
      };
    }
  });
}
