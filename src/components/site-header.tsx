import Link from "next/link";
import { CalendarRange, Clock, History, Radio, SunMedium } from "lucide-react";
import { AFIU_FREQ, LIPB, type HoleThreshold } from "@/lib/constants";
import { CopyLink } from "@/components/copy-link";
import { HoleThresholdControl } from "@/components/hole-threshold";
import { clockLegend } from "@/lib/time";

const PATHS = {
  today: "/",
  week: "/week",
  history: "/history",
  season: "/season",
} as const;

export function SiteHeader({
  active,
  minMinutes,
}: {
  active: keyof typeof PATHS;
  minMinutes: HoleThreshold;
}) {
  const path = PATHS[active];
  const links = [
    { href: PATHS.today, id: "today" as const, label: "Today", icon: Clock },
    { href: PATHS.week, id: "week" as const, label: "Week", icon: CalendarRange },
    {
      href: PATHS.history,
      id: "history" as const,
      label: "History",
      icon: History,
    },
    { href: PATHS.season, id: "season" as const, label: "Season", icon: SunMedium },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-[#0b1210]/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.22em] text-emerald-300/85 uppercase">
            <Radio className="size-3.5" />
            Hangar board · {LIPB.icao} / {LIPB.iata}
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-[#f6f1e6] md:text-5xl">
            {LIPB.nameEn}{" "}
            <span className="text-[#f6f1e6]/45">/</span> {LIPB.nameDe}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#d7d2c4]/75">
            SkyAlps timetable plus live FlightAware IFR. Confirm with AFIU{" "}
            <span className="font-mono text-emerald-200">{AFIU_FREQ}</span>.
            Night VFR is not allowed.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100">
            <Clock className="size-3.5" />
            Clock times: {clockLegend()} · not UTC
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          <HoleThresholdControl minMinutes={minMinutes} path={path} />
          <div className="flex rounded-full border border-white/10 bg-black/25 p-1">
            {links.map((link) => {
              const Icon = link.icon;
              const on = active === link.id;
              return (
                <Link
                  key={link.id}
                  href={`${link.href}?min=${minMinutes}`}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    on
                      ? "bg-emerald-300 text-[#10211c] shadow-[0_0_24px_oklch(0.86_0.14_155/0.35)]"
                      : "text-[#f3efe4]/80 hover:bg-white/8 hover:text-[#f6f1e6]"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {link.label}
                </Link>
              );
            })}
          </div>
          <CopyLink
            href="/api/calendar/vfr-windows.ics"
            label="Subscribe .ics"
            minMinutes={minMinutes}
          />
        </nav>
      </div>
    </header>
  );
}
