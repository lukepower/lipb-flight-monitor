"use client";

import { useState } from "react";
import { ChevronDown, Mountain, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import {
  formatFoehnSlotCompact,
  isPhysicsDetailChip,
  type TurbulenceVerdict,
  type TurbulenceVerdictLevel,
  type VerdictReasonChip,
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

function chipBadgeClass(chip: VerdictReasonChip): string {
  if (chip.kind === "sigmet") return "bg-rose-300/90 text-[#10211c]";
  if (chip.kind === "foehn") return "bg-amber-300/90 text-[#10211c]";
  if (chip.kind === "omega") return "bg-white/12 text-[#f3efe4]";
  return "bg-white/12 text-[#f3efe4]";
}

function ChipList({
  chips,
  emphasize,
}: {
  chips: VerdictReasonChip[];
  emphasize?: boolean;
}) {
  if (chips.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <li key={chip.id}>
          <Badge
            className={
              emphasize ? chipBadgeClass(chip) : "bg-white/12 text-[#f3efe4]"
            }
            title={chip.detail}
          >
            {chip.label}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function PhysicsDetails({ chips }: { chips: VerdictReasonChip[] }) {
  const [open, setOpen] = useState(false);
  if (chips.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] font-medium tracking-wide text-emerald-200/70 uppercase hover:text-emerald-100"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Physics
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li key={chip.id}>
              <Badge className="bg-white/10 text-[#f3efe4]" title={chip.detail}>
                {chip.label}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TimelineSlots({ verdict }: { verdict: TurbulenceVerdict }) {
  const [openIso, setOpenIso] = useState<string | null>(null);

  return (
    <div className="mt-4">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-emerald-200/60 uppercase">
        {verdict.nextHours.spanLabel ??
          `Next ${verdict.nextHours.hours} h`}
      </p>
      <ol className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-12">
        {verdict.timeline.map((slot) => {
          const hm = formatLocalHm(new Date(slot.atIso));
          const src = foehnSrcTag(slot.foehnSource);
          const quiet = slot.level === "none";
          // Quiet slots: just the Δp number. Elevated: full reason line.
          let reasonShort: string | null = null;
          if (quiet) {
            if (slot.foehnLabel) {
              const m = slot.foehnLabel.match(/^([NS])-?Föhn\s+([\d.]+)/);
              const below = slot.foehnLabel.match(/^([NS])\s+([\d.]+)/);
              if (m) reasonShort = `${m[1]} ${m[2]}`;
              else if (below) reasonShort = `${below[1]} ${below[2]}`;
              else if (/Δp\s*~?0/i.test(slot.foehnLabel)) reasonShort = "0";
              else reasonShort = formatFoehnSlotCompact(0);
            }
          } else {
            reasonShort =
              slot.reasons[0] ?? slot.foehnLabel ?? slot.label;
          }
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
                {reasonShort ? (
                  <span className="line-clamp-2 text-[9px] leading-tight text-[#d7d2c4]/55 md:line-clamp-3">
                    {reasonShort}
                  </span>
                ) : null}
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

function splitChips(chips: VerdictReasonChip[]) {
  const primary = chips.filter((c) => !isPhysicsDetailChip(c));
  const physics = chips.filter((c) => isPhysicsDetailChip(c));
  return { primary, physics };
}

/** Full Sky verdict card with reason chips + 12 h timeline. */
export function TurbulenceVerdictCard({
  verdict,
}: {
  verdict: TurbulenceVerdict;
}) {
  const { primary, physics } = splitChips(verdict.now.chips);
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
        <Badge className={levelBadgeClass(verdict.nextHours.level)}>
          Next {verdict.nextHours.hours} h · {verdict.nextHours.label}
        </Badge>
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          ≤ 3500 m VFR · wave ≤ ~FL{WAVE_DETECTION_TOP_FL} ({WAVE_DETECTION_TOP_HPA}{" "}
          hPa) · inferred
        </span>
      </div>

      <ChipList chips={primary} emphasize />
      <PhysicsDetails chips={physics} />

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
  const { primary, physics } = splitChips(verdict.now.chips);
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
        <Badge className={levelBadgeClass(verdict.nextHours.level)}>
          Next {verdict.nextHours.hours} h · {verdict.nextHours.label}
        </Badge>
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          ≤ 3500 m · ~FL{WAVE_DETECTION_TOP_FL} · inferred
        </span>
      </div>
      <ChipList chips={primary.slice(0, 6)} />
      <PhysicsDetails chips={physics} />

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
