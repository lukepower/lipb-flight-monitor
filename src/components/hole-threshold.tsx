"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Timer } from "lucide-react";
import {
  HOLE_THRESHOLDS,
  MIN_WINDOW_MINUTES,
  type HoleThreshold,
} from "@/lib/constants";
import { parseHoleThreshold } from "@/lib/holes";

const STORAGE_KEY = "lipb-vfr-hole-min";

const HoleThresholdContext = createContext<{
  minMinutes: HoleThreshold;
  setMinMinutes: (value: HoleThreshold) => void;
}>({
  minMinutes: MIN_WINDOW_MINUTES,
  setMinMinutes: () => {},
});

export function HoleThresholdProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [minMinutes, setMinMinutes] = useState<HoleThreshold>(MIN_WINDOW_MINUTES);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("min");
    const fromStore = window.localStorage.getItem(STORAGE_KEY);
    setMinMinutes(parseHoleThreshold(fromUrl ?? fromStore));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(minMinutes));
  }, [minMinutes]);

  const value = useMemo(
    () => ({ minMinutes, setMinMinutes }),
    [minMinutes],
  );

  return (
    <HoleThresholdContext.Provider value={value}>
      {children}
    </HoleThresholdContext.Provider>
  );
}

export function useHoleThreshold() {
  return useContext(HoleThresholdContext);
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
