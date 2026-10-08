import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  addMonths,
  formatMonthTitle,
  monthOfDate,
  parseCalendarDate,
  parseCalendarMonth,
} from "@/lib/history";
import { todayLocalDate } from "@/lib/time";

/** IATA → city display name (shared with Excel programmazione importer). */
export const CITY_BY_AIRPORT: Record<string, string> = {
  ANR: "Antwerp",
  BER: "Berlin",
  BDS: "Brindisi",
  BLQ: "Bologna",
  BRI: "Bari",
  BRN: "Bern",
  BRU: "Brussels",
  BUD: "Budapest",
  BWK: "Brač",
  CAG: "Cagliari",
  CDG: "Paris CDG",
  CFU: "Corfu",
  CPH: "Copenhagen",
  CTA: "Catania",
  DRS: "Dresden",
  DUS: "Düsseldorf",
  EFL: "Kefalonia",
  FCO: "Rome Fiumicino",
  FDH: "Friedrichshafen",
  FRA: "Frankfurt",
  HAJ: "Hannover",
  HAM: "Hamburg",
  IBZ: "Ibiza",
  KSF: "Kassel",
  LDE: "Lourdes",
  LGW: "London Gatwick",
  LHA: "Lahr",
  LNZ: "Linz",
  LYN: "Lyon",
  MAH: "Menorca",
  MGL: "Mönchengladbach",
  MLA: "Malta",
  MRS: "Marseille",
  MUC: "Munich",
  NAP: "Naples",
  OLB: "Olbia",
  OST: "Ostend",
  PMF: "Parma",
  PRG: "Prague",
  PVK: "Preveza",
  QSR: "Salerno",
  SKG: "Thessaloniki",
  SPU: "Split",
  SUF: "Lamezia Terme",
  VIE: "Vienna",
  VRN: "Verona",
  ZRH: "Zurich",
};

const ITALIAN_MONTH: Record<string, number> = {
  gen: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  mag: 5,
  giu: 6,
  lug: 7,
  ago: 8,
  set: 9,
  ott: 10,
  nov: 11,
  dic: 12,
};

const WEEKDAY_RE =
  /^(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)$/i;
const DATE_RE = /^(\d{2})-(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)$/i;
const ROUTE_RE = /^([A-Z]{3})-([A-Z]{3})$/;
const FLIGHT_RE = /^BQ\d{3,4}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const MONTH_FILE_RE = /^\d{4}-\d{2}\.json$/;

export type OfficialMovement = {
  id: string;
  dateLocal: string;
  flightNumber: string;
  direction: "arrival" | "departure";
  otherAirport: string;
  otherCity: string;
  timeLocal: string;
};

export type OfficialMonthFile = {
  month: string;
  source: string;
  timezone: string;
  from: string;
  to: string;
  movements: OfficialMovement[];
};

export function cityFor(airport: string): string {
  return CITY_BY_AIRPORT[airport] ?? airport;
}

export function officialSchedulesDir(
  cwd = process.cwd(),
): string {
  return resolve(cwd, "data/official-schedules");
}

export function officialPdfPublicPath(month: string): string {
  return `/schedules/${month}.pdf`;
}

function parseRoute(
  route: string,
): { direction: "arrival" | "departure"; otherAirport: string } | null {
  const m = ROUTE_RE.exec(route.toUpperCase());
  if (!m) return null;
  const [, a, b] = m;
  if (a === "BZO") return { direction: "departure", otherAirport: b };
  if (b === "BZO") return { direction: "arrival", otherAirport: a };
  return null;
}

function movementId(
  dateLocal: string,
  flightNumber: string,
  direction: "arrival" | "departure",
): string {
  const dirShort = direction === "departure" ? "dep" : "arr";
  return `${dateLocal}-${flightNumber}-${dirShort}`;
}

/**
 * Parse SkyAlps "Voli schedulati …" PDF text into a month file.
 * Layout: weekday + DD-mmm header, then (route, BQ####, HH:MM) or
 * (BQ####, HH:MM, route) triples.
 */
export function parseOfficialScheduleText(
  text: string,
  opts: { year: number; source: string; month?: string },
): OfficialMonthFile {
  const lines = text
    .split(/\r?\n/)
    .map((ln) => ln.trim())
    .filter(Boolean);

  const byId = new Map<string, OfficialMovement>();
  let currentDate: string | null = null;
  let i = 0;

  while (i < lines.length) {
    const ln = lines[i];
    if (
      WEEKDAY_RE.test(ln) &&
      i + 1 < lines.length &&
      DATE_RE.test(lines[i + 1])
    ) {
      const dm = DATE_RE.exec(lines[i + 1]);
      if (dm) {
        const day = dm[1];
        const mon = ITALIAN_MONTH[dm[2].toLowerCase()];
        currentDate = `${opts.year}-${String(mon).padStart(2, "0")}-${day}`;
      }
      i += 2;
      continue;
    }

    if (!currentDate) {
      i += 1;
      continue;
    }

    if (
      ROUTE_RE.test(ln) &&
      i + 2 < lines.length &&
      FLIGHT_RE.test(lines[i + 1]) &&
      TIME_RE.test(lines[i + 2])
    ) {
      const parsed = parseRoute(ln);
      if (parsed) {
        const flightNumber = lines[i + 1].toUpperCase();
        const timeLocal = lines[i + 2];
        const id = movementId(currentDate, flightNumber, parsed.direction);
        byId.set(id, {
          id,
          dateLocal: currentDate,
          flightNumber,
          direction: parsed.direction,
          otherAirport: parsed.otherAirport,
          otherCity: cityFor(parsed.otherAirport),
          timeLocal,
        });
      }
      i += 3;
      continue;
    }

    if (
      FLIGHT_RE.test(ln) &&
      i + 2 < lines.length &&
      TIME_RE.test(lines[i + 1]) &&
      ROUTE_RE.test(lines[i + 2])
    ) {
      const parsed = parseRoute(lines[i + 2]);
      if (parsed) {
        const flightNumber = ln.toUpperCase();
        const timeLocal = lines[i + 1];
        const id = movementId(currentDate, flightNumber, parsed.direction);
        byId.set(id, {
          id,
          dateLocal: currentDate,
          flightNumber,
          direction: parsed.direction,
          otherAirport: parsed.otherAirport,
          otherCity: cityFor(parsed.otherAirport),
          timeLocal,
        });
      }
      i += 3;
      continue;
    }

    i += 1;
  }

  const movements = [...byId.values()].sort((a, b) => {
    const d = a.dateLocal.localeCompare(b.dateLocal);
    if (d) return d;
    const t = a.timeLocal.localeCompare(b.timeLocal);
    if (t) return t;
    return a.flightNumber.localeCompare(b.flightNumber);
  });

  if (movements.length === 0) {
    throw new Error("no movements parsed from official schedule text");
  }

  const dates = [...new Set(movements.map((m) => m.dateLocal))].sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const month = opts.month ?? monthOfDate(from);

  for (const m of movements) {
    if (monthOfDate(m.dateLocal) !== month) {
      throw new Error(
        `${m.id}: date ${m.dateLocal} is outside month ${month}`,
      );
    }
  }

  return {
    month,
    source: opts.source,
    timezone: "Europe/Rome",
    from,
    to,
    movements,
  };
}

function isOfficialMonthFile(value: unknown): value is OfficialMonthFile {
  if (!value || typeof value !== "object") return false;
  const v = value as OfficialMonthFile;
  return (
    typeof v.month === "string" &&
    typeof v.source === "string" &&
    typeof v.timezone === "string" &&
    typeof v.from === "string" &&
    typeof v.to === "string" &&
    Array.isArray(v.movements)
  );
}

export function listOfficialMonths(cwd = process.cwd()): string[] {
  const dir = officialSchedulesDir(cwd);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => MONTH_FILE_RE.test(n))
    .map((n) => n.slice(0, 7))
    .filter((m) => parseCalendarMonth(m) != null)
    .sort();
}

export function loadOfficialMonth(
  month: string,
  cwd = process.cwd(),
): OfficialMonthFile | null {
  const parsed = parseCalendarMonth(month);
  if (!parsed) return null;
  const path = resolve(officialSchedulesDir(cwd), `${parsed}.json`);
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isOfficialMonthFile(raw)) return null;
    if (raw.month !== parsed) return null;
    return raw;
  } catch {
    return null;
  }
}

export function movementsOnOfficialDate(
  file: OfficialMonthFile,
  dateLocal: string,
): OfficialMovement[] {
  return file.movements
    .filter((m) => m.dateLocal === dateLocal)
    .sort((a, b) => {
      const t = a.timeLocal.localeCompare(b.timeLocal);
      if (t) return t;
      return a.flightNumber.localeCompare(b.flightNumber);
    });
}

export function officialTrafficDates(file: OfficialMonthFile): Set<string> {
  return new Set(file.movements.map((m) => m.dateLocal));
}

/** Prefer current Rome month if imported; else latest available month. */
export function defaultOfficialMonth(
  available: string[],
  now = new Date(),
): string | null {
  if (available.length === 0) return null;
  const current = monthOfDate(todayLocalDate(now));
  if (available.includes(current)) return current;
  return available[available.length - 1];
}

export function parseOfficialBrowseMonth(
  raw: unknown,
  available: string[],
): string | null {
  const month = parseCalendarMonth(raw);
  if (!month) return null;
  return available.includes(month) ? month : null;
}

export function parseOfficialBrowseDate(
  raw: unknown,
  file: OfficialMonthFile | null,
): string | null {
  const date = parseCalendarDate(raw);
  if (!date || !file) return null;
  if (date < file.from || date > file.to) return null;
  if (monthOfDate(date) !== file.month) return null;
  return date;
}

export { addMonths, formatMonthTitle };
