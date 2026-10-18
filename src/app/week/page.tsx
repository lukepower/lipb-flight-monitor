import { DayPanel } from "@/components/day-board";
import { Disclaimer } from "@/components/disclaimer";
import { minFromSearchParam } from "@/components/hole-threshold";
import { OpsBanner } from "@/components/ops-banner";
import { SiteHeader } from "@/components/site-header";
import { WeekOverview } from "@/components/week-overview";
import { loadWeek } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string }>;
}) {
  const minMinutes = minFromSearchParam((await searchParams).min);
  const week = await loadWeek();
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader active="week" minMinutes={minMinutes} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
        <p className="max-w-2xl text-sm leading-relaxed text-[#d7d2c4]/75">
          Next seven days. Slots inside TAF validity use the official forecast;
          later hours use Open-Meteo and are labelled as a model. All clock
          times are Bolzano local, not UTC.
        </p>
        <WeekOverview days={week.overview} />
        <OpsBanner ops={week.ops} days={week.days} />
        {week.days.map((day) => (
          <DayPanel
            key={day.dateLocal}
            day={day}
            minMinutes={minMinutes}
            collapseMovements
          />
        ))}
      </main>
      <Disclaimer minMinutes={minMinutes} />
    </div>
  );
}
