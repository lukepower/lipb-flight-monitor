import { Disclaimer } from "@/components/disclaimer";
import { SiteHeader } from "@/components/site-header";
import { loadSeason } from "@/lib/board";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SeasonPage() {
  const season = loadSeason();
  const max = Math.max(1, ...season.heatmap.map((c) => c.minutes));
  const hours = Array.from({ length: 18 }, (_, i) => i + 5);
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader active="season" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5">
        <section className="rounded-2xl border border-white/10 bg-[#101917] p-4 md:p-5">
          <h2 className="font-serif text-2xl text-[#f3efe4]">
            Quiet slots · {season.from} to {season.to}
          </h2>
          <p className="mt-1 text-sm text-[#d7d2c4]/70">
            Traffic only — SkyAlps summer 2026. Darker green means more total
            hole minutes in that weekday/hour. Weather is not applied here.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-max border-separate border-spacing-1 text-center text-xs">
              <thead>
                <tr>
                  <th className="w-12 text-left text-[#d7d2c4]/50" />
                  {hours.map((h) => (
                    <th key={h} className="w-8 font-normal text-[#d7d2c4]/50">
                      {String(h).padStart(2, "0")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WEEKDAYS.map((label, idx) => (
                  <tr key={label}>
                    <th className="text-left font-medium text-[#d7d2c4]/80">
                      {label}
                    </th>
                    {hours.map((hour) => {
                      const cell = season.heatmap.find(
                        (c) => c.weekday === idx + 1 && c.hour === hour,
                      );
                      const t = cell ? cell.minutes / max : 0;
                      return (
                        <td key={`${label}-${hour}`}>
                          <div
                            className="size-8 rounded-md"
                            style={{
                              background: `color-mix(in oklab, #34d399 ${Math.round(t * 100)}%, #10211c)`,
                            }}
                            title={`${label} ${hour}:00 · ${cell?.minutes ?? 0} min`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rounded-2xl border border-white/10 bg-[#101917] p-4 md:p-5">
          <h2 className="font-serif text-2xl text-[#f3efe4]">Best remaining days</h2>
          <ol className="mt-3 divide-y divide-white/5">
            {season.bestDays.map((d, i) => (
              <li
                key={d.dateLocal}
                className="flex items-center justify-between py-2 text-[#f3efe4]"
              >
                <span>
                  {i + 1}. {d.dateLocal}
                </span>
                <span className="text-[#d7d2c4]/70">
                  {d.windowCount} holes · {Math.round(d.totalGreenMin / 60)} h
                  green
                </span>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Disclaimer />
    </div>
  );
}
