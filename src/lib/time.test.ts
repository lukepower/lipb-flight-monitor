import { describe, expect, it } from "vitest";
import {
  clockLegend,
  formatLocalHm,
  formatUtcHm,
  fromZonedLocal,
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
});
