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
  buildWaveBasemap,
  projectWaveLonLat,
  WAVE_MAP_ATTRIBUTION,
  WAVE_TILE_PX,
  type WaveBasemap,
} from "@/lib/wave-map";
import { formatLocalHm } from "@/lib/time";
import { cn } from "@/lib/utils";

function cellFill(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "oklch(0.72 0.14 25 / 0.55)";
  if (severity === "shear") return "oklch(0.82 0.14 85 / 0.48)";
  return "oklch(0.55 0.04 160 / 0.14)";
}

function cellStroke(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "oklch(0.78 0.16 25 / 0.95)";
  if (severity === "shear") return "oklch(0.86 0.14 85 / 0.9)";
  return "oklch(0.95 0.02 95 / 0.35)";
}

function severityLabel(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "Mountain-wave / shear";
  if (severity === "shear") return "Shear elevated";
  return "Quiet";
}

function cellSize(
  scope: WaveRiskCell["scope"],
  basemap: WaveBasemap,
): { w: number; h: number } {
  const innerW = basemap.width;
  const innerH = basemap.height;
  if (scope === "local") {
    return {
      w: (innerW / Math.max(WAVE_RISK_GRID.cols - 1, 1)) * 0.2,
      h: (innerH / Math.max(WAVE_RISK_GRID.rows - 1, 1)) * 0.2,
    };
  }
  return {
    w: (innerW / 6) * 0.5,
    h: (innerH / 5) * 0.5,
  };
}

function CellRect({
  cell,
  basemap,
}: {
  cell: WaveRiskCell;
  basemap: WaveBasemap;
}) {
  const { x, y } = projectWaveLonLat(cell.lon, cell.lat, basemap);
  const { w, h } = cellSize(cell.scope, basemap);
  const insufficient = cell.data === "insufficient";
  const title = [
    cell.isLipb ? "LIPB" : cell.id,
    insufficient ? "insufficient data" : severityLabel(cell.severity),
    cell.shearKtPer1000ft != null
      ? `shear ${Math.round(cell.shearKtPer1000ft)} kt/1000 ft`
      : null,
    cell.midWindKt != null ? `mid ${cell.midWindKt} kt` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <g>
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={4}
        fill={
          insufficient ? "oklch(0.45 0.02 160 / 0.2)" : cellFill(cell.severity)
        }
        stroke={
          insufficient ? "oklch(0.85 0.02 95 / 0.55)" : cellStroke(cell.severity)
        }
        strokeWidth={cell.isLipb ? 2.2 : 1.1}
        strokeDasharray={insufficient ? "3 2" : undefined}
      >
        <title>{title}</title>
      </rect>
      {insufficient ? (
        <line
          x1={x - w / 2 + 2}
          y1={y + h / 2 - 2}
          x2={x + w / 2 - 2}
          y2={y - h / 2 + 2}
          stroke="oklch(0.85 0.02 95 / 0.4)"
          strokeWidth={1}
        />
      ) : null}
    </g>
  );
}

function ageLabel(iso: string | null, now = new Date()): string | null {
  if (!iso) return null;
  const ageMin = Math.max(
    0,
    Math.round((now.getTime() - new Date(iso).getTime()) / 60_000),
  );
  if (ageMin < 2) return "just now";
  if (ageMin < 60) return `${ageMin} min ago`;
  const h = Math.round(ageMin / 60);
  return `${h} h ago`;
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

  const basemap = buildWaveBasemap();
  const lipb = projectWaveLonLat(LIPB.lon, LIPB.lat, basemap);
  const hourHm = risk.hourIso ? formatLocalHm(new Date(risk.hourIso)) : null;
  const elevated = risk.worstSeverity !== "quiet";
  const localAge = ageLabel(risk.localFetchedAt);
  const alpsAge = ageLabel(risk.alpsFetchedAt);
  const okCells = risk.cells.filter((c) => c.data === "ok").length;
  const insuff = risk.cells.filter((c) => c.data === "insufficient").length;

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
        <Badge className="bg-white/10 text-[#f3efe4]">
          near LIPB · {severityLabel(risk.localWorstSeverity)}
        </Badge>
        {risk.partial ? (
          <Badge className="bg-amber-300/80 text-[#10211c]">Partial</Badge>
        ) : null}
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          ≤ {SOUNDING_MAX_ALT_M} m · {risk.flaggedCellCount}/{okCells} cells
          {insuff > 0 ? ` · ${insuff} thin` : ""}
          {hourHm ? ` · ${hourHm}` : ""}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[#d7d2c4]/55">
        Inferred mountain-wave and wind-shear over the Alps around LIPB —
        dense Tyrol Open-Meteo grid plus coarse Alps cells and alpine crest
        winds. Not observed turbulence.
      </p>
      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${basemap.width} ${basemap.height}`}
          className="mx-auto h-auto w-full max-w-2xl rounded-2xl"
          role="img"
          aria-label="Alps mountain-wave and shear risk grid on topographic basemap"
        >
          <defs>
            <clipPath id="wave-basemap-clip">
              <rect
                width={basemap.width}
                height={basemap.height}
                rx={16}
                ry={16}
              />
            </clipPath>
          </defs>
          <g clipPath="url(#wave-basemap-clip)">
            {basemap.tiles.map((tile) => (
              <image
                key={`${tile.z}-${tile.x}-${tile.y}`}
                href={tile.url}
                x={tile.px}
                y={tile.py}
                width={WAVE_TILE_PX}
                height={WAVE_TILE_PX}
                preserveAspectRatio="none"
              />
            ))}
            {/* Darken topo slightly so risk colours stay readable */}
            <rect
              width={basemap.width}
              height={basemap.height}
              fill="oklch(0.12 0.02 160 / 0.28)"
            />

            {risk.cells
              .filter((c) => c.scope === "alps")
              .map((cell) => (
                <CellRect key={cell.id} cell={cell} basemap={basemap} />
              ))}
            {risk.cells
              .filter((c) => c.scope === "local")
              .map((cell) => (
                <CellRect key={cell.id} cell={cell} basemap={basemap} />
              ))}

            {ALPINE_STATIONS.map((station) => {
              const p = projectWaveLonLat(station.lon, station.lat, basemap);
              return (
                <circle
                  key={station.id}
                  cx={p.x}
                  cy={p.y}
                  r={2.8}
                  fill="oklch(0.96 0.02 95)"
                  stroke="oklch(0.2 0.02 160)"
                  strokeWidth={1}
                >
                  <title>{`${station.name} · ${station.elevM} m`}</title>
                </circle>
              );
            })}
            <circle
              cx={lipb.x}
              cy={lipb.y}
              r={5.5}
              fill="oklch(0.86 0.14 155)"
              stroke="oklch(0.15 0.03 160)"
              strokeWidth={1.6}
            >
              <title>LIPB</title>
            </circle>
            <text
              x={lipb.x + 9}
              y={lipb.y + 4}
              className="fill-[#f6f1e6]"
              style={{
                fontSize: 12,
                fontFamily: "ui-monospace, monospace",
                fontWeight: 600,
                paintOrder: "stroke",
                stroke: "oklch(0.15 0.02 160 / 0.75)",
                strokeWidth: 3,
              }}
            >
              LIPB
            </text>
          </g>
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
          <span className="inline-block size-2.5 rounded-sm border border-dashed border-[#d7d2c4]/50 bg-white/5" />
          Insufficient data
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-[#f3efe4]" />
          Crest station
        </span>
      </div>
      <p className="mt-2 text-[10px] text-[#d7d2c4]/40">
        {WAVE_MAP_ATTRIBUTION}
        {localAge ? ` · local grid ${localAge}` : ""}
        {alpsAge ? ` · Alps grid ${alpsAge}` : ""}
        {risk.partial ? " · serving partial / stale batches" : ""}
      </p>
    </Panel>
  );
}
