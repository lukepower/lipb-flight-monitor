import { Mountain, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import { ALPINE_STATIONS } from "@/lib/alpine-wind";
import {
  LIPB,
  SOUNDING_MAX_ALT_M,
  WAVE_RISK_BBOX,
  WAVE_RISK_GRID,
} from "@/lib/constants";
import {
  type WaveRiskBundle,
  type WaveRiskCell,
  type WaveRiskSeverity,
} from "@/lib/wave-risk";
import { formatLocalHm } from "@/lib/time";
import { cn } from "@/lib/utils";

const MAP_W = 560;
const MAP_H = 420;
const PAD = 18;

function project(lon: number, lat: number): { x: number; y: number } {
  const { lamin, lamax, lomin, lomax } = WAVE_RISK_BBOX;
  const x = PAD + ((lon - lomin) / (lomax - lomin)) * (MAP_W - PAD * 2);
  const y = PAD + ((lamax - lat) / (lamax - lamin)) * (MAP_H - PAD * 2);
  return { x, y };
}

function cellFill(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "oklch(0.72 0.14 25 / 0.55)";
  if (severity === "shear") return "oklch(0.82 0.14 85 / 0.45)";
  return "oklch(0.55 0.04 160 / 0.18)";
}

function cellStroke(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "oklch(0.78 0.16 25)";
  if (severity === "shear") return "oklch(0.86 0.14 85)";
  return "oklch(0.7 0.03 160 / 0.35)";
}

function severityLabel(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "Mountain-wave / shear";
  if (severity === "shear") return "Shear elevated";
  return "Quiet";
}

function cellSize(): { w: number; h: number } {
  const innerW = MAP_W - PAD * 2;
  const innerH = MAP_H - PAD * 2;
  return {
    w: innerW / Math.max(WAVE_RISK_GRID.cols - 1, 1) * 0.72,
    h: innerH / Math.max(WAVE_RISK_GRID.rows - 1, 1) * 0.72,
  };
}

function CellRect({ cell }: { cell: WaveRiskCell }) {
  const { x, y } = project(cell.lon, cell.lat);
  const { w, h } = cellSize();
  const title = [
    cell.isLipb ? "LIPB" : cell.id,
    severityLabel(cell.severity),
    cell.shearKtPer1000ft != null
      ? `shear ${Math.round(cell.shearKtPer1000ft)} kt/1000 ft`
      : null,
    cell.midWindKt != null ? `mid ${cell.midWindKt} kt` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <rect
      x={x - w / 2}
      y={y - h / 2}
      width={w}
      height={h}
      rx={6}
      fill={cellFill(cell.severity)}
      stroke={cellStroke(cell.severity)}
      strokeWidth={cell.isLipb ? 2.2 : 1}
    >
      <title>{title}</title>
    </rect>
  );
}

export function WaveRiskMap({ risk }: { risk: WaveRiskBundle }) {
  if (risk.error && risk.cells.length === 0) {
    return (
      <Panel className="border-amber-300/25 bg-amber-400/10">
        <SectionKicker>
          <TriangleAlert className="size-3.5" /> Regional wave / shear
        </SectionKicker>
        <p className="mt-3 text-sm text-[#f3efe4]">
          Map unavailable{risk.error ? `: ${risk.error}` : ""}
        </p>
      </Panel>
    );
  }

  const lipb = project(LIPB.lon, LIPB.lat);
  const hourHm = risk.hourIso ? formatLocalHm(new Date(risk.hourIso)) : null;
  const elevated = risk.worstSeverity !== "quiet";

  return (
    <Panel className={cn(elevated && "border-amber-300/25 bg-amber-400/[0.05]")}>
      <div className="flex flex-wrap items-center gap-2">
        <SectionKicker>
          <Mountain className="size-3.5" /> Regional wave / shear
        </SectionKicker>
        <Badge
          className={
            risk.worstSeverity === "wave"
              ? "bg-rose-300 text-[#10211c]"
              : risk.worstSeverity === "shear"
                ? "bg-amber-300 text-[#10211c]"
                : "bg-white/12 text-[#f3efe4]"
          }
        >
          {severityLabel(risk.worstSeverity)}
        </Badge>
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          ≤ {SOUNDING_MAX_ALT_M} m · {risk.flaggedCellCount}/{risk.cells.length}{" "}
          cells
          {hourHm ? ` · ${hourHm}` : ""}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#d7d2c4]/55">
        Inferred mountain-wave and wind-shear over a wide area around LIPB —
        Open-Meteo grid plus alpine crest winds. Not observed turbulence.
      </p>
      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className="mx-auto h-auto w-full max-w-xl"
          role="img"
          aria-label="Regional mountain-wave and shear risk grid around LIPB"
        >
          <rect
            x={0}
            y={0}
            width={MAP_W}
            height={MAP_H}
            rx={16}
            fill="oklch(0.18 0.02 160 / 0.55)"
          />
          {risk.cells.map((cell) => (
            <CellRect key={cell.id} cell={cell} />
          ))}
          {ALPINE_STATIONS.map((station) => {
            const p = project(station.lon, station.lat);
            return (
              <circle
                key={station.id}
                cx={p.x}
                cy={p.y}
                r={3.2}
                fill="oklch(0.92 0.02 95)"
                stroke="oklch(0.25 0.02 160)"
                strokeWidth={1}
              >
                <title>{`${station.name} · ${station.elevM} m`}</title>
              </circle>
            );
          })}
          <circle
            cx={lipb.x}
            cy={lipb.y}
            r={5}
            fill="oklch(0.86 0.14 155)"
            stroke="oklch(0.2 0.03 160)"
            strokeWidth={1.5}
          >
            <title>LIPB</title>
          </circle>
          <text
            x={lipb.x + 8}
            y={lipb.y + 4}
            className="fill-[#f6f1e6]"
            style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}
          >
            LIPB
          </text>
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[#d7d2c4]/55">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-sm"
            style={{ background: cellFill("quiet") }}
          />
          Quiet
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-sm"
            style={{ background: cellFill("shear") }}
          />
          Shear
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-sm"
            style={{ background: cellFill("wave") }}
          />
          Mountain-wave
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-[#f3efe4]" />
          Crest station
        </span>
      </div>
    </Panel>
  );
}
