import Link from "next/link";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { DayPanel } from "@/components/day-board";
import { Disclaimer } from "@/components/disclaimer";
import { minFromSearchParam } from "@/components/hole-threshold";
import { SiteHeader } from "@/components/site-header";
import { loadHistoryBoard } from "@/lib/board";
import { listHistoryDates, parseBrowseDate } from "@/lib/history";

export const dynamic = "force-dynamic";

function adjacentDates(
  dates: string[],
  current: string,
): { prev: string | null; next: string | null } {
  const idx = dates.indexOf(current);
  if (idx < 0) {
    return { prev: dates[0] ?? null, next: null };
  }
  // dates are newest-first
  return {
    prev: dates[idx + 1] ?? null,
    next: dates[idx - 1] ?? null,
  };
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string; date?: string }>;
}) {
  const params = await searchParams;
  const minMinutes = minFromSearchParam(params.min);
  const dates = await listHistoryDates();
  const requested = params.date?.trim() ?? "";
  const defaultDate = dates[0] ?? null;

  let invalidDate = false;
  let dateLocal: string | null = defaultDate;
  if (requested) {
    if (parseBrowseDate(requested)) {
      dateLocal = requested;
    } else {
      invalidDate = true;
      dateLocal = null;
    }
  }

  const board =
    dateLocal != null
      ? await loadHistoryBoard(dateLocal)
      : { day: null, updatedAt: null, dates, invalidDate };

  const navDate = dateLocal && !board.invalidDate ? dateLocal : null;
  const { prev, next } = navDate
    ? adjacentDates(board.dates, navDate)
    : { prev: null, next: null };

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader active="history" minMinutes={minMinutes} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.18em] text-emerald-300/80 uppercase">
              <History className="size-3.5" />
              Archived ops
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#d7d2c4]/75">
              Past IFR from FlightAware snapshots merged with the SkyAlps
              timetable. No live weather. Not an official airport log.
            </p>
          </div>
          {navDate ? (
            <div className="flex items-center gap-2">
              {prev ? (
                <Link
                  href={`/history?date=${prev}&min=${minMinutes}`}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-[#f3efe4]/85 transition hover:bg-white/8"
                >
                  <ChevronLeft className="size-3.5" />
                  Earlier
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/5 px-3 py-1.5 text-sm text-[#f3efe4]/35">
                  <ChevronLeft className="size-3.5" />
                  Earlier
                </span>
              )}
              {next ? (
                <Link
                  href={`/history?date=${next}&min=${minMinutes}`}
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-[#f3efe4]/85 transition hover:bg-white/8"
                >
                  Later
                  <ChevronRight className="size-3.5" />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/5 px-3 py-1.5 text-sm text-[#f3efe4]/35">
                  Later
                  <ChevronRight className="size-3.5" />
                </span>
              )}
            </div>
          ) : null}
        </div>

        {invalidDate || board.invalidDate ? (
          <p className="rounded-2xl border border-rose-300/20 bg-rose-300/5 px-4 py-3 text-sm text-rose-100/90">
            Invalid date.
          </p>
        ) : null}

        {!dateLocal && !invalidDate ? (
          <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-[#d7d2c4]/75">
            History starts after the first cron snapshot. Nothing archived yet.
          </p>
        ) : null}

        {board.day ? (
          <>
            <p className="text-xs text-[#d7d2c4]/55">
              Archived ops · no weather
              {board.updatedAt
                ? ` · snapshot ${board.updatedAt.replace("T", " ").slice(0, 16)} UTC`
                : " · timetable only for this day"}
            </p>
            <DayPanel
              day={board.day}
              minMinutes={minMinutes}
              emptyHint="No IFR on the timetable or in the archive for this day."
            />
          </>
        ) : null}
      </main>
      <Disclaimer minMinutes={minMinutes} />
    </div>
  );
}
