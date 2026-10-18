/**
 * Shared server-side TTL cache with single-flight promise deduplication
 * and stale-entry inspection for resilient external API fallbacks.
 */

export type CacheEntry<T> = {
  at: number;
  value: T;
};

export class TtlCache<T = unknown> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly inflight = new Map<string, Promise<T>>();

  /** Return a fresh cached value if within ttlMs, or undefined. */
  getFresh(key: string, ttlMs: number, nowMs = Date.now()): T | undefined {
    const hit = this.store.get(key);
    if (hit && nowMs - hit.at < ttlMs) {
      return hit.value;
    }
    return undefined;
  }

  /** Return the last stored entry regardless of TTL (for stale-on-error fallback). */
  peek(key: string): CacheEntry<T> | undefined {
    return this.store.get(key);
  }

  /** Explicitly store a value in the cache. */
  set(key: string, value: T, nowMs = Date.now()): void {
    this.store.set(key, { at: nowMs, value });
  }

  /** Clear all cached entries and in-flight promises (useful in tests). */
  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }

  /**
   * Fetch with TTL caching and single-flight deduplication:
   * concurrent callers for the same key share a single in-flight promise.
   */
  async getOrFetch<V extends T = T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<V>,
  ): Promise<V> {
    const fresh = this.getFresh(key, ttlMs);
    if (fresh !== undefined) return fresh as V;

    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<V>;

    const promise = fn()
      .then((value) => {
        this.store.set(key, { at: Date.now(), value });
        this.inflight.delete(key);
        return value;
      })
      .catch((error) => {
        this.inflight.delete(key);
        throw error;
      });

    this.inflight.set(key, promise);
    return promise;
  }
}
