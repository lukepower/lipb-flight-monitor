import { describe, expect, it } from "vitest";
import { buildDayBoard } from "@/lib/board";
import type { TafBundle } from "@/lib/weather";

const EMPTY_TAF: TafBundle = {
  raw: "",
  issuedAt: null,
  validFrom: null,
  validTo: null,
  periods: [],
};

describe("buildDayBoard", () => {
  it("builds a timetable-only Saturday board with holes", () => {
    const board = buildDayBoard("2026-09-05", EMPTY_TAF, []);
    expect(board.dateLocal).toBe("2026-09-05");
    expect(board.movements.some((m) => m.flightNumber === "BQ1906")).toBe(true);
    expect(board.movements.every((m) => m.source === "timetable")).toBe(true);
    expect(board.runway.length).toBe(board.movements.length);
    expect(board.windows.length).toBeGreaterThan(0);
    expect(board.windows.every((w) => w.durationMin >= 20)).toBe(true);
    expect(board.daylight.vfrStartHm).toMatch(/^\d{2}:\d{2}$/);
  });
});
