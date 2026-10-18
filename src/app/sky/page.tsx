import { AlpineWindStrip } from "@/components/alpine-wind-strip";
import { Disclaimer } from "@/components/disclaimer";
import { GaforStrip } from "@/components/gafor-strip";
import { minFromSearchParam } from "@/components/hole-threshold";
import { SigmetStrip } from "@/components/sigmet-strip";
import { SiteHeader } from "@/components/site-header";
import { SkyJumpChips } from "@/components/sky-jump-chips";
import { SwllStrip } from "@/components/swll-strip";
import { WebcamStrip } from "@/components/webcam-strip";
import { TurbulenceVerdictCard } from "@/components/turbulence-verdict-card";
import { WaveRiskMap } from "@/components/wave-risk-map";
import { WxImagery } from "@/components/wx-imagery";
import { loadSky } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function SkyPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string }>;
}) {
  const minMinutes = minFromSearchParam((await searchParams).min);
  const board = await loadSky();
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader active="sky" minMinutes={minMinutes} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
        <SkyJumpChips />
        <div id="sky-turbulence" className="scroll-mt-16 space-y-5">
          <TurbulenceVerdictCard verdict={board.turbulenceVerdict} />
          <WaveRiskMap risk={board.waveRisk} alpine={board.alpineWind} />
        </div>
        <div id="sky-wind" className="scroll-mt-16">
          <AlpineWindStrip wind={board.alpineWind} foehn={board.metar.foehn} />
        </div>
        <div id="sky-swll" className="scroll-mt-16">
          <SwllStrip swll={board.swll} />
        </div>
        <div id="sky-gafor" className="scroll-mt-16">
          <GaforStrip italyGafor={board.italyGafor} routes={board.gaforRoutes} />
        </div>
        <div id="sky-sigmet" className="scroll-mt-16">
          <SigmetStrip advisories={board.advisories} />
        </div>
        <div id="sky-radar" className="scroll-mt-16">
          <WxImagery radar={board.radar} satellite={board.satellite} />
        </div>
        <div id="sky-webcams" className="scroll-mt-16">
          <WebcamStrip webcams={board.webcams} />
        </div>
      </main>
      <Disclaimer minMinutes={minMinutes} />
    </div>
  );
}
