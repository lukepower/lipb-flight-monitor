import { Disclaimer } from "@/components/disclaimer";
import { SeasonBoard } from "@/components/season-board";
import { SiteHeader } from "@/components/site-header";
import { loadSeason } from "@/lib/board";

export const dynamic = "force-dynamic";

export default function SeasonPage() {
  const season = loadSeason();
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader active="season" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6">
        <SeasonBoard season={season} />
      </main>
      <Disclaimer />
    </div>
  );
}
