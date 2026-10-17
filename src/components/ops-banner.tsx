import { Activity } from "lucide-react";
import { DataSourceStatus } from "@/components/data-source-status";
import type { DayBoard } from "@/lib/board";
import type { OpsBundle } from "@/lib/ops-flights";
import { formatLocalHm, zoneAbbrev } from "@/lib/time";

export function OpsBanner({
  ops,
  days,
  liveError,
}: {
  ops: OpsBundle;
  days: DayBoard[];
  /** Optional ADS-B error when composed from a client parent. */
  liveError?: string | null;
}) {
  const extra = days.reduce(
    (n, day) => n + day.movements.filter((m) => m.source === "ops").length,
    0,
  );
  const at = new Date(ops.fetchedAt);
  const when = `${formatLocalHm(at)} LT (${zoneAbbrev(at)})`;
  const opsDown = Boolean(ops.error && ops.source === "none");
  const opsWarn = ops.error && !opsDown ? ops.error : null;

  if (opsDown || liveError) {
    return (
      <DataSourceStatus
        opsError={opsDown ? ops.error : null}
        liveError={liveError}
      />
    );
  }

  return (
    <p className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm leading-relaxed text-[#d7d2c4]/88">
      <Activity className="mt-0.5 size-4 shrink-0 text-emerald-300" />
      <span>
        Live FlightAware arrivals and departures, merged with the airport
        programmazione. Ops time wins when both exist.{" "}
        <span className="font-medium text-[#f6f1e6]">{extra}</span> movement
        {extra === 1 ? "" : "s"} on this view come from the live board
        {opsWarn ? ` · last fetch warning: ${opsWarn}` : ""}. Updated{" "}
        <span className="font-mono">{when}</span>.
      </span>
    </p>
  );
}
