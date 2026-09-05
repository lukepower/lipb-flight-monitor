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
import { addLocalDays, todayLocalDate } from "@/lib/time";

export const RETENTION_DAYS = 180;
export const MAX_DAY_FILE_BYTES = 2 * 1024 * 1024;
export const COALESCE_MS = 5 * 60_000;

export type SerializedOpsMovement = {
  flightNumber: string;
  direction: "arrival" | "departure";
  otherAirport: string;
  otherCity: string;
  at: string;
  dateLocal: string;
  status?: MovementStatus;
  scheduledAt?: string;
  aircraft?: string;
  operator?: string;
  source: "ops";
};

export type DayHistoryFile = {
  dateLocal: string;
  updatedAt: string;
  source: "flightaware";
  movements: SerializedOpsMovement[];
};

export type SnapshotResult = {
  ok: boolean;
  coalesced?: boolean;
  written: string[];
  movementCount: number;
  pruned?: number;
  error?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_RANK: Record<MovementStatus, number> = {
  scheduled: 1,
  estimated: 2,
  enroute: 3,
  taxi: 3,
  arrived: 4,
  departed: 4,
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

/** Browse: valid calendar day inside [today − retention, today] (Rome). */
export function parseBrowseDate(raw: unknown, now = new Date()): string | null {
  const date = parseCalendarDate(raw);
  if (!date) return null;
  const today = todayLocalDate(now);
  const oldest = addLocalDays(today, -RETENTION_DAYS);
  if (date < oldest || date > today) return null;
  return date;
}

/** Snapshot may only persist today and tomorrow (live FA horizon). */
export function isSnapshotWritableDate(
  dateLocal: string,
  now = new Date(),
): boolean {
  if (!parseCalendarDate(dateLocal)) return false;
  const today = todayLocalDate(now);
  return dateLocal === today || dateLocal === addLocalDays(today, 1);
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

function statusRank(status: MovementStatus | undefined): number {
  if (!status) return 0;
  return STATUS_RANK[status] ?? 0;
}

export function serializeOpsMovement(m: Movement): SerializedOpsMovement {
  const out: SerializedOpsMovement = {
    flightNumber: m.flightNumber,
    direction: m.direction,
    otherAirport: m.otherAirport,
    otherCity: m.otherCity,
    at: m.at.toISOString(),
    dateLocal: m.dateLocal,
    source: "ops",
  };
  if (m.status) out.status = m.status;
  if (m.scheduledAt) out.scheduledAt = m.scheduledAt.toISOString();
  if (m.aircraft) out.aircraft = m.aircraft;
  if (m.operator) out.operator = m.operator;
  return out;
}

export function deserializeOpsMovement(row: SerializedOpsMovement): Movement {
  return {
    id: `${row.flightNumber}-${row.direction}-${row.dateLocal}`,
    flightNumber: row.flightNumber,
    direction: row.direction,
    otherAirport: row.otherAirport,
    otherCity: row.otherCity,
    at: new Date(row.at),
    dateLocal: row.dateLocal,
    source: "ops",
    status: row.status,
    scheduledAt: row.scheduledAt ? new Date(row.scheduledAt) : undefined,
    aircraft: row.aircraft,
    operator: row.operator,
  };
}

/** Prefer terminal status; then later `at`; keep allowlisted fields only. */
export function preferMovement(
  existing: SerializedOpsMovement,
  incoming: SerializedOpsMovement,
): SerializedOpsMovement {
  const a = statusRank(existing.status);
  const b = statusRank(incoming.status);
  if (b > a) return sanitizeSerialized(incoming);
  if (b < a) return sanitizeSerialized(existing);
  const existingAt = Date.parse(existing.at);
  const incomingAt = Date.parse(incoming.at);
  if (incomingAt > existingAt) return sanitizeSerialized(incoming);
  return sanitizeSerialized(existing);
}

function sanitizeSerialized(row: SerializedOpsMovement): SerializedOpsMovement {
  return serializeOpsMovement(deserializeOpsMovement(row));
}

async function ensureDir(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
}

async function atomicWriteJson(
  filePath: string,
  data: DayHistoryFile,
): Promise<void> {
  const json = `${JSON.stringify(data, null, 2)}\n`;
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
): Promise<DayHistoryFile | null> {
  const filePath = dayFilePath(dateLocal, root);
  if (!filePath) return null;
  try {
    const raw = await readFile(filePath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_DAY_FILE_BYTES) return null;
    const parsed = JSON.parse(raw) as DayHistoryFile;
    if (parsed.dateLocal !== dateLocal || !Array.isArray(parsed.movements)) {
      return null;
    }
    return {
      dateLocal: parsed.dateLocal,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      source: "flightaware",
      movements: parsed.movements.map((m) =>
        sanitizeSerialized({ ...m, source: "ops" }),
      ),
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
  return readDayFile(date, options.root ?? getHistoryDir());
}

export async function hasHistory(
  dateLocal: string,
  options: { root?: string; now?: Date } = {},
): Promise<boolean> {
  return (await loadHistoryDay(dateLocal, options)) !== null;
}

/** Bounded list of archived dates (newest first), within retention. */
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
  existing: SerializedOpsMovement[],
  incoming: SerializedOpsMovement[],
): SerializedOpsMovement[] {
  const map = new Map<string, SerializedOpsMovement>();
  for (const row of existing) {
    const key = movementKey(row.flightNumber, row.direction, row.dateLocal);
    map.set(key, sanitizeSerialized(row));
  }
  for (const row of incoming) {
    const key = movementKey(row.flightNumber, row.direction, row.dateLocal);
    const prev = map.get(key);
    map.set(key, prev ? preferMovement(prev, row) : sanitizeSerialized(row));
  }
  return [...map.values()].sort((a, b) => {
    const t = Date.parse(a.at) - Date.parse(b.at);
    if (t !== 0) return t;
    return a.flightNumber.localeCompare(b.flightNumber);
  });
}

/**
 * Upsert ops movements into per-day JSON files.
 * Only writes today / tomorrow (Rome). Never deletes mid-day vanished rows.
 */
export async function upsertFromOpsBundle(
  bundle: OpsBundle,
  options: { root?: string; now?: Date } = {},
): Promise<{ written: string[]; movementCount: number }> {
  return withWriteLock(async () => {
    const now = options.now ?? new Date();
    const root = options.root ?? getHistoryDir();
    await ensureDir(root);

    const byDate = new Map<string, SerializedOpsMovement[]>();
    for (const m of bundle.movements) {
      if (m.source && m.source !== "ops") continue;
      if (!isSnapshotWritableDate(m.dateLocal, now)) continue;
      if (!parseCalendarDate(m.dateLocal)) continue;
      const list = byDate.get(m.dateLocal) ?? [];
      list.push(serializeOpsMovement({ ...m, source: "ops" }));
      byDate.set(m.dateLocal, list);
    }

    const written: string[] = [];
    let movementCount = 0;
    const updatedAt = now.toISOString();

    for (const [dateLocal, incoming] of byDate) {
      const filePath = dayFilePath(dateLocal, root);
      if (!filePath) continue;

      const prev = await readDayFile(dateLocal, root);
      const existing = prev?.movements ?? [];
      const merged = mergeDayMovements(existing, incoming);
      const payload: DayHistoryFile = {
        dateLocal,
        updatedAt,
        source: "flightaware",
        movements: merged,
      };
      await atomicWriteJson(filePath, payload);
      written.push(dateLocal);
      movementCount += merged.length;
    }

    return { written, movementCount };
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
      return { ok: true, written, movementCount, pruned };
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
