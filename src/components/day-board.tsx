import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Mountain,
  PlaneLanding,
  PlaneTakeoff,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import type { DayBoard } from "@/lib/board";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import { addMinutes, formatLocalHm, zoneAbbrev } from "@/lib/time";

export function DayPanel({
  day,
  emptyHint,
}: {
  day: DayBoard;
  emptyHint?: string;
}) {
  return (
    <Panel className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl tracking-tight text-[#f6f1e6]">
            {day.title}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#d7d2c4]/65">
            <span className="inline-flex items-center gap-1.5">
              <Sun className="size-3.5 text-emerald-300/80" />
              VFR {day.daylight.vfrStartHm}–{day.daylight.vfrEndHm} LT
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sunrise className="size-3.5 text-amber-200/80" />
              {day.daylight.sunriseHm}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sunset className="size-3.5 text-rose-200/80" />
              {day.daylight.sunsetHm}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Stat chip={`${day.movements.length}`} label="IFR" />
          <Stat chip={`${day.windows.length}`} label="holes" tone="emerald" />
        </div>
      </div>
      <Timeline day={day} />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <SectionKicker>
            <Clock className="size-3.5" /> Movements
          </SectionKicker>
          <p className="mt-2 flex gap-4 text-[11px] text-[#d7d2c4]/55">
            <span className="inline-flex items-center gap-1 text-sky-300">
              <PlaneTakeoff className="size-3" /> DEP outbound
            </span>
            <span className="inline-flex items-center gap-1 text-rose-300">
              <PlaneLanding className="size-3" /> ARR inbound
            </span>
          </p>
          {day.movements.length === 0 ? (
            <p className="mt-3 text-sm text-[#d7d2c4]/75">
              {emptyHint ?? "No IFR on the timetable or live board for this day."}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-white/6">
              {day.movements.map((m) => {
                const dep = m.direction === "departure";
                const Icon = dep ? PlaneTakeoff : PlaneLanding;
                return (
                  <li
                    key={m.id}
                    className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-l-2 py-2.5 pl-3 ${
                      dep ? "border-sky-400/80" : "border-rose-400/80"
                    }`}
                  >
                    <div
                      className={`flex size-8 items-center justify-center rounded-full ${
                        dep ? "bg-sky-400/15 text-sky-200" : "bg-rose-400/15 text-rose-200"
                      }`}
                    >
                      <Icon className="size-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`flex flex-wrap items-baseline gap-x-2 font-mono text-[15px] font-medium ${
                          dep ? "text-sky-100" : "text-rose-100"
                        }`}
                      >
                        <span>{m.atHm}</span>
                        <span className="text-[#f6f1e6]">{m.flightNumber}</span>
                        {m.scheduledHm ? (
                          <span className="text-[11px] font-normal text-[#d7d2c4]/50">
                            sched {m.scheduledHm}
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-sm text-[#d7d2c4]/65">
                        {dep ? "to" : "from"} {m.otherCity} ({m.otherAirport})
                        {m.operator || m.aircraft
                          ? ` · ${[m.operator, m.aircraft].filter(Boolean).join(" · ")}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      {m.status === "enroute" || m.status === "taxi" ? (
                        <Badge className="bg-amber-300 text-[#10211c]">
                          <span className="live-dot mr-1 inline-block size-1.5 rounded-full bg-[#10211c]" />
                          LIVE
                        </Badge>
                      ) : null}
                      {m.source === "ops" && !m.scheduledHm ? (
                        <Badge
                          variant="outline"
                          className="border-white/15 text-[#d7d2c4]"
                        >
                          ops
                        </Badge>
                      ) : null}
                      <Badge
                        className={
                          dep
                            ? "bg-sky-400/18 text-sky-100 ring-1 ring-sky-300/30"
                            : "bg-rose-400/18 text-rose-100 ring-1 ring-rose-300/30"
                        }
                      >
                        {dep ? (
                          <ArrowUpRight className="size-3" />
                        ) : (
                          <ArrowDownRight className="size-3" />
                        )}
                        {dep ? "DEP" : "ARR"}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <SectionKicker>
            <Mountain className="size-3.5" /> Best VFR holes
          </SectionKicker>
          {day.windows.length === 0 ? (
            <p className="mt-3 text-sm text-[#d7d2c4]/75">
              No hole of 45 minutes or more in civil daylight.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {day.windows.map((w) => (
                <li
                  key={`${w.dateLocal}-${w.startIso}`}
                  className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-base font-medium text-emerald-50">
                      {w.startHm}–{w.endHm}{" "}
                      <span className="text-sm font-normal text-emerald-100/70">
                        · {w.durationMin} min
                      </span>
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
    </Panel>
  );
}

function Stat({
  chip,
  label,
  tone = "plain",
}: {
  chip: string;
  label: string;
  tone?: "plain" | "emerald";
}) {
  return (
    <div
      className={`rounded-2xl border px-3 py-1.5 text-right ${
        tone === "emerald"
          ? "border-emerald-300/20 bg-emerald-400/10"
          : "border-white/8 bg-black/20"
      }`}
    >
      <p className="font-mono text-lg leading-none text-[#f6f1e6]">{chip}</p>
      <p className="mt-0.5 text-[10px] tracking-wide text-[#d7d2c4]/55 uppercase">
        {label}
      </p>
    </div>
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
    <Badge variant="outline" className="border-white/15">
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
  const nowPct = ((Date.now() - rangeStart) / span) * 100;
  const showNow = nowPct > 0 && nowPct < 100;
  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#d7d2c4]/60">
        <div className="flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm bg-emerald-400 shadow-[0_0_10px_oklch(0.84_0.16_155/0.7)]" />{" "}
            Hole
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm bg-red-500" /> ATZ closed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-sm bg-amber-400" /> Valle Adige
          </span>
        </div>
        <p className="font-mono text-[11px] text-[#f6f1e6]/80">
          {day.dateLocal} · Bolzano LT (
          {zoneAbbrev(new Date(day.daylight.vfrStartIso))})
        </p>
      </div>
      <div className="rounded-2xl border border-white/6 bg-black/35 px-2.5 pt-3 pb-1.5">
        <div className="relative h-[88px]">
          {ticks.map((tick) => (
            <div
              key={`grid-${tick.pct}-${tick.label}`}
              className={`absolute top-0 bottom-6 w-px ${
                tick.major ? "bg-white/16" : "bg-white/7"
              }`}
              style={{ left: `${tick.pct}%` }}
            />
          ))}
          {day.windows.map((w) => (
            <div
              key={`w-${w.startIso}`}
              className="absolute top-1 flex h-6 items-center overflow-hidden rounded-md bg-emerald-400/90 px-1 shadow-[0_0_16px_oklch(0.84_0.16_155/0.35)]"
              style={{ left: left(w.startIso), width: width(w.startIso, w.endIso) }}
              title={`${day.dateLocal} ${w.startHm}–${w.endHm}`}
            >
              <span className="truncate font-mono text-[10px] font-semibold leading-none text-[#10211c]">
                {w.startHm}–{w.endHm}
              </span>
            </div>
          ))}
          {day.sector.map((b) => (
            <div
              key={`s-${b.startIso}`}
              className="absolute top-8 h-3.5 rounded-sm bg-amber-400/90"
              style={{ left: left(b.startIso), width: width(b.startIso, b.endIso) }}
              title={`${day.dateLocal} Valle Adige ${b.startHm}–${b.endHm} · ${b.flights.join(", ")}`}
            />
          ))}
          {day.atz.map((b) => (
            <div
              key={`a-${b.startIso}`}
              className="absolute top-12 h-4 rounded-sm bg-red-500"
              style={{ left: left(b.startIso), width: width(b.startIso, b.endIso) }}
              title={`${day.dateLocal} ATZ ${b.startHm}–${b.endHm} · ${b.flights.join(", ")}`}
            />
          ))}
          {showNow ? (
            <div
              className="now-line absolute top-0 bottom-5 w-px bg-white"
              style={{ left: `${nowPct}%` }}
              title="Now"
            >
              <span className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-full bg-white px-1 font-mono text-[8px] font-semibold tracking-wide text-[#10211c] uppercase">
                now
              </span>
            </div>
          ) : null}
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
                    ? "text-[#f6f1e6]"
                    : "text-[#d7d2c4]/45 max-[700px]:hidden"
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
