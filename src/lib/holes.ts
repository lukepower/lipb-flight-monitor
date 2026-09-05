import {
  HOLE_THRESHOLDS,
  MIN_WINDOW_MINUTES,
  type HoleThreshold,
} from "@/lib/constants";

export function parseHoleThreshold(raw: string | number | null | undefined): HoleThreshold {
  const n = typeof raw === "number" ? raw : Number(raw);
  return (HOLE_THRESHOLDS as readonly number[]).includes(n)
    ? (n as HoleThreshold)
    : MIN_WINDOW_MINUTES;
}

export function filterHoles<T extends { durationMin: number }>(
  windows: T[],
  minMinutes: number,
): T[] {
  return windows.filter((w) => w.durationMin >= minMinutes);
}
