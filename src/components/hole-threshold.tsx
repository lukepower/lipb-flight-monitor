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
const EVENT = "lipb-hole-min";

function readStored(): HoleThreshold {
  if (typeof window === "undefined") return MIN_WINDOW_MINUTES;
  const fromUrl = new URLSearchParams(window.location.search).get("min");
  const fromStore = window.localStorage.getItem(STORAGE_KEY);
  return parseHoleThreshold(fromUrl ?? fromStore);
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useHoleThreshold() {
  const minMinutes = useSyncExternalStore(
    subscribe,
    readStored,
    () => MIN_WINDOW_MINUTES,
  );
  const setMinMinutes = useCallback((value: HoleThreshold) => {
    window.localStorage.setItem(STORAGE_KEY, String(value));
    const url = new URL(window.location.href);
    url.searchParams.set("min", String(value));
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { minMinutes, setMinMinutes };
}

export function HoleThresholdControl() {
  const { minMinutes, setMinMinutes } = useHoleThreshold();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-black/25 px-2 py-1">
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
              className={`rounded-full px-2 py-1 font-mono text-xs transition ${
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
