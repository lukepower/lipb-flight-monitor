import { DayPanel } from "@/components/day-board";
import { Disclaimer } from "@/components/disclaimer";
import { MetarStrip } from "@/components/metar-strip";
import { OpsBanner } from "@/components/ops-banner";
import { SiteHeader } from "@/components/site-header";
import { TafStrip } from "@/components/taf-strip";
import { loadWeek } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function WeekPage() {
  const week = await loadWeek();
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader active="week" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-5">
        <p className="text-sm text-[#d7d2c4]/80">
          Next seven days. Slots inside the TAF validity use the official
          forecast; later hours use Open-Meteo and are labelled as a model.
          All clock times are Bolzano local, not UTC.
        </p>
        <MetarStrip metar={week.metar} />
        <TafStrip taf={week.taf} />
        <OpsBanner ops={week.ops} days={week.days} />
        {week.days.map((day) => (
          <DayPanel key={day.dateLocal} day={day} />
        ))}
      </main>
      <Disclaimer />
    </div>
  );
}
