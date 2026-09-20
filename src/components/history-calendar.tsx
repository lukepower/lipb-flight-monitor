import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Panel } from "@/components/panel";
import {
  addMonths,
  formatMonthTitle,
  monthGrid,
  parseBrowseDate,
  parseBrowseMonth,
} from "@/lib/history";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function historyHref(opts: { date?: string | null; month?: string | null }): string {
  const params = new URLSearchParams();
  if (opts.date) params.set("date", opts.date);
  if (opts.month) params.set("month", opts.month);
  const q = params.toString();
  return q ? `/history?${q}` : "/history";
}

export function HistoryCalendar({
  month,
  selectedDate,
  archivedDates,
  now = new Date(),
}: {
  month: string;
  selectedDate: string | null;
  archivedDates: Set<string>;
  now?: Date;
}) {
  const cells = monthGrid(month);
  const prevMonth = addMonths(month, -1);
  const nextMonth = addMonths(month, 1);
  const canPrev = parseBrowseMonth(prevMonth, now) != null;
  const canNext = parseBrowseMonth(nextMonth, now) != null;

  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        {canPrev ? (
          <Link
            href={historyHref({
              month: prevMonth,
              date: selectedDate && selectedDate.startsWith(prevMonth) ? selectedDate : null,
            })}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-[#f3efe4]/85 transition hover:bg-white/8"
          >
            <ChevronLeft className="size-3.5" />
            {formatMonthTitle(prevMonth)}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/5 px-3 py-1.5 text-sm text-[#f3efe4]/35">
            <ChevronLeft className="size-3.5" />
            Earlier
          </span>
        )}
        <h2 className="font-serif text-2xl tracking-tight text-[#f6f1e6]">
          {formatMonthTitle(month)}
        </h2>
        {canNext ? (
          <Link
            href={historyHref({
              month: nextMonth,
              date: selectedDate && selectedDate.startsWith(nextMonth) ? selectedDate : null,
            })}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-[#f3efe4]/85 transition hover:bg-white/8"
          >
            {formatMonthTitle(nextMonth)}
            <ChevronRight className="size-3.5" />
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/5 px-3 py-1.5 text-sm text-[#f3efe4]/35">
            Later
            <ChevronRight className="size-3.5" />
          </span>
        )}
      </div>

      <div
        role="grid"
        aria-label="Flight history calendar"
        className="mt-5 grid grid-cols-7 gap-1.5"
      >
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            role="columnheader"
            className="pb-1 text-center text-[11px] font-semibold tracking-[0.14em] text-[#d7d2c4]/50 uppercase"
          >
            {wd}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) {
            return <div key={`pad-${i}`} role="gridcell" />;
          }
          const browseable = parseBrowseDate(date, now) != null;
          const selected = date === selectedDate;
          const hasFlights = archivedDates.has(date);
          const dayNum = Number(date.slice(8, 10));
          const className = [
            "relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition",
            selected
              ? "bg-emerald-300 text-[#10211c] shadow-[0_0_24px_oklch(0.86_0.14_155/0.35)]"
              : browseable
                ? "border border-white/10 bg-black/20 text-[#f3efe4]/90 hover:bg-white/8"
                : "text-[#f3efe4]/25",
          ].join(" ");

          if (!browseable) {
            return (
              <div
                key={date}
                role="gridcell"
                aria-disabled="true"
                className={className}
              >
                {dayNum}
              </div>
            );
          }

          return (
            <div key={date} role="gridcell">
              <Link
                href={historyHref({ date })}
                aria-current={selected ? "date" : undefined}
                aria-label={`${date}${hasFlights ? ", flights recorded" : ""}`}
                className={className}
              >
                {dayNum}
                {hasFlights ? (
                  <span
                    className={`mt-0.5 size-1.5 rounded-full ${
                      selected ? "bg-[#10211c]" : "bg-emerald-300"
                    }`}
                    aria-hidden
                  />
                ) : (
                  <span className="mt-0.5 size-1.5" aria-hidden />
                )}
              </Link>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
