/**
 * Import LIPB day-by-day programming from the airport Excel workbook
 * ("Programmazione Voli …") into data/lipb-day-movements.json.
 *
 * Usage:
 *   npm run import:schedule -- "C:\\path\\to\\Programmazione Voli.xlsx"
 *   npm run import:schedule -- "C:\\path\\to\\Programmazione Voli_INVERNO.xlsx" --merge
 *
 * --merge keeps existing movements before the imported range (summer + winter
 * workbooks). Without --merge, the JSON is replaced entirely.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const MONTH_SHEETS = [
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
  "Gennaio",
  "Febbraio",
  "Marzo",
];

const WEEKDAY_RE =
  /^(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)$/i;

/** Known SkyAlps pairs when the workbook omits the XXX-BZO route cell. */
const FALLBACK_ROUTE_BY_FLIGHT = {
  BQ1998: "DRS-BZO",
};

/** IATA → city display name (SkyAlps + common ferry/charter airports). */
const CITY_BY_AIRPORT = {
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
  WAW: "Warsaw",
  ZRH: "Zurich",
};

const outPath = fileURLToPath(
  new URL("../data/lipb-day-movements.json", import.meta.url),
);

function excelSerialToISO(serial) {
  const utc = new Date(
    Date.UTC(1899, 11, 30) + Math.round(Number(serial) * 86400000),
  );
  return utc.toISOString().slice(0, 10);
}

function fracToHHMM(f) {
  const total = Math.round(Number(f) * 24 * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function cellStr(v) {
  if (v == null) return "";
  return String(v).trim();
}

/** Strip accents so "venerdì" / "lunedì" match weekday headers. */
function stripAccents(s) {
  return cellStr(s)
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function classifyKind(note) {
  const n = note.toUpperCase();
  if (n.includes("CHARTER")) return "charter";
  if (n.includes("FERRY")) return "ferry";
  return "scheduled";
}

function parseRoute(route) {
  // Workbook typos: WAW-BAO → WAW-BZO
  const r = route.toUpperCase().replace(/\bBAO\b/g, "BZO");
  if (r.startsWith("BZO-")) {
    return { direction: "departure", otherAirport: r.slice(4) };
  }
  if (r.endsWith("-BZO")) {
    return { direction: "arrival", otherAirport: r.slice(0, -4) };
  }
  return null;
}

function cityFor(airport) {
  return CITY_BY_AIRPORT[airport] ?? airport;
}

function isFlightCode(s) {
  return /^[A-Z]{2}\d{3,4}$/i.test(s);
}

/** SkyAlps workbook typos (BW1950 → BQ1950). */
function normalizeFlightCode(s) {
  const upper = cellStr(s).toUpperCase();
  if (/^BW\d{3,4}$/.test(upper)) return `BQ${upper.slice(2)}`;
  return upper;
}

/**
 * Accept Excel time fractions and string clocks ("10:45", "9:30", "19.10").
 * Returns HH:MM or null.
 */
function parseTimeLocal(v) {
  if (typeof v === "number") {
    if (v > 0 && v < 1) return fracToHHMM(v);
    return null;
  }
  const s = cellStr(v);
  if (!s) return null;
  if (!Number.isNaN(Number(s))) {
    const n = Number(s);
    if (n > 0 && n < 1) return fracToHHMM(n);
  }
  const m = s.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Winter workbooks often leave Gennaio/Febbraio on the previous calendar year
 * (Excel serials for 2026-01 instead of 2027-01). Bump Jan–Mar forward when the
 * sheet follows an autumn month already past that date.
 */
function coerceSeasonDate(iso, maxSeenIso) {
  if (!maxSeenIso || iso >= maxSeenIso) return iso;
  const month = Number(iso.slice(5, 7));
  if (month > 3) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const bumped = `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (bumped > maxSeenIso) {
    console.warn(`year-rollover: ${iso} → ${bumped} (after ${maxSeenIso})`);
    return bumped;
  }
  return iso;
}

/** Maggio (and similar) sheets insert a blank column A; detect offset once. */
function detectColOffset(rows) {
  for (const row of rows) {
    for (let off = 0; off <= 2; off++) {
      if (
        WEEKDAY_RE.test(stripAccents(row[off])) &&
        row[off + 1] !== "" &&
        !Number.isNaN(Number(row[off + 1]))
      ) {
        return off;
      }
    }
  }
  return 0;
}

function sortMovements(movements) {
  return [...movements].sort((a, b) => {
    const d = a.dateLocal.localeCompare(b.dateLocal);
    if (d) return d;
    const t = a.timeLocal.localeCompare(b.timeLocal);
    if (t) return t;
    return a.flightNumber.localeCompare(b.flightNumber);
  });
}

function dedupeMovements(movements) {
  const byId = new Map();
  for (const m of movements) {
    if (byId.has(m.id)) {
      const prev = byId.get(m.id);
      if (prev.timeLocal !== m.timeLocal) {
        m.id = `${m.id}-${m.timeLocal.replace(":", "")}`;
        byId.set(m.id, m);
      }
    } else {
      byId.set(m.id, m);
    }
  }
  return sortMovements([...byId.values()]);
}

function importWorkbook(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath, { cellDates: false });
  const movements = [];
  const seenDays = new Set();
  let currentDate = null;
  let maxSeenDate = null;
  const counts = { scheduled: 0, ferry: 0, charter: 0 };
  const presentSheets = MONTH_SHEETS.filter((name) => wb.Sheets[name]);

  if (presentSheets.length === 0) {
    throw new Error(
      `no recognized month sheets in ${basename(xlsxPath)} (have: ${wb.SheetNames.join(", ")})`,
    );
  }

  for (const sheetName of MONTH_SHEETS) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: true,
    });
    const off = detectColOffset(rows);
    currentDate = null;

    for (const row of rows) {
      const c0 = cellStr(row[off]);
      const c0Norm = stripAccents(row[off]);
      const c1 = cellStr(row[off + 1]);
      const c2 = row[off + 2];
      const c3 = cellStr(row[off + 3]);
      const c4 = cellStr(row[off + 4]);

      if (WEEKDAY_RE.test(c0Norm) && c1 !== "" && !Number.isNaN(Number(c1))) {
        let iso = excelSerialToISO(Number(c1));
        iso = coerceSeasonDate(iso, maxSeenDate);
        currentDate = iso;
        seenDays.add(currentDate);
        if (!maxSeenDate || currentDate > maxSeenDate) maxSeenDate = currentDate;
        continue;
      }

      if (!currentDate) continue;

      const flightNumber = normalizeFlightCode(c1);
      if (!isFlightCode(flightNumber)) continue;
      const timeLocal = parseTimeLocal(c2);
      if (!timeLocal) continue;

      let routeRaw = c0.includes("-") ? c0 : c3.includes("-") ? c3 : "";
      if (!routeRaw && FALLBACK_ROUTE_BY_FLIGHT[flightNumber]) {
        routeRaw = FALLBACK_ROUTE_BY_FLIGHT[flightNumber];
        console.warn(
          `fallback route ${currentDate} ${flightNumber} → ${routeRaw}`,
        );
      }
      const parsed = parseRoute(routeRaw);
      if (!parsed) {
        console.warn(
          `skip ${currentDate} ${flightNumber}: no BZO route in ${JSON.stringify(routeRaw)}`,
        );
        continue;
      }

      const note = c4 || (c3 && !c3.includes("-") ? c3 : "");
      const kind = classifyKind(note);
      const dirShort = parsed.direction === "departure" ? "dep" : "arr";
      const id = `${currentDate}-${flightNumber}-${dirShort}`;

      movements.push({
        id,
        dateLocal: currentDate,
        flightNumber,
        direction: parsed.direction,
        otherAirport: parsed.otherAirport,
        otherCity: cityFor(parsed.otherAirport),
        timeLocal,
        kind,
        ...(note ? { note: note.trim() } : {}),
      });
      counts[kind] += 1;
    }
  }

  const unique = dedupeMovements(movements);
  const dates = [...seenDays].sort();
  return {
    source: basename(xlsxPath),
    timezone: "Europe/Rome",
    season: {
      from: dates[0] ?? "",
      to: dates[dates.length - 1] ?? "",
    },
    movements: unique,
    _meta: {
      days: dates.length,
      sheets: presentSheets,
      counts,
    },
  };
}

function loadExisting() {
  try {
    return JSON.parse(readFileSync(outPath, "utf8"));
  } catch {
    return null;
  }
}

function mergePayload(existing, incoming) {
  if (!existing?.movements?.length) return incoming;

  const from = incoming.season.from;
  const to = incoming.season.to;
  const kept = existing.movements.filter(
    (m) => m.dateLocal < from || m.dateLocal > to,
  );
  const movements = dedupeMovements([...kept, ...incoming.movements]);
  const allDates = movements.map((m) => m.dateLocal).sort();
  const sources = [
    ...new Set(
      [...String(existing.source ?? "").split(" + "), incoming.source]
        .map((s) => cellStr(s))
        .filter(Boolean),
    ),
  ];

  const counts = { scheduled: 0, ferry: 0, charter: 0 };
  for (const m of movements) counts[m.kind] = (counts[m.kind] ?? 0) + 1;

  return {
    source: sources.join(" + "),
    timezone: incoming.timezone || existing.timezone || "Europe/Rome",
    season: {
      from: allDates[0] ?? existing.season?.from ?? from,
      to: allDates[allDates.length - 1] ?? existing.season?.to ?? to,
    },
    movements,
    _meta: {
      days: new Set(allDates).size,
      merged: true,
      keptBefore: kept.filter((m) => m.dateLocal < from).length,
      replacedRange: `${from} → ${to}`,
      counts,
    },
  };
}

function parseArgs(argv) {
  let xlsxPath = null;
  let merge = false;
  for (const a of argv) {
    if (a === "--merge") {
      merge = true;
      continue;
    }
    if (!a.startsWith("-") && !xlsxPath) xlsxPath = a;
  }
  return { xlsxPath, merge };
}

const { xlsxPath: arg, merge: wantMerge } = parseArgs(process.argv.slice(2));
if (!arg) {
  console.error(
    'Usage: npm run import:schedule -- "C:\\\\path\\\\to\\\\Programmazione Voli.xlsx" [--merge]',
  );
  process.exit(1);
}

const xlsxPath = resolve(arg);
let { _meta, ...payload } = importWorkbook(xlsxPath);

if (wantMerge) {
  const existing = loadExisting();
  if (!existing) {
    console.warn("warning: --merge requested but no existing schedule found");
  } else {
    const merged = mergePayload({ ...existing, _meta: undefined }, {
      ...payload,
      _meta,
    });
    ({ _meta, ...payload } = merged);
  }
} else {
  const existing = loadExisting();
  if (
    existing?.season?.from &&
    payload.season.from &&
    existing.season.from < payload.season.from
  ) {
    console.warn(
      `warning: imported range starts ${payload.season.from} but existing season starts ${existing.season.from}. Re-run with --merge to keep earlier months.`,
    );
  }
}

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`wrote ${outPath}`);
console.log(
  `days ${_meta.days} (${payload.season.from} → ${payload.season.to})`,
);
console.log(
  `movements ${payload.movements.length}: scheduled ${_meta.counts.scheduled}, ferry ${_meta.counts.ferry}, charter ${_meta.counts.charter}`,
);
if (_meta.sheets) console.log(`sheets: ${_meta.sheets.join(", ")}`);
if (_meta.merged) {
  console.log(
    `merged: kept ${_meta.keptBefore} movements before ${_meta.replacedRange}`,
  );
}
