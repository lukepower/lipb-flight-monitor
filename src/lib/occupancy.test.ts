import { describe, expect, it } from "vitest";
import { fromZonedLocal } from "@/lib/time";
import {
  invertFree,
  isPastMovement,
  mergeOccupied,
  movementOccupancy,
  runwayWindowFor,
  seasonHeatmap,
  securityCongestion,
  securityWindowFor,
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

  it("gives a 15-minute arrival window ending at landing", () => {
    const m = movement("arr", "arrival", "2026-09-05", "12:00");
    const w = runwayWindowFor(m);
    expect((m.at.getTime() - w.start.getTime()) / 60000).toBe(15);
    expect(w.end.getTime()).toBe(m.at.getTime());
    expect(w.event.getTime()).toBe(m.at.getTime());
  });

  it("gives a short departure taxi window plus 3 minutes after takeoff", () => {
    const m = movement("dep", "departure", "2026-09-05", "10:00");
    const w = runwayWindowFor(m);
    expect((m.at.getTime() - w.start.getTime()) / 60000).toBe(5);
    expect((w.end.getTime() - m.at.getTime()) / 60000).toBe(3);
    expect(w.event.getTime()).toBe(m.at.getTime());
  });

  it("places the security queue from STD−40 to STD−20", () => {
    const m = movement("dep", "departure", "2026-09-05", "10:00");
    const w = securityWindowFor(m);
    expect((m.at.getTime() - w.start.getTime()) / 60000).toBe(40);
    expect((m.at.getTime() - w.end.getTime()) / 60000).toBe(20);
  });

  it("hides security congestion for a single departure", () => {
    expect(
      securityCongestion([movement("one", "departure", "2026-09-05", "10:00")]),
    ).toHaveLength(0);
  });

  it("marks security only where two departure queues overlap", () => {
    const a = movement("a", "departure", "2026-09-05", "10:00");
    const b = movement("b", "departure", "2026-09-05", "10:15");
    const busy = securityCongestion([a, b]);
    expect(busy).toHaveLength(1);
    expect(busy[0].start.getTime()).toBe(fromZonedLocal("2026-09-05", "09:35").getTime());
    expect(busy[0].end.getTime()).toBe(fromZonedLocal("2026-09-05", "09:40").getTime());
    expect(busy[0].movements).toHaveLength(2);
  });

  it("does not treat touching security windows as congestion", () => {
    const a = movement("a", "departure", "2026-09-05", "10:00");
    const b = movement("b", "departure", "2026-09-05", "10:20");
    expect(securityCongestion([a, b])).toHaveLength(0);
  });

  it("finds a long morning VFR hole on a quiet Monday", () => {
    const date = "2026-09-07";
    const movements = [movement("one", "departure", date, "14:50")];
    const windows = vfrWindowsForDay(date, movements, 45);
    expect(windows.length).toBeGreaterThan(0);
    expect(windows[0].durationMin).toBeGreaterThan(180);
  });

  it("buckets a two-hour hole onto weekday hours for the season heatmap", () => {
    const cells = seasonHeatmap([
      {
        start: fromZonedLocal("2026-09-05", "10:00"),
        end: fromZonedLocal("2026-09-05", "12:00"),
        dateLocal: "2026-09-05",
        durationMin: 120,
        nearbyMovements: 0,
      },
    ]);
    const byHour = Object.fromEntries(cells.map((c) => [c.hour, c]));
    expect(byHour[10]?.weekday).toBe(6);
    expect(byHour[10]?.minutes).toBe(60);
    expect(byHour[11]?.minutes).toBe(60);
  });
});

describe("isPastMovement", () => {
  const date = "2026-09-05";
  const noon = fromZonedLocal(date, "12:00");

  it("grays a same-day flight whose clock has already passed", () => {
    const m = movement("arr", "arrival", date, "10:00");
    expect(isPastMovement(m, noon)).toBe(true);
  });

  it("leaves later same-day flights in color", () => {
    const m = movement("dep", "departure", date, "16:00");
    expect(isPastMovement(m, noon)).toBe(false);
  });

  it("never grays tomorrow, even after that wall-clock time today", () => {
    const m = movement("arr", "arrival", "2026-09-06", "10:00");
    expect(isPastMovement(m, noon)).toBe(false);
  });

  it("keeps an airborne/taxiing flight live-colored after STA", () => {
    const m: Movement = {
      ...movement("arr", "arrival", date, "10:00"),
      status: "enroute",
    };
    expect(isPastMovement(m, noon)).toBe(false);
  });

  it("grays arrived/departed even if the ops clock is slightly ahead", () => {
    const m: Movement = {
      ...movement("dep", "departure", date, "12:05"),
      status: "departed",
    };
    expect(isPastMovement(m, noon)).toBe(true);
  });

  it("accepts serialized atIso the same way as a Date", () => {
    const m = movement("arr", "arrival", date, "10:00");
    expect(
      isPastMovement({ dateLocal: m.dateLocal, atIso: m.at.toISOString() }, noon),
    ).toBe(true);
  });
});
