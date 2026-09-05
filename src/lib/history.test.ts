import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COALESCE_MS,
  MAX_DAY_FILE_BYTES,
  RETENTION_DAYS,
  authorizeCron,
  dayFilePath,
  deserializeOpsMovement,
  listHistoryDates,
  loadHistoryDay,
  parseBrowseDate,
  parseCalendarDate,
  preferMovement,
  pruneHistory,
  resetSnapshotCoalesceForTests,
  runHistorySnapshot,
  serializeOpsMovement,
  upsertFromOpsBundle,
  type SerializedOpsMovement,
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

describe("dayFilePath containment", () => {
  it("maps only to HISTORY_DIR/date.json", () => {
    const root = join(tmpdir(), "hist-root");
    expect(dayFilePath("2026-09-05", root)).toBe(join(root, "2026-09-05.json"));
    expect(dayFilePath("../etc/passwd", root)).toBeNull();
    expect(dayFilePath("2026-09-05/../../x", root)).toBeNull();
  });
});

describe("preferMovement", () => {
  const base: SerializedOpsMovement = {
    flightNumber: "BQ1906",
    direction: "departure",
    otherAirport: "OLB",
    otherCity: "Olbia",
    at: fromZonedLocal("2026-09-05", "10:00").toISOString(),
    dateLocal: "2026-09-05",
    status: "estimated",
    source: "ops",
  };

  it("prefers terminal status over estimated", () => {
    const next = {
      ...base,
      status: "departed" as const,
      at: fromZonedLocal("2026-09-05", "10:05").toISOString(),
    };
    expect(preferMovement(base, next).status).toBe("departed");
  });

  it("keeps terminal when incoming is weaker", () => {
    const terminal = { ...base, status: "arrived" as const };
    const weak = { ...base, status: "enroute" as const };
    expect(preferMovement(terminal, weak).status).toBe("arrived");
  });

  it("strips unknown fields via sanitize", () => {
    const dirty = {
      ...base,
      evil: "drop-me",
      status: "departed" as const,
    } as SerializedOpsMovement & { evil: string };
    const clean = preferMovement(base, dirty);
    expect(clean).not.toHaveProperty("evil");
    expect(clean.source).toBe("ops");
    expect(clean.status).toBe("departed");
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

  it("writes only under root for today and keeps vanished mid-day rows", async () => {
    const first = bundle([
      opsMove("BQ1906", "departure", "2026-09-05", "10:00", "estimated"),
      opsMove("NJE1AB", "arrival", "2026-09-05", "12:00", "enroute"),
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
    expect(day!.movements.find((m) => m.flightNumber === "BQ1906")?.status).toBe(
      "departed",
    );

    const names = readdirSync(root);
    expect(names).toEqual(["2026-09-05.json"]);
    const raw = readFileSync(join(root, "2026-09-05.json"), "utf8");
    expect(JSON.parse(raw).dateLocal).toBe("2026-09-05");
  });

  it("splits multi-day bundles into today and tomorrow files", async () => {
    await upsertFromOpsBundle(
      bundle([
        opsMove("BQ1906", "departure", "2026-09-05", "10:00", "scheduled"),
        opsMove("BQ1907", "arrival", "2026-09-06", "09:00", "scheduled"),
        opsMove("BQ1999", "arrival", "2026-09-07", "09:00", "scheduled"), // skipped
      ]),
      { root, now: FIXED_NOW },
    );
    expect(readdirSync(root).sort()).toEqual([
      "2026-09-05.json",
      "2026-09-06.json",
    ]);
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
        updatedAt: FIXED_NOW.toISOString(),
        source: "flightaware",
        movements: [],
      }),
    );
    writeFileSync(
      join(root, `${keep}.json`),
      JSON.stringify({
        dateLocal: keep,
        updatedAt: FIXED_NOW.toISOString(),
        source: "flightaware",
        movements: [],
      }),
    );
    const removed = await pruneHistory({ root, now: FIXED_NOW });
    expect(removed).toBe(1);
    expect(readdirSync(root)).toEqual([`${keep}.json`]);
  });

  it("listHistoryDates is bounded and newest-first", async () => {
    for (const d of ["2026-09-03", "2026-09-05", "2026-09-04"]) {
      writeFileSync(
        join(root, `${d}.json`),
        JSON.stringify({
          dateLocal: d,
          updatedAt: FIXED_NOW.toISOString(),
          source: "flightaware",
          movements: [],
        }),
      );
    }
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
      opsMove("BQ1906", "departure", "2026-09-05", "10:00", "estimated"),
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

  it("coalesces a second call within the window", async () => {
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
  it("round-trips allowlisted fields", () => {
    const m = opsMove("BQ1906", "departure", "2026-09-05", "10:00", "departed");
    m.scheduledAt = fromZonedLocal("2026-09-05", "09:55");
    const back = deserializeOpsMovement(serializeOpsMovement(m));
    expect(back.flightNumber).toBe("BQ1906");
    expect(back.status).toBe("departed");
    expect(back.scheduledAt?.toISOString()).toBe(m.scheduledAt.toISOString());
    expect(back.source).toBe("ops");
  });
});

describe("MAX_DAY_FILE_BYTES constant", () => {
  it("is 2 MiB", () => {
    expect(MAX_DAY_FILE_BYTES).toBe(2 * 1024 * 1024);
  });
});
