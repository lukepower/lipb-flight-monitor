import { ShieldAlert } from "lucide-react";
import { AFIU_FREQ } from "@/lib/constants";
import { CopyLink } from "@/components/copy-link";

export function Disclaimer() {
  return (
    <footer className="mt-4 border-t border-white/8 px-4 py-8 text-sm text-[#d7d2c4]/65">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <p className="flex max-w-3xl gap-3 leading-relaxed">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-emerald-300/70" />
          <span>
            Planning aid only. No VFR in the Bolzano ATZ during an IFR arrival or
            departure. Valle Adige / Cles can also be hot from Trento or Cles
            HEMS. Today and the week overlay FlightAware arrivals and departures
            on the SkyAlps timetable; local circuits stay off the list. Confirm
            with Bolzano AFIU {AFIU_FREQ}, AIP and NOTAM. TAF is official
            aviation weather; Open-Meteo hours are a model, not a TAF. Clock
            times are Bolzano local (CET/CEST). Only the raw METAR/TAF string is
            UTC.
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <CopyLink href="/api/calendar/vfr-windows.ics" label="VFR calendar" />
          <CopyLink href="/api/calendar/ifr.ics" label="IFR calendar" />
        </div>
      </div>
    </footer>
  );
}
