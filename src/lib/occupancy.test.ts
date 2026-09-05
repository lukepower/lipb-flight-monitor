import { describe, expect, it } from "vitest";
import { fromZonedLocal } from "@/lib/time";
import {
  invertFree,
  mergeOccupied,
  movementOccupancy,
  vfrWindowsForDay,
  type Movement,
} from "@/lib/occupancy";

function movement(
  id: string,
  direction: Movement["direction"],
  dateLocal: string,
  time: string,
): Movement {
  return {
    id,
    flightNumber: id.toUpperCase(),
    direction,
    otherAirport: "BER",
    otherCity: "Berlin",
    at: fromZonedLocal(dateLocal, time),
    dateLocal,
  };
}

describe("occupancy", () => {
  it("gives a 12-minute arrival sector before STA", () => {
    const m = movement("arr", "arrival", "2026-09-05", "12:00");
    const { sector, atz } = movementOccupancy(m);
    expect((m.at.getTime() - sector.start.getTime()) / 60000).toBe(12);
    expect(sector.end.getTime()).toBe(m.at.getTime());
    expect((m.at.getTime() - atz.start.getTime()) / 60000).toBe(8);
    expect((atz.end.getTime() - m.at.getTime()) / 60000).toBe(5);
  });

  it("gives departure ATZ and climb-out sector", () => {
    const m = movement("dep", "departure", "2026-09-05", "10:00");
    const { sector, atz } = movementOccupancy(m);
    expect(sector.start.getTime()).toBe(m.at.getTime());
    expect((sector.end.getTime() - m.at.getTime()) / 60000).toBe(10);
    expect((m.at.getTime() - atz.start.getTime()) / 60000).toBe(5);
    expect((atz.end.getTime() - m.at.getTime()) / 60000).toBe(8);
  });

  it("merges overlapping ATZ blocks", () => {
    const a = movement("a", "arrival", "2026-09-05", "12:00");
    const b = movement("b", "departure", "2026-09-05", "12:06");
    const merged = mergeOccupied([a, b], "atz");
    expect(merged).toHaveLength(1);
    expect(merged[0].movements).toHaveLength(2);
  });

  it("inverts busy blocks into holes", () => {
    const start = fromZonedLocal("2026-09-05", "08:00");
    const end = fromZonedLocal("2026-09-05", "12:00");
    const holes = invertFree(
      { start, end },
      [
        {
          start: fromZonedLocal("2026-09-05", "09:00"),
          end: fromZonedLocal("2026-09-05", "09:30"),
        },
      ],
    );
    expect(holes).toHaveLength(2);
    expect((holes[0].end.getTime() - holes[0].start.getTime()) / 60000).toBe(60);
    expect((holes[1].end.getTime() - holes[1].start.getTime()) / 60000).toBe(150);
  });

  it("finds a long morning VFR hole on a quiet Monday", () => {
    const date = "2026-09-07";
    const movements = [movement("one", "departure", date, "14:50")];
    const windows = vfrWindowsForDay(date, movements, 45);
    expect(windows.length).toBeGreaterThan(0);
    expect(windows[0].durationMin).toBeGreaterThan(180);
  });
});
