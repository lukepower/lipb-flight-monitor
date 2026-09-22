import { describe, expect, it } from "vitest";
import { eachDate, movementsOnDate, seasonDateRange } from "@/lib/schedule";
import { fromZonedLocal } from "@/lib/time";

describe("schedule", () => {
  it("expands Excel Saturday legs with OLB times from programmazione", () => {
    const movements = movementsOnDate("2026-09-05");
    const olbiaDep = movements.find(
      (m) => m.flightNumber === "BQ1906" && m.direction === "departure",
    );
    const olbiaArr = movements.find(
      (m) => m.flightNumber === "BQ1907" && m.direction === "arrival",
    );
    const preveza = movements.find(
      (m) => m.flightNumber === "BQ1938" && m.direction === "departure",
    );
    expect(olbiaDep?.otherAirport).toBe("OLB");
    expect(olbiaDep?.source).toBe("timetable");
    expect(olbiaDep?.at.getTime()).toBe(fromZonedLocal("2026-09-05", "07:00").getTime());
    expect(olbiaArr?.at.getTime()).toBe(fromZonedLocal("2026-09-05", "10:45").getTime());
    expect(preveza?.otherAirport).toBe("PVK");
    expect(movements.every((m) => m.source !== "extra")).toBe(true);
    expect(movements.length).toBe(18);
  });

  it("marks ferry legs as extra on the day board", () => {
    const movements = movementsOnDate("2026-04-01");
    const ferryIn = movements.find((m) => m.flightNumber === "BQ701");
    expect(ferryIn?.source).toBe("extra");
    expect(ferryIn?.direction).toBe("arrival");
    expect(ferryIn?.otherAirport).toBe("FCO");
    expect(ferryIn?.note).toMatch(/FERRY/i);
  });

  it("returns no timetable flights outside the season", () => {
    expect(seasonDateRange()).toEqual({ from: "2026-04-01", to: "2026-10-24" });
    expect(movementsOnDate("2026-01-15")).toEqual([]);
    expect(movementsOnDate("2026-03-29")).toEqual([]);
  });

  it("lists eachDate inclusively", () => {
    expect(eachDate("2026-09-05", "2026-09-07")).toEqual([
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
    ]);
  });
});
