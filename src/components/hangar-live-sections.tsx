"use client";

import { DataSourceStatus } from "@/components/data-source-status";
import { DayPanel } from "@/components/day-board";
import { LiveTraffic } from "@/components/live-traffic";
import { useLiveTracks } from "@/components/use-live-tracks";
import type { DayBoard } from "@/lib/board";
import type { HoleThreshold } from "@/lib/constants";

/** One ADS-B poll shared by today's movements list and the ATZ map. */
export function HangarLiveSections({
  day,
  minMinutes,
  opsError,
}: {
  day: DayBoard;
  minMinutes?: HoleThreshold;
  /** FlightAware down — passed from the server page as a prop. */
  opsError?: string | null;
}) {
  const live = useLiveTracks();
  return (
    <>
      <DataSourceStatus opsError={opsError} liveError={live.error} />
      <DayPanel day={day} minMinutes={minMinutes} atzTracks={live.tracks} />
      <LiveTraffic live={live} />
    </>
  );
}
