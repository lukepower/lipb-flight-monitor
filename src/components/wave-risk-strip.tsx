import { Mountain, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import { SOUNDING_MAX_ALT_M, WAVE_RISK_GRID } from "@/lib/constants";
import {
  type WaveRiskBundle,
  type WaveRiskSeverity,
} from "@/lib/wave-risk";
import { formatLocalHm } from "@/lib/time";
import { cn } from "@/lib/utils";

function severityLabel(severity: WaveRiskSeverity): string {
  // Align wording with shared turbulence verdict (no "Smooth" / "Quiet").
  if (severity === "wave") return "Mountain wave & rotor likely";
  if (severity === "shear") return "Turbulence possible";
  return "No turbulence signal";
}

function severityBadgeClass(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "bg-rose-300 text-[#10211c]";
  if (severity === "shear") return "bg-amber-300 text-[#10211c]";
  return "bg-white/12 text-[#f3efe4]";
}

function formatCrestStation(s: {
  name: string;
  windKt: number | null;
  gustKt: number | null;
}): string {
  if (s.windKt === null) return s.name;
  if (s.gustKt !== null) return `${s.name} ${s.windKt}G${s.gustKt}`;
  return `${s.name} ${s.windKt}`;
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
  const localTotal =
    WAVE_RISK_GRID.cols * WAVE_RISK_GRID.rows || localCells.length;
  const localInsufficient = localCells.filter((c) => c.data === "insufficient");
  const elevated = localWorst !== "quiet";
  const lipbShear =
    risk.lipb?.shearKtPer1000ft != null
      ? `${Math.round(risk.lipb.shearKtPer1000ft)} kt/1000 ft`
      : null;
  const hourHm = risk.hourIso ? formatLocalHm(new Date(risk.hourIso)) : null;
  const localCrest = risk.localCrestStrong ?? risk.crestStrong;
  const crestStations = risk.localCrestStations ?? [];

  const crestReason =
    localCrest && crestStations.length > 0
      ? `Crest winds strong (${crestStations.map(formatCrestStation).join(", ")})${
          localWorst === "quiet" ? " · no shear signal" : ""
        }`
      : localCrest
        ? localWorst === "quiet"
          ? "Crest winds strong · no shear signal"
          : "Crest winds strong"
        : null;

  const evaluatedLine =
    localInsufficient.length > 0
      ? `${localOk.length}/${localTotal} cells evaluated`
      : null;

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
          <Badge className="bg-amber-300/90 text-[#10211c]">Crest strong</Badge>
        ) : null}
        {evaluatedLine ? (
          <Badge className="bg-white/10 text-[#f3efe4]">{evaluatedLine}</Badge>
        ) : null}
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          ≤ {SOUNDING_MAX_ALT_M} m · Tyrol grid + crest · inferred
          {hourHm ? ` · ${hourHm}` : ""}
        </span>
      </div>
      {crestReason ? (
        <p className="mt-2 text-xs leading-relaxed text-amber-100/75">
          {crestReason}
        </p>
      ) : null}
      <p
        className={cn(
          "text-xs leading-relaxed text-[#d7d2c4]/55",
          crestReason ? "mt-1.5" : "mt-2",
        )}
      >
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
