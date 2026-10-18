"use client";

import type { WeekDayOverview } from "@/lib/board";
import { Panel, SectionKicker } from "@/components/panel";
import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";

export function WeekOverview({ days }: { days: WeekDayOverview[] }) {
  return (
    <Panel>
      <SectionKicker>
        <CalendarRange className="size-3.5" /> 7-day overview
      </SectionKicker>
      <p className="mt-1 text-xs text-[#d7d2c4]/55">
        Tap a day to jump. Days 3+ are model-only (ICON-2I ω ~48 h).
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="hidden w-full min-w-[640px] text-left text-sm md:table">
          <thead className="text-[11px] tracking-wide text-[#d7d2c4]/55 uppercase">
            <tr>
              <th className="pb-2 pr-3 font-medium">Day</th>
              <th className="pb-2 pr-3 font-medium">Daylight</th>
              <th className="pb-2 pr-3 font-medium">Holes</th>
              <th className="pb-2 pr-3 font-medium">Longest</th>
              <th className="pb-2 pr-3 font-medium">Model wx</th>
              <th className="pb-2 font-medium">Turbulence / Föhn</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {days.map((d) => (
              <tr key={d.dateLocal}>
                <td className="py-2.5 pr-3">
                  <a
                    href={`#day-${d.dateLocal}`}
                    className="font-medium text-emerald-100 hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      document
                        .getElementById(`day-${d.dateLocal}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    {d.title}
                  </a>
                  {d.lowerConfidence ? (
                    <p className="text-[10px] text-amber-200/70">
                      model only · lower confidence
                    </p>
                  ) : null}
                </td>
                <td className="py-2.5 pr-3 font-mono text-xs">{d.daylightHm}</td>
                <td className="py-2.5 pr-3 font-mono">{d.holeCount}</td>
                <td className="py-2.5 pr-3 font-mono">
                  {d.longestHoleMin ? `${d.longestHoleMin} min` : "—"}
                </td>
                <td className="py-2.5 pr-3 text-[#d7d2c4]/80">
                  {d.modelWxSummary ?? "—"}
                </td>
                <td
                  className={cn(
                    "py-2.5 text-xs",
                    d.turbulenceLevel === "wave"
                      ? "text-rose-200"
                      : d.turbulenceLevel === "possible"
                        ? "text-amber-200"
                        : "text-[#d7d2c4]/75",
                  )}
                >
                  {d.turbulenceLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 space-y-2 md:hidden">
        {days.map((d) => (
          <li key={d.dateLocal}>
            <button
              type="button"
              className="w-full rounded-2xl border border-white/8 bg-black/20 px-3.5 py-3 text-left"
              onClick={() => {
                document
                  .getElementById(`day-${d.dateLocal}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <p className="font-medium text-[#f6f1e6]">{d.title}</p>
              <p className="mt-0.5 font-mono text-[11px] text-[#d7d2c4]/60">
                {d.daylightHm} · {d.holeCount} holes · longest{" "}
                {d.longestHoleMin || "—"} min
              </p>
              <p className="mt-1 text-xs text-[#d7d2c4]/75">
                {d.modelWxSummary ?? "Model wx n/a"}
              </p>
              <p
                className={cn(
                  "mt-1 text-xs",
                  d.turbulenceLevel === "wave"
                    ? "text-rose-200"
                    : d.turbulenceLevel === "possible"
                      ? "text-amber-200"
                      : "text-[#d7d2c4]/70",
                )}
              >
                {d.turbulenceLabel}
                {d.lowerConfidence ? " · model only · lower confidence" : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
