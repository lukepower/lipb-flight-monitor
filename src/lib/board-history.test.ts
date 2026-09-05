import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadHistoryBoard } from "@/lib/board";
import {
  resetSnapshotCoalesceForTests,
  upsertFromOpsBundle,
} from "@/lib/history";
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

describe("loadHistoryBoard", () => {
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

  it("merges archived ops with timetable and never calls live fetch", async () => {
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

    const board = await loadHistoryBoard("2026-09-05", FIXED_NOW);
    expect(board.invalidDate).toBe(false);
    expect(board.day).not.toBeNull();
    expect(board.day!.movements.some((m) => m.flightNumber === "NJE1AB")).toBe(
      true,
    );
    expect(board.day!.windows.every((w) => w.weatherSource === "none")).toBe(
      true,
    );
  });

  it("flags invalid dates without reading escape paths", async () => {
    const board = await loadHistoryBoard("../../../etc/passwd", FIXED_NOW);
    expect(board.invalidDate).toBe(true);
    expect(board.day).toBeNull();
  });
});
