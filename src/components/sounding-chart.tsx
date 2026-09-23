import type { ReactNode } from "react";
import type { WindowView } from "@/lib/board";
import {
  DEFAULT_SKEW_T_VIEW,
  skewTPoint,
  windStripX,
  type SoundingHazard,
  type SoundingHour,
  type SoundingLevel,
  type SkewTView,
} from "@/lib/sounding";
import { Badge } from "@/components/ui/badge";

const ISOBARS = [1000, 925, 850, 700, 600, 500];
const ISOTHERMS = [-20, -10, 0, 10, 20, 30];
const WIND_KT_MAX = 60;
const WIND_STRIP_WIDTH = 96;

function polyline(
  levels: SoundingLevel[],
  pick: (level: SoundingLevel) => number | null,
  view: SkewTView,
): string {
  return levels
    .filter((level) => pick(level) !== null)
    .map((level) => {
      const { x, y } = skewTPoint(level.pHpa, pick(level) as number, view);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function WindBarb({
  x,
  y,
  dir,
  kt,
  muted = false,
}: {
  x: number;
  y: number;
  dir: number;
  kt: number;
  muted?: boolean;
}) {
  const stroke = muted ? "#d7d2c4" : "#f6f1e6";
  if (kt < 2) {
    return <circle cx={x} cy={y} r={2.2} fill="none" stroke={stroke} strokeWidth={1.1} />;
  }
  const pennants = Math.floor((kt + 2) / 50);
  let rest = Math.max(kt - pennants * 50, 0);
  const full = Math.floor((rest + 2) / 10);
  rest = Math.max(rest - full * 10, 0);
  const half = rest >= 3 ? 1 : 0;
  const staff = 18;
  const step = 3.4;
  const marks: ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < pennants; i += 1) {
    const yy = y - staff + cursor;
    marks.push(
      <polygon
        key={`p${i}`}
        points={`${x},${yy} ${x - 8},${yy + 2.2} ${x},${yy + 5}`}
        fill={stroke}
      />,
    );
    cursor += 6;
  }
  for (let i = 0; i < full; i += 1) {
    const yy = y - staff + cursor;
    marks.push(
      <line
        key={`f${i}`}
        x1={x}
        y1={yy}
        x2={x - 8}
        y2={yy + 3}
        stroke={stroke}
        strokeWidth={1.1}
      />,
    );
    cursor += step;
  }
  if (half) {
    const yy = y - staff + cursor;
    marks.push(
      <line
        key="h"
        x1={x}
        y1={yy}
        x2={x - 4}
        y2={yy + 1.6}
        stroke={stroke}
        strokeWidth={1.1}
      />,
    );
  }
  return (
    <g transform={`rotate(${dir} ${x} ${y})`}>
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y - staff}
        stroke={stroke}
        strokeWidth={1.15}
      />
      {marks}
    </g>
  );
}

function hazardSet(hazards: SoundingHazard[]): Set<number> {
  const flagged = new Set<number>();
  for (const hazard of hazards) {
    if (hazard.pHpa !== undefined) flagged.add(hazard.pHpa);
    if (hazard.pHpaTo !== undefined) flagged.add(hazard.pHpaTo);
  }
  return flagged;
}

function SkewTPlot({
  sounding,
  hazards,
}: {
  sounding: SoundingHour;
  hazards: SoundingHazard[];
}) {
  const view = DEFAULT_SKEW_T_VIEW;
  const flagged = hazardSet(hazards);
  const tPath = polyline(sounding.levels, (l) => l.tempC, view);
  const tdPath = polyline(sounding.levels, (l) => l.dewC, view);
  const isotherms = ISOTHERMS.map((temp) => {
    const pts = ISOBARS.map((p) => skewTPoint(p, temp, view));
    return { temp, d: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") };
  });
  return (
    <svg
      viewBox={`0 0 ${view.width} ${view.height}`}
      className="h-auto w-full max-w-full"
      role="img"
      aria-label="Skew-T log-P model sounding. Temperature in warm ink, dewpoint in cool ink, wind barbs on the right."
    >
      <rect
        x="0"
        y="0"
        width={view.width}
        height={view.height}
        rx="12"
        fill="#0c1613"
      />
      {ISOBARS.map((p) => {
        const y = skewTPoint(p, 0, view).y;
        return (
          <g key={`p${p}`}>
            <line
              x1={view.pad.left}
              x2={view.width - view.pad.right + 8}
              y1={y}
              y2={y}
              stroke="rgba(246,241,230,0.12)"
            />
            <text
              x={6}
              y={y + 3}
              fill="#d7d2c4"
              fontSize="8"
              fontFamily="ui-monospace, monospace"
            >
              {p}
            </text>
          </g>
        );
      })}
      {isotherms.map((iso) => (
        <polyline
          key={`t${iso.temp}`}
          points={iso.d}
          fill="none"
          stroke={iso.temp === 0 ? "rgba(246,241,230,0.28)" : "rgba(246,241,230,0.1)"}
          strokeWidth={iso.temp === 0 ? 1.1 : 0.8}
        />
      ))}
      {ISOTHERMS.map((temp) => {
        const { x } = skewTPoint(view.pMax, temp, view);
        return (
          <text
            key={`tl${temp}`}
            x={x}
            y={view.height - 8}
            fill="#d7d2c4"
            fontSize="8"
            fontFamily="ui-monospace, monospace"
            textAnchor="middle"
          >
            {temp}°
          </text>
        );
      })}
      {tdPath ? (
        <polyline
          points={tdPath}
          fill="none"
          stroke="#7eb8d8"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      ) : null}
      {tPath ? (
        <polyline
          points={tPath}
          fill="none"
          stroke="#e8a070"
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
      ) : null}
      {sounding.levels.map((level) => {
        if (level.windKt === null || level.windDir === null) return null;
        const { y } = skewTPoint(level.pHpa, 0, view);
        return (
          <WindBarb
            key={`barb-${level.pHpa}`}
            x={view.width - 22}
            y={y}
            dir={level.windDir}
            kt={level.windKt}
            muted={!flagged.has(level.pHpa)}
          />
        );
      })}
      <text
        x={view.pad.left}
        y={11}
        fill="#d7d2c4"
        fontSize="8"
        fontFamily="ui-monospace, monospace"
      >
        hPa
      </text>
    </svg>
  );
}

function WindStrip({
  sounding,
  hazards,
}: {
  sounding: SoundingHour;
  hazards: SoundingHazard[];
}) {
  const view = DEFAULT_SKEW_T_VIEW;
  const flagged = hazardSet(hazards);
  const width = WIND_STRIP_WIDTH;
  const height = view.height;
  const padLeft = 8;
  const padRight = 10;
  const ticks = [0, 20, 40, 60];
  const points = sounding.levels
    .filter((level) => level.windKt !== null)
    .map((level) => {
      const { y } = skewTPoint(level.pHpa, 0, view);
      const x = windStripX(level.windKt ?? 0, width, padLeft, padRight, WIND_KT_MAX);
      return { x, y, level };
    });
  const path = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const surface = sounding.levels[0];
  const surfaceY = surface ? skewTPoint(surface.pHpa, 0, view).y : null;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full max-w-[7.5rem]"
      role="img"
      aria-label="Wind speed in knots versus height"
    >
      <rect x="0" y="0" width={width} height={height} rx="12" fill="#0c1613" />
      {ticks.map((kt) => {
        const x = windStripX(kt, width, padLeft, padRight, WIND_KT_MAX);
        return (
          <g key={kt}>
            <line
              x1={x}
              x2={x}
              y1={view.pad.top}
              y2={height - view.pad.bottom}
              stroke="rgba(246,241,230,0.1)"
            />
            <text
              x={x}
              y={height - 8}
              fill="#d7d2c4"
              fontSize="8"
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
            >
              {kt}
            </text>
          </g>
        );
      })}
      {path ? (
        <polyline
          points={path}
          fill="none"
          stroke="#e6c15a"
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      ) : null}
      {points.map(({ x, y, level }) => (
        <circle
          key={`w-${level.pHpa}`}
          cx={x}
          cy={y}
          r={flagged.has(level.pHpa) ? 3.2 : 2.2}
          fill={flagged.has(level.pHpa) ? "#f0b35a" : "#e6c15a"}
        />
      ))}
      {sounding.gustKt && surfaceY !== null ? (
        <line
          x1={windStripX(sounding.gustKt, width, padLeft, padRight, WIND_KT_MAX)}
          x2={windStripX(sounding.gustKt, width, padLeft, padRight, WIND_KT_MAX)}
          y1={surfaceY - 6}
          y2={surfaceY + 6}
          stroke="#f3efe4"
          strokeWidth={1.4}
        />
      ) : null}
      <text
        x={width / 2}
        y={11}
        fill="#d7d2c4"
        fontSize="8"
        fontFamily="ui-monospace, monospace"
        textAnchor="middle"
      >
        kt
      </text>
    </svg>
  );
}

function dirLabel(dir: number | null, kt: number | null): string {
  if (kt === 0) return "calm";
  if (dir === null || kt === null) return "—";
  return `${String(Math.round(dir)).padStart(3, "0")}°/${kt}`;
}

function HazardChips({ hazards }: { hazards: SoundingHazard[] }) {
  if (hazards.length === 0) {
    return (
      <Badge variant="outline" className="border-white/15 text-[#d7d2c4]">
        No wind / shear flags
      </Badge>
    );
  }
  return (
    <>
      {hazards.map((hazard) => (
        <Badge
          key={`${hazard.kind}-${hazard.label}`}
          className={
            hazard.kind === "cape" || hazard.kind === "wave"
              ? "bg-rose-300 text-[#10211c]"
              : "bg-amber-300 text-[#10211c]"
          }
          title={hazard.detail}
        >
          {hazard.label}
        </Badge>
      ))}
    </>
  );
}

export function SoundingPanel({
  window,
}: {
  window: WindowView;
}) {
  const sounding = window.sounding;
  if (!sounding) {
    return (
      <p className="mt-2 text-sm text-[#d7d2c4]/70">
        No model sounding for this hour.
      </p>
    );
  }
  const freeze =
    sounding.freezingLevelFt !== null
      ? `0 °C ${sounding.freezingLevelFt} ft`
      : null;
  const cape =
    sounding.cape !== null && sounding.cape > 0
      ? `CAPE ${Math.round(sounding.cape)}`
      : null;
  return (
    <div className="mt-3 border-t border-white/8 pt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <HazardChips hazards={window.soundingHazards} />
      </div>
      <div className="mt-3 grid items-start gap-2 sm:grid-cols-[minmax(0,1fr)_6rem]">
        <SkewTPlot sounding={sounding} hazards={window.soundingHazards} />
        <WindStrip sounding={sounding} hazards={window.soundingHazards} />
      </div>
      <table className="mt-3 w-full text-left font-mono text-[11px] text-[#d7d2c4]/85">
        <caption className="sr-only">
          Model sounding levels for this VFR hole
        </caption>
        <thead className="text-[#d7d2c4]/50">
          <tr>
            <th className="py-1 font-medium">hPa</th>
            <th className="py-1 font-medium">ft</th>
            <th className="py-1 font-medium">T</th>
            <th className="py-1 font-medium">Td</th>
            <th className="py-1 font-medium">Wind</th>
          </tr>
        </thead>
        <tbody>
          {sounding.levels.map((level, index) => (
            <tr key={level.pHpa} className="border-t border-white/6">
              <td className="py-1">{index === 0 ? "SFC" : level.pHpa}</td>
              <td className="py-1">{level.altFtMsl}</td>
              <td className="py-1">
                {level.tempC === null ? "—" : `${Math.round(level.tempC)}°`}
              </td>
              <td className="py-1">
                {level.dewC === null ? "—" : `${Math.round(level.dewC)}°`}
              </td>
              <td className="py-1">
                {dirLabel(level.windDir, level.windKt)}
                {index === 0 && sounding.gustKt ? ` G${sounding.gustKt}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] leading-relaxed text-[#d7d2c4]/55">
        Model sounding · gusts at 10 m only · wave/shear ≤ 3500 m inferred, not
        observed turbulence.
        {freeze ? ` · ${freeze}` : ""}
        {cape ? ` · ${cape}` : ""}
      </p>
    </div>
  );
}
