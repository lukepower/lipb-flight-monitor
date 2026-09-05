import { History } from "lucide-react";
import { Disclaimer } from "@/components/disclaimer";
import { HistoryCalendar } from "@/components/history-calendar";
import { HistoryFlightList } from "@/components/history-flights";
import { minFromSearchParam } from "@/components/hole-threshold";
import { SiteHeader } from "@/components/site-header";
import {
  listHistoryDates,
  loadHistoryDay,
  monthOfDate,
  parseBrowseDate,
  parseBrowseMonth,
} from "@/lib/history";
import { todayLocalDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string; date?: string; month?: string }>;
}) {
  const params = await searchParams;
  const minMinutes = minFromSearchParam(params.min);
  const now = new Date();
  const dates = await listHistoryDates({ now });
  const archivedDates = new Set(dates);

  const requestedDate = params.date?.trim() ?? "";
  const requestedMonth = params.month?.trim() ?? "";

  let invalidDate = false;
  let dateLocal: string | null = null;
  if (requestedDate) {
    if (parseBrowseDate(requestedDate, now)) {
      dateLocal = requestedDate;
    } else {
      invalidDate = true;
    }
  }

  let invalidMonth = false;
  let month = dateLocal ? monthOfDate(dateLocal) : monthOfDate(todayLocalDate(now));
  if (requestedMonth) {
    const parsed = parseBrowseMonth(requestedMonth, now);
    if (parsed) {
      month = parsed;
    } else {
      invalidMonth = true;
    }
  }

  const day = dateLocal ? await loadHistoryDay(dateLocal, { now }) : null;

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader active="history" minMinutes={minMinutes} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.18em] text-emerald-300/80 uppercase">
            <History className="size-3.5" />
            As-flown log
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[#d7d2c4]/75">
            Arrivals and departures as they happened, from FlightAware. Pick a
            day on the calendar. Not merged with the SkyAlps timetable. Not an
            official airport log.
          </p>
        </div>

        {invalidDate || invalidMonth ? (
          <p className="rounded-2xl border border-rose-300/20 bg-rose-300/5 px-4 py-3 text-sm text-rose-100/90">
            Invalid date.
          </p>
        ) : null}

        <HistoryCalendar
          month={month}
          selectedDate={dateLocal}
          archivedDates={archivedDates}
          now={now}
        />

        {!dateLocal && dates.length === 0 && !invalidDate ? (
          <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-[#d7d2c4]/75">
            History starts after the first cron snapshot. Nothing archived yet.
          </p>
        ) : null}

        {dateLocal ? (
          <HistoryFlightList
            dateLocal={dateLocal}
            movements={day?.movements ?? []}
          />
        ) : null}
      </main>
      <Disclaimer minMinutes={minMinutes} />
    </div>
  );
}
