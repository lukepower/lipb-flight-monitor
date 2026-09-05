import { calendarWindows, loadWeek } from "@/lib/board";
import { parseHoleThreshold } from "@/lib/holes";
import { publicOrigin, vfrWindowsIcs } from "@/lib/ics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const min = parseHoleThreshold(new URL(request.url).searchParams.get("min"));
  const week = await loadWeek();
  const events = calendarWindows(week.days).filter(
    (e) => e.window.durationMin >= min,
  );
  const body = vfrWindowsIcs(events, publicOrigin(request));
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=lipb-vfr-windows.ics",
      "Cache-Control": "public, max-age=300",
    },
  });
}
