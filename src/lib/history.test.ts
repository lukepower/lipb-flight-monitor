import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COALESCE_MS,
  MAX_DAY_FILE_BYTES,
  RETENTION_DAYS,
  addMonths,
  authorizeCron,
  dayFilePath,
  daysInMonth,
  deserializeAsFlown,
  formatMonthTitle,
  listHistoryDates,
  loadHistoryDay,
  monthGrid,
  monthOfDate,
  parseBrowseDate,
  parseBrowseMonth,
  parseCalendarDate,
  parseCalendarMonth,
  preferMovement,
  pruneHistory,
  resetSnapshotCoalesceForTests,
  runHistorySnapshot,
  serializeAsFlown,
  upsertFromOpsBundle,
  type AsFlownMovement,
} from "@/lib/history";
import type { Movement } from "@/lib/occupancy";
import type { OpsBundle } from "@/lib/ops-flights";
import { fromZonedLocal, todayLocalDate, addLocalDays } from "@/lib/time";

const FIXED_NOW = fromZonedLocal("2026-09-05", "14:00");

function opsMove(
  flightNumber: string,
  direction: Movement["direction"],
  dateLocal: string,
  time: string,
  status?: Movement["status"],
): Movement {
  return {
    id: `${flightNumber}-${direction}-${dateLocal}`,
    flightNumber,
    direction,
    otherAirport: "OLB",
    otherCity: "Olbia",
    at: fromZonedLocal(dateLocal, time),
    dateLocal,
    source: "ops",
    status,
    aircraft: "DH8D",
    operator: "SkyAlps",
  };
}

function bundle(movements: Movement[], fetchedAt = FIXED_NOW.toISOString()): OpsBundle {
  return { movements, source: "flightaware", fetchedAt };
}

describe("parseCalendarDate / parseBrowseDate", () => {
  it("accepts a real YYYY-MM-DD", () => {
    expect(parseCalendarDate("2026-09-05")).toBe("2026-09-05");
  });

  it("rejects traversal and malformed values", () => {
    const bad = [
      "../../../etc/passwd",
      "..%2F..",
      "2026-09-05/../../x",
      "2026-09-05\0",
      "",
      "2026-9-5",
      "20260905",
      "2026-02-31",
      "2026-13-01",
      "05/09/2026",
      "1725532800",
      null,
      undefined,
      20260905,
    ];
    for (const value of bad) {
      expect(parseCalendarDate(value as never)).toBeNull();
    }
  });

  it("enforces browse retention window", () => {
    expect(parseBrowseDate("2026-09-05", FIXED_NOW)).toBe("2026-09-05");
    expect(parseBrowseDate("2026-09-06", FIXED_NOW)).toBeNull();
    expect(
      parseBrowseDate(addLocalDays(todayLocalDate(FIXED_NOW), -(RETENTION_DAYS + 1)), FIXED_NOW),
    ).toBeNull();
    expect(
      parseBrowseDate(addLocalDays(todayLocalDate(FIXED_NOW), -RETENTION_DAYS), FIXED_NOW),
    ).toBe(addLocalDays(todayLocalDate(FIXED_NOW), -RETENTION_DAYS));
  });
});

describe("calendar month helpers", () => {
  it("parses and rejects months", () => {
    expect(parseCalendarMonth("2026-09")).toBe("2026-09");
    expect(parseCalendarMonth("2026-13")).toBeNull();
    expect(parseCalendarMonth("2026-9")).toBeNull();
    expect(parseCalendarMonth("../etc")).toBeNull();
    expect(monthOfDate("2026-09-05")).toBe("2026-09");
    expect(addMonths("2026-09", 1)).toBe("2026-10");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(formatMonthTitle("2026-09")).toBe("September 2026");
  });

  it("builds a Monday-first September 2026 grid", () => {
    expect(daysInMonth("2026-09")[0]).toBe("2026-09-01");
    expect(daysInMonth("2026-09").at(-1)).toBe("2026-09-30");
    const cells = monthGrid("2026-09");
    expect(cells[0]).toBeNull(); // Tue 1st → one leading null (Mon)
    expect(cells[1]).toBe("2026-09-01");
    expect(cells.filter(Boolean)).toHaveLength(30);
    expect(cells.length % 7).toBe(0);
  });

  it("clamps browse months to retention", () => {
    expect(parseBrowseMonth("2026-09", FIXED_NOW)).toBe("2026-09");
    expect(parseBrowseMonth("2026-10", FIXED_NOW)).toBeNull();
    expect(parseBrowseMonth("2025-01", FIXED_NOW)).toBeNull();
    expect(parseBrowseMonth("2026-03", FIXED_NOW)).toBe("2026-03");
  });
});

describe("dayFilePath containment", () => {
  it("maps only to HISTORY_DIR/date.json", () => {
    const root = join(tmpdir(), "hist-root");
    expect(dayFilePath("2026-09-05", root)).toBe(join(root, "2026-09-05.json"));
    expect(dayFilePath("../etc/passwd", root)).toBeNull();
    expect(dayFilePath("2026-09-05/../../x", root)).toBeNull();
  });
});

describe("preferMovement", () => {
  const base: AsFlownMovement = {
    flightNumber: "BQ1906",
    direction: "departure",
    otherAirport: "OLB",
    otherCity: "Olbia",
    at: fromZonedLocal("2026-09-05", "10:00").toISOString(),
    dateLocal: "2026-09-05",
  };

  it("prefers a later actual time", () => {
    const next = {
      ...base,
      at: fromZonedLocal("2026-09-05", "10:05").toISOString(),
    };
    expect(preferMovement(base, next).at).toBe(next.at);
  });

  it("keeps existing when incoming is earlier", () => {
    const earlier = {
      ...base,
      at: fromZonedLocal("2026-09-05", "09:50").toISOString(),
    };
    expect(preferMovement(base, earlier).at).toBe(base.at);
  });

  it("strips unknown fields via sanitize", () => {
    const dirty = {
      ...base,
      evil: "drop-me",
      status: "departed",
      source: "ops",
      scheduledAt: fromZonedLocal("2026-09-05", "09:55").toISOString(),
    } as AsFlownMovement & { evil: string; status: string; source: string };
    const clean = preferMovement(base, dirty);
    expect(clean).not.toHaveProperty("evil");
    expect(clean).not.toHaveProperty("status");
    expect(clean).not.toHaveProperty("source");
    expect(clean).not.toHaveProperty("scheduledAt");
    expect(clean.flightNumber).toBe("BQ1906");
  });
});

describe("upsert / load / prune", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lipb-hist-"));
    resetSnapshotCoalesceForTests();
  });

  afterEach(() => {
    resetSnapshotCoalesceForTests();
  });

  it("persists only arrived/departed and keeps vanished as-flown rows", async () => {
    const first = bundle([
      opsMove("BQ1906", "departure", "2026-09-05", "10:00", "departed"),
      opsMove("NJE1AB", "arrival", "2026-09-05", "12:00", "arrived"),
      opsMove("SWU1904", "departure", "2026-09-05", "11:00", "estimated"),
    ]);
    await upsertFromOpsBundle(first, { root, now: FIXED_NOW });

    const second = bundle([
      opsMove("BQ1906", "departure", "2026-09-05", "10:05", "departed"),
      // NJE1AB vanished from live board — must remain
    ]);
    await upsertFromOpsBundle(second, { root, now: FIXED_NOW });

    const day = await loadHistoryDay("2026-09-05", { root, now: FIXED_NOW });
    expect(day).not.toBeNull();
    expect(day!.movements.map((m) => m.flightNumber).sort()).toEqual([
      "BQ1906",
      "NJE1AB",
    ]);
    expect(day!.movements.find((m) => m.flightNumber === "BQ1906")?.at).toBe(
      fromZonedLocal("2026-09-05", "10:05").toISOString(),
    );
    expect(day!.movements[0]).not.toHaveProperty("status");
    expect(day).not.toHaveProperty("updatedAt");
    expect(day).not.toHaveProperty("source");

    const names = readdirSync(root);
    expect(names).toEqual(["2026-09-05.json"]);
    const raw = readFileSync(join(root, "2026-09-05.json"), "utf8");
    expect(raw.includes("\n  ")).toBe(false);
    expect(JSON.parse(raw).dateLocal).toBe("2026-09-05");
    expect(JSON.parse(raw)).not.toHaveProperty("updatedAt");
  });

  it("ignores tomorrow scheduled and writes yesterday terminals", async () => {
    await upsertFromOpsBundle(
      bundle([
        opsMove("BQ1906", "departure", "2026-09-05", "10:00", "departed"),
        opsMove("BQ1907", "arrival", "2026-09-06", "09:00", "scheduled"),
        opsMove("BQ1905", "arrival", "2026-09-04", "21:40", "arrived"),
        opsMove("BQ1999", "arrival", "2026-09-07", "09:00", "arrived"),
      ]),
      { root, now: FIXED_NOW },
    );
    expect(readdirSync(root).sort()).toEqual([
      "2026-09-04.json",
      "2026-09-05.json",
    ]);
  });

  it("does not rewrite when the as-flown list is unchanged", async () => {
    const payload = bundle([
      opsMove("BQ1906", "departure", "2026-09-05", "10:00", "departed"),
    ]);
    const first = await upsertFromOpsBundle(payload, { root, now: FIXED_NOW });
    expect(first.written).toEqual(["2026-09-05"]);
    const before = readFileSync(join(root, "2026-09-05.json"), "utf8");

    const second = await upsertFromOpsBundle(payload, { root, now: FIXED_NOW });
    expect(second.written).toEqual([]);
    expect(second.unchanged).toEqual(["2026-09-05"]);
    expect(readFileSync(join(root, "2026-09-05.json"), "utf8")).toBe(before);
  });

  it("does not create a file when the bundle is only scheduled", async () => {
    const result = await upsertFromOpsBundle(
      bundle([opsMove("BQ1906", "departure", "2026-09-05", "10:00", "scheduled")]),
      { root, now: FIXED_NOW },
    );
    expect(result.written).toEqual([]);
    expect(readdirSync(root)).toEqual([]);
  });

  it("reads legacy snapshot files and keeps only as-flown rows", async () => {
    writeFileSync(
      join(root, "2026-09-05.json"),
      JSON.stringify(
        {
          dateLocal: "2026-09-05",
          updatedAt: FIXED_NOW.toISOString(),
          source: "flightaware",
          movements: [
            {
              flightNumber: "BQ1906",
              direction: "departure",
              otherAirport: "OLB",
              otherCity: "Olbia",
              at: fromZonedLocal("2026-09-05", "10:00").toISOString(),
              dateLocal: "2026-09-05",
              status: "departed",
              source: "ops",
              scheduledAt: fromZonedLocal("2026-09-05", "09:55").toISOString(),
              aircraft: "DH8D",
            },
            {
              flightNumber: "NJE1AB",
              direction: "arrival",
              otherAirport: "IBZ",
              otherCity: "Ibiza",
              at: fromZonedLocal("2026-09-05", "12:00").toISOString(),
              dateLocal: "2026-09-05",
              status: "estimated",
              source: "ops",
            },
            {
              flightNumber: "IAM9001",
              direction: "arrival",
              otherAirport: "CIA",
              otherCity: "Rome",
              at: fromZonedLocal("2026-09-05", "09:00").toISOString(),
              dateLocal: "2026-09-05",
            },
          ],
        },
        null,
        2,
      ),
    );
    const day = await loadHistoryDay("2026-09-05", { root, now: FIXED_NOW });
    expect(day!.movements.map((m) => m.flightNumber)).toEqual([
      "BQ1906",
      "IAM9001",
    ]);
    expect(day!.movements[0]).not.toHaveProperty("status");
    expect(day!.movements[0]).not.toHaveProperty("scheduledAt");
  });

  it("rejects oversized day writes without clobbering a good file", async () => {
    await upsertFromOpsBundle(
      bundle([opsMove("BQ1906", "departure", "2026-09-05", "10:00", "departed")]),
      { root, now: FIXED_NOW },
    );
    const before = readFileSync(join(root, "2026-09-05.json"), "utf8");

    const fat = opsMove("HUGE1", "arrival", "2026-09-05", "12:00", "arrived");
    fat.aircraft = "X".repeat(MAX_DAY_FILE_BYTES);
    await expect(
      upsertFromOpsBundle(bundle([fat]), { root, now: FIXED_NOW }),
    ).rejects.toThrow(/max size/);
    expect(readFileSync(join(root, "2026-09-05.json"), "utf8")).toBe(before);
  });

  it("prunes files older than retention", async () => {
    const old = addLocalDays(todayLocalDate(FIXED_NOW), -(RETENTION_DAYS + 5));
    const keep = addLocalDays(todayLocalDate(FIXED_NOW), -10);
    writeFileSync(
      join(root, `${old}.json`),
      JSON.stringify({
        dateLocal: old,
        movements: [
          {
            flightNumber: "BQ1",
            direction: "arrival",
            otherAirport: "OLB",
            otherCity: "Olbia",
            at: FIXED_NOW.toISOString(),
            dateLocal: old,
          },
        ],
      }),
    );
    writeFileSync(
      join(root, `${keep}.json`),
      JSON.stringify({
        dateLocal: keep,
        movements: [
          {
            flightNumber: "BQ2",
            direction: "arrival",
            otherAirport: "OLB",
            otherCity: "Olbia",
            at: FIXED_NOW.toISOString(),
            dateLocal: keep,
          },
        ],
      }),
    );
    const removed = await pruneHistory({ root, now: FIXED_NOW });
    expect(removed).toBe(1);
    expect(readdirSync(root)).toEqual([`${keep}.json`]);
  });

  it("listHistoryDates is bounded, newest-first, and skips empty days", async () => {
    for (const d of ["2026-09-03", "2026-09-05", "2026-09-04"]) {
      writeFileSync(
        join(root, `${d}.json`),
        JSON.stringify({
          dateLocal: d,
          movements: [
            {
              flightNumber: "BQ1",
              direction: "arrival",
              otherAirport: "OLB",
              otherCity: "Olbia",
              at: FIXED_NOW.toISOString(),
              dateLocal: d,
            },
          ],
        }),
      );
    }
    writeFileSync(
      join(root, "2026-09-02.json"),
      JSON.stringify({ dateLocal: "2026-09-02", movements: [] }),
    );
    writeFileSync(join(root, "not-a-date.json"), "{}");
    writeFileSync(join(root, "evil..name.json"), "{}");
    expect(await listHistoryDates({ root, now: FIXED_NOW })).toEqual([
      "2026-09-05",
      "2026-09-04",
      "2026-09-03",
    ]);
  });

  it("browse outside retention does not create files", async () => {
    const far = "2020-01-01";
    expect(await loadHistoryDay(far, { root, now: FIXED_NOW })).toBeNull();
    expect(readdirSync(root)).toEqual([]);
  });

  it("parallel upserts leave valid JSON", async () => {
    const a = bundle([
      opsMove("BQ1906", "departure", "2026-09-05", "10:00", "departed"),
    ]);
    const b = bundle([
      opsMove("NJE1AB", "arrival", "2026-09-05", "11:00", "arrived"),
    ]);
    await Promise.all([
      upsertFromOpsBundle(a, { root, now: FIXED_NOW }),
      upsertFromOpsBundle(b, { root, now: FIXED_NOW }),
    ]);
    const day = await loadHistoryDay("2026-09-05", { root, now: FIXED_NOW });
    expect(day).not.toBeNull();
    JSON.parse(readFileSync(join(root, "2026-09-05.json"), "utf8"));
    expect(day!.movements.length).toBeGreaterThanOrEqual(1);
  });
});

describe("runHistorySnapshot coalesce + lock", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lipb-snap-"));
    resetSnapshotCoalesceForTests();
  });

  afterEach(() => {
    resetSnapshotCoalesceForTests();
  });

  it("coalesces a second call within the window as unchanged", async () => {
    const fetchOps = vi.fn(async () =>
      bundle([opsMove("BQ1906", "departure", "2026-09-05", "10:00", "departed")]),
    );
    const first = await runHistorySnapshot({
      fetchOps,
      root,
      now: FIXED_NOW,
      coalesceMs: COALESCE_MS,
    });
    expect(first.ok).toBe(true);
    expect(first.coalesced).toBeFalsy();
    expect(fetchOps).toHaveBeenCalledTimes(1);

    const second = await runHistorySnapshot({
      fetchOps,
      root,
      now: new Date(FIXED_NOW.getTime() + 30_000),
      coalesceMs: COALESCE_MS,
    });
    expect(second.coalesced).toBe(true);
    expect(second.unchanged).toBe(true);
    expect(fetchOps).toHaveBeenCalledTimes(1);
  });

  it("shares a single in-flight promise", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const fetchOps = vi.fn(async () => {
      await gate;
      return bundle([
        opsMove("BQ1906", "departure", "2026-09-05", "10:00", "departed"),
      ]);
    });
    const a = runHistorySnapshot({
      fetchOps,
      root,
      now: FIXED_NOW,
      force: true,
    });
    const b = runHistorySnapshot({
      fetchOps,
      root,
      now: FIXED_NOW,
      force: true,
    });
    release();
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toEqual(rb);
    expect(fetchOps).toHaveBeenCalledTimes(1);
  });

  it("marks a no-op ingest as unchanged", async () => {
    const fetchOps = vi.fn(async () =>
      bundle([opsMove("BQ1906", "departure", "2026-09-05", "10:00", "scheduled")]),
    );
    const result = await runHistorySnapshot({
      fetchOps,
      root,
      now: FIXED_NOW,
      force: true,
    });
    expect(result.ok).toBe(true);
    expect(result.unchanged).toBe(true);
    expect(result.written).toEqual([]);
  });
});

describe("authorizeCron", () => {
  const prev = process.env.CRON_SECRET;

  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prev;
  });

  it("rejects missing secret and wrong bearer", () => {
    delete process.env.CRON_SECRET;
    expect(
      authorizeCron(new Request("http://localhost", { method: "POST" })),
    ).toBe(false);

    process.env.CRON_SECRET = "correct-horse-battery";
    expect(
      authorizeCron(
        new Request("http://localhost", {
          method: "POST",
          headers: { Authorization: "Bearer wrong" },
        }),
      ),
    ).toBe(false);
    expect(
      authorizeCron(
        new Request("http://localhost", {
          method: "POST",
          headers: { Authorization: "Bearer correct-horse-battery" },
        }),
      ),
    ).toBe(true);
  });
});

describe("serialize round-trip", () => {
  it("round-trips allowlisted fields without status or schedule", () => {
    const m = opsMove("BQ1906", "departure", "2026-09-05", "10:00", "departed");
    m.scheduledAt = fromZonedLocal("2026-09-05", "09:55");
    const serialized = serializeAsFlown(m);
    expect(serialized).not.toHaveProperty("status");
    expect(serialized).not.toHaveProperty("scheduledAt");
    expect(serialized).not.toHaveProperty("source");
    const back = deserializeAsFlown(serialized);
    expect(back.flightNumber).toBe("BQ1906");
    expect(back.source).toBe("ops");
    expect(back.aircraft).toBe("DH8D");
  });
});

describe("MAX_DAY_FILE_BYTES constant", () => {
  it("is 2 MiB", () => {
    expect(MAX_DAY_FILE_BYTES).toBe(2 * 1024 * 1024);
  });
});
