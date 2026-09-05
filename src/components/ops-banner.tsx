import { Activity, TriangleAlert } from "lucide-react";
import type { DayBoard } from "@/lib/board";
import type { OpsBundle } from "@/lib/ops-flights";
import { formatLocalHm, zoneAbbrev } from "@/lib/time";

export function OpsBanner({
  ops,
  days,
}: {
  ops: OpsBundle;
  days: DayBoard[];
}) {
  const extra = days.reduce(
    (n, day) => n + day.movements.filter((m) => m.source === "ops").length,
    0,
  );
  const at = new Date(ops.fetchedAt);
  const when = `${formatLocalHm(at)} LT (${zoneAbbrev(at)})`;
  if (ops.error && ops.source === "none") {
    return (
      <p className="flex items-start gap-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        Live FlightAware overlay is down ({ops.error}). Showing the SkyAlps
        seasonal timetable only — charters and bizjets will be missing.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm leading-relaxed text-[#d7d2c4]/88">
      <Activity className="mt-0.5 size-4 shrink-0 text-emerald-300" />
      <span>
        Live FlightAware arrivals and departures, merged with the SkyAlps
        timetable. Ops time wins when both exist.{" "}
        <span className="font-medium text-[#f6f1e6]">{extra}</span> movement
        {extra === 1 ? "" : "s"} on this view come from the live board
        {ops.error ? ` · last fetch warning: ${ops.error}` : ""}. Updated{" "}
        <span className="font-mono">{when}</span>.
      </span>
    </p>
  );
}
