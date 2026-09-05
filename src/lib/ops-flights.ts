import type {
  Movement,
  MovementDirection,
  MovementStatus,
} from "@/lib/occupancy";
import {
  addLocalDays,
  formatLocalDate,
  fromZonedLocal,
  isoWeekday,
} from "@/lib/time";

export { isLiveMovement } from "@/lib/occupancy";

const CACHE_MS = 3 * 60_000;
const FETCH_MS = 12_000;
const MATCH_MS = 3 * 60 * 60_000;
const AIRPORT_MATCH_MS = 90 * 60_000;

const FA_PAGE =
  process.env.FLIGHTAWARE_LIPB_URL ??
  "https://r.jina.ai/http://www.flightaware.com/live/airport/LIPB";

const IFR_TYPES = new Set([
  "A319",
  "A320",
  "A321",
  "AT72",
  "AT75",
  "B738",
  "BE20",
  "BE40",
  "C25A",
  "C25B",
  "C25C",
  "C56X",
  "C68A",
  "C700",
  "CL30",
  "CL35",
  "CL60",
  "CRJ2",
  "DH4",
  "DH8B",
  "DH8D",
  "E55P",
  "E55L",
  "FA7X",
  "GALX",
  "GLEX",
  "GL5T",
  "GLF4",
  "GLF5",
  "GLF6",
  "H25B",
  "LJ45",
  "LJ60",
  "PC12",
  "PC24",
  "TBM7",
  "TBM8",
  "TBM9",
]);

const OPERATORS: [string, string][] = [
  ["SWU", "SkyAlps"],
  ["NJE", "NetJets"],
  ["GDK", "Goldeck-Flug"],
  ["TJD", "Aliserio"],
  ["JFA", "Jetfly"],
  ["IAM", "Aeronautica Militare"],
  ["TGZ", "Georgian Airways"],
  ["BQ", "SkyAlps"],
  ["BN", "Luxwing"],
  ["A9", "Georgian Airways"],
];

const CITY_ALIAS: Record<string, string> = {
  BDS: "Brindisi",
  OLB: "Olbia",
  PVK: "Preveza",
  CAG: "Cagliari",
  SUF: "Lamezia Terme",
  BER: "Berlin",
  NAP: "Naples",
  LGW: "London Gatwick",
  DUS: "Düsseldorf",
  HAM: "Hamburg",
  CTA: "Catania",
  LIN: "Milan",
  CIA: "Rome Ciampino",
  FRA: "Frankfurt",
  TBS: "Tbilisi",
  LOAN: "Wiener Neustadt",
  QEW: "Wiener Neustadt",
  ANR: "Antwerp",
  IBZ: "Ibiza",
  CFU: "Corfu",
  MAH: "Menorca",
};

const SKIP_CALLSIGN = /^(FIAMM|VOLP)/i;
const AIRLINE_IDENT = /^[A-Z]{2,3}\d{2,4}[A-Z]?$/;
const REGISTRATION = /^[A-Z]{1,2}-[A-Z0-9]{3,5}$|^T7-[A-Z0-9]+$/i;

export type OpsBundle = {
  movements: Movement[];
  source: "flightaware" | "none";
  fetchedAt: string;
  error?: string;
};

type Cache = { at: number; bundle: OpsBundle };
let cache: Cache | null = null;

type ParsedClock = {
  hm: string;
  estimated: boolean;
  weekday: string | null;
};

type AirportCell = {
  city: string;
  icao: string;
  iata: string;
};

type RawOps = {
  ident: string;
  display: string;
  direction: MovementDirection;
  other: AirportCell;
  hm: string;
  dateLocal: string;
  estimated: boolean;
  aircraft: string;
  section: string;
};

export function canonicalIdent(raw: string): string {
  const ident = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (ident.startsWith("SWU") && /^\d/.test(ident.slice(3))) {
    return `BQ${ident.slice(3)}`;
  }
  if (ident.startsWith("TGZ") && /^\d/.test(ident.slice(3))) {
    return `A9${ident.slice(3)}`;
  }
  return ident;
}

export function displayIdent(raw: string): string {
  return canonicalIdent(raw);
}

export function operatorFor(ident: string): string | undefined {
  const up = ident.toUpperCase();
  for (const [prefix, name] of OPERATORS) {
    if (up.startsWith(prefix) && /[0-9]/.test(up.slice(prefix.length, prefix.length + 1))) {
      return name;
    }
  }
  return undefined;
}

function splitRow(line: string): string[] {
  const parts = line.split("|").map((cell) => cell.trim());
  if (parts[0] === "") parts.shift();
  if (parts.at(-1) === "") parts.pop();
  return parts;
}

function stripMd(value: string): string {
  return value
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[_*`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIdent(cell: string): { ident: string; href: string } | null {
  const link = cell.match(/\[([^\]]+)\]\(([^)]+)\)/);
  const raw = (link?.[1] ?? stripMd(cell)).split("/")[0]?.trim() ?? "";
  const ident = raw.replace(/\s+/g, "").toUpperCase();
  if (!ident || ident === "IDENT" || ident.length < 3) return null;
  return { ident, href: link?.[2] ?? "" };
}

function parseType(cell: string): string {
  const link = cell.match(/\/aircrafttype\/([A-Z0-9]+)/i);
  if (link) return link[1].toUpperCase();
  const text = stripMd(cell).split(/\s+/)[0] ?? "";
  return /^[A-Z0-9]{2,4}$/.test(text) ? text : "";
}

function parseAirportCell(cell: string): AirportCell {
  const icaoFromUrl = cell.match(/\/airport\/([A-Z]{4})/i)?.[1]?.toUpperCase() ?? "";
  const codes = cell.match(
    /\(\[([A-Z]{3,4})(?:\s*\/\s*([A-Z]{4}))?\]/i,
  );
  let iata = "";
  let icao = icaoFromUrl;
  if (codes) {
    const first = codes[1].toUpperCase();
    const second = codes[2]?.toUpperCase();
    if (first.length === 4) icao = icao || first;
    if (first.length === 3) iata = first;
    if (second) icao = icao || second;
  }
  const city = stripMd(cell)
    .replace(/\(([A-Z]{3,4})(?:\s*\/\s*[A-Z]{4})?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { city, icao, iata };
}

function historyDate(href: string): string | null {
  const m = href.match(/\/history\/(\d{8})\//);
  if (!m) return null;
  const raw = m[1];
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

export function parseFaClock(raw: string): ParsedClock | null {
  const estimated = /_/.test(raw) || raw.includes("([?]");
  const cleaned = stripMd(raw).replace(/\(\[.*?\]\([^)]*\)\)/g, "").trim();
  if (!cleaned) return null;
  const m = cleaned.match(
    /(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+)?(\d{1,2}):(\d{2})\s*([ap]m?)?(?:\s+([A-Z]{2,4}|[+\-]\d{2}))?/i,
  );
  if (!m) return null;
  let hour = Number(m[2]);
  const minute = Number(m[3]);
  const ampm = m[4]?.toLowerCase();
  if (ampm) {
    const pm = ampm.startsWith("p");
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  }
  if (hour > 23 || minute > 59) return null;
  return {
    hm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    estimated,
    weekday: m[1] ? m[1].slice(0, 3) : null,
  };
}

function alignToWeekday(dateLocal: string, weekday: string): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const want = names.findIndex(
    (n) => n.toLowerCase() === weekday.slice(0, 3).toLowerCase(),
  );
  if (want < 0) return dateLocal;
  const currentIso = isoWeekday(dateLocal);
  const currentJs = currentIso === 7 ? 0 : currentIso;
  let delta = want - currentJs;
  if (delta < -3) delta += 7;
  if (delta > 3) delta -= 7;
  return delta === 0 ? dateLocal : addLocalDays(dateLocal, delta);
}

function lipbDate(
  hist: string | null,
  clock: ParsedClock,
  direction: MovementDirection,
): string {
  let dateLocal = hist ?? formatLocalDate(new Date());
  if (clock.weekday) {
    return alignToWeekday(dateLocal, clock.weekday);
  }
  const hour = Number(clock.hm.slice(0, 2));
  if (direction === "arrival" && hour < 5) {
    return addLocalDays(dateLocal, 1);
  }
  return dateLocal;
}

function otherCode(other: AirportCell): string {
  if (other.iata) return other.iata;
  if (other.icao && other.icao !== "LIPB") return other.icao;
  return other.icao || "ZZZZ";
}

function isLocalCircuit(other: AirportCell): boolean {
  return other.icao === "LIPB" || other.iata === "BZO" || /bolzano dolomiti/i.test(other.city);
}

function isNearBolzano(other: AirportCell): boolean {
  return /near bolzano/i.test(other.city);
}

function keepRaw(row: RawOps): boolean {
  if (SKIP_CALLSIGN.test(row.ident)) return false;
  if (isLocalCircuit(row.other)) return false;
  if (isNearBolzano(row.other)) return false;
  const hasAirport = Boolean(row.other.icao || row.other.iata);
  const nearSomewhere = /^near /i.test(row.other.city);
  if (!hasAirport && !row.other.city) return false;
  if (REGISTRATION.test(row.ident) && !IFR_TYPES.has(row.aircraft) && !hasAirport) {
    return false;
  }
  if (nearSomewhere && !IFR_TYPES.has(row.aircraft) && !AIRLINE_IDENT.test(row.ident)) {
    return false;
  }
  if (hasAirport || IFR_TYPES.has(row.aircraft) || AIRLINE_IDENT.test(row.ident)) {
    return true;
  }
  return false;
}

function statusFor(
  section: string,
  estimated: boolean,
  dateLocal: string,
  now = new Date(),
): MovementStatus {
  const today = formatLocalDate(now);
  if (dateLocal > today) return estimated ? "estimated" : "scheduled";
  if (section === "scheduled") return "scheduled";
  if (section === "enroute") return estimated ? "estimated" : "enroute";
  if (estimated) return "estimated";
  return section === "arrival" ? "arrived" : "departed";
}

function sectionOf(title: string): { direction: MovementDirection; kind: string } | null {
  const t = title.toLowerCase();
  if (t.includes("scheduled departure")) return { direction: "departure", kind: "scheduled" };
  if (t.includes("en route") || t.includes("scheduled to")) {
    return { direction: "arrival", kind: "enroute" };
  }
  if (t.includes("arrival")) return { direction: "arrival", kind: "arrival" };
  if (t.includes("departure")) return { direction: "departure", kind: "departure" };
  return null;
}

function pickClock(
  direction: MovementDirection,
  depart: ParsedClock | null,
  arrive: ParsedClock | null,
): ParsedClock | null {
  if (direction === "arrival") return arrive ?? depart;
  return depart ?? arrive;
}

function parseTableSection(block: string, title: string): RawOps[] {
  const section = sectionOf(title);
  if (!section) return [];
  const out: RawOps[] = [];
  for (const line of block.split("\n")) {
    if (!line.includes("|")) continue;
    const cells = splitRow(line);
    if (cells.length < 4) continue;
    const identCell = parseIdent(cells[0] ?? "");
    if (!identCell) continue;
    const aircraft = parseType(cells[1] ?? "");
    const other = parseAirportCell(cells[2] ?? "");
    const timeCells = cells.slice(3).filter((c) => parseFaClock(c));
    const depart = cells[3] ? parseFaClock(cells[3]) : null;
    const arrive = cells.length >= 6 ? parseFaClock(cells[5] ?? "") : parseFaClock(cells.at(-1) ?? "");
    const clock = pickClock(section.direction, depart, arrive ?? timeCells.at(-1) ?? null);
    if (!clock) continue;
    const dateLocal = lipbDate(historyDate(identCell.href), clock, section.direction);
    out.push({
      ident: identCell.ident,
      display: displayIdent(identCell.ident),
      direction: section.direction,
      other,
      hm: clock.hm,
      dateLocal,
      estimated: clock.estimated,
      aircraft,
      section: section.kind,
    });
  }
  return out;
}

export function parseFlightAwareMarkdown(
  markdown: string,
  now = new Date(),
): Movement[] {
  const markers = [
    ...markdown.matchAll(
      /##\s+(Arrivals|Departures|En Route\/Scheduled to BZO|En Route[^|\n]*|Scheduled Departures)/gi,
    ),
  ];
  const raw: RawOps[] = [];
  for (let i = 0; i < markers.length; i++) {
    const title = markers[i][1] ?? "";
    const start = markers[i].index ?? 0;
    const end = markers[i + 1]?.index ?? markdown.length;
    raw.push(...parseTableSection(markdown.slice(start, end), title));
  }
  const seen = new Map<string, RawOps>();
  const rank = (row: RawOps) => {
    if (row.section === "arrival" || row.section === "departure") {
      return row.estimated ? 2 : 3;
    }
    return row.estimated ? 0 : 1;
  };
  for (const row of raw) {
    if (!keepRaw(row)) continue;
    const key = `${row.dateLocal}|${row.direction}|${canonicalIdent(row.ident)}`;
    const prev = seen.get(key);
    if (!prev || rank(row) > rank(prev)) seen.set(key, row);
  }
  return [...seen.values()]
    .map((row) => {
      const at = fromZonedLocal(row.dateLocal, row.hm);
      return {
        id: `ops-${canonicalIdent(row.ident)}-${row.direction}-${row.dateLocal}`,
        flightNumber: row.display,
        direction: row.direction,
        otherAirport: otherCode(row.other),
        otherCity:
          CITY_ALIAS[otherCode(row.other)] ??
          (row.other.city || otherCode(row.other)),
        at,
        dateLocal: row.dateLocal,
        operator: operatorFor(row.ident),
        aircraft: row.aircraft || undefined,
        source: "ops" as const,
        status: statusFor(row.section, row.estimated, row.dateLocal, now),
      } satisfies Movement;
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

function sameAirport(a: string, b: string): boolean {
  const x = a.toUpperCase();
  const y = b.toUpperCase();
  if (x === y) return true;
  if (x.slice(-3) === y || y.slice(-3) === x) return true;
  return false;
}

export function mergeMovements(
  timetable: Movement[],
  ops: Movement[],
): Movement[] {
  const used = new Set<string>();
  const merged: Movement[] = timetable.map((m) => ({
    ...m,
    source: m.source ?? (m.id.startsWith("extra-") ? "extra" : "timetable"),
    scheduledAt: m.scheduledAt ?? m.at,
  }));

  const take = (opsM: Movement, sched: Movement | undefined) => {
    if (!sched) {
      merged.push(opsM);
      return;
    }
    used.add(sched.id);
    const idx = merged.findIndex((m) => m.id === sched.id);
    const next: Movement = {
      ...sched,
      ...opsM,
      id: sched.id,
      flightNumber: opsM.flightNumber || sched.flightNumber,
      otherAirport: opsM.otherAirport || sched.otherAirport,
      otherCity: opsM.otherCity || sched.otherCity,
      at: opsM.at,
      scheduledAt: sched.scheduledAt ?? sched.at,
      source: "ops",
      note: sched.note,
    };
    if (idx >= 0) merged[idx] = next;
    else merged.push(next);
  };

  for (const opsM of ops) {
    const identMatch = merged.find(
      (t) =>
        !used.has(t.id) &&
        t.dateLocal === opsM.dateLocal &&
        t.direction === opsM.direction &&
        canonicalIdent(t.flightNumber) === canonicalIdent(opsM.flightNumber) &&
        Math.abs(t.at.getTime() - opsM.at.getTime()) < MATCH_MS,
    );
    if (identMatch) {
      take(opsM, identMatch);
      continue;
    }
    const airportMatch = merged.find(
      (t) =>
        !used.has(t.id) &&
        t.dateLocal === opsM.dateLocal &&
        t.direction === opsM.direction &&
        sameAirport(t.otherAirport, opsM.otherAirport) &&
        Math.abs(t.at.getTime() - opsM.at.getTime()) < AIRPORT_MATCH_MS,
    );
    take(opsM, airportMatch);
  }

  return merged.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export async function fetchLiveOps(now = new Date()): Promise<OpsBundle> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.bundle;
  try {
    const res = await fetch(FA_PAGE, {
      headers: {
        Accept: "text/plain, text/markdown, */*",
        "User-Agent": "lipb-vfr-windows/0.1 (hangar board; +https://flightaware.com)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) {
      const bundle: OpsBundle = {
        movements: cache?.bundle.movements ?? [],
        source: cache?.bundle.source ?? "none",
        fetchedAt: now.toISOString(),
        error: `FlightAware HTTP ${res.status}`,
      };
      cache = { at: Date.now(), bundle };
      return bundle;
    }
    const markdown = await res.text();
    const movements = parseFlightAwareMarkdown(markdown, now);
    if (movements.length === 0) {
      const bundle: OpsBundle = {
        movements: [],
        source: "none",
        fetchedAt: now.toISOString(),
        error: "FlightAware page had no usable LIPB rows",
      };
      cache = { at: Date.now(), bundle };
      return bundle;
    }
    const bundle: OpsBundle = {
      movements,
      source: "flightaware",
      fetchedAt: now.toISOString(),
    };
    cache = { at: Date.now(), bundle };
    return bundle;
  } catch (e) {
    const bundle: OpsBundle = {
      movements: cache?.bundle.movements ?? [],
      source: cache?.bundle.source ?? "none",
      fetchedAt: now.toISOString(),
      error: e instanceof Error ? e.message : "FlightAware unavailable",
    };
    cache = { at: Date.now(), bundle };
    return bundle;
  }
}
