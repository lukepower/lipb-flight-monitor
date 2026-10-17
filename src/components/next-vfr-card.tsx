"use client";

import { Mountain } from "lucide-react";
import { useNowMs } from "@/components/day-board";
import type { DayBoard } from "@/lib/board";
import type { HoleThreshold } from "@/lib/constants";

export function NextVfrCard({
  day,
  minMinutes,
}: {
  day: DayBoard;
  minMinutes: HoleThreshold;
}) {
  const nowMs = useNowMs();
  const windows = day.windows.filter((w) => w.durationMin >= minMinutes);
  const next =
    nowMs == null
      ? windows[0]
      : windows.find((w) => Date.parse(w.endIso) > nowMs);

  return (
    <div className="md:hidden rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3">
      <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-emerald-200/90 uppercase">
        <Mountain className="size-3.5" />
        {day.title}
      </p>
      {next ? (
        <p className="mt-1.5 font-mono text-base text-emerald-50">
          Next VFR hole: {next.startHm}–{next.endHm}{" "}
          <span className="text-sm text-emerald-100/75">
            ({next.durationMin} min)
          </span>
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-[#d7d2c4]/80">
          No hole of {minMinutes} minutes or more
          {nowMs != null && windows.length > 0 ? " left today" : " in civil daylight"}
          .
        </p>
      )}
      <p className="mt-1 text-xs text-[#d7d2c4]/55">
        {day.movements.length} IFR · {windows.length} hole
        {windows.length === 1 ? "" : "s"} ≥ {minMinutes} min
      </p>
    </div>
  );
}
