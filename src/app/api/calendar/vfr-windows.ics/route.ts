import { calendarWindows, loadWeek } from "@/lib/board";
import { publicOrigin, vfrWindowsIcs } from "@/lib/ics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const week = await loadWeek();
  const body = vfrWindowsIcs(calendarWindows(week.days), publicOrigin(request));
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=lipb-vfr-windows.ics",
      "Cache-Control": "public, max-age=300",
    },
  });
}
