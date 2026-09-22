"use client";

import { DayPanel } from "@/components/day-board";
import { LiveTraffic } from "@/components/live-traffic";
import { useLiveTracks } from "@/components/use-live-tracks";
import type { DayBoard } from "@/lib/board";
import type { HoleThreshold } from "@/lib/constants";

/** One ADS-B poll shared by today's movements list and the ATZ map. */
export function HangarLiveSections({
  day,
  minMinutes,
}: {
  day: DayBoard;
  minMinutes?: HoleThreshold;
}) {
  const live = useLiveTracks();
  return (
    <>
      <DayPanel day={day} minMinutes={minMinutes} atzTracks={live.tracks} />
      <LiveTraffic live={live} />
    </>
  );
}
