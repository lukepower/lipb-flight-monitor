import {
  CloudSun,
  Droplets,
  Eye,
  Gauge,
  Thermometer,
  TriangleAlert,
  Wind,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import { formatLocalHm, formatUtcHm } from "@/lib/time";
import type { MetarBundle } from "@/lib/weather";

export function MetarStrip({ metar }: { metar: MetarBundle }) {
  if (metar.error) {
    return (
      <Panel className="border-amber-300/25 bg-amber-400/10">
        <SectionKicker>
          <TriangleAlert className="size-3.5" /> LIPB METAR
        </SectionKicker>
        <p className="mt-3 text-sm text-[#f3efe4]">
          Weather unavailable: {metar.error}
        </p>
      </Panel>
    );
  }
  const d = metar.decoded;
  const catColor =
    d.flightCategory === "VFR"
      ? "bg-emerald-300 text-[#10211c]"
      : d.flightCategory === "MVFR"
        ? "bg-sky-300 text-[#10211c]"
        : d.flightCategory === "IFR"
          ? "bg-red-400 text-white"
          : d.flightCategory === "LIFR"
            ? "bg-fuchsia-400 text-[#10211c]"
            : "bg-white/20 text-[#f3efe4]";
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2">
        <SectionKicker>
          <CloudSun className="size-3.5" />
          LIPB {d.metarType === "SPECI" ? "SPECI" : "METAR"}
        </SectionKicker>
        <Badge className={catColor}>{d.flightCategory}</Badge>
        {d.lipbVisLow ? (
          <Badge className="bg-amber-300 text-[#10211c]">Vis under 5 km</Badge>
        ) : null}
        {d.issuedAt ? (
          <span className="font-mono text-xs text-[#d7d2c4]/65">
            Observed {formatLocalHm(d.issuedAt)} LT ({formatUtcHm(d.issuedAt)})
            {d.ageMin !== null && d.ageMin !== undefined ? ` · ${d.ageMin} min` : ""}
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-mono text-sm leading-relaxed text-[#f6f1e6]/90 md:text-[15px]">
        {metar.raw || "No raw METAR"}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Fact icon={Wind} label="Wind" value={d.gustKt ? `${d.windDir} G${d.gustKt}` : d.windDir} />
        <Fact
          icon={Eye}
          label="Visibility"
          value={
            d.cavok
              ? "CAVOK"
              : d.visKm === null
                ? "n/a"
                : `${d.visPlus ? ">" : ""}${d.visKm.toFixed(1)} km`
          }
        />
        <Fact
          icon={CloudSun}
          label="Ceiling"
          value={d.ceilingFt === null ? "None" : `${d.ceilingFt} ft`}
        />
        <Fact icon={Gauge} label="QNH" value={d.qnhHpa ? `${Math.round(d.qnhHpa)} hPa` : "n/a"} />
        <Fact
          icon={Thermometer}
          label="Temp / dew"
          value={
            d.tempC === null ? "n/a" : `${d.tempC.toFixed(0)}° / ${d.dewC?.toFixed(0) ?? "–"}°`
          }
        />
        <Fact icon={Droplets} label="Weather" value={d.wx ?? "NSW"} />
      </dl>
    </Panel>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wind;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/6 bg-black/20 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[11px] tracking-wide text-[#d7d2c4]/55 uppercase">
        <Icon className="size-3 text-emerald-300/80" />
        {label}
      </dt>
      <dd className="mt-1 font-mono text-base font-medium text-[#f6f1e6]">{value}</dd>
    </div>
  );
}
