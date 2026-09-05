import { AFIU_FREQ } from "@/lib/constants";
import { CopyLink } from "@/components/copy-link";

export function Disclaimer() {
  return (
    <footer className="border-t border-white/10 px-4 py-6 text-sm text-[#d7d2c4]/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <p className="max-w-3xl">
          Planning aid only. No VFR in the Bolzano ATZ during an IFR arrival or
          departure. Valle Adige / Cles can also be hot from Trento or Cles HEMS.
          GA, state and ambulance IFR are often missing from the SkyAlps
          timetable. Confirm with Bolzano AFIU {AFIU_FREQ}, AIP and NOTAM. TAF is
          official aviation weather; Open-Meteo hours are a model, not a TAF.
        </p>
        <div className="flex flex-wrap gap-2">
          <CopyLink href="/api/calendar/vfr-windows.ics" label="VFR calendar" />
          <CopyLink href="/api/calendar/ifr.ics" label="IFR calendar" />
        </div>
      </div>
    </footer>
  );
}
