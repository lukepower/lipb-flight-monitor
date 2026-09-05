"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Timer } from "lucide-react";
import {
  HOLE_THRESHOLDS,
  MIN_WINDOW_MINUTES,
  type HoleThreshold,
} from "@/lib/constants";
import { parseHoleThreshold } from "@/lib/holes";

const STORAGE_KEY = "lipb-vfr-hole-min";

type HoleThresholdContextValue = {
  minMinutes: HoleThreshold;
  setMinMinutes: (next: HoleThreshold) => void;
};

const HoleThresholdContext = createContext<HoleThresholdContextValue | null>(
  null,
);

function readPersisted(): HoleThreshold {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("min");
    const fromStore = window.localStorage.getItem(STORAGE_KEY);
    return parseHoleThreshold(fromUrl ?? fromStore);
  } catch {
    return MIN_WINDOW_MINUTES;
  }
}

export function HoleThresholdProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [minMinutes, setMin] = useState<HoleThreshold>(MIN_WINDOW_MINUTES);

  useEffect(() => {
    setMin(readPersisted());
  }, []);

  const setMinMinutes = useCallback((next: HoleThreshold) => {
    setMin(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* preview iframes can lock storage */
    }
  }, []);

  const value = useMemo(
    () => ({ minMinutes, setMinMinutes }),
    [minMinutes, setMinMinutes],
  );

  return (
    <HoleThresholdContext.Provider value={value}>
      {children}
    </HoleThresholdContext.Provider>
  );
}

export function useHoleThreshold() {
  const ctx = useContext(HoleThresholdContext);
  if (!ctx) {
    throw new Error("useHoleThreshold must be used under HoleThresholdProvider");
  }
  return ctx;
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
              data-hole-min={mins}
              aria-pressed={on}
              onPointerDown={(event) => {
                event.preventDefault();
                setMinMinutes(mins);
              }}
              className={`cursor-pointer rounded-full px-2.5 py-1 font-mono text-xs select-none transition ${
                on
                  ? "bg-emerald-300 text-[#10211c]"
                  : "text-[#f3efe4]/75 hover:bg-white/8 hover:text-[#f6f1e6]"
              }`}
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
