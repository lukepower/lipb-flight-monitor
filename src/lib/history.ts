import { timingSafeEqual } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { Movement, MovementStatus } from "@/lib/occupancy";
import type { OpsBundle } from "@/lib/ops-flights";
import { canonicalIdent } from "@/lib/ops-flights";
import { addLocalDays, isoWeekday, todayLocalDate } from "@/lib/time";

export const RETENTION_DAYS = 180;
export const MAX_DAY_FILE_BYTES = 2 * 1024 * 1024;
export const COALESCE_MS = 5 * 60_000;

/** Lean as-flown record — what actually arrived or departed. */
export type AsFlownMovement = {
  flightNumber: string;
  direction: "arrival" | "departure";
  otherAirport: string;
  otherCity: string;
  at: string;
  dateLocal: string;
  aircraft?: string;
  operator?: string;
};

export type DayHistoryFile = {
  dateLocal: string;
  movements: AsFlownMovement[];
};

export type SnapshotResult = {
  ok: boolean;
  coalesced?: boolean;
  unchanged?: boolean;
  written: string[];
  movementCount: number;
  pruned?: number;
  error?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

type LegacyRow = AsFlownMovement & {
  status?: MovementStatus;
  scheduledAt?: string;
  source?: string;
};

let lastSnapshotAt = 0;
let inFlight: Promise<SnapshotResult> | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Env-only history root. Never accept a path from a request. */
export function getHistoryDir(): string {
  return process.env.HISTORY_DIR?.trim() || resolve(process.cwd(), "data/history");
}

/** Calendar YYYY-MM-DD only — rejects traversal, bad months, Feb 31, etc. */
export function parseCalendarDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.length !== 10) return null;
  if (!DATE_RE.test(s)) return null;
  if (s.includes("\0")) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() + 1 !== m ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return s;
}

/** Calendar YYYY-MM only. */
export function parseCalendarMonth(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.length !== 7) return null;
  if (!MONTH_RE.test(s)) return null;
  if (s.includes("\0")) return null;
  const [y, m] = s.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  const dt = new Date(Date.UTC(y, m - 1, 1));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m) return null;
  return s;
}

export function monthOfDate(dateLocal: string): string {
  return dateLocal.slice(0, 7);
}

export function addMonths(yearMonth: string, delta: number): string {
  const parsed = parseCalendarMonth(yearMonth);
  if (!parsed) return yearMonth;
  const [y, m] = parsed.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthTitle(yearMonth: string): string {
  const parsed = parseCalendarMonth(yearMonth);
  if (!parsed) return yearMonth;
  const [y, m] = parsed.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function daysInMonth(yearMonth: string): string[] {
  const parsed = parseCalendarMonth(yearMonth);
  if (!parsed) return [];
  const [y, m] = parsed.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    return `${parsed}-${day}`;
  });
}

/** Monday-first cells for a month grid (leading/trailing nulls). */
export function monthGrid(yearMonth: string): (string | null)[] {
  const days = daysInMonth(yearMonth);
  if (days.length === 0) return [];
  const lead = isoWeekday(days[0]) - 1;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  cells.push(...days);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function browseMonthBounds(now = new Date()): {
  oldest: string;
  today: string;
  minMonth: string;
  maxMonth: string;
} {
  const today = todayLocalDate(now);
  const oldest = addLocalDays(today, -RETENTION_DAYS);
  return {
    oldest,
    today,
    minMonth: monthOfDate(oldest),
    maxMonth: monthOfDate(today),
  };
}

/** Browse month inside the retention window (Rome). */
export function parseBrowseMonth(raw: unknown, now = new Date()): string | null {
  const month = parseCalendarMonth(raw);
  if (!month) return null;
  const { minMonth, maxMonth } = browseMonthBounds(now);
  if (month < minMonth || month > maxMonth) return null;
  return month;
}

/** Browse: valid calendar day inside [today − retention, today] (Rome). */
export function parseBrowseDate(raw: unknown, now = new Date()): string | null {
  const date = parseCalendarDate(raw);
  if (!date) return null;
  const today = todayLocalDate(now);
  const oldest = addLocalDays(today, -RETENTION_DAYS);
  if (date < oldest || date > today) return null;
  return date;
}

export function isAsFlownStatus(status: MovementStatus | undefined): boolean {
  return status === "arrived" || status === "departed";
}

/** Ingest may persist today and yesterday (Rome) so late terminals still land. */
export function isHistoryWritableDate(
  dateLocal: string,
  now = new Date(),
): boolean {
  if (!parseCalendarDate(dateLocal)) return false;
  const today = todayLocalDate(now);
  return dateLocal === today || dateLocal === addLocalDays(today, -1);
}

/**
 * Resolve `${date}.json` under root with containment checks.
 * Returns null if date is invalid or the path would escape root.
 */
export function dayFilePath(
  dateLocal: string,
  root: string = getHistoryDir(),
): string | null {
  if (!parseCalendarDate(dateLocal)) return null;
  const name = `${dateLocal}.json`;
  const resolvedRoot = resolve(root);
  const resolved = resolve(resolvedRoot, name);
  const rel = relative(resolvedRoot, resolved);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  if (rel !== name) return null;
  return resolved;
}

export function movementKey(
  flightNumber: string,
  direction: Movement["direction"],
  dateLocal: string,
): string {
  return `${canonicalIdent(flightNumber)}|${direction}|${dateLocal}`;
}

export function serializeAsFlown(m: Movement): AsFlownMovement {
  const out: AsFlownMovement = {
    flightNumber: m.flightNumber,
    direction: m.direction,
    otherAirport: m.otherAirport,
    otherCity: m.otherCity,
    at: m.at.toISOString(),
    dateLocal: m.dateLocal,
  };
  if (m.aircraft) out.aircraft = m.aircraft;
  if (m.operator) out.operator = m.operator;
  return out;
}

export function deserializeAsFlown(row: AsFlownMovement): Movement {
  return {
    id: `${row.flightNumber}-${row.direction}-${row.dateLocal}`,
    flightNumber: row.flightNumber,
    direction: row.direction,
    otherAirport: row.otherAirport,
    otherCity: row.otherCity,
    at: new Date(row.at),
    dateLocal: row.dateLocal,
    source: "ops",
    aircraft: row.aircraft,
    operator: row.operator,
  };
}

function keepArchivedRow(row: LegacyRow): boolean {
  if (row.status == null) return true;
  return isAsFlownStatus(row.status);
}

function sanitizeAsFlown(row: LegacyRow): AsFlownMovement | null {
  if (!row || typeof row !== "object") return null;
  if (typeof row.flightNumber !== "string" || !row.flightNumber) return null;
  if (row.direction !== "arrival" && row.direction !== "departure") return null;
  if (typeof row.otherAirport !== "string") return null;
  if (typeof row.otherCity !== "string") return null;
  if (typeof row.at !== "string" || Number.isNaN(Date.parse(row.at))) return null;
  if (!parseCalendarDate(row.dateLocal)) return null;
  if (!keepArchivedRow(row)) return null;
  return serializeAsFlown(deserializeAsFlown(row));
}

/** Prefer later actual time; keep allowlisted fields only. */
export function preferMovement(
  existing: AsFlownMovement,
  incoming: AsFlownMovement,
): AsFlownMovement {
  const a = sanitizeAsFlown(existing);
  const b = sanitizeAsFlown(incoming);
  if (!a && !b) return existing;
  if (!a && b) return b;
  if (a && !b) return a;
  const existingAt = Date.parse(a!.at);
  const incomingAt = Date.parse(b!.at);
  if (incomingAt > existingAt) return b!;
  return a!;
}

async function ensureDir(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
}

function dayFileJson(data: DayHistoryFile): string {
  return `${JSON.stringify(data)}\n`;
}

async function atomicWriteJson(
  filePath: string,
  data: DayHistoryFile,
): Promise<void> {
  const json = dayFileJson(data);
  const bytes = Buffer.byteLength(json, "utf8");
  if (bytes > MAX_DAY_FILE_BYTES) {
    throw new Error("day file exceeds max size");
  }
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(tmp, json, "utf8");
  try {
    await rename(tmp, filePath);
  } catch {
    // Windows cannot rename over an existing file — replace in place, then drop tmp.
    await writeFile(filePath, json, "utf8");
    try {
      await unlink(tmp);
    } catch {
      /* ignore */
    }
  }
}

async function readDayFile(
  dateLocal: string,
  root: string,
): Promise<{ day: DayHistoryFile; raw: string } | null> {
  const filePath = dayFilePath(dateLocal, root);
  if (!filePath) return null;
  try {
    const raw = await readFile(filePath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_DAY_FILE_BYTES) return null;
    const parsed = JSON.parse(raw) as DayHistoryFile;
    if (parsed.dateLocal !== dateLocal || !Array.isArray(parsed.movements)) {
      return null;
    }
    const movements = parsed.movements
      .map((m) => sanitizeAsFlown(m as LegacyRow))
      .filter((m): m is AsFlownMovement => m != null);
    return {
      raw,
      day: { dateLocal: parsed.dateLocal, movements },
    };
  } catch {
    return null;
  }
}

/** Load an archived day for browse UI (retention window enforced). */
export async function loadHistoryDay(
  dateLocal: string,
  options: { root?: string; now?: Date } = {},
): Promise<DayHistoryFile | null> {
  const now = options.now ?? new Date();
  const date = parseBrowseDate(dateLocal, now);
  if (!date) return null;
  const loaded = await readDayFile(date, options.root ?? getHistoryDir());
  return loaded?.day ?? null;
}

export async function hasHistory(
  dateLocal: string,
  options: { root?: string; now?: Date } = {},
): Promise<boolean> {
  const day = await loadHistoryDay(dateLocal, options);
  return (day?.movements.length ?? 0) > 0;
}

/** Bounded list of archived dates with as-flown rows (newest first). */
export async function listHistoryDates(
  options: { root?: string; now?: Date } = {},
): Promise<string[]> {
  const now = options.now ?? new Date();
  const today = todayLocalDate(now);
  const oldest = addLocalDays(today, -RETENTION_DAYS);
  const root = options.root ?? getHistoryDir();
  try {
    const names = await readdir(root);
    const dates: string[] = [];
    for (const name of names) {
      if (!name.endsWith(".json") || name.endsWith(".tmp")) continue;
      const date = name.slice(0, -".json".length);
      if (!parseCalendarDate(date)) continue;
      if (date < oldest || date > today) continue;
      const loaded = await readDayFile(date, root);
      if (!loaded || loaded.day.movements.length === 0) continue;
      dates.push(date);
    }
    dates.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    return dates.slice(0, RETENTION_DAYS + 1);
  } catch {
    return [];
  }
}

export async function pruneHistory(
  options: { root?: string; now?: Date } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const today = todayLocalDate(now);
  const oldest = addLocalDays(today, -RETENTION_DAYS);
  const root = options.root ?? getHistoryDir();
  let removed = 0;
  try {
    const names = await readdir(root);
    for (const name of names) {
      if (!name.endsWith(".json") || name.endsWith(".tmp")) continue;
      const date = name.slice(0, -".json".length);
      if (!parseCalendarDate(date)) continue;
      if (date >= oldest) continue;
      const filePath = dayFilePath(date, root);
      if (!filePath) continue;
      try {
        await unlink(filePath);
        removed += 1;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* missing dir */
  }
  return removed;
}

function mergeDayMovements(
  existing: AsFlownMovement[],
  incoming: AsFlownMovement[],
): AsFlownMovement[] {
  const map = new Map<string, AsFlownMovement>();
  for (const row of existing) {
    const clean = sanitizeAsFlown(row);
    if (!clean) continue;
    const key = movementKey(clean.flightNumber, clean.direction, clean.dateLocal);
    map.set(key, clean);
  }
  for (const row of incoming) {
    const clean = sanitizeAsFlown(row);
    if (!clean) continue;
    const key = movementKey(clean.flightNumber, clean.direction, clean.dateLocal);
    const prev = map.get(key);
    map.set(key, prev ? preferMovement(prev, clean) : clean);
  }
  return [...map.values()].sort((a, b) => {
    const t = Date.parse(a.at) - Date.parse(b.at);
    if (t !== 0) return t;
    return a.flightNumber.localeCompare(b.flightNumber);
  });
}

/**
 * Upsert as-flown ops into per-day JSON files.
 * Only writes today / yesterday (Rome). Never deletes mid-day vanished flown rows.
 * Skips the disk write when the compact payload is unchanged.
 */
export async function upsertFromOpsBundle(
  bundle: OpsBundle,
  options: { root?: string; now?: Date } = {},
): Promise<{ written: string[]; unchanged: string[]; movementCount: number }> {
  return withWriteLock(async () => {
    const now = options.now ?? new Date();
    const root = options.root ?? getHistoryDir();
    await ensureDir(root);

    const byDate = new Map<string, AsFlownMovement[]>();
    for (const m of bundle.movements) {
      if (m.source && m.source !== "ops") continue;
      if (!isAsFlownStatus(m.status)) continue;
      if (!isHistoryWritableDate(m.dateLocal, now)) continue;
      if (!parseCalendarDate(m.dateLocal)) continue;
      const list = byDate.get(m.dateLocal) ?? [];
      list.push(serializeAsFlown(m));
      byDate.set(m.dateLocal, list);
    }

    const written: string[] = [];
    const unchanged: string[] = [];
    let movementCount = 0;

    for (const [dateLocal, incoming] of byDate) {
      const filePath = dayFilePath(dateLocal, root);
      if (!filePath) continue;

      const prev = await readDayFile(dateLocal, root);
      const existing = prev?.day.movements ?? [];
      const merged = mergeDayMovements(existing, incoming);
      if (merged.length === 0) {
        continue;
      }
      const payload: DayHistoryFile = { dateLocal, movements: merged };
      const json = dayFileJson(payload);
      if (prev?.raw === json) {
        unchanged.push(dateLocal);
        movementCount += merged.length;
        continue;
      }
      await atomicWriteJson(filePath, payload);
      written.push(dateLocal);
      movementCount += merged.length;
    }

    return { written, unchanged, movementCount };
  });
}

/** Compare Bearer token with CRON_SECRET using timing-safe equality. */
export function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length);
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function resetSnapshotCoalesceForTests(): void {
  lastSnapshotAt = 0;
  inFlight = null;
}

/**
 * Cron entry: coalesce + single-flight + fetch + upsert + prune.
 * Does not live inside public fetchLiveOps.
 */
export async function runHistorySnapshot(options: {
  fetchOps: () => Promise<OpsBundle>;
  now?: Date;
  root?: string;
  coalesceMs?: number;
  force?: boolean;
}): Promise<SnapshotResult> {
  if (inFlight) return inFlight;

  const coalesceMs = options.coalesceMs ?? COALESCE_MS;
  const nowMs = (options.now ?? new Date()).getTime();
  if (!options.force && lastSnapshotAt > 0 && nowMs - lastSnapshotAt < coalesceMs) {
    return {
      ok: true,
      coalesced: true,
      unchanged: true,
      written: [],
      movementCount: 0,
    };
  }

  const work = (async (): Promise<SnapshotResult> => {
    try {
      const bundle = await options.fetchOps();
      if (bundle.source === "none" && bundle.error) {
        return {
          ok: false,
          written: [],
          movementCount: 0,
          error: "upstream unavailable",
        };
      }
      const { written, movementCount } = await upsertFromOpsBundle(bundle, {
        root: options.root,
        now: options.now,
      });
      const pruned = await pruneHistory({
        root: options.root,
        now: options.now,
      });
      lastSnapshotAt = Date.now();
      return {
        ok: true,
        written,
        movementCount,
        pruned,
        unchanged: written.length === 0,
      };
    } catch (err) {
      console.error("[history] snapshot failed", err);
      return {
        ok: false,
        written: [],
        movementCount: 0,
        error: "snapshot failed",
      };
    } finally {
      inFlight = null;
    }
  })();

  inFlight = work;
  return work;
}
