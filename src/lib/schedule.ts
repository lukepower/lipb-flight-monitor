import extraJson from "../../data/extra-movements.json";
import dayMovementsJson from "../../data/lipb-day-movements.json";
import { fromZonedLocal } from "@/lib/time";
import type { Movement } from "@/lib/occupancy";

export type DayMovementKind = "scheduled" | "ferry" | "charter";

export type DayMovement = {
  id: string;
  dateLocal: string;
  flightNumber: string;
  direction: "arrival" | "departure";
  otherAirport: string;
  otherCity: string;
  timeLocal: string;
  kind: DayMovementKind;
  note?: string;
};

export type ExtraMovement = {
  id: string;
  flightNumber: string;
  direction: "arrival" | "departure";
  otherAirport: string;
  otherCity: string;
  dateLocal: string;
  timeLocal: string;
  note?: string;
};

export type DayScheduleFile = {
  source: string;
  timezone: string;
  season: { from: string; to: string };
  movements: DayMovement[];
};

export const schedule = dayMovementsJson as DayScheduleFile;
export const extraMovements = extraJson as ExtraMovement[];

function dayMovementToMovement(m: DayMovement): Movement {
  const isExtra = m.kind === "ferry" || m.kind === "charter";
  return {
    id: isExtra ? `extra-${m.id}` : `day-${m.id}`,
    flightNumber: m.flightNumber,
    direction: m.direction,
    otherAirport: m.otherAirport,
    otherCity: m.otherCity,
    at: fromZonedLocal(m.dateLocal, m.timeLocal),
    dateLocal: m.dateLocal,
    note: m.note,
    source: isExtra ? "extra" : "timetable",
  };
}

export function movementsOnDate(dateLocal: string): Movement[] {
  const fromDay: Movement[] = schedule.movements
    .filter((m) => m.dateLocal === dateLocal)
    .map(dayMovementToMovement);
  const extras: Movement[] = extraMovements
    .filter((m) => m.dateLocal === dateLocal)
    .map((m) => ({
      id: `extra-${m.id}`,
      flightNumber: m.flightNumber,
      direction: m.direction,
      otherAirport: m.otherAirport,
      otherCity: m.otherCity,
      at: fromZonedLocal(m.dateLocal, m.timeLocal),
      dateLocal: m.dateLocal,
      note: m.note,
      source: "extra" as const,
    }));
  return [...fromDay, ...extras].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  );
}

export function movementsOnDates(dateLocals: string[]): Movement[] {
  return dateLocals.flatMap(movementsOnDate);
}

export function seasonDateRange(): { from: string; to: string } {
  return schedule.season;
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    out.push(cursor);
    const [y, m, d] = cursor.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    cursor = next.toISOString().slice(0, 10);
  }
  return out;
}
