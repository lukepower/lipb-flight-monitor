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
      <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-sm text-amber-100 ring-1 ring-amber-300/30">
        Live FlightAware overlay is down ({ops.error}). Showing the SkyAlps
        seasonal timetable only — charters and bizjets will be missing.
      </p>
    );
  }
  return (
    <p className="rounded-xl bg-white/5 px-3 py-2 text-sm text-[#d7d2c4]/85 ring-1 ring-white/10">
      Live board from FlightAware arrivals and departures, merged with the
      SkyAlps timetable. Ops time wins when both exist. {extra} movement
      {extra === 1 ? "" : "s"} on this view come from the live board
      {ops.error ? ` · last fetch warning: ${ops.error}` : ""}. Updated {when}.
    </p>
  );
}
