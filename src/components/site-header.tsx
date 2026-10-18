import { Clock, Radio } from "lucide-react";
import { AFIU_FREQ, LIPB, type HoleThreshold } from "@/lib/constants";
import { CopyLink } from "@/components/copy-link";
import { HoleThresholdControl } from "@/components/hole-threshold";
import { SiteHeaderShell } from "@/components/site-header-shell";
import {
  SiteNavTabs,
  type SiteNavActive,
} from "@/components/site-nav-tabs";
import { zoneAbbrev } from "@/lib/time";

const PATHS: Record<SiteNavActive, string> = {
  today: "/",
  tomorrow: "/tomorrow",
  week: "/week",
  sky: "/sky",
  history: "/history",
  season: "/season",
  timetable: "/timetable",
};

export function SiteHeader({
  active,
  minMinutes,
}: {
  active: SiteNavActive;
  minMinutes: HoleThreshold;
}) {
  const path = PATHS[active];
  const hideHole =
    active === "history" || active === "sky" || active === "timetable";
  const abbrev = zoneAbbrev();

  return (
    <SiteHeaderShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-1.5 px-4 py-2 md:flex-row md:items-end md:justify-between md:gap-5 md:py-5">
        <div className="min-w-0 max-w-2xl md:min-w-[16rem]">
          <p className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] text-emerald-300/85 uppercase md:text-[11px] md:tracking-[0.22em]">
            <Radio className="size-3.5" />
            Hangar board · {LIPB.icao} / {LIPB.iata}
          </p>
          <h1 className="mt-0.5 font-serif text-2xl tracking-tight text-[#f6f1e6] sm:text-3xl md:mt-2 md:text-5xl">
            {LIPB.nameEn}{" "}
            <span className="text-[#f6f1e6]/45">/</span> {LIPB.nameDe}
          </h1>
          <p className="mt-0.5 max-h-10 overflow-hidden text-xs leading-snug text-[#d7d2c4]/75 opacity-100 transition-[max-height,opacity,margin] duration-200 md:mt-1 md:text-sm lg:group-data-[compact=true]/hdr:mt-0 lg:group-data-[compact=true]/hdr:max-h-0 lg:group-data-[compact=true]/hdr:opacity-0">
            SkyAlps timetable + live IFR · AFIU{" "}
            <span className="font-mono text-emerald-200">{AFIU_FREQ}</span>
            {" · "}
            no night VFR
          </p>
          <p className="mt-1 inline-flex max-h-8 w-fit items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-100 opacity-100 transition-[max-height,opacity,margin,padding,border-color] duration-200 md:mt-2 md:gap-2 md:px-3 md:py-1 md:text-xs lg:group-data-[compact=true]/hdr:m-0 lg:group-data-[compact=true]/hdr:max-h-0 lg:group-data-[compact=true]/hdr:border-transparent lg:group-data-[compact=true]/hdr:p-0 lg:group-data-[compact=true]/hdr:opacity-0">
            <Clock className="size-3 shrink-0 md:size-3.5" />
            <span className="md:hidden">
              Bolzano local · {abbrev} · not UTC
            </span>
            <span className="hidden md:inline lg:hidden">
              Bolzano LT · {abbrev} · not UTC
            </span>
            <span className="hidden lg:inline">
              Bolzano LT · {abbrev} · not UTC
            </span>
          </p>
        </div>
        <nav
          className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
          aria-label="Sections"
        >
          <SiteNavTabs active={active} minMinutes={minMinutes} />
          {!hideHole ? (
            <div className="flex flex-wrap items-center gap-2">
              <HoleThresholdControl minMinutes={minMinutes} path={path} />
              <CopyLink
                href="/api/calendar/vfr-windows.ics"
                label="Subscribe .ics"
                shortLabel="ICS"
                minMinutes={minMinutes}
              />
            </div>
          ) : null}
        </nav>
      </div>
    </SiteHeaderShell>
  );
}
