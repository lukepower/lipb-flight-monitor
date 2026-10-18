import { Mountain, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import { ALPINE_STATIONS } from "@/lib/alpine-wind";
import { LIPB, SOUNDING_MAX_ALT_M, WAVE_RISK_GRID } from "@/lib/constants";
import {
  type WaveRiskBundle,
  type WaveRiskCell,
  type WaveRiskSeverity,
} from "@/lib/wave-risk";
import {
  WAVE_MAP,
  WAVE_MAP_ATTRIBUTION,
  WAVE_MAP_H,
  WAVE_MAP_W,
  projectWaveLonLat,
  waveFeaturesByLayer,
  waveLinePath,
  type WaveMapFeature,
  type WaveMapLayer,
} from "@/lib/wave-map";
import { formatLocalHm } from "@/lib/time";
import { cn } from "@/lib/utils";

function cellFill(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "oklch(0.72 0.14 25 / 0.42)";
  if (severity === "shear") return "oklch(0.82 0.14 85 / 0.34)";
  return "oklch(0.55 0.04 160 / 0.10)";
}

function cellStroke(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "oklch(0.78 0.16 25 / 0.85)";
  if (severity === "shear") return "oklch(0.86 0.14 85 / 0.8)";
  return "oklch(0.7 0.03 160 / 0.22)";
}

function severityLabel(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "Mountain-wave / shear";
  if (severity === "shear") return "Shear elevated";
  return "Quiet";
}

function cellSize(): { w: number; h: number } {
  const innerW = WAVE_MAP_W - 44;
  const innerH = WAVE_MAP_H - 44;
  return {
    w: (innerW / Math.max(WAVE_RISK_GRID.cols - 1, 1)) * 0.7,
    h: (innerH / Math.max(WAVE_RISK_GRID.rows - 1, 1)) * 0.7,
  };
}

function CellRect({ cell }: { cell: WaveRiskCell }) {
  const { x, y } = projectWaveLonLat(cell.lon, cell.lat);
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

function LineLayer({
  layer,
  stroke,
  strokeWidth,
  strokeDasharray,
  opacity = 1,
}: {
  layer: WaveMapLayer;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  opacity?: number;
}) {
  return (
    <>
      {waveFeaturesByLayer(WAVE_MAP, layer).map((f, i) => {
        if (f.geometry.type !== "LineString") return null;
        return (
          <path
            key={`${layer}-${i}`}
            d={waveLinePath(f.geometry.coordinates)}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={opacity}
          />
        );
      })}
    </>
  );
}

function PlaceLabels() {
  return (
    <>
      {waveFeaturesByLayer(WAVE_MAP, "label").map((f, i) => {
        if (f.geometry.type !== "Point") return null;
        const [lon, lat] = f.geometry.coordinates;
        const { x, y } = projectWaveLonLat(lon, lat);
        return (
          <PlaceLabel key={`label-${i}`} feature={f} x={x} y={y} />
        );
      })}
    </>
  );
}

function PlaceLabel({
  feature,
  x,
  y,
}: {
  feature: WaveMapFeature;
  x: number;
  y: number;
}) {
  const name = feature.properties.name ?? "";
  const kind = feature.properties.kind;
  const isCountry = kind === "country";
  const isPass = kind === "pass";
  return (
    <text
      x={x + (isCountry ? 0 : 6)}
      y={y + (isCountry ? 0 : 3)}
      textAnchor={isCountry ? "middle" : "start"}
      className={isCountry ? "fill-[#d7d2c4]/35" : "fill-[#f3efe4]/70"}
      style={{
        fontSize: isCountry ? 18 : isPass ? 9 : 10,
        fontFamily: "ui-monospace, monospace",
        fontWeight: isCountry ? 600 : 500,
        letterSpacing: isCountry ? "0.12em" : undefined,
      }}
    >
      {name}
    </text>
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

  const lipb = projectWaveLonLat(LIPB.lon, LIPB.lat);
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
          viewBox={`0 0 ${WAVE_MAP_W} ${WAVE_MAP_H}`}
          className="mx-auto h-auto w-full max-w-lg"
          role="img"
          aria-label="Regional mountain-wave and shear risk grid around LIPB with geographic outline"
        >
          <rect
            x={0}
            y={0}
            width={WAVE_MAP_W}
            height={WAVE_MAP_H}
            rx={16}
            fill="oklch(0.18 0.02 160 / 0.55)"
          />

          {/* Geographic underlay */}
          <LineLayer
            layer="ridge"
            stroke="oklch(0.55 0.03 160)"
            strokeWidth={1.2}
            strokeDasharray="3 5"
            opacity={0.55}
          />
          <LineLayer
            layer="river"
            stroke="oklch(0.62 0.06 220)"
            strokeWidth={1.4}
            opacity={0.45}
          />
          <LineLayer
            layer="corridor"
            stroke="oklch(0.78 0.04 95)"
            strokeWidth={2.2}
            opacity={0.55}
          />
          <LineLayer
            layer="border"
            stroke="oklch(0.82 0.02 95)"
            strokeWidth={1.6}
            strokeDasharray="6 4"
            opacity={0.7}
          />
          <PlaceLabels />

          {/* Risk cells over geography */}
          {risk.cells.map((cell) => (
            <CellRect key={cell.id} cell={cell} />
          ))}

          {ALPINE_STATIONS.map((station) => {
            const p = projectWaveLonLat(station.lon, station.lat);
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
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-3 border-t border-dashed border-[#d7d2c4]/70"
          />
          IT / AT border
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 bg-[#d7d2c4]/55" />
          Valle Adige / Brenner
        </span>
      </div>
      <p className="mt-2 text-[10px] text-[#d7d2c4]/40">{WAVE_MAP_ATTRIBUTION}</p>
    </Panel>
  );
}
