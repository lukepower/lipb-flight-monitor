import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "@/lib/cache";

describe("TtlCache", () => {
  it("deduplicates concurrent in-flight requests and caches result", async () => {
    const cache = new TtlCache<number>();
    let calls = 0;
    const loader = vi.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return calls * 10;
    });

    const [a, b, c] = await Promise.all([
      cache.getOrFetch("k", 5_000, loader),
      cache.getOrFetch("k", 5_000, loader),
      cache.getOrFetch("k", 5_000, loader),
    ]);

    expect(a).toBe(10);
    expect(b).toBe(10);
    expect(c).toBe(10);
    expect(loader).toHaveBeenCalledTimes(1);

    // Subsequent call within TTL hits cache without invoking loader
    const cachedVal = await cache.getOrFetch("k", 5_000, loader);
    expect(cachedVal).toBe(10);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("retains stale entry via peek after TTL expires", () => {
    const cache = new TtlCache<string>();
    cache.set("ops", "last-known-good", 1_000);
    expect(cache.getFresh("ops", 500, 1_200)).toBe("last-known-good");
    expect(cache.getFresh("ops", 500, 2_000)).toBeUndefined();
    expect(cache.peek("ops")?.value).toBe("last-known-good");
  });
});
