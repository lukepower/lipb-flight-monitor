import Link from "next/link";
import { FileDown } from "lucide-react";
import { MonthNav } from "@/components/month-nav";
import { Panel } from "@/components/panel";
import { monthGrid } from "@/lib/history";
import {
  addMonths,
  formatMonthTitle,
  officialPdfPublicPath,
  type OfficialMonthFile,
} from "@/lib/official-schedule";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function timetableHref(opts: {
  date?: string | null;
  month?: string | null;
  min?: number;
}): string {
  const params = new URLSearchParams();
  if (opts.date) params.set("date", opts.date);
  if (opts.month) params.set("month", opts.month);
  if (opts.min != null) params.set("min", String(opts.min));
  const q = params.toString();
  return q ? `/timetable?${q}` : "/timetable";
}

export function TimetableCalendar({
  month,
  selectedDate,
  trafficDates,
  availableMonths,
  file,
  minMinutes,
}: {
  month: string;
  selectedDate: string | null;
  trafficDates: Set<string>;
  availableMonths: string[];
  file: OfficialMonthFile;
  minMinutes: number;
}) {
  const cells = monthGrid(month);
  const prevMonth = addMonths(month, -1);
  const nextMonth = addMonths(month, 1);
  const canPrev = availableMonths.includes(prevMonth);
  const canNext = availableMonths.includes(nextMonth);

  return (
    <Panel>
      <MonthNav
        title={formatMonthTitle(month)}
        canPrev={canPrev}
        canNext={canNext}
        prevHref={timetableHref({ month: prevMonth, min: minMinutes })}
        nextHref={timetableHref({ month: nextMonth, min: minMinutes })}
      />

      <p className="mt-3 text-sm text-[#d7d2c4]/65">
        {file.from} → {file.to} · {file.movements.length} published legs ·{" "}
        <a
          href={officialPdfPublicPath(month)}
          className="inline-flex items-center gap-1 text-emerald-200/90 underline-offset-2 hover:underline"
          download
        >
          <FileDown className="size-3.5" />
          Download official PDF
        </a>
      </p>

      <div
        role="grid"
        aria-label="Official SkyAlps timetable calendar"
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
          const inRange = date >= file.from && date <= file.to;
          const selected = date === selectedDate;
          const hasFlights = trafficDates.has(date);
          const dayNum = Number(date.slice(8, 10));
          const className = [
            "relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition",
            selected
              ? "bg-emerald-300 text-[#10211c] shadow-[0_0_24px_oklch(0.86_0.14_155/0.35)]"
              : inRange
                ? "border border-white/10 bg-black/20 text-[#f3efe4]/90 hover:bg-white/8"
                : "text-[#f3efe4]/25",
          ].join(" ");

          if (!inRange) {
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
                href={timetableHref({ date, min: minMinutes })}
                aria-current={selected ? "date" : undefined}
                aria-label={`${date}${hasFlights ? ", scheduled flights" : ""}`}
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
