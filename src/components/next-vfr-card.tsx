"use client";

import { Mountain } from "lucide-react";
import { useNowMs } from "@/components/day-board";
import type { DayBoard, WindowView } from "@/lib/board";
import type { HoleThreshold } from "@/lib/constants";
import { cn } from "@/lib/utils";

function isFlyable(w: WindowView): boolean {
  return w.quality === "good" || w.quality === "marginal";
}

function categoryLabel(w: WindowView): { text: string; marginal: boolean } {
  if (w.quality === "marginal") return { text: "marginal", marginal: true };
  if (w.weather?.flightCategory === "MVFR") {
    return { text: "marginal", marginal: true };
  }
  if (w.weather?.flightCategory === "VFR" || w.quality === "good") {
    return { text: "VFR", marginal: false };
  }
  return { text: "VFR", marginal: false };
}

function turbLine(w: WindowView): string {
  if (!w.turbulenceLabel) return "turbulence n/a";
  if (w.turbulenceLevel === "wave") return w.turbulenceLabel;
  if (w.turbulenceLevel === "possible") return w.turbulenceLabel;
  if (w.turbulenceCoverage !== "full") return w.turbulenceLabel;
  return "No turbulence signal";
}

function WindowLine({
  w,
  prefix,
}: {
  w: WindowView;
  prefix: string;
}) {
  const cat = categoryLabel(w);
  return (
    <p
      className={cn(
        "mt-1.5 font-mono text-base",
        cat.marginal ? "text-amber-100" : "text-emerald-50",
      )}
    >
      <span className="text-sm text-[#d7d2c4]/70">{prefix} </span>
      {w.startHm}–{w.endHm}{" "}
      <span
        className={cn(
          "text-sm",
          cat.marginal ? "text-amber-100/80" : "text-emerald-100/75",
        )}
      >
        ({w.durationMin} min)
      </span>
      <span className="text-sm text-[#d7d2c4]/70">
        {" "}
        ·{" "}
        <span
          className={cn(
            cat.marginal
              ? "rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-amber-400/25 text-amber-100"
              : "font-semibold text-emerald-100",
          )}
        >
          {cat.text}
        </span>
        {" · "}
        {turbLine(w)}
      </span>
    </p>
  );
}

export function NextVfrCard({
  day,
  minMinutes,
}: {
  day: DayBoard;
  minMinutes: HoleThreshold;
}) {
  const nowMs = useNowMs();
  const flyable = day.windows
    .filter((w) => w.durationMin >= minMinutes && isFlyable(w))
    .filter((w) => (nowMs == null ? true : Date.parse(w.endIso) > nowMs))
    .sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso));
  const next = flyable[0];
  const following = flyable[1];

  return (
    <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-3">
      <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-emerald-200/90 uppercase">
        <Mountain className="size-3.5" />
        Decision · {day.title}
      </p>
      {next ? (
        <>
          <WindowLine w={next} prefix="Next flyable window" />
          {following ? (
            <WindowLine w={following} prefix="Then" />
          ) : (
            <p className="mt-1 text-xs text-[#d7d2c4]/55">
              No further flyable window in civil daylight.
            </p>
          )}
        </>
      ) : (
        <p className="mt-1.5 text-sm text-[#d7d2c4]/80">
          No flyable window of {minMinutes} minutes or more
          {nowMs != null ? " left" : ""} (traffic hole ∩ VFR/MVFR ∩ daylight).
        </p>
      )}
      <p className="mt-1 text-xs text-[#d7d2c4]/55">
        {day.movements.length} IFR · {flyable.length} flyable hole
        {flyable.length === 1 ? "" : "s"} ≥ {minMinutes} min · turbulence shown,
        not filtered
      </p>
    </div>
  );
}
