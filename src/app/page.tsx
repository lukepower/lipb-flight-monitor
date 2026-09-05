import { DayPanel } from "@/components/day-board";
import { Disclaimer } from "@/components/disclaimer";
import { LiveTraffic } from "@/components/live-traffic";
import { MetarStrip } from "@/components/metar-strip";
import { SiteHeader } from "@/components/site-header";
import { TafStrip } from "@/components/taf-strip";
import { loadHangar } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function HangarPage() {
  const board = await loadHangar();
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader active="today" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-5">
        <MetarStrip metar={board.metar} />
        <TafStrip taf={board.taf} />
        <DayPanel day={board.today} />
        <DayPanel day={board.tomorrow} />
        <LiveTraffic />
      </main>
      <Disclaimer />
    </div>
  );
}
