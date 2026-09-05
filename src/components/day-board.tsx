import type { DayBoard } from "@/lib/board";
import { Badge } from "@/components/ui/badge";

export function DayPanel({
  day,
  emptyHint,
}: {
  day: DayBoard;
  emptyHint?: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#101917] p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-serif text-2xl text-[#f3efe4]">{day.title}</h2>
          <p className="text-sm text-[#d7d2c4]/70">
            VFR daylight {day.daylight.vfrStartHm}–{day.daylight.vfrEndHm} · SR{" "}
            {day.daylight.sunriseHm} / SS {day.daylight.sunsetHm}
          </p>
        </div>
        <p className="text-sm text-[#d7d2c4]/70">
          {day.movements.length} scheduled IFR · {day.windows.length} holes
        </p>
      </div>
      <Timeline day={day} />
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold tracking-wide text-[#d7d2c4]/60 uppercase">
            Movements
          </h3>
          {day.movements.length === 0 ? (
            <p className="mt-2 text-sm text-[#d7d2c4]/80">
              {emptyHint ?? "No SkyAlps IFR in the loaded season for this day."}
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-white/5">
              {day.movements.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <p className="text-base font-medium text-[#f3efe4]">
                      {m.atHm} {m.flightNumber}
                    </p>
                    <p className="text-sm text-[#d7d2c4]/70">
                      {m.direction === "arrival" ? "Arrival from" : "Departure to"}{" "}
                      {m.otherCity} ({m.otherAirport})
                    </p>
                  </div>
                  <Badge variant="outline">
                    {m.direction === "arrival" ? "ARR" : "DEP"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-xs font-semibold tracking-wide text-[#d7d2c4]/60 uppercase">
            Best VFR holes
          </h3>
          {day.windows.length === 0 ? (
            <p className="mt-2 text-sm text-[#d7d2c4]/80">
              No hole of 45 minutes or more in civil daylight.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {day.windows.map((w) => (
                <li
                  key={`${w.dateLocal}-${w.startIso}`}
                  className="rounded-xl bg-emerald-400/10 px-3 py-2 ring-1 ring-emerald-300/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-base font-medium text-emerald-100">
                      {w.startHm}–{w.endHm} · {w.durationMin} min
                    </p>
                    <Quality quality={w.quality} source={w.weatherSource} />
                  </div>
                  <p className="mt-1 text-sm text-[#d7d2c4]/80">
                    {w.weatherSummary ?? "No TAF yet for this slot"}
                    {w.weatherSource === "model" ? " (model, not TAF)" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Quality({
  quality,
  source,
}: {
  quality: string;
  source: string;
}) {
  if (quality === "good") {
    return <Badge className="bg-emerald-300 text-[#10211c]">Traffic OK · wx OK</Badge>;
  }
  if (quality === "marginal") {
    return <Badge className="bg-amber-300 text-[#10211c]">Traffic OK · wx marginal</Badge>;
  }
  if (quality === "poor") {
    return <Badge className="bg-red-400 text-white">Traffic OK · wx poor</Badge>;
  }
  return (
    <Badge variant="outline">
      {source === "none" ? "No forecast" : "Weather unknown"}
    </Badge>
  );
}

function Timeline({ day }: { day: DayBoard }) {
  const rangeStart = Date.parse(day.daylight.vfrStartIso);
  const rangeEnd = Date.parse(day.daylight.vfrEndIso);
  const span = Math.max(rangeEnd - rangeStart, 60 * 60 * 1000);
  const left = (iso: string) =>
    `${((Date.parse(iso) - rangeStart) / span) * 100}%`;
  const width = (startIso: string, endIso: string) =>
    `${Math.max(((Date.parse(endIso) - Date.parse(startIso)) / span) * 100, 0.8)}%`;
  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-[#d7d2c4]/70">
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-2.5 rounded-sm bg-emerald-400" /> Hole
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-2.5 rounded-sm bg-red-500" /> ATZ closed
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-2.5 rounded-sm bg-amber-400" /> Valle Adige
        </span>
      </div>
      <div className="relative h-16 overflow-hidden rounded-xl bg-black/30">
        {day.windows.map((w) => (
          <div
            key={`w-${w.startIso}`}
            className="absolute top-1 h-4 rounded-sm bg-emerald-400/80"
            style={{ left: left(w.startIso), width: width(w.startIso, w.endIso) }}
            title={`${w.startHm}–${w.endHm}`}
          />
        ))}
        {day.sector.map((b) => (
          <div
            key={`s-${b.startIso}`}
            className="absolute top-6 h-3 rounded-sm bg-amber-400/85"
            style={{ left: left(b.startIso), width: width(b.startIso, b.endIso) }}
            title={`Sector ${b.startHm}–${b.endHm}`}
          />
        ))}
        {day.atz.map((b) => (
          <div
            key={`a-${b.startIso}`}
            className="absolute top-10 h-4 rounded-sm bg-red-500/90"
            style={{ left: left(b.startIso), width: width(b.startIso, b.endIso) }}
            title={`ATZ ${b.startHm}–${b.endHm}`}
          />
        ))}
      </div>
    </div>
  );
}
