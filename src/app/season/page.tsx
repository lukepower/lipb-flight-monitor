import { Disclaimer } from "@/components/disclaimer";
import { minFromSearchParam } from "@/components/hole-threshold";
import { SeasonBoard } from "@/components/season-board";
import { SiteHeader } from "@/components/site-header";
import { loadSeason } from "@/lib/board";

export const dynamic = "force-dynamic";

export default async function SeasonPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string }>;
}) {
  const minMinutes = minFromSearchParam((await searchParams).min);
  const season = loadSeason();
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader active="season" minMinutes={minMinutes} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
        <SeasonBoard season={season} minMinutes={minMinutes} />
      </main>
      <Disclaimer minMinutes={minMinutes} />
    </div>
  );
}
