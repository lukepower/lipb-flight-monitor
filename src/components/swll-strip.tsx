"use client";

import { Map, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import {
  isSwllValidAt,
  type SwllBundle,
  type SwllChart,
} from "@/lib/swll";
import { formatLocalHm, formatUtcHm } from "@/lib/time";
import { cn } from "@/lib/utils";

export function SwllStrip({ swll }: { swll: SwllBundle }) {
  const charts = swll.charts;
  const [index, setIndex] = useState(0);
  const chart = charts[Math.min(index, Math.max(0, charts.length - 1))] ?? null;

  if (!chart) {
    return (
      <Panel className="border-amber-300/25 bg-amber-400/10">
        <SectionKicker>
          <TriangleAlert className="size-3.5" /> SWLL
        </SectionKicker>
        <p className="mt-3 text-sm text-[#f3efe4]">
          Low-level significant weather unavailable
          {swll.error ? `: ${swll.error}` : ""}
        </p>
        <p className="mt-2 text-xs text-[#d7d2c4]/55">
          <a
            className="text-emerald-200/80 underline-offset-2 hover:underline"
            href={swll.sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            MeteoAM SWLL
          </a>
        </p>
      </Panel>
    );
  }

  const validAt = new Date(chart.validAt);
  const validNow = isSwllValidAt(validAt, new Date());

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2">
        <SectionKicker>
          <Map className="size-3.5" /> SWLL
        </SectionKicker>
        <Badge className="bg-white/12 text-[#f3efe4]">SFC–FL100</Badge>
        {validNow ? (
          <Badge className="bg-emerald-400/20 text-emerald-100">Valid now</Badge>
        ) : (
          <Badge className="bg-white/8 text-[#d7d2c4]/75">Forecast</Badge>
        )}
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          VT {formatUtcHm(validAt)} · {formatLocalHm(validAt)} local · ±3 h
        </span>
      </div>
      <p className="mt-2 text-xs text-[#d7d2c4]/55">
        Italian Air Force low-level significant weather (planning aid).{" "}
        <a
          className="text-emerald-200/80 underline-offset-2 hover:underline"
          href={swll.sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          Official MeteoAM page
        </a>
      </p>

      <a
        href={chart.nativeUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-4 block overflow-hidden rounded-lg border border-white/10 bg-[#0b1210]"
        title="Open full-size chart"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={chart.url}
          src={chart.url}
          alt={`SWLL chart valid ${formatUtcHm(validAt)}`}
          className="mx-auto max-h-[min(70vh,640px)] w-full object-contain"
          draggable={false}
        />
      </a>

      {charts.length > 1 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {charts.map((c, i) => (
            <ChartTab
              key={c.id}
              chart={c}
              active={i === index}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}

      <p className="mt-3 text-[11px] text-[#d7d2c4]/45">
        {swll.attribution}
        {" · "}
        <a
          href={swll.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-white/20 hover:text-[#f3efe4]/70"
        >
          meteoam.it/it/swll
        </a>
      </p>
    </Panel>
  );
}

function ChartTab({
  chart,
  active,
  onClick,
}: {
  chart: SwllChart;
  active: boolean;
  onClick: () => void;
}) {
  const vt = new Date(chart.validAt);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 font-mono text-xs transition",
        active
          ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-100"
          : "border-white/10 bg-black/25 text-[#d7d2c4]/70 hover:bg-white/8",
      )}
    >
      {formatUtcHm(vt)}
    </button>
  );
}
