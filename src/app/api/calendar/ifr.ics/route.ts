import { loadWeek, movementsFromDays } from "@/lib/board";
import { ifrBusyIcs, publicOrigin } from "@/lib/ics";
import { mergeOccupied } from "@/lib/occupancy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const week = await loadWeek();
  const movements = movementsFromDays(week.days);
  const atz = mergeOccupied(movements, "atz");
  const body = ifrBusyIcs(movements, atz, publicOrigin(request));
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=lipb-ifr.ics",
      "Cache-Control": "public, max-age=300",
    },
  });
}
