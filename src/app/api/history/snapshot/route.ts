import { fetchLiveOps } from "@/lib/ops-flights";
import { authorizeCron, runHistorySnapshot } from "@/lib/history";

export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function cronConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET?.length);
}

export async function POST(request: Request) {
  if (!cronConfigured()) {
    return Response.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  if (!authorizeCron(request)) {
    return unauthorized();
  }

  const result = await runHistorySnapshot({
    fetchOps: () => fetchLiveOps(),
  });

  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        error: result.error ?? "snapshot failed",
        written: result.written,
        movementCount: result.movementCount,
      },
      { status: 502 },
    );
  }

  return Response.json({
    ok: true,
    coalesced: result.coalesced ?? false,
    written: result.written,
    movementCount: result.movementCount,
    pruned: result.pruned ?? 0,
  });
}

/** Mutations use POST; reject GET so casual probes do not look like a cron target. */
export async function GET() {
  return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
