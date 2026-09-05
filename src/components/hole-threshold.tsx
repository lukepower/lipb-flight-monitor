"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Timer } from "lucide-react";
import {
  HOLE_THRESHOLDS,
  MIN_WINDOW_MINUTES,
  type HoleThreshold,
} from "@/lib/constants";
import { parseHoleThreshold } from "@/lib/holes";

const STORAGE_KEY = "lipb-vfr-hole-min";
const listeners = new Set<() => void>();

let value: HoleThreshold = MIN_WINDOW_MINUTES;

function readPersisted(): HoleThreshold {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("min");
    const fromStore = window.localStorage.getItem(STORAGE_KEY);
    return parseHoleThreshold(fromUrl ?? fromStore);
  } catch {
    return MIN_WINDOW_MINUTES;
  }
}

if (typeof window !== "undefined") {
  value = readPersisted();
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function useHoleThreshold() {
  const minMinutes = useSyncExternalStore(
    subscribe,
    () => value,
    () => MIN_WINDOW_MINUTES,
  );

  const setMinMinutes = useCallback((next: HoleThreshold) => {
    if (value === next) return;
    value = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* private iframes and locked storage still keep the in-memory value */
    }
    emit();
  }, []);

  return { minMinutes, setMinMinutes };
}

export function HoleThresholdControl() {
  const { minMinutes, setMinMinutes } = useHoleThreshold();
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
            <button
              key={mins}
              type="button"
              onClick={() => setMinMinutes(mins)}
              className={`cursor-pointer rounded-full px-2.5 py-1 font-mono text-xs select-none transition ${
                on
                  ? "bg-emerald-300 text-[#10211c]"
                  : "text-[#f3efe4]/75 hover:bg-white/8 hover:text-[#f6f1e6]"
              }`}
              aria-pressed={on}
            >
              {mins}
            </button>
          );
        })}
      </div>
      <span className="pr-1.5 text-[11px] text-[#d7d2c4]/50">min</span>
    </div>
  );
}
