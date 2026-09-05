import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  clockLegend,
  formatLocalHm,
  formatUtcHm,
  fromZonedLocal,
  isoWeekday,
  zoneAbbrev,
  zoneOffsetLabel,
} from "@/lib/time";

describe("clock zone", () => {
  it("formats the same instant as Rome local and as UTC without mixing", () => {
    const at = fromZonedLocal("2026-09-05", "14:00");
    expect(formatLocalHm(at)).toBe("14:00");
    expect(formatUtcHm(at)).toBe("12:00Z");
    expect(zoneAbbrev(at)).toMatch(/CEST|GMT\+2|UTC\+2/);
    expect(zoneOffsetLabel(at)).toMatch(/UTC\+2|GMT\+2/);
    expect(clockLegend(at)).toContain("Bolzano local");
    expect(clockLegend(at)).not.toMatch(/^UTC$/);
  });

  it("uses CET in January", () => {
    const at = fromZonedLocal("2026-01-15", "14:00");
    expect(formatLocalHm(at)).toBe("14:00");
    expect(formatUtcHm(at)).toBe("13:00Z");
    expect(zoneOffsetLabel(at)).toMatch(/UTC\+1|GMT\+1/);
  });

  it("adds calendar days and reports ISO weekday in Rome", () => {
    expect(addLocalDays("2026-09-05", 1)).toBe("2026-09-06");
    expect(addLocalDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isoWeekday("2026-09-05")).toBe(6);
    expect(isoWeekday("2026-09-07")).toBe(1);
  });
});
