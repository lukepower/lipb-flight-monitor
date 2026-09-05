import { Badge } from "@/components/ui/badge";
import type { MetarBundle } from "@/lib/weather";

export function MetarStrip({ metar }: { metar: MetarBundle }) {
  if (metar.error) {
    return (
      <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
        <h2 className="text-sm font-semibold tracking-wide text-amber-200 uppercase">
          LIPB METAR
        </h2>
        <p className="mt-2 text-sm text-[#f3efe4]">Weather unavailable: {metar.error}</p>
      </section>
    );
  }
  const d = metar.decoded;
  const catColor =
    d.flightCategory === "VFR"
      ? "bg-emerald-400 text-[#10211c]"
      : d.flightCategory === "MVFR"
        ? "bg-blue-300 text-[#10211c]"
        : d.flightCategory === "IFR"
          ? "bg-red-400 text-white"
          : d.flightCategory === "LIFR"
            ? "bg-fuchsia-400 text-[#10211c]"
            : "bg-white/20";
  return (
    <section className="rounded-2xl border border-white/10 bg-[#13201c] p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-emerald-200/90 uppercase">
          LIPB {d.metarType === "SPECI" ? "SPECI" : "METAR"}
        </h2>
        <Badge className={catColor}>{d.flightCategory}</Badge>
        {d.lipbVisLow ? (
          <Badge className="bg-amber-300 text-[#10211c]">Vis under 5 km</Badge>
        ) : null}
        {d.ageMin !== null && d.ageMin !== undefined ? (
          <span className="text-xs text-[#d7d2c4]/70">{d.ageMin} min old</span>
        ) : null}
      </div>
      <p className="mt-3 font-mono text-sm leading-relaxed text-[#f3efe4] md:text-base">
        {metar.raw || "No raw METAR"}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4 lg:grid-cols-6">
        <Fact label="Wind" value={d.gustKt ? `${d.windDir} G${d.gustKt}` : d.windDir} />
        <Fact
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
          label="Ceiling"
          value={d.ceilingFt === null ? "None" : `${d.ceilingFt} ft AGL`}
        />
        <Fact label="QNH" value={d.qnhHpa ? `${Math.round(d.qnhHpa)} hPa` : "n/a"} />
        <Fact
          label="Temp / dew"
          value={
            d.tempC === null ? "n/a" : `${d.tempC.toFixed(0)}° / ${d.dewC?.toFixed(0) ?? "–"}°`
          }
        />
        <Fact label="Weather" value={d.wx ?? "NSW"} />
      </dl>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/20 px-3 py-2">
      <dt className="text-[11px] tracking-wide text-[#d7d2c4]/60 uppercase">{label}</dt>
      <dd className="mt-0.5 text-base font-medium text-[#f3efe4]">{value}</dd>
    </div>
  );
}
