import { AlertTriangle, ExternalLink, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import type { AdvisoryBundle, WxAdvisory } from "@/lib/sigmet";
import { formatLocalHm, formatUtcHm } from "@/lib/time";
import { cn } from "@/lib/utils";

export function SigmetStrip({ advisories }: { advisories: AdvisoryBundle }) {
  const items = advisories.advisories;

  if (items.length === 0) {
    return (
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <SectionKicker>
            <AlertTriangle className="size-3.5" /> SIGMET / AIRMET
          </SectionKicker>
          <Badge className="bg-emerald-400/15 text-emerald-100">None active</Badge>
        </div>
        <p className="mt-2 text-xs text-[#d7d2c4]/55">
          No currently valid Italian / Alpine SIGMET or AIRMET from MeteoAM or
          AWC
          {advisories.error ? ` (${advisories.error})` : ""}. Confirm on official
          pages before flight.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <SourceLink href={advisories.sigmetSourceUrl} label="MeteoAM SIGMET" />
          <SourceLink href={advisories.airmetSourceUrl} label="MeteoAM AIRMET" />
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="border-amber-300/20">
      <div className="flex flex-wrap items-center gap-2">
        <SectionKicker>
          <TriangleAlert className="size-3.5" /> SIGMET / AIRMET
        </SectionKicker>
        <Badge className="bg-amber-400/20 text-amber-100">
          {items.length} active
        </Badge>
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          MeteoAM + AWC · Alpine FIRs preferred
        </span>
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((a) => (
          <li key={a.id}>
            <AdvisoryCard advisory={a} />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-[#d7d2c4]/45">
        {advisories.attribution}
        {" · "}
        <a
          href={advisories.sigmetSourceUrl}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-white/20 hover:text-[#f3efe4]/70"
        >
          meteoam.it/it/sigmet
        </a>
      </p>
    </Panel>
  );
}

function AdvisoryCard({ advisory }: { advisory: WxAdvisory }) {
  const from = advisory.validFrom ? new Date(advisory.validFrom) : null;
  const to = advisory.validTo ? new Date(advisory.validTo) : null;
  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-2.5",
        advisory.alpineRelevant
          ? "border-amber-300/25 bg-amber-400/10"
          : "border-white/6 bg-black/20",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-white/12 text-[#f3efe4] uppercase">
          {advisory.kind}
        </Badge>
        {advisory.fir ? (
          <span className="font-mono text-sm text-[#f6f1e6]">{advisory.fir}</span>
        ) : null}
        {advisory.alpineRelevant ? (
          <Badge className="bg-amber-300/20 text-amber-100">Alpine FIR</Badge>
        ) : null}
        <span className="font-mono text-[11px] text-[#d7d2c4]/45">
          {advisory.source}
        </span>
      </div>
      {(from || to) && (
        <p className="mt-1 font-mono text-xs text-[#d7d2c4]/55">
          {from ? `${formatUtcHm(from)}–` : ""}
          {to ? formatUtcHm(to) : "?"}
          {to ? ` · ${formatLocalHm(to)} local end` : ""}
        </p>
      )}
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[#d7d2c4]/80">
        {advisory.raw}
      </pre>
      {advisory.mapUrl ? (
        <a
          href={advisory.mapUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block overflow-hidden rounded-lg border border-white/10 bg-[#0b1210]"
          title="Open area chart"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={advisory.mapUrl}
            alt={`${advisory.kind} area chart`}
            className="mx-auto max-h-56 w-full object-contain"
            draggable={false}
          />
        </a>
      ) : null}
    </div>
  );
}

function SourceLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-[#f3efe4]/90 transition hover:bg-white/8"
    >
      {label}
      <ExternalLink className="size-3 opacity-60" />
    </a>
  );
}
