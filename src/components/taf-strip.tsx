import { FileText } from "lucide-react";
import { Panel, SectionKicker } from "@/components/panel";
import type { TafBundle } from "@/lib/weather";
import { formatLocalHm, formatUtcHm, zoneAbbrev } from "@/lib/time";

export function TafStrip({ taf }: { taf: TafBundle }) {
  if (taf.error || !taf.periods.length) {
    return (
      <Panel>
        <SectionKicker>
          <FileText className="size-3.5" /> LIPB TAF
        </SectionKicker>
        <p className="mt-3 text-sm text-[#d7d2c4]/80">
          {taf.error ?? "No TAF periods decoded."}
        </p>
      </Panel>
    );
  }
  return (
    <Panel>
      <SectionKicker>
        <FileText className="size-3.5" />
        LIPB TAF
        {taf.validFrom && taf.validTo
          ? ` · ${formatLocalHm(taf.validFrom)}–${formatLocalHm(taf.validTo)} LT (${zoneAbbrev(taf.validFrom)})`
          : ""}
      </SectionKicker>
      <p className="mt-2 text-xs text-[#d7d2c4]/55">
        Decoded times are Bolzano local. Raw text is UTC (Z).
        {taf.issuedAt
          ? ` Issued ${formatLocalHm(taf.issuedAt)} LT / ${formatUtcHm(taf.issuedAt)}.`
          : ""}
      </p>
      <p className="mt-3 font-mono text-xs leading-relaxed text-[#d7d2c4]/75 md:text-sm">
        {taf.raw}
      </p>
      <ol className="mt-4 grid gap-2 md:grid-cols-2">
        {taf.periods.map((p, i) => (
          <li
            key={`${p.start?.toISOString() ?? i}-${p.change ?? "base"}`}
            className={`rounded-2xl px-3.5 py-2.5 ${
              p.prevailing
                ? "border border-white/6 bg-black/20"
                : "border border-amber-300/25 bg-amber-400/10"
            }`}
          >
            <p className="font-mono text-[11px] tracking-wide text-[#d7d2c4]/55 uppercase">
              {p.change ?? "Base"}
              {p.probability ? ` ${p.probability}%` : ""}{" "}
              {p.start && p.end
                ? `${formatLocalHm(p.start)}–${formatLocalHm(p.end)} LT`
                : ""}
            </p>
            <p className="mt-1 text-sm text-[#f6f1e6]">{p.summary}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
