import { Mountain, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import { SOUNDING_MAX_ALT_M } from "@/lib/constants";
import {
  type WaveRiskBundle,
  type WaveRiskSeverity,
} from "@/lib/wave-risk";
import { formatLocalHm } from "@/lib/time";
import { cn } from "@/lib/utils";

function severityLabel(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "Mountain-wave / shear";
  if (severity === "shear") return "Shear elevated";
  return "Quiet";
}

function severityBadgeClass(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "bg-rose-300 text-[#10211c]";
  if (severity === "shear") return "bg-amber-300 text-[#10211c]";
  return "bg-white/12 text-[#f3efe4]";
}

export function WaveRiskStrip({
  risk,
  showSkyHint = true,
}: {
  risk: WaveRiskBundle;
  showSkyHint?: boolean;
}) {
  if (risk.error && risk.cells.length === 0) {
    return (
      <Panel className="border-amber-300/25 bg-amber-400/10">
        <SectionKicker>
          <TriangleAlert className="size-3.5" /> Mountain-wave / shear
        </SectionKicker>
        <p className="mt-3 text-sm text-[#f3efe4]">
          Regional wave / shear unavailable
          {risk.error ? `: ${risk.error}` : ""}
        </p>
      </Panel>
    );
  }

  const localWorst = risk.localWorstSeverity ?? risk.worstSeverity;
  const localFlagged = risk.localFlaggedCellCount ?? risk.flaggedCellCount;
  const localCells = risk.cells.filter((c) => c.scope === "local");
  const localOk = localCells.filter((c) => c.data === "ok");
  const elevated = localWorst !== "quiet";
  const lipbShear =
    risk.lipb?.shearKtPer1000ft != null
      ? `${Math.round(risk.lipb.shearKtPer1000ft)} kt/1000 ft`
      : null;
  const hourHm = risk.hourIso ? formatLocalHm(new Date(risk.hourIso)) : null;
  const localCrest = risk.localCrestStrong ?? risk.crestStrong;

  return (
    <Panel
      className={cn(
        elevated && "border-amber-300/25 bg-amber-400/[0.07]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SectionKicker>
          <Mountain className="size-3.5" /> Mountain-wave / shear
        </SectionKicker>
        <Badge className={severityBadgeClass(localWorst)}>
          {severityLabel(localWorst)}
        </Badge>
        {localCrest ? (
          <Badge className="bg-white/12 text-[#f3efe4]">Crest strong</Badge>
        ) : null}
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          ≤ {SOUNDING_MAX_ALT_M} m · Tyrol grid + crest · inferred
          {hourHm ? ` · ${hourHm}` : ""}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#d7d2c4]/55">
        Dense Open-Meteo grid around LIPB for mountain-wave and wind-shear
        clues — not observed turbulence and not a CAT product.{" "}
        {localFlagged > 0
          ? `${localFlagged} of ${localOk.length || localCells.length || risk.cells.length} local cells elevated`
          : `All ${localOk.length || localCells.length || risk.cells.length} local cells quiet`}
        {lipbShear ? ` · LIPB shear ${lipbShear}` : ""}
        {showSkyHint ? ". See Sky for the Alps map." : "."}
      </p>
      {risk.lipbHazards.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {risk.lipbHazards
            .filter((h) => h.kind === "shear" || h.kind === "wave" || h.kind === "wind")
            .map((hazard) => (
              <li key={`${hazard.kind}-${hazard.label}`}>
                <Badge
                  className={
                    hazard.kind === "wave"
                      ? "bg-rose-300 text-[#10211c]"
                      : "bg-amber-300 text-[#10211c]"
                  }
                  title={hazard.detail}
                >
                  {hazard.label}
                </Badge>
              </li>
            ))}
        </ul>
      ) : null}
    </Panel>
  );
}
