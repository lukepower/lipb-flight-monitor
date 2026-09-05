import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSnapshotCoalesceForTests } from "@/lib/history";
import type { OpsBundle } from "@/lib/ops-flights";
import { fromZonedLocal } from "@/lib/time";

const FIXED_NOW = fromZonedLocal("2026-09-05", "14:00");

const fetchLiveOps = vi.fn();

vi.mock("@/lib/ops-flights", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ops-flights")>();
  return {
    ...actual,
    fetchLiveOps: (...args: unknown[]) => fetchLiveOps(...args),
  };
});

describe("POST /api/history/snapshot", () => {
  let root: string;
  const prevSecret = process.env.CRON_SECRET;
  const prevDir = process.env.HISTORY_DIR;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lipb-api-hist-"));
    process.env.HISTORY_DIR = root;
    process.env.CRON_SECRET = "test-cron-secret-value";
    resetSnapshotCoalesceForTests();
    fetchLiveOps.mockReset();
    fetchLiveOps.mockResolvedValue({
      movements: [
        {
          id: "BQ1906-departure-2026-09-05",
          flightNumber: "BQ1906",
          direction: "departure",
          otherAirport: "OLB",
          otherCity: "Olbia",
          at: fromZonedLocal("2026-09-05", "10:00"),
          dateLocal: "2026-09-05",
          source: "ops",
          status: "departed",
        },
      ],
      source: "flightaware",
      fetchedAt: FIXED_NOW.toISOString(),
    } satisfies OpsBundle);
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevSecret;
    if (prevDir === undefined) delete process.env.HISTORY_DIR;
    else process.env.HISTORY_DIR = prevDir;
    resetSnapshotCoalesceForTests();
  });

  async function loadRoute() {
    return import("@/app/api/history/snapshot/route");
  }

  it("returns 401 without Authorization and does not fetch", async () => {
    const { POST } = await loadRoute();
    const res = await POST(new Request("http://localhost/api/history/snapshot", { method: "POST" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(JSON.stringify(body)).not.toMatch(/[A-Z]:\\|\/data\/history|tmp/);
    expect(fetchLiveOps).not.toHaveBeenCalled();
  });

  it("returns 401 for wrong secret and does not fetch", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://localhost/api/history/snapshot", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-secret" },
      }),
    );
    expect(res.status).toBe(401);
    expect(fetchLiveOps).not.toHaveBeenCalled();
  });

  it("returns 401 when CRON_SECRET is unset in production", async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://localhost/api/history/snapshot", {
        method: "POST",
        headers: { Authorization: "Bearer anything" },
      }),
    );
    expect(res.status).toBe(401);
    expect(fetchLiveOps).not.toHaveBeenCalled();
  });

  it("writes history with a valid Bearer token", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://localhost/api/history/snapshot", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret-value" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.written).toContain("2026-09-05");
    expect(body.unchanged).toBe(false);
    expect(fetchLiveOps).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(body)).not.toMatch(/stack|Error:/);
  });

  it("returns unchanged when a second ingest has nothing new", async () => {
    const { POST } = await loadRoute();
    const req = () =>
      new Request("http://localhost/api/history/snapshot", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret-value" },
      });
    expect((await POST(req())).status).toBe(200);
    resetSnapshotCoalesceForTests();
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.unchanged).toBe(true);
    expect(body.written).toEqual([]);
  });

  it("rejects GET", async () => {
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(405);
  });
});
