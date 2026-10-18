import { Disclaimer } from "@/components/disclaimer";
import { HangarLiveSections } from "@/components/hangar-live-sections";
import { minFromSearchParam } from "@/components/hole-threshold";
import { MetarStrip } from "@/components/metar-strip";
import { NextVfrCard } from "@/components/next-vfr-card";
import { OpsBanner } from "@/components/ops-banner";
import { SiteHeader } from "@/components/site-header";
import { TafStrip } from "@/components/taf-strip";
import { TurbulenceVerdictStrip } from "@/components/turbulence-verdict-card";
import { loadHangar } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function HangarPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string }>;
}) {
  const minMinutes = minFromSearchParam((await searchParams).min);
  const board = await loadHangar();
  const opsDown = Boolean(board.ops.error && board.ops.source === "none");
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader active="today" minMinutes={minMinutes} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
        <NextVfrCard day={board.today} minMinutes={minMinutes} />
        <MetarStrip metar={board.metar} />
        <TafStrip taf={board.taf} />
        {/* Single merged card: verdict + Tyrol grid footer (no separate WaveRiskStrip). */}
        <TurbulenceVerdictStrip
          verdict={board.turbulenceVerdict}
          risk={board.waveRisk}
        />
        {!opsDown ? (
          <OpsBanner ops={board.ops} days={[board.today]} />
        ) : null}
        <HangarLiveSections
          day={board.today}
          minMinutes={minMinutes}
          opsError={opsDown ? board.ops.error : null}
        />
      </main>
      <Disclaimer minMinutes={minMinutes} />
    </div>
  );
}
