import { DayPanel } from "@/components/day-board";
import { Disclaimer } from "@/components/disclaimer";
import { minFromSearchParam } from "@/components/hole-threshold";
import { MetarStrip } from "@/components/metar-strip";
import { OpsBanner } from "@/components/ops-banner";
import { SiteHeader } from "@/components/site-header";
import { TafStrip } from "@/components/taf-strip";
import { loadHangar } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function TomorrowPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string }>;
}) {
  const minMinutes = minFromSearchParam((await searchParams).min);
  const board = await loadHangar();
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader active="tomorrow" minMinutes={minMinutes} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
        <MetarStrip metar={board.metar} />
        <TafStrip taf={board.taf} />
        <OpsBanner ops={board.ops} days={[board.tomorrow]} />
        <DayPanel day={board.tomorrow} minMinutes={minMinutes} />
      </main>
      <Disclaimer minMinutes={minMinutes} />
    </div>
  );
}
