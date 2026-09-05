import Link from "next/link";
import { Timer } from "lucide-react";
import {
  HOLE_THRESHOLDS,
  MIN_WINDOW_MINUTES,
  type HoleThreshold,
} from "@/lib/constants";
import { parseHoleThreshold } from "@/lib/holes";

export function minFromSearchParam(
  raw: string | string[] | undefined,
): HoleThreshold {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return parseHoleThreshold(value);
}

export function holePath(path: string, min: HoleThreshold): string {
  const base = path === "/" ? "/" : path;
  return `${base}?min=${min}`;
}

export function HoleThresholdControl({
  minMinutes,
  path,
}: {
  minMinutes: HoleThreshold;
  path: string;
}) {
  return (
    <div
      role="group"
      aria-label="Minimum VFR hole length"
      className="relative z-10 flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-black/25 px-2 py-1"
    >
      <span className="inline-flex items-center gap-1 pl-1.5 text-[11px] font-semibold tracking-wide text-[#d7d2c4]/65 uppercase">
        <Timer className="size-3.5 text-emerald-300/80" />
        Min hole
      </span>
      <div className="flex">
        {HOLE_THRESHOLDS.map((mins) => {
          const on = mins === minMinutes;
          return (
            <Link
              key={mins}
              href={holePath(path, mins)}
              prefetch={false}
              data-hole-min={mins}
              aria-pressed={on}
              aria-current={on ? "true" : undefined}
              className={`cursor-pointer rounded-full px-2.5 py-1 font-mono text-xs select-none transition ${
                on
                  ? "bg-emerald-300 text-[#10211c]"
                  : "text-[#f3efe4]/75 hover:bg-white/8 hover:text-[#f6f1e6]"
              }`}
            >
              {mins}
            </Link>
          );
        })}
      </div>
      <span className="pr-1.5 text-[11px] text-[#d7d2c4]/50">min</span>
    </div>
  );
}

export { MIN_WINDOW_MINUTES };
