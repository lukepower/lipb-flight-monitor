import type { DayBoard } from "@/lib/board";
import { Badge } from "@/components/ui/badge";
import { addMinutes, formatLocalHm } from "@/lib/time";

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

function timelineTicks(rangeStart: number, rangeEnd: number) {
  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);
  const startLabel = formatLocalHm(start);
  const [, startMin] = startLabel.split(":").map(Number);
  const ticks: { pct: number; label: string; major: boolean }[] = [
    { pct: 0, label: startLabel, major: true },
  ];
  let cursor = addMinutes(start, startMin === 0 ? 60 : 60 - startMin);
  while (cursor.getTime() < rangeEnd - 20 * 60_000) {
    const label = formatLocalHm(cursor);
    const hour = Number(label.slice(0, 2));
    ticks.push({
      pct: ((cursor.getTime() - rangeStart) / (rangeEnd - rangeStart)) * 100,
      label,
      major: hour % 2 === 0,
    });
    cursor = addMinutes(cursor, 60);
  }
  ticks.push({ pct: 100, label: formatLocalHm(end), major: true });
  return ticks;
}

function Timeline({ day }: { day: DayBoard }) {
  const rangeStart = Date.parse(day.daylight.vfrStartIso);
  const rangeEnd = Date.parse(day.daylight.vfrEndIso);
  const span = Math.max(rangeEnd - rangeStart, 60 * 60 * 1000);
  const left = (iso: string) =>
    `${((Date.parse(iso) - rangeStart) / span) * 100}%`;
  const width = (startIso: string, endIso: string) =>
    `${Math.max(((Date.parse(endIso) - Date.parse(startIso)) / span) * 100, 0.8)}%`;
  const ticks = timelineTicks(rangeStart, rangeEnd);
  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#d7d2c4]/70">
        <div className="flex flex-wrap gap-3">
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
        <p className="font-medium text-[#f3efe4]">
          {day.title} · {day.dateLocal} · local (Europe/Rome)
        </p>
      </div>
      <div className="rounded-xl bg-black/30 px-2 pt-2 pb-1">
        <div className="relative h-20">
          {ticks.map((tick) => (
            <div
              key={`grid-${tick.pct}-${tick.label}`}
              className={`absolute top-0 bottom-6 w-px ${
                tick.major ? "bg-white/20" : "bg-white/10"
              }`}
              style={{ left: `${tick.pct}%` }}
            />
          ))}
          {day.windows.map((w) => (
            <div
              key={`w-${w.startIso}`}
              className="absolute top-1 flex h-5 items-center overflow-hidden rounded-sm bg-emerald-400/85 px-1"
              style={{ left: left(w.startIso), width: width(w.startIso, w.endIso) }}
              title={`${day.dateLocal} ${w.startHm}–${w.endHm}`}
            >
              <span className="truncate text-[10px] font-semibold leading-none text-[#10211c]">
                {w.startHm}–{w.endHm}
              </span>
            </div>
          ))}
          {day.sector.map((b) => (
            <div
              key={`s-${b.startIso}`}
              className="absolute top-7 h-3.5 rounded-sm bg-amber-400/90"
              style={{ left: left(b.startIso), width: width(b.startIso, b.endIso) }}
              title={`${day.dateLocal} Valle Adige ${b.startHm}–${b.endHm} · ${b.flights.join(", ")}`}
            />
          ))}
          {day.atz.map((b) => (
            <div
              key={`a-${b.startIso}`}
              className="absolute top-11 h-4 rounded-sm bg-red-500"
              style={{ left: left(b.startIso), width: width(b.startIso, b.endIso) }}
              title={`${day.dateLocal} ATZ ${b.startHm}–${b.endHm} · ${b.flights.join(", ")}`}
            />
          ))}
        </div>
        <div className="relative mt-1 h-5">
          {ticks.map((tick) => {
            const align =
              tick.pct < 1
                ? "left-0"
                : tick.pct > 99
                  ? "right-0 left-auto"
                  : "-translate-x-1/2";
            return (
              <div
                key={`label-${tick.pct}-${tick.label}`}
                className={`absolute font-mono text-[10px] ${align} ${
                  tick.major
                    ? "text-[#f3efe4]"
                    : "text-[#d7d2c4]/55 max-[700px]:hidden"
                }`}
                style={
                  tick.pct < 1 || tick.pct > 99
                    ? undefined
                    : { left: `${tick.pct}%` }
                }
              >
                {tick.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
