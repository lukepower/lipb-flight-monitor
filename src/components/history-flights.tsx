import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  PlaneLanding,
  PlaneTakeoff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import type { AsFlownMovement } from "@/lib/history";
import { formatLocalHm, formatLocalLong, fromZonedLocal } from "@/lib/time";

export function HistoryFlightList({
  dateLocal,
  movements,
}: {
  dateLocal: string;
  movements: AsFlownMovement[];
}) {
  const title = formatLocalLong(fromZonedLocal(dateLocal, "12:00"));
  return (
    <Panel>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl tracking-tight text-[#f6f1e6]">
            {title}
          </h2>
          <p className="mt-1 text-sm text-[#d7d2c4]/65">
            As flown · FlightAware ops · not an official airport log
          </p>
        </div>
        <p className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-medium text-[#f3efe4]/80">
          {movements.length} {movements.length === 1 ? "flight" : "flights"}
        </p>
      </div>
      <div className="mt-6">
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
        {movements.length === 0 ? (
          <p className="mt-3 text-sm text-[#d7d2c4]/75">
            No as-flown IFR for this day.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-white/6">
            {movements.map((m) => {
              const dep = m.direction === "departure";
              const Icon = dep ? PlaneTakeoff : PlaneLanding;
              const atHm = formatLocalHm(new Date(m.at));
              return (
                <li
                  key={`${m.flightNumber}-${m.direction}-${m.dateLocal}-${m.at}`}
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
                      <span>{atHm}</span>
                      <span className="text-[#f6f1e6]">{m.flightNumber}</span>
                    </p>
                    <p className="truncate text-sm text-[#d7d2c4]/65">
                      {dep ? "to" : "from"} {m.otherCity} ({m.otherAirport})
                      {m.operator || m.aircraft
                        ? ` · ${[m.operator, m.aircraft].filter(Boolean).join(" · ")}`
                        : ""}
                    </p>
                  </div>
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
