import { describe, expect, it } from "vitest";
import { daylightForDate } from "@/lib/daylight";
import { formatLocalHm, fromZonedLocal } from "@/lib/time";

describe("daylightForDate", () => {
  it("keeps dawn before sunrise and clips VFR to airport hours in summer", () => {
    const day = daylightForDate("2026-06-21");
    expect(day.dawn.getTime()).toBeLessThan(day.sunrise.getTime());
    expect(day.sunrise.getTime()).toBeLessThan(day.sunset.getTime());
    expect(day.sunset.getTime()).toBeLessThan(day.dusk.getTime());
    expect(formatLocalHm(day.airportOpen)).toBe("04:30");
    expect(formatLocalHm(day.airportClose)).toBe("22:00");
    expect(day.vfrStart.getTime()).toBe(
      Math.max(day.dawn.getTime(), day.airportOpen.getTime()),
    );
    expect(day.vfrEnd.getTime()).toBe(
      Math.min(day.dusk.getTime(), day.airportClose.getTime()),
    );
    expect(day.vfrStart.getTime()).toBeGreaterThanOrEqual(day.airportOpen.getTime());
    expect(day.vfrEnd.getTime()).toBeLessThanOrEqual(day.airportClose.getTime());
  });

  it("uses civil twilight as the VFR bounds on a short winter day", () => {
    const day = daylightForDate("2026-01-15");
    expect(day.dawn.getTime()).toBeLessThan(day.sunrise.getTime());
    expect(day.dusk.getTime()).toBeGreaterThan(day.sunset.getTime());
    expect(day.dawn.getTime()).toBeGreaterThan(day.airportOpen.getTime());
    expect(day.dusk.getTime()).toBeLessThan(day.airportClose.getTime());
    expect(day.vfrStart.getTime()).toBe(day.dawn.getTime());
    expect(day.vfrEnd.getTime()).toBe(day.dusk.getTime());
    expect(day.vfrStart.getTime()).toBeGreaterThan(
      fromZonedLocal("2026-01-15", "06:30").getTime(),
    );
    expect(day.vfrEnd.getTime()).toBeLessThan(
      fromZonedLocal("2026-01-15", "18:00").getTime(),
    );
  });
});
