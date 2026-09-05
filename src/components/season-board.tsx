"use client";

import { CalendarCheck, Grid3x3 } from "lucide-react";
import { Panel, SectionKicker } from "@/components/panel";
import { MIN_WINDOW_MINUTES, type HoleThreshold } from "@/lib/constants";
import { seasonFromWindows } from "@/lib/occupancy";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Relative 0..1 scale: cool empty → teal → gold → orange fullest. */
function heatBackground(t: number): string {
  const stops: { at: number; color: string }[] = [
    { at: 0, color: "oklch(0.17 0.025 220)" },
    { at: 0.22, color: "oklch(0.36 0.07 205)" },
    { at: 0.45, color: "oklch(0.52 0.1 155)" },
    { at: 0.68, color: "oklch(0.7 0.13 85)" },
    { at: 0.85, color: "oklch(0.74 0.15 55)" },
    { at: 1, color: "oklch(0.76 0.17 42)" },
  ];
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped <= 0) return stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i];
    if (clamped <= b.at) {
      const a = stops[i - 1];
      const local = (clamped - a.at) / (b.at - a.at);
      return `color-mix(in oklab, ${b.color} ${Math.round(local * 100)}%, ${a.color})`;
    }
  }
  return stops[stops.length - 1].color;
}

export type SeasonPayload = {
  from: string;
  to: string;
  dates: string[];
  windows: {
    dateLocal: string;
    startIso: string;
    endIso: string;
    durationMin: number;
    nearbyMovements: number;
  }[];
};

export function SeasonBoard({
  season,
  minMinutes = MIN_WINDOW_MINUTES,
}: {
  season: SeasonPayload;
  minMinutes?: HoleThreshold;
}) {
  const { heatmap, bestDays } = seasonFromWindows(
    season.dates,
    season.windows,
    minMinutes,
  );
  const max = Math.max(1, ...heatmap.map((c) => c.minutes));
  const hours = Array.from({ length: 18 }, (_, i) => i + 5);
  return (
    <>
      <Panel>
        <SectionKicker>
          <Grid3x3 className="size-3.5" /> Quiet slots · {season.from} → {season.to}
        </SectionKicker>
        <h2 className="mt-2 font-serif text-3xl tracking-tight text-[#f6f1e6]">
          Season heatmap
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[#d7d2c4]/65">
          Traffic only — SkyAlps summer 2026. Holes shorter than {minMinutes}{" "}
          min are ignored. Color is relative to the fullest cell this season:
          cool → gold → orange (most hole minutes that weekday/hour, Bolzano
          local). Weather is not applied here.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-max border-separate border-spacing-1 text-center text-xs">
            <thead>
              <tr>
                <th className="w-12 text-left font-mono text-[10px] text-[#d7d2c4]/45" />
                {hours.map((h) => (
                  <th
                    key={h}
                    className="w-8 font-mono font-normal text-[#d7d2c4]/45"
                  >
                    {String(h).padStart(2, "0")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WEEKDAYS.map((label, idx) => (
                <tr key={label}>
                  <th className="pr-1 text-left font-medium text-[#d7d2c4]/80">
                    {label}
                  </th>
                  {hours.map((hour) => {
                    const cell = heatmap.find(
                      (c) => c.weekday === idx + 1 && c.hour === hour,
                    );
                    const t = cell ? cell.minutes / max : 0;
                    return (
                      <td key={`${label}-${hour}`}>
                        <div
                          className="size-8 rounded-lg ring-1 ring-white/5 transition hover:scale-110 hover:ring-white/25"
                          style={{ background: heatBackground(t) }}
                          title={`${label} ${hour}:00 · ${cell?.minutes ?? 0} min`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          className="mt-4 flex max-w-xs items-center gap-2 text-[10px] font-medium tracking-wide text-[#d7d2c4]/50 uppercase"
          aria-hidden
        >
          <span>Empty</span>
          <div className="flex h-2 flex-1 overflow-hidden rounded-full ring-1 ring-white/10">
            {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
              <div
                key={t}
                className="h-full flex-1"
                style={{ background: heatBackground(t) }}
              />
            ))}
          </div>
          <span>Full</span>
        </div>
      </Panel>
      <Panel>
        <SectionKicker>
          <CalendarCheck className="size-3.5" /> Ranked remaining days
        </SectionKicker>
        <h2 className="mt-2 font-serif text-3xl tracking-tight text-[#f6f1e6]">
          Best remaining days
        </h2>
        {bestDays.length === 0 ? (
          <p className="mt-3 text-sm text-[#d7d2c4]/75">
            No remaining day has a hole of {minMinutes} minutes or more.
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-white/6">
            {bestDays.map((d, i) => {
              const hoursGreen = Math.round(d.totalGreenMin / 60);
              return (
                <li
                  key={d.dateLocal}
                  className="flex items-center justify-between gap-3 py-3 text-[#f6f1e6]"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-emerald-300/15 font-mono text-sm text-emerald-100">
                      {i + 1}
                    </span>
                    <span className="font-mono">{d.dateLocal}</span>
                  </span>
                  <span className="font-mono text-sm text-[#d7d2c4]/65">
                    {d.windowCount} holes · {hoursGreen} h green
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </>
  );
}
