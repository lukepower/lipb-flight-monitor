import { LIPB } from "@/lib/constants";

const TZ = LIPB.timezone;

function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/** Interpret YYYY-MM-DD + HH:MM as local wall time in Europe/Rome. */
export function fromZonedLocal(
  dateLocal: string,
  timeLocal: string,
  timeZone = TZ,
): Date {
  const [year, month, day] = dateLocal.split("-").map(Number);
  const [hour, minute] = timeLocal.split(":").map(Number);
  const asUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const first = new Date(asUtc.getTime() - tzOffsetMs(asUtc, timeZone));
  const corrected = new Date(asUtc.getTime() - tzOffsetMs(first, timeZone));
  return corrected;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function startOfLocalDay(dateLocal: string, timeZone = TZ): Date {
  return fromZonedLocal(dateLocal, "00:00", timeZone);
}

export function formatLocal(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  timeZone: string = TZ,
): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, ...options }).format(date);
}

export function formatLocalHm(date: Date, timeZone: string = TZ): string {
  return formatLocal(
    date,
    { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
    timeZone,
  );
}

export function formatUtcHm(date: Date): string {
  return `${formatLocal(
    date,
    { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
    "UTC",
  )}Z`;
}

export function zoneAbbrev(date: Date = new Date(), timeZone: string = TZ): string {
  const name = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "short",
    hour: "2-digit",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  if (name && name !== "GMT" && !name.startsWith("GMT")) return name;
  const offset = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  return offset?.replace("GMT", "UTC") ?? "Europe/Rome";
}

export function zoneOffsetLabel(date: Date = new Date(), timeZone = TZ): string {
  const offset = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  return (offset ?? "GMT+2").replace("GMT", "UTC");
}

/** One-line legend: every HH:MM on the board is Bolzano local, not UTC. */
export function clockLegend(date: Date = new Date()): string {
  const abbrev = zoneAbbrev(date);
  const offset = zoneOffsetLabel(date);
  return `Bolzano local (${abbrev}, ${offset})`;
}

export function formatLocalDate(date: Date, timeZone = TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatLocalWeekday(date: Date, timeZone = TZ): string {
  return formatLocal(date, { weekday: "short" }, timeZone);
}

export function formatLocalLong(date: Date, timeZone = TZ): string {
  return formatLocal(
    date,
    { weekday: "long", day: "numeric", month: "short" },
    timeZone,
  );
}

export function isoWeekday(dateLocal: string, timeZone = TZ): number {
  const noon = fromZonedLocal(dateLocal, "12:00", timeZone);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(noon);
  return map[wd] ?? 0;
}

export function todayLocalDate(now = new Date(), timeZone = TZ): string {
  return formatLocalDate(now, timeZone);
}

export function addLocalDays(dateLocal: string, days: number): string {
  const noon = fromZonedLocal(dateLocal, "12:00");
  return formatLocalDate(addMinutes(noon, days * 24 * 60));
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

export function clampDate(value: Date, min: Date, max: Date): Date {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function parseLocalDateTime(isoLocal: string): Date {
  // YYYY-MM-DDTHH:MM
  const [date, time] = isoLocal.split("T");
  return fromZonedLocal(date, time);
}
