import {
  BookOpen,
  CalendarRange,
  Clock,
  CloudSun,
  History,
  Radio,
  SunMedium,
  Sunrise,
} from "lucide-react";
import { AFIU_FREQ, LIPB, type HoleThreshold } from "@/lib/constants";
import { CopyLink } from "@/components/copy-link";
import { HoleThresholdControl } from "@/components/hole-threshold";
import { SiteHeaderShell } from "@/components/site-header-shell";
import { SiteNavTabs } from "@/components/site-nav-tabs";
import { clockLegend, zoneAbbrev } from "@/lib/time";

const PATHS = {
  today: "/",
  tomorrow: "/tomorrow",
  week: "/week",
  sky: "/sky",
  history: "/history",
  season: "/season",
  timetable: "/timetable",
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
    {
      href: PATHS.tomorrow,
      id: "tomorrow" as const,
      label: "Tomorrow",
      icon: Sunrise,
    },
    { href: PATHS.week, id: "week" as const, label: "Week", icon: CalendarRange },
    { href: PATHS.sky, id: "sky" as const, label: "Sky", icon: CloudSun },
    {
      href: PATHS.history,
      id: "history" as const,
      label: "History",
      icon: History,
    },
    { href: PATHS.season, id: "season" as const, label: "Season", icon: SunMedium },
    {
      href: PATHS.timetable,
      id: "timetable" as const,
      label: "Timetable",
      icon: BookOpen,
    },
  ];
  const hideHole =
    active === "history" || active === "sky" || active === "timetable";
  const abbrev = zoneAbbrev();

  return (
    <SiteHeaderShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-end md:justify-between md:gap-5 md:py-5">
        <div className="min-w-0 max-w-2xl md:min-w-[16rem]">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.22em] text-emerald-300/85 uppercase">
            <Radio className="size-3.5" />
            Hangar board · {LIPB.icao} / {LIPB.iata}
          </p>
          <h1 className="mt-1.5 font-serif text-3xl tracking-tight text-[#f6f1e6] md:mt-2 md:text-5xl">
            {LIPB.nameEn}{" "}
            <span className="text-[#f6f1e6]/45">/</span> {LIPB.nameDe}
          </h1>
          <p className="mt-1.5 max-h-12 overflow-hidden text-sm leading-snug text-[#d7d2c4]/75 opacity-100 transition-[max-height,opacity,margin] duration-200 lg:group-data-[compact=true]/hdr:mt-0 lg:group-data-[compact=true]/hdr:max-h-0 lg:group-data-[compact=true]/hdr:opacity-0">
            SkyAlps timetable + live IFR · AFIU{" "}
            <span className="font-mono text-emerald-200">{AFIU_FREQ}</span>
            {" · "}
            no night VFR
          </p>
        </div>
        <nav
          className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
          aria-label="Sections"
        >
          <p className="inline-flex max-h-10 w-fit items-center gap-2 overflow-hidden rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100 opacity-100 transition-[max-height,opacity,margin,padding,border-color] duration-200 lg:group-data-[compact=true]/hdr:m-0 lg:group-data-[compact=true]/hdr:max-h-0 lg:group-data-[compact=true]/hdr:border-transparent lg:group-data-[compact=true]/hdr:p-0 lg:group-data-[compact=true]/hdr:opacity-0">
            <Clock className="size-3.5 shrink-0" />
            <span className="md:hidden">
              Bolzano local · {abbrev} · not UTC
            </span>
            <span className="hidden md:inline">
              Clock times: {clockLegend()} · not UTC
            </span>
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SiteNavTabs links={links} active={active} minMinutes={minMinutes} />
            {!hideHole ? (
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <HoleThresholdControl minMinutes={minMinutes} path={path} />
                <CopyLink
                  href="/api/calendar/vfr-windows.ics"
                  label="Subscribe .ics"
                  shortLabel="ICS"
                  minMinutes={minMinutes}
                />
              </div>
            ) : null}
          </div>
        </nav>
      </div>
    </SiteHeaderShell>
  );
}
