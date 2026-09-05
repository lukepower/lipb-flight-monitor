import { describe, expect, it } from "vitest";
import { MIN_WINDOW_MINUTES } from "@/lib/constants";
import { filterHoles, parseHoleThreshold } from "@/lib/holes";

describe("hole threshold", () => {
  it("accepts the hangar presets and otherwise falls back to 45", () => {
    expect(parseHoleThreshold("20")).toBe(20);
    expect(parseHoleThreshold(90)).toBe(90);
    expect(parseHoleThreshold("17")).toBe(MIN_WINDOW_MINUTES);
    expect(parseHoleThreshold(null)).toBe(MIN_WINDOW_MINUTES);
  });

  it("drops windows shorter than the chosen minimum", () => {
    const kept = filterHoles(
      [{ durationMin: 20 }, { durationMin: 44 }, { durationMin: 45 }],
      45,
    );
    expect(kept).toEqual([{ durationMin: 45 }]);
  });
});
