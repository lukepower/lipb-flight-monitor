import { Disclaimer } from "@/components/disclaimer";
import { HangarLiveSections } from "@/components/hangar-live-sections";
import { minFromSearchParam } from "@/components/hole-threshold";
import { MetarStrip } from "@/components/metar-strip";
import { OpsBanner } from "@/components/ops-banner";
import { SiteHeader } from "@/components/site-header";
import { TafStrip } from "@/components/taf-strip";
import { WaveRiskStrip } from "@/components/wave-risk-strip";
import { loadHangar } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function HangarPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string }>;
}) {
  const minMinutes = minFromSearchParam((await searchParams).min);
  const board = await loadHangar();
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader active="today" minMinutes={minMinutes} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
        <MetarStrip metar={board.metar} />
        <TafStrip taf={board.taf} />
        <WaveRiskStrip risk={board.waveRisk} />
        <OpsBanner ops={board.ops} days={[board.today]} />
        <HangarLiveSections day={board.today} minMinutes={minMinutes} />
      </main>
      <Disclaimer minMinutes={minMinutes} />
    </div>
  );
}
