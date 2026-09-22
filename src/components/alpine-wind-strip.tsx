import { Navigation2, TriangleAlert, Wind } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import {
  ALPINE_WIND_STRONG_KT,
  type AlpineStationReading,
  type AlpineWindBundle,
  type WindSample,
} from "@/lib/alpine-wind";
import { formatLocalHm } from "@/lib/time";
import { cn } from "@/lib/utils";

export function AlpineWindStrip({ wind }: { wind: AlpineWindBundle }) {
  const ok = wind.stations.filter((s) => !s.error && s.windKt !== null);
  if (ok.length === 0) {
    return (
      <Panel className="border-amber-300/25 bg-amber-400/10">
        <SectionKicker>
          <TriangleAlert className="size-3.5" /> Alpine wind
        </SectionKicker>
        <p className="mt-3 text-sm text-[#f3efe4]">
          Alpine wind unavailable
          {wind.error ? `: ${wind.error}` : ""}
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2">
        <SectionKicker>
          <Wind className="size-3.5" /> Alpine wind
        </SectionKicker>
        <Badge className="bg-white/12 text-[#f3efe4]">Föhn check</Badge>
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          Last ~3 h · knots · SIAG / GeoSphere / Meteotrentino
        </span>
      </div>
      <p className="mt-2 text-xs text-[#d7d2c4]/55">
        High-altitude observations for crest / Föhn flow — not a forecast.{" "}
        <a
          className="text-emerald-200/80 underline-offset-2 hover:underline"
          href="https://weather.province.bz.it/en/foehn-chart"
          rel="noreferrer"
          target="_blank"
        >
          Province Föhn chart
        </a>
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {wind.stations.map((station) => (
          <li key={station.id}>
            <StationCard station={station} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function StationCard({ station }: { station: AlpineStationReading }) {
  const strong =
    (station.windKt !== null && station.windKt >= ALPINE_WIND_STRONG_KT) ||
    (station.gustKt !== null && station.gustKt >= ALPINE_WIND_STRONG_KT);

  if (station.error || station.windKt === null) {
    return (
      <div className="rounded-2xl border border-white/6 bg-black/20 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-[#f6f1e6]">{station.name}</p>
          <RegionBadge region={station.region} />
        </div>
        <p className="mt-1 font-mono text-xs text-[#d7d2c4]/45">
          {station.elevM} m · {station.error ?? "n/a"}
        </p>
      </div>
    );
  }

  const dirLabel =
    station.windDirDeg === null
      ? "VRB"
      : `${Math.round(station.windDirDeg).toString().padStart(3, "0")}°`;

  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-2.5",
        strong
          ? "border-amber-300/35 bg-amber-400/10"
          : "border-white/6 bg-black/20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[#f6f1e6]">{station.name}</p>
          <p className="mt-0.5 font-mono text-[11px] text-[#d7d2c4]/55">
            {station.elevM} m
            {station.observedAt
              ? ` · ${formatLocalHm(station.observedAt)} LT`
              : ""}
            {station.ageMin !== null ? ` · ${station.ageMin} min` : ""}
          </p>
        </div>
        <RegionBadge region={station.region} />
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <DirArrow deg={station.windDirDeg} />
          <div>
            <p className="font-mono text-lg font-medium text-[#f6f1e6]">
              {dirLabel}{" "}
              <span className={strong ? "text-amber-200" : ""}>
                {station.windKt}
              </span>
              {station.gustKt !== null ? (
                <span className="text-[#d7d2c4]/70"> G{station.gustKt}</span>
              ) : null}
              <span className="ml-1 text-xs text-[#d7d2c4]/55">kt</span>
            </p>
          </div>
        </div>
        <WindSparkline samples={station.history} strong={strong} />
      </div>
    </div>
  );
}

function RegionBadge({ region }: { region: AlpineStationReading["region"] }) {
  return (
    <Badge className="bg-white/10 text-[10px] tracking-wide text-[#f3efe4]">
      {region}
    </Badge>
  );
}

function DirArrow({ deg }: { deg: number | null }) {
  if (deg === null) {
    return <Navigation2 className="size-4 text-[#d7d2c4]/40" />;
  }
  // Meteorological direction: wind FROM; rotate so tip points where wind goes.
  const to = (deg + 180) % 360;
  return (
    <Navigation2
      aria-hidden
      className="size-4 shrink-0 text-emerald-300/85"
      style={{ transform: `rotate(${to}deg)` }}
    />
  );
}

function WindSparkline({
  samples,
  strong,
}: {
  samples: WindSample[];
  strong: boolean;
}) {
  const w = 88;
  const h = 28;
  if (samples.length < 2) {
    return <div style={{ width: w, height: h }} className="shrink-0" />;
  }
  const values = samples.map((s) => s.windKt);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, ALPINE_WIND_STRONG_KT);
  const span = Math.max(max - min, 1);
  const pts = samples
    .map((s, i) => {
      const x = (i / (samples.length - 1)) * (w - 2) + 1;
      const y = h - 2 - ((s.windKt - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden
      className="shrink-0"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
    >
      <polyline
        fill="none"
        points={pts}
        stroke={strong ? "oklch(0.86 0.12 85)" : "oklch(0.86 0.14 155 / 0.75)"}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
