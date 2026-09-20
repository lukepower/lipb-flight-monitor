import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listHistoryDates,
  loadHistoryDay,
  parseBrowseDate,
  resetSnapshotCoalesceForTests,
  upsertFromOpsBundle,
} from "@/lib/history";
import { movementsOnDate } from "@/lib/schedule";
import type { Movement } from "@/lib/occupancy";
import { fromZonedLocal } from "@/lib/time";

const FIXED_NOW = fromZonedLocal("2026-09-05", "14:00");

vi.mock("@/lib/ops-flights", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ops-flights")>();
  return {
    ...actual,
    fetchLiveOps: vi.fn(async () => {
      throw new Error("fetchLiveOps must not be called from history browse");
    }),
  };
});

describe("history browse", () => {
  let root: string;
  const prevDir = process.env.HISTORY_DIR;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lipb-board-hist-"));
    process.env.HISTORY_DIR = root;
    resetSnapshotCoalesceForTests();
  });

  afterEach(() => {
    if (prevDir === undefined) delete process.env.HISTORY_DIR;
    else process.env.HISTORY_DIR = prevDir;
    resetSnapshotCoalesceForTests();
  });

  it("returns as-flown ops only and never calls live fetch", async () => {
    const ops: Movement = {
      id: "NJE1AB-arrival-2026-09-05",
      flightNumber: "NJE1AB",
      direction: "arrival",
      otherAirport: "IBZ",
      otherCity: "Ibiza",
      at: fromZonedLocal("2026-09-05", "15:00"),
      dateLocal: "2026-09-05",
      source: "ops",
      status: "arrived",
    };
    await upsertFromOpsBundle(
      {
        movements: [ops],
        source: "flightaware",
        fetchedAt: FIXED_NOW.toISOString(),
      },
      { root, now: FIXED_NOW },
    );

    const day = await loadHistoryDay("2026-09-05", { now: FIXED_NOW });
    expect(day).not.toBeNull();
    expect(day!.movements.map((m) => m.flightNumber)).toEqual(["NJE1AB"]);
    const timetableIdents = new Set(
      movementsOnDate("2026-09-05").map((m) => m.flightNumber),
    );
    expect(day!.movements.some((m) => timetableIdents.has(m.flightNumber))).toBe(
      false,
    );
    expect(await listHistoryDates({ now: FIXED_NOW })).toEqual(["2026-09-05"]);
  });

  it("flags invalid dates without reading escape paths", async () => {
    expect(parseBrowseDate("../../../etc/passwd", FIXED_NOW)).toBeNull();
    expect(await loadHistoryDay("../../../etc/passwd", { now: FIXED_NOW })).toBeNull();
  });
});
