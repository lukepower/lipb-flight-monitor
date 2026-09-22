/**
 * Import LIPB day-by-day programming from the airport Excel workbook
 * ("Programmazione Voli …") into data/lipb-day-movements.json.
 *
 * Usage:
 *   npm run import:schedule -- "C:\\path\\to\\Programmazione Voli.xlsx"
 */
import { writeFileSync } from "node:fs";
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
];

const WEEKDAY_RE =
  /^(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)$/i;

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
  ZRH: "Zurich",
};

const outPath = fileURLToPath(new URL("../data/lipb-day-movements.json", import.meta.url));

function excelSerialToISO(serial) {
  const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(serial) * 86400000));
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

function classifyKind(note) {
  const n = note.toUpperCase();
  if (n.includes("CHARTER")) return "charter";
  if (n.includes("FERRY")) return "ferry";
  return "scheduled";
}

function parseRoute(route) {
  const r = route.toUpperCase();
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

function isTimeFraction(v) {
  if (typeof v === "number") return v > 0 && v < 1;
  if (typeof v === "string" && v !== "" && !Number.isNaN(Number(v))) {
    const n = Number(v);
    return n > 0 && n < 1;
  }
  return false;
}

/** Maggio (and similar) sheets insert a blank column A; detect offset once. */
function detectColOffset(rows) {
  for (const row of rows) {
    for (let off = 0; off <= 2; off++) {
      if (
        WEEKDAY_RE.test(cellStr(row[off])) &&
        row[off + 1] !== "" &&
        !Number.isNaN(Number(row[off + 1]))
      ) {
        return off;
      }
    }
  }
  return 0;
}

function importWorkbook(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath, { cellDates: false });
  const movements = [];
  const seenDays = new Set();
  let currentDate = null;
  const counts = { scheduled: 0, ferry: 0, charter: 0 };

  for (const sheetName of MONTH_SHEETS) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      console.warn(`warning: missing sheet ${sheetName}`);
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: true,
    });
    const off = detectColOffset(rows);
    currentDate = null;

    for (const row of rows) {
      const c0 = cellStr(row[off]);
      const c1 = cellStr(row[off + 1]);
      const c2 = row[off + 2];
      const c3 = cellStr(row[off + 3]);
      const c4 = cellStr(row[off + 4]);

      if (WEEKDAY_RE.test(c0) && c1 !== "" && !Number.isNaN(Number(c1))) {
        currentDate = excelSerialToISO(Number(c1));
        seenDays.add(currentDate);
        continue;
      }

      if (!currentDate) continue;
      if (!isFlightCode(c1) || !isTimeFraction(c2)) continue;

      const routeRaw = c0.includes("-") ? c0 : c3.includes("-") ? c3 : "";
      const parsed = parseRoute(routeRaw);
      if (!parsed) {
        console.warn(
          `skip ${currentDate} ${c1}: no BZO route in ${JSON.stringify(routeRaw)}`,
        );
        continue;
      }

      const note = c4 || (c3 && !c3.includes("-") ? c3 : "");
      const kind = classifyKind(note);
      const timeLocal = fracToHHMM(Number(c2));
      const dirShort = parsed.direction === "departure" ? "dep" : "arr";
      const id = `${currentDate}-${c1.toUpperCase()}-${dirShort}`;

      movements.push({
        id,
        dateLocal: currentDate,
        flightNumber: c1.toUpperCase(),
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

  movements.sort((a, b) => {
    const d = a.dateLocal.localeCompare(b.dateLocal);
    if (d) return d;
    const t = a.timeLocal.localeCompare(b.timeLocal);
    if (t) return t;
    return a.flightNumber.localeCompare(b.flightNumber);
  });

  // Deduplicate identical id collisions (same code+dir+date twice)
  const byId = new Map();
  for (const m of movements) {
    if (byId.has(m.id)) {
      const prev = byId.get(m.id);
      // Prefer keeping both with a suffix if times differ
      if (prev.timeLocal !== m.timeLocal) {
        m.id = `${m.id}-${m.timeLocal.replace(":", "")}`;
        byId.set(m.id, m);
      }
    } else {
      byId.set(m.id, m);
    }
  }
  const unique = [...byId.values()].sort((a, b) => {
    const d = a.dateLocal.localeCompare(b.dateLocal);
    if (d) return d;
    return a.timeLocal.localeCompare(b.timeLocal);
  });

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
      counts,
    },
  };
}

const arg = process.argv[2];
if (!arg) {
  console.error(
    'Usage: npm run import:schedule -- "C:\\\\path\\\\to\\\\Programmazione Voli.xlsx"',
  );
  process.exit(1);
}

const xlsxPath = resolve(arg);
const { _meta, ...payload } = importWorkbook(xlsxPath);

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`wrote ${outPath}`);
console.log(
  `days ${_meta.days} (${payload.season.from} → ${payload.season.to})`,
);
console.log(
  `movements ${payload.movements.length}: scheduled ${_meta.counts.scheduled}, ferry ${_meta.counts.ferry}, charter ${_meta.counts.charter}`,
);
