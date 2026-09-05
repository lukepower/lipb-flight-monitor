import {
  MIN_WINDOW_MINUTES,
  OCCUPANCY,
  RUNWAY,
  SECURITY,
} from "@/lib/constants";
import { daylightForDate } from "@/lib/daylight";
import { addMinutes, minutesBetween } from "@/lib/time";

export type MovementDirection = "arrival" | "departure";

export type MovementSource = "timetable" | "ops" | "extra";

export type MovementStatus =
  | "scheduled"
  | "estimated"
  | "enroute"
  | "taxi"
  | "arrived"
  | "departed";

export type Movement = {
  id: string;
  flightNumber: string;
  direction: MovementDirection;
  otherAirport: string;
  otherCity: string;
  at: Date;
  dateLocal: string;
  note?: string;
  operator?: string;
  aircraft?: string;
  source?: MovementSource;
  status?: MovementStatus;
  scheduledAt?: Date;
};

export type Interval = { start: Date; end: Date };

export type OccupiedBlock = Interval & {
  kind: "atz" | "sector";
  movements: Movement[];
};

export type RunwayWindow = Interval & {
  direction: MovementDirection;
  movement: Movement;
  event: Date;
};

export type SecurityCongestion = Interval & {
  movements: Movement[];
};

export type VfrWindow = Interval & {
  dateLocal: string;
  durationMin: number;
  nearbyMovements: number;
};

function occupancyFor(movement: Movement): { atz: Interval; sector: Interval } {
  const { at } = movement;
  if (movement.direction === "arrival") {
    return {
      sector: {
        start: addMinutes(at, -OCCUPANCY.arrivalSectorBeforeMin),
        end: at,
      },
      atz: {
        start: addMinutes(at, -OCCUPANCY.arrivalAtzBeforeMin),
        end: addMinutes(at, OCCUPANCY.arrivalAtzAfterMin),
      },
    };
  }
  return {
    sector: {
      start: at,
      end: addMinutes(at, OCCUPANCY.departureSectorAfterMin),
    },
    atz: {
      start: addMinutes(at, -OCCUPANCY.departureAtzBeforeMin),
      end: addMinutes(at, OCCUPANCY.departureAtzAfterMin),
    },
  };
}

export function movementOccupancy(movement: Movement) {
  return occupancyFor(movement);
}

export function runwayWindowFor(movement: Movement): RunwayWindow {
  const before =
    movement.direction === "arrival"
      ? RUNWAY.arrivalApproachMin
      : RUNWAY.departureTaxiMin;
  return {
    start: addMinutes(movement.at, -before),
    end: movement.at,
    direction: movement.direction,
    movement,
    event: movement.at,
  };
}

export function runwayWindows(movements: Movement[]): RunwayWindow[] {
  return movements
    .map(runwayWindowFor)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function securityWindowFor(movement: Movement): Interval {
  return {
    start: addMinutes(movement.at, -SECURITY.beforeMin),
    end: addMinutes(movement.at, -SECURITY.untilMin),
  };
}

/** Times when two or more departure security windows (STD−40…STD−20) overlap. */
export function securityCongestion(movements: Movement[]): SecurityCongestion[] {
  const deps = movements.filter((m) => m.direction === "departure");
  const edges: { at: number; delta: number; movement: Movement }[] = [];
  for (const m of deps) {
    const w = securityWindowFor(m);
    if (w.end <= w.start) continue;
    edges.push({ at: w.start.getTime(), delta: 1, movement: m });
    edges.push({ at: w.end.getTime(), delta: -1, movement: m });
  }
  edges.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    return a.delta - b.delta;
  });
  const open = new Set<Movement>();
  const raw: SecurityCongestion[] = [];
  let prev: number | null = null;
  for (const edge of edges) {
    if (prev !== null && edge.at > prev && open.size >= 2) {
      raw.push({
        start: new Date(prev),
        end: new Date(edge.at),
        movements: [...open],
      });
    }
    if (edge.delta > 0) open.add(edge.movement);
    else open.delete(edge.movement);
    prev = edge.at;
  }
  const out: SecurityCongestion[] = [];
  for (const block of raw) {
    const last = out.at(-1);
    if (last && last.end.getTime() === block.start.getTime()) {
      last.end = block.end;
      const seen = new Set(last.movements);
      for (const m of block.movements) {
        if (!seen.has(m)) last.movements.push(m);
      }
    } else {
      out.push({
        start: block.start,
        end: block.end,
        movements: [...block.movements],
      });
    }
  }
  return out;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const out: Interval[] = [{ ...sorted[0] }];
  for (const next of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (next.start.getTime() <= last.end.getTime()) {
      if (next.end > last.end) last.end = next.end;
    } else {
      out.push({ ...next });
    }
  }
  return out;
}

export function mergeOccupied(
  movements: Movement[],
  kind: "atz" | "sector",
): OccupiedBlock[] {
  const raw = movements.map((m) => ({
    ...occupancyFor(m)[kind],
    kind,
    movements: [m],
  }));
  raw.sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: OccupiedBlock[] = [];
  for (const next of raw) {
    const last = out[out.length - 1];
    if (last && next.start.getTime() <= last.end.getTime()) {
      if (next.end > last.end) last.end = next.end;
      last.movements.push(...next.movements);
    } else {
      out.push({
        start: next.start,
        end: next.end,
        kind,
        movements: [...next.movements],
      });
    }
  }
  return out;
}

export function invertFree(
  bounds: Interval,
  busy: Interval[],
): Interval[] {
  const merged = mergeIntervals(
    busy.filter((b) => b.end > bounds.start && b.start < bounds.end),
  );
  const holes: Interval[] = [];
  let cursor = bounds.start;
  for (const block of merged) {
    const start = block.start < bounds.start ? bounds.start : block.start;
    if (start > cursor) {
      holes.push({ start: cursor, end: start });
    }
    if (block.end > cursor) cursor = block.end;
  }
  if (cursor < bounds.end) {
    holes.push({ start: cursor, end: bounds.end });
  }
  return holes;
}

export function vfrWindowsForDay(
  dateLocal: string,
  movements: Movement[],
  minMinutes = MIN_WINDOW_MINUTES,
): VfrWindow[] {
  const day = daylightForDate(dateLocal);
  if (day.vfrEnd <= day.vfrStart) return [];
  const dayMovements = movements.filter((m) => m.dateLocal === dateLocal);
  const atz = mergeOccupied(dayMovements, "atz");
  const sector = mergeOccupied(dayMovements, "sector");
  const busy = [...atz, ...sector];
  const holes = invertFree(
    { start: day.vfrStart, end: day.vfrEnd },
    busy,
  );
  return holes
    .map((hole) => {
      const durationMin = minutesBetween(hole.start, hole.end);
      const nearbyMovements = dayMovements.filter((m) => {
        const delta = Math.min(
          Math.abs(m.at.getTime() - hole.start.getTime()),
          Math.abs(m.at.getTime() - hole.end.getTime()),
        );
        return delta <= 90 * 60_000;
      }).length;
      return {
        ...hole,
        dateLocal,
        durationMin,
        nearbyMovements,
      };
    })
    .filter((w) => w.durationMin >= minMinutes)
    .sort((a, b) => {
      if (b.durationMin !== a.durationMin) return b.durationMin - a.durationMin;
      return a.nearbyMovements - b.nearbyMovements;
    });
}

export function vfrWindowsForDates(
  dateLocals: string[],
  movements: Movement[],
  minMinutes = MIN_WINDOW_MINUTES,
): VfrWindow[] {
  return dateLocals.flatMap((d) => vfrWindowsForDay(d, movements, minMinutes));
}

export function seasonHeatmap(
  windows: VfrWindow[],
): { weekday: number; hour: number; minutes: number }[] {
  const cells = new Map<string, number>();
  for (const w of windows) {
    let cursor = new Date(w.start);
    while (cursor < w.end) {
      const weekday = isoWeekdayFromDate(cursor);
      const hour = localHour(cursor);
      const key = `${weekday}-${hour}`;
      const nextHour = nextLocalHour(cursor);
      const sliceEnd = nextHour < w.end ? nextHour : w.end;
      const mins = minutesBetween(cursor, sliceEnd);
      cells.set(key, (cells.get(key) ?? 0) + mins);
      cursor = sliceEnd;
    }
  }
  return [...cells.entries()].map(([key, minutes]) => {
    const [weekday, hour] = key.split("-").map(Number);
    return { weekday, hour, minutes };
  });
}

function isoWeekdayFromDate(date: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[wd] ?? 0;
}

function localHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date),
  );
}

function nextLocalHour(date: Date): Date {
  const mins = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      minute: "2-digit",
    }).format(date),
  );
  return addMinutes(date, 60 - mins);
}

export function seasonFromWindows(
  dates: string[],
  windows: {
    dateLocal: string;
    startIso: string;
    endIso: string;
    durationMin: number;
    nearbyMovements: number;
  }[],
  minMinutes: number,
) {
  const kept = windows.filter((w) => w.durationMin >= minMinutes);
  const heatmap = seasonHeatmap(
    kept.map((w) => ({
      start: new Date(w.startIso),
      end: new Date(w.endIso),
      dateLocal: w.dateLocal,
      durationMin: w.durationMin,
      nearbyMovements: w.nearbyMovements,
    })),
  );
  const bestDays = dates
    .map((dateLocal) => {
      const dayWindows = kept.filter((w) => w.dateLocal === dateLocal);
      return {
        dateLocal,
        totalGreenMin: dayWindows.reduce((sum, w) => sum + w.durationMin, 0),
        windowCount: dayWindows.length,
      };
    })
    .sort((a, b) => b.totalGreenMin - a.totalGreenMin)
    .slice(0, 12);
  return { heatmap, bestDays };
}

export function bestDays(
  dateLocals: string[],
  movements: Movement[],
): { dateLocal: string; totalGreenMin: number; windowCount: number }[] {
  return dateLocals
    .map((dateLocal) => {
      const windows = vfrWindowsForDay(dateLocal, movements);
      return {
        dateLocal,
        totalGreenMin: windows.reduce((sum, w) => sum + w.durationMin, 0),
        windowCount: windows.length,
      };
    })
    .sort((a, b) => b.totalGreenMin - a.totalGreenMin);
}
