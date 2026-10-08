import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultOfficialMonth,
  listOfficialMonths,
  loadOfficialMonth,
  movementsOnOfficialDate,
  parseOfficialBrowseDate,
  parseOfficialBrowseMonth,
  parseOfficialScheduleText,
} from "@/lib/official-schedule";

const sampleText = readFileSync(
  resolve(process.cwd(), "data/official-schedule-sample.txt"),
  "utf8",
);

describe("parseOfficialScheduleText", () => {
  it("parses weekday headers and dep/arr triples from a fixture", () => {
    const file = parseOfficialScheduleText(sampleText, {
      year: 2026,
      source: "sample.txt",
      month: "2026-10",
    });
    expect(file.month).toBe("2026-10");
    expect(file.from).toBe("2026-10-01");
    expect(file.to).toBe("2026-10-02");
    expect(file.movements).toHaveLength(6);

    const hajDep = file.movements.find((m) => m.id === "2026-10-01-BQ1980-dep");
    expect(hajDep).toMatchObject({
      direction: "departure",
      otherAirport: "HAJ",
      otherCity: "Hannover",
      timeLocal: "09:05",
    });

    const anrArr = file.movements.find((m) => m.id === "2026-10-01-BQ1964-arr");
    expect(anrArr).toMatchObject({
      direction: "arrival",
      otherAirport: "ANR",
      timeLocal: "14:05",
    });
  });
});

describe("official October seed", () => {
  it("lists and loads the imported 2026-10 month", () => {
    const months = listOfficialMonths();
    expect(months).toContain("2026-10");
    const file = loadOfficialMonth("2026-10");
    expect(file?.movements.length).toBe(188);
    expect(file?.from).toBe("2026-10-01");
    expect(file?.to).toBe("2026-10-24");

    const day = movementsOnOfficialDate(file!, "2026-10-01");
    expect(day).toHaveLength(10);
    expect(day[0].flightNumber).toBe("BQ1980");
  });

  it("defaults to latest month when current month is unavailable", () => {
    expect(defaultOfficialMonth(["2026-09", "2026-10"], new Date("2026-04-01T12:00:00Z"))).toBe(
      "2026-10",
    );
    expect(
      defaultOfficialMonth(["2026-09", "2026-10"], new Date("2026-10-08T12:00:00+02:00")),
    ).toBe("2026-10");
  });

  it("accepts browse params only for imported months/dates", () => {
    const file = loadOfficialMonth("2026-10");
    expect(parseOfficialBrowseMonth("2026-10", ["2026-10"])).toBe("2026-10");
    expect(parseOfficialBrowseMonth("2026-11", ["2026-10"])).toBeNull();
    expect(parseOfficialBrowseDate("2026-10-01", file)).toBe("2026-10-01");
    expect(parseOfficialBrowseDate("2026-10-31", file)).toBeNull();
  });
});
