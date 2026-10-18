"use client";

import { useState } from "react";
import { Mountain, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import {
  type TurbulenceVerdict,
  type TurbulenceVerdictLevel,
  WAVE_DETECTION_TOP_FL,
  WAVE_DETECTION_TOP_HPA,
} from "@/lib/turbulence-verdict-shared";
import type { WaveRiskBundle } from "@/lib/wave-risk";
import { SOUNDING_MAX_ALT_M, WAVE_RISK_GRID } from "@/lib/constants";
import { formatLocalHm } from "@/lib/time";
import { cn } from "@/lib/utils";

function levelBadgeClass(level: TurbulenceVerdictLevel): string {
  if (level === "wave") return "bg-rose-300 text-[#10211c]";
  if (level === "possible") return "bg-amber-300 text-[#10211c]";
  return "bg-white/12 text-[#f3efe4]";
}

function slotBarClass(level: TurbulenceVerdictLevel): string {
  if (level === "wave") return "bg-rose-400/85";
  if (level === "possible") return "bg-amber-400/75";
  return "bg-white/15";
}

function foehnSrcTag(src: "observed" | "forecast" | "none"): string | null {
  if (src === "observed") return "obs";
  if (src === "forecast") return "fcst";
  return null;
}

function TimelineSlots({ verdict }: { verdict: TurbulenceVerdict }) {
  const [openIso, setOpenIso] = useState<string | null>(null);

  return (
    <div className="mt-4">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-emerald-200/60 uppercase">
        Next {verdict.nextHours.hours} h
      </p>
      <ol className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-12">
        {verdict.timeline.map((slot) => {
          const hm = formatLocalHm(new Date(slot.atIso));
          const src = foehnSrcTag(slot.foehnSource);
          const reasonShort =
            slot.reasons[0] ??
            (slot.level === "none" ? "quiet" : slot.label);
          const expanded = openIso === slot.atIso;
          const tip = [
            slot.label,
            slot.foehnLabel
              ? `${slot.foehnLabel} (${slot.foehnSource}${slot.foehnBiasCorrected ? ", bias-corrected" : ""})`
              : null,
            slot.reasons.join(" · ") || null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={slot.atIso} className="flex min-w-0 flex-col gap-0.5">
              <button
                type="button"
                className="flex flex-col gap-0.5 text-left"
                title={tip}
                aria-expanded={expanded}
                onClick={() =>
                  setOpenIso((cur) => (cur === slot.atIso ? null : slot.atIso))
                }
              >
                <div
                  className={cn("h-8 w-full rounded-sm", slotBarClass(slot.level))}
                />
                <span className="font-mono text-[10px] text-[#d7d2c4]/70">
                  {hm}
                </span>
                {src ? (
                  <span className="text-[9px] uppercase tracking-wide text-[#d7d2c4]/45">
                    {src}
                  </span>
                ) : (
                  <span className="text-[9px] text-transparent">—</span>
                )}
                <span className="line-clamp-2 text-[9px] leading-tight text-[#d7d2c4]/55 md:line-clamp-3">
                  {reasonShort}
                </span>
              </button>
              {expanded ? (
                <p className="mt-0.5 text-[10px] leading-snug text-amber-100/75 md:hidden">
                  {tip}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] leading-relaxed text-[#d7d2c4]/45">
        Timeline Δp: <span className="text-[#d7d2c4]/70">obs</span> = METAR
        LOWI−LIPB (≤ 90 min) · <span className="text-[#d7d2c4]/70">fcst</span>{" "}
        = model pressure_msl Innsbruck−Bozen (bias-corrected when obs fresh).
        Tap a slot for detail. Not observed turbulence.
      </p>
    </div>
  );
}

function WaveGridFooter({ risk }: { risk: WaveRiskBundle }) {
  const localCells = risk.cells.filter((c) => c.scope === "local");
  const localOk = localCells.filter((c) => c.data === "ok");
  const localFlagged =
    risk.localFlaggedCellCount ?? risk.flaggedCellCount;
  const localTotal =
    WAVE_RISK_GRID.cols * WAVE_RISK_GRID.rows || localCells.length;
  const localInsufficient = localCells.filter((c) => c.data === "insufficient");
  const lipbShear =
    risk.lipb?.shearKtPer1000ft != null
      ? `${Math.round(risk.lipb.shearKtPer1000ft)} kt/1000 ft`
      : null;
  const hourHm = risk.hourIso
    ? formatLocalHm(new Date(risk.hourIso))
    : null;

  return (
    <p className="mt-3 text-xs leading-relaxed text-[#d7d2c4]/55">
      Tyrol grid ≤ {SOUNDING_MAX_ALT_M} m
      {hourHm ? ` · ${hourHm}` : ""}
      {localInsufficient.length > 0
        ? ` · ${localOk.length}/${localTotal} cells evaluated`
        : ""}
      {localFlagged > 0
        ? ` · ${localFlagged} local cells elevated`
        : ` · all local cells quiet`}
      {lipbShear ? ` · LIPB shear ${lipbShear}` : ""}. See Sky for the Alps map.
    </p>
  );
}

/** Full Sky verdict card with reason chips + 12 h timeline. */
export function TurbulenceVerdictCard({
  verdict,
}: {
  verdict: TurbulenceVerdict;
}) {
  return (
    <Panel
      className={cn(
        verdict.now.level !== "none" && "border-amber-300/25 bg-amber-400/[0.07]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SectionKicker>
          <Mountain className="size-3.5" /> LIPB turbulence
        </SectionKicker>
        <Badge className={levelBadgeClass(verdict.now.level)}>
          {verdict.now.label}
        </Badge>
        {verdict.nextHours.level !== verdict.now.level ? (
          <Badge className={levelBadgeClass(verdict.nextHours.level)}>
            Next {verdict.nextHours.hours} h · {verdict.nextHours.label}
          </Badge>
        ) : null}
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          ≤ 3500 m VFR · wave ≤ ~FL{WAVE_DETECTION_TOP_FL} ({WAVE_DETECTION_TOP_HPA}{" "}
          hPa) · inferred
        </span>
      </div>

      {verdict.now.chips.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {verdict.now.chips.map((chip) => (
            <li key={chip.id}>
              <Badge
                className={
                  chip.kind === "sigmet"
                    ? "bg-rose-300/90 text-[#10211c]"
                    : chip.kind === "foehn"
                      ? "bg-amber-300/90 text-[#10211c]"
                      : "bg-white/12 text-[#f3efe4]"
                }
                title={chip.detail}
              >
                {chip.label}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {verdict.foehnTrend.gap ? (
        <p className="mt-2 text-xs text-amber-100/70">
          {verdict.foehnTrend.label} — {verdict.foehnTrend.detail}
        </p>
      ) : verdict.foehnObserved ? (
        <p className="mt-2 text-xs text-[#d7d2c4]/55">
          Föhn {verdict.foehnTrend.label}
          {verdict.foehnBiasOffsetHpa != null
            ? ` · forecast bias ${verdict.foehnBiasOffsetHpa > 0 ? "+" : ""}${verdict.foehnBiasOffsetHpa.toFixed(1)} hPa`
            : ""}
        </p>
      ) : null}

      <TimelineSlots verdict={verdict} />
    </Panel>
  );
}

/**
 * Merged Today hangar strip: shared verdict + optional Tyrol grid footer
 * (replaces the separate Mountain-wave / shear card).
 */
export function TurbulenceVerdictStrip({
  verdict,
  risk,
  showSkyHint = true,
}: {
  verdict: TurbulenceVerdict;
  risk?: WaveRiskBundle;
  showSkyHint?: boolean;
}) {
  const elevated = verdict.now.level !== "none";
  return (
    <Panel
      className={cn(elevated && "border-amber-300/25 bg-amber-400/[0.07]")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SectionKicker>
          {elevated ? (
            <TriangleAlert className="size-3.5" />
          ) : (
            <Mountain className="size-3.5" />
          )}{" "}
          Turbulence / mountain wave
        </SectionKicker>
        <Badge className={levelBadgeClass(verdict.now.level)}>
          {verdict.now.label}
        </Badge>
        {verdict.nextHours.level !== "none" &&
        verdict.nextHours.level !== verdict.now.level ? (
          <Badge className={levelBadgeClass(verdict.nextHours.level)}>
            Next {verdict.nextHours.hours} h · {verdict.nextHours.label}
          </Badge>
        ) : null}
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          ≤ 3500 m · ~FL{WAVE_DETECTION_TOP_FL} · inferred
        </span>
      </div>
      {verdict.now.chips.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {verdict.now.chips.slice(0, 6).map((chip) => (
            <li key={chip.id}>
              <Badge
                className="bg-white/12 text-[#f3efe4]"
                title={chip.detail}
              >
                {chip.label}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      <TimelineSlots verdict={verdict} />

      {risk ? <WaveGridFooter risk={risk} /> : null}
      {!risk && showSkyHint ? (
        <p className="mt-2 text-xs leading-relaxed text-[#d7d2c4]/55">
          Shared LIPB verdict from shear, crest, Föhn, and near-field
          SIGMET — not observed turbulence. See Sky for the Alps map.
        </p>
      ) : null}
    </Panel>
  );
}
