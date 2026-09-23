import { AlpineWindStrip } from "@/components/alpine-wind-strip";
import { Disclaimer } from "@/components/disclaimer";
import { GaforStrip } from "@/components/gafor-strip";
import { minFromSearchParam } from "@/components/hole-threshold";
import { MetarStrip } from "@/components/metar-strip";
import { SigmetStrip } from "@/components/sigmet-strip";
import { SiteHeader } from "@/components/site-header";
import { SwllStrip } from "@/components/swll-strip";
import { WebcamStrip } from "@/components/webcam-strip";
import { WaveRiskMap } from "@/components/wave-risk-map";
import { WaveRiskStrip } from "@/components/wave-risk-strip";
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
        <MetarStrip metar={board.metar} />
        <WaveRiskStrip risk={board.waveRisk} showSkyHint={false} />
        <WaveRiskMap risk={board.waveRisk} />
        <AlpineWindStrip wind={board.alpineWind} />
        <SwllStrip swll={board.swll} />
        <GaforStrip italyGafor={board.italyGafor} routes={board.gaforRoutes} />
        <SigmetStrip advisories={board.advisories} />
        <WxImagery radar={board.radar} satellite={board.satellite} />
        <WebcamStrip webcams={board.webcams} />
      </main>
      <Disclaimer minMinutes={minMinutes} />
    </div>
  );
}
