import extraJson from "../../data/extra-movements.json";
import scheduleJson from "../../data/lipb-schedule.json";
import { fromZonedLocal, isoWeekday } from "@/lib/time";
import type { Movement } from "@/lib/occupancy";

export type ScheduledPair = {
  id: string;
  days: number[];
  validFrom: string;
  validTo: string;
  otherAirport: string;
  otherCity: string;
  departure: { flightNumber: string; timeLocal: string };
  arrival: { flightNumber: string; timeLocal: string };
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

export type ScheduleFile = {
  source: string;
  sourceUrl: string;
  timezone: string;
  season: { from: string; to: string };
  flights: ScheduledPair[];
};

export const schedule = scheduleJson as ScheduleFile;
export const extraMovements = extraJson as ExtraMovement[];

function inRange(dateLocal: string, from: string, to: string): boolean {
  return dateLocal >= from && dateLocal <= to;
}

export function movementsOnDate(dateLocal: string): Movement[] {
  const weekday = isoWeekday(dateLocal);
  const fromSchedule: Movement[] = [];
  for (const pair of schedule.flights) {
    if (!pair.days.includes(weekday)) continue;
    if (!inRange(dateLocal, pair.validFrom, pair.validTo)) continue;
    fromSchedule.push({
      id: `${pair.id}-dep-${dateLocal}`,
      flightNumber: pair.departure.flightNumber,
      direction: "departure",
      otherAirport: pair.otherAirport,
      otherCity: pair.otherCity,
      at: fromZonedLocal(dateLocal, pair.departure.timeLocal),
      dateLocal,
      source: "timetable",
    });
    fromSchedule.push({
      id: `${pair.id}-arr-${dateLocal}`,
      flightNumber: pair.arrival.flightNumber,
      direction: "arrival",
      otherAirport: pair.otherAirport,
      otherCity: pair.otherCity,
      at: fromZonedLocal(dateLocal, pair.arrival.timeLocal),
      dateLocal,
      source: "timetable" as const,
    });
  }
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
  return [...fromSchedule, ...extras].sort(
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
