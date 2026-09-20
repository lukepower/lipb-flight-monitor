import { afterEach, describe, expect, it } from "vitest";
import { ifrBusyIcs, publicOrigin, vfrWindowsIcs } from "@/lib/ics";
import { fromZonedLocal } from "@/lib/time";
import type { Movement, OccupiedBlock, VfrWindow } from "@/lib/occupancy";

const window: VfrWindow = {
  start: fromZonedLocal("2026-09-05", "08:00"),
  end: fromZonedLocal("2026-09-05", "10:00"),
  dateLocal: "2026-09-05",
  durationMin: 120,
  nearbyMovements: 1,
};

const movement: Movement = {
  id: "bq1906-dep-2026-09-05",
  flightNumber: "BQ1906",
  direction: "departure",
  otherAirport: "OLB",
  otherCity: "Olbia",
  at: fromZonedLocal("2026-09-05", "07:00"),
  dateLocal: "2026-09-05",
  source: "timetable",
};

const atz: OccupiedBlock = {
  start: fromZonedLocal("2026-09-05", "06:55"),
  end: fromZonedLocal("2026-09-05", "07:08"),
  kind: "atz",
  movements: [movement],
};

describe("ICS feeds", () => {
  it("emits a VFR calendar with UTC DTSTART/DTEND", () => {
    const ics = vfrWindowsIcs(
      [{ window, weatherNote: "CAVOK", quality: "good" }],
      "https://example.test",
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toMatch(/DTSTART:20260905T060000Z/);
    expect(ics).toMatch(/DTEND:20260905T080000Z/);
    expect(ics).toContain("URL:https://example.test/");
    expect(ics).toContain("VFR hole 08:00");
  });

  it("emits IFR movement and ATZ-busy events", () => {
    const ics = ifrBusyIcs([movement], [atz], "https://example.test");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("SUMMARY:DEP BQ1906 Olbia");
    expect(ics).toMatch(/DTSTART:20260905T050000Z/);
    expect(ics).toContain("LIPB runway busy");
    expect(ics).toContain("BQ1906");
  });
});

describe("publicOrigin", () => {
  afterEach(() => {
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
  });

  it("prefers RAILWAY_PUBLIC_DOMAIN and uses https", () => {
    process.env.RAILWAY_PUBLIC_DOMAIN = "lipb.example.com";
    const origin = publicOrigin(new Request("http://localhost:43147/api/calendar"));
    expect(origin).toBe("https://lipb.example.com");
  });

  it("falls back to the request host on localhost", () => {
    const origin = publicOrigin(
      new Request("http://127.0.0.1:43147/", {
        headers: { host: "localhost:43147" },
      }),
    );
    expect(origin).toBe("http://localhost:43147");
  });
});
