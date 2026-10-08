import { BookOpen } from "lucide-react";
import { Disclaimer } from "@/components/disclaimer";
import { minFromSearchParam } from "@/components/hole-threshold";
import { SiteHeader } from "@/components/site-header";
import { TimetableCalendar } from "@/components/timetable-calendar";
import { TimetableFlightList } from "@/components/timetable-flights";
import { monthOfDate, parseCalendarDate } from "@/lib/history";
import {
  defaultOfficialMonth,
  listOfficialMonths,
  loadOfficialMonth,
  movementsOnOfficialDate,
  officialTrafficDates,
  parseOfficialBrowseDate,
  parseOfficialBrowseMonth,
} from "@/lib/official-schedule";

export const dynamic = "force-dynamic";

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string; date?: string; month?: string }>;
}) {
  const params = await searchParams;
  const minMinutes = minFromSearchParam(params.min);
  const available = listOfficialMonths();
  const now = new Date();

  const requestedDate = params.date?.trim() ?? "";
  const requestedMonth = params.month?.trim() ?? "";

  let invalidDate = false;
  let invalidMonth = false;

  let month =
    defaultOfficialMonth(available, now) ?? available[available.length - 1] ?? null;

  if (requestedMonth) {
    const parsed = parseOfficialBrowseMonth(requestedMonth, available);
    if (parsed) {
      month = parsed;
    } else {
      invalidMonth = true;
    }
  }

  let dateLocal: string | null = null;
  if (requestedDate) {
    const calendarDate = parseCalendarDate(requestedDate);
    if (!calendarDate) {
      invalidDate = true;
    } else {
      const dateMonth = monthOfDate(calendarDate);
      const fileForDate = loadOfficialMonth(dateMonth);
      const parsed = parseOfficialBrowseDate(calendarDate, fileForDate);
      if (parsed) {
        dateLocal = parsed;
        month = dateMonth;
      } else {
        invalidDate = true;
      }
    }
  }

  const file = month ? loadOfficialMonth(month) : null;
  const trafficDates = file ? officialTrafficDates(file) : new Set<string>();
  const dayMovements =
    dateLocal && file ? movementsOnOfficialDate(file, dateLocal) : [];

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader active="timetable" minMinutes={minMinutes} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.18em] text-emerald-300/80 uppercase">
            <BookOpen className="size-3.5" />
            Official timetable
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#d7d2c4]/75">
            Published SkyAlps commercial schedule by month. Ferries, charters,
            and bizjets still appear on Today / Week from the airport
            programmazione and live FlightAware board.
          </p>
        </div>

        {invalidDate || invalidMonth ? (
          <p className="rounded-2xl border border-rose-300/20 bg-rose-300/5 px-4 py-3 text-sm text-rose-100/90">
            {invalidDate && invalidMonth
              ? "Invalid date or month."
              : invalidMonth
                ? "Invalid month — that official timetable is not imported yet."
                : "Invalid date for this official timetable."}
          </p>
        ) : null}

        {available.length === 0 || !file || !month ? (
          <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-[#d7d2c4]/75">
            No official monthly schedules imported yet. Add a SkyAlps PDF with{" "}
            <code className="font-mono text-emerald-100/90">
              npm run import:official
            </code>
            .
          </p>
        ) : (
          <>
            <TimetableCalendar
              month={month}
              selectedDate={dateLocal}
              trafficDates={trafficDates}
              availableMonths={available}
              file={file}
              minMinutes={minMinutes}
            />

            {dateLocal ? (
              <TimetableFlightList
                dateLocal={dateLocal}
                movements={dayMovements}
              />
            ) : (
              <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-[#d7d2c4]/75">
                Pick a day with a green dot to see the published ARR/DEP list.
              </p>
            )}
          </>
        )}
      </main>
      <Disclaimer minMinutes={minMinutes} />
    </div>
  );
}
