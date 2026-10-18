import { isoWeekday } from "@/lib/time";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

/** Calendar YYYY-MM-DD only — rejects traversal, bad months, Feb 31, etc. */
export function parseCalendarDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.length !== 10) return null;
  if (!DATE_RE.test(s)) return null;
  if (s.includes("\0")) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() + 1 !== m ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return s;
}

/** Calendar YYYY-MM only. */
export function parseCalendarMonth(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.length !== 7) return null;
  if (!MONTH_RE.test(s)) return null;
  if (s.includes("\0")) return null;
  const [y, m] = s.split("-").map(Number);
  if (m < 1 || m > 12) return null;
  const dt = new Date(Date.UTC(y, m - 1, 1));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m) return null;
  return s;
}

export function monthOfDate(dateLocal: string): string {
  return dateLocal.slice(0, 7);
}

export function addMonths(yearMonth: string, delta: number): string {
  const parsed = parseCalendarMonth(yearMonth);
  if (!parsed) return yearMonth;
  const [y, m] = parsed.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthTitle(yearMonth: string): string {
  const parsed = parseCalendarMonth(yearMonth);
  if (!parsed) return yearMonth;
  const [y, m] = parsed.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function daysInMonth(yearMonth: string): string[] {
  const parsed = parseCalendarMonth(yearMonth);
  if (!parsed) return [];
  const [y, m] = parsed.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    return `${parsed}-${day}`;
  });
}

/** Monday-first cells for a month grid (leading/trailing nulls). */
export function monthGrid(yearMonth: string): (string | null)[] {
  const days = daysInMonth(yearMonth);
  if (days.length === 0) return [];
  const lead = isoWeekday(days[0]) - 1;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  cells.push(...days);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
