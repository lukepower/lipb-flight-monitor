import { Mountain, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import {
  ALPINE_WIND_STRONG_KT,
  type AlpineStationReading,
  type AlpineWindBundle,
} from "@/lib/alpine-wind";
import { LIPB, SOUNDING_MAX_ALT_M, WAVE_RISK_GRID } from "@/lib/constants";
import {
  localAtCrestIncomplete,
  stationIsStrong,
  type WaveRiskBundle,
  type WaveRiskCell,
  type WaveRiskSeverity,
} from "@/lib/wave-risk";
import {
  buildWaveBasemap,
  projectWaveLonLat,
  WAVE_MAP_ATTRIBUTION,
  type WaveBasemap,
} from "@/lib/wave-map";
import { formatLocalHm } from "@/lib/time";
import { cn } from "@/lib/utils";

function cellFill(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "oklch(0.72 0.14 25 / 0.72)";
  if (severity === "shear") return "oklch(0.82 0.14 85 / 0.65)";
  return "oklch(0.55 0.04 160 / 0.22)";
}

function cellStroke(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "oklch(0.78 0.16 25 / 0.95)";
  if (severity === "shear") return "oklch(0.86 0.14 85 / 0.95)";
  return "oklch(0.92 0.02 95 / 0.75)";
}

function severityLabel(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "Mountain-wave / shear";
  if (severity === "shear") return "Shear elevated";
  return "Quiet";
}

function localSeverityBadgeClass(severity: WaveRiskSeverity): string {
  if (severity === "wave") return "bg-rose-300 text-[#10211c]";
  if (severity === "shear") return "bg-amber-300 text-[#10211c]";
  return "bg-white/12 text-[#f3efe4]";
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

function CellMark({
  cell,
  basemap,
}: {
  cell: WaveRiskCell;
  basemap: WaveBasemap;
}) {
  const { x, y } = projectWaveLonLat(cell.lon, cell.lat, basemap);
  const { w, h } = cellSize(cell.scope, basemap);
  const insufficient = cell.data === "insufficient";
  const quietOk = !insufficient && cell.severity === "quiet";
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

  // Quiet cells: faint dot only — keep the map readable for flagged / thin columns.
  if (quietOk) {
    return (
      <circle
        cx={x}
        cy={y}
        r={cell.isLipb ? 2.2 : 1.4}
        fill="oklch(0.92 0.02 95 / 0.28)"
        stroke="oklch(0.95 0.02 95 / 0.35)"
        strokeWidth={cell.isLipb ? 1.2 : 0.6}
      >
        <title>{title}</title>
      </circle>
    );
  }

  const hatchId = `hatch-${cell.id}`;
  return (
    <g>
      {insufficient ? (
        <defs>
          <pattern
            id={hatchId}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={6} height={6} fill="oklch(0.28 0.02 160 / 0.55)" />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={6}
              stroke="oklch(0.88 0.02 95 / 0.7)"
              strokeWidth={2}
            />
          </pattern>
        </defs>
      ) : null}
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={4}
        fill={insufficient ? `url(#${hatchId})` : cellFill(cell.severity)}
        stroke={
          insufficient ? "oklch(0.88 0.02 95 / 0.85)" : cellStroke(cell.severity)
        }
        strokeWidth={cell.isLipb ? 2.4 : insufficient ? 1.4 : 1.5}
        strokeDasharray={insufficient ? "4 2.5" : undefined}
      >
        <title>{title}</title>
      </rect>
    </g>
  );
}

function crestTooltip(station: AlpineStationReading): string {
  const wind =
    station.windKt !== null
      ? station.gustKt !== null
        ? `${station.windKt}G${station.gustKt} kt`
        : `${station.windKt} kt`
      : station.error ?? "n/a";
  const age =
    station.ageMin !== null
      ? station.ageMin < 2
        ? "just now"
        : `${station.ageMin} min ago`
      : null;
  return [station.name, wind, age].filter(Boolean).join(" · ");
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

export function WaveRiskMap({
  risk,
  alpine,
}: {
  risk: WaveRiskBundle;
  alpine?: AlpineWindBundle | null;
}) {
  if (risk.error && risk.cells.length === 0) {
    return (
      <Panel className="border-amber-300/25 bg-amber-400/10">
        <SectionKicker>
          <Mountain className="size-3.5" /> Regional wave / shear
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
  const localElevated = risk.localWorstSeverity !== "quiet";
  const localAge = ageLabel(risk.localFetchedAt);
  const alpsAge = ageLabel(risk.alpsFetchedAt);
  const okCells = risk.cells.filter((c) => c.data === "ok").length;
  const insuff = risk.cells.filter((c) => c.data === "insufficient").length;
  const alpsWave = risk.alpsWaveCount ?? 0;
  const alpsShear = risk.alpsShearCount ?? 0;
  const stations = alpine?.stations ?? [];
  const atCrestIncomplete = alpine ? localAtCrestIncomplete(alpine) : false;

  const labelFontPx = Math.max(11, Math.round(12 * (720 / basemap.width)));

  return (
    <Panel
      className={cn(localElevated && "border-amber-300/25 bg-amber-400/[0.05]")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SectionKicker>
          <Mountain className="size-3.5" /> Regional wave / shear
        </SectionKicker>
        <Badge className={localSeverityBadgeClass(risk.localWorstSeverity)}>
          Near LIPB: {severityLabel(risk.localWorstSeverity)}
        </Badge>
        <Badge className="bg-white/10 text-[#f3efe4]">
          Alps: {alpsWave} wave · {alpsShear} shear
        </Badge>
        {atCrestIncomplete ? (
          <Badge className="bg-amber-300/90 text-[#10211c]">
            <TriangleAlert className="mr-1 inline size-3" aria-hidden />
            Crest data incomplete (AT)
          </Badge>
        ) : null}
        {risk.partial ? (
          <Badge className="bg-amber-300/80 text-[#10211c]">Partial</Badge>
        ) : null}
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          ≤ {SOUNDING_MAX_ALT_M} m · {risk.flaggedCellCount}/{okCells} cells
          {insuff > 0 ? ` · ${insuff} thin` : ""}
          {hourHm ? ` · ${hourHm}` : ""}
        </span>
      </div>
      {atCrestIncomplete ? (
        <p className="mt-2 text-xs leading-relaxed text-amber-100/80">
          Near-LIPB Austrian crest stations are missing or errored — local wave
          coupling may under-read until GeoSphere recovers.
        </p>
      ) : null}
      <p className="mt-2 text-xs leading-relaxed text-[#d7d2c4]/55">
        Inferred mountain-wave and wind-shear over the Alps around LIPB —
        dense Tyrol Open-Meteo grid plus coarse Alps cells and alpine crest
        winds. Not observed turbulence.
      </p>
      <div className="mt-4 w-full">
        <svg
          viewBox={`0 0 ${basemap.width} ${basemap.height}`}
          className="h-auto w-full rounded-2xl"
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
            <filter id="wave-basemap-mute">
              <feColorMatrix
                type="matrix"
                values="0.33 0.33 0.33 0 0
                        0.33 0.33 0.33 0 0
                        0.33 0.33 0.33 0 0
                        0 0 0 1 0"
              />
              <feComponentTransfer>
                <feFuncR type="linear" slope="0.45" intercept="0.02" />
                <feFuncG type="linear" slope="0.45" intercept="0.02" />
                <feFuncB type="linear" slope="0.45" intercept="0.02" />
              </feComponentTransfer>
            </filter>
          </defs>
          <g clipPath="url(#wave-basemap-clip)">
            {basemap.staticUrl ? (
              <image
                href={basemap.staticUrl}
                x={0}
                y={0}
                width={basemap.width}
                height={basemap.height}
                preserveAspectRatio="none"
                filter="url(#wave-basemap-mute)"
              />
            ) : null}
            <rect
              width={basemap.width}
              height={basemap.height}
              fill="oklch(0.12 0.02 160 / 0.35)"
            />

            {risk.cells
              .filter((c) => c.scope === "alps")
              .map((cell) => (
                <CellMark key={cell.id} cell={cell} basemap={basemap} />
              ))}
            {risk.cells
              .filter((c) => c.scope === "local")
              .map((cell) => (
                <CellMark key={cell.id} cell={cell} basemap={basemap} />
              ))}

            {stations.map((station) => {
              const p = projectWaveLonLat(station.lon, station.lat, basemap);
              const strong = stationIsStrong(station);
              return (
                <circle
                  key={station.id}
                  cx={p.x}
                  cy={p.y}
                  r={strong ? 3.4 : 2.8}
                  fill={
                    strong
                      ? "oklch(0.86 0.14 85)"
                      : "oklch(0.96 0.02 95)"
                  }
                  stroke="oklch(0.2 0.02 160)"
                  strokeWidth={1}
                >
                  <title>{crestTooltip(station)}</title>
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
                fontSize: labelFontPx,
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
          <span className="inline-block size-1.5 rounded-full bg-[#f3efe4]/35" />
          Quiet (dot)
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
          <span className="inline-block size-2.5 rounded-sm border border-dashed border-[#d7d2c4]/60 bg-[repeating-linear-gradient(-45deg,transparent,transparent_2px,#d7d2c4_2px,#d7d2c4_3px)] opacity-70" />
          Insufficient data
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full bg-[#f3efe4]" />
          Crest station
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2 rounded-full"
            style={{ background: "oklch(0.86 0.14 85)" }}
          />
          Strong crest (≥{ALPINE_WIND_STRONG_KT} kt)
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
