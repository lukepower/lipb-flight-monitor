import { ExternalLink, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionKicker } from "@/components/panel";
import {
  ALPS_GAFOR_MAP,
  alpsGaforLinePath,
  projectAlpsGafor,
  type GaforRoute,
  type GaforRoutesBundle,
} from "@/lib/gafor-routes";
import {
  categoryLabel,
  ITALY_GAFOR_ALPINE_ZONE,
  type ItalyGaforBundle,
  type ItalyGaforZoneEntry,
} from "@/lib/italy-gafor";
import { LIPB } from "@/lib/constants";
import { formatUtcHm } from "@/lib/time";
import { cn } from "@/lib/utils";

const BRIEFING_LINKS = [
  {
    href: "https://www.austrocontrol.at/wetter/flugwetter/produkte",
    label: "ACG Flugwetter (incl. LL SWC Alps)",
  },
  {
    href: "https://www.homebriefing.com",
    label: "Homebriefing",
  },
  {
    href: "https://www.skybriefing.com",
    label: "skybriefing (CH)",
  },
  {
    href: "https://www.flugwetter.de",
    label: "DWD pc_met / flugwetter.de",
  },
] as const;

const ROUTE_COLORS: Record<number, string> = {
  50: "#6ee7b7",
  51: "#fcd34d",
};

export function GaforStrip({
  italyGafor,
  routes,
}: {
  italyGafor: ItalyGaforBundle;
  routes: GaforRoutesBundle;
}) {
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2">
        <SectionKicker>
          <Route className="size-3.5" /> Alpine GAFOR
        </SectionKicker>
        <Badge className="bg-white/12 text-[#f3efe4]">AT 50/51 · IT zones</Badge>
        <span className="font-mono text-xs text-[#d7d2c4]/65">
          Geometry open · colours login-walled
        </span>
      </div>
      <p className="mt-2 text-xs text-[#d7d2c4]/55">
        Austrian route GAFOR O/D/M/X and the joint Low-Level SWC Alps chart need
        a pilot briefing login. Italy publishes zone GAFOR (not Alpine routes) —
        zone {ITALY_GAFOR_ALPINE_ZONE} is the usual Alpine / Alto Adige area.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ItalyGaforPanel italyGafor={italyGafor} />
        <RouteMapPanel routes={routes} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {BRIEFING_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-[#f3efe4]/90 transition hover:bg-white/8"
          >
            {link.label}
            <ExternalLink className="size-3 opacity-60" />
          </a>
        ))}
        <a
          href={italyGafor.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs text-[#f3efe4]/90 transition hover:bg-white/8"
        >
          MeteoAM GAFOR IT
          <ExternalLink className="size-3 opacity-60" />
        </a>
      </div>
    </Panel>
  );
}

function ItalyGaforPanel({ italyGafor }: { italyGafor: ItalyGaforBundle }) {
  const b = italyGafor.bulletin;
  if (!b || b.entries.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2.5">
        <p className="text-sm font-medium text-[#f6f1e6]">Italy GAFOR</p>
        <p className="mt-1 text-xs text-[#d7d2c4]/65">
          Unavailable{italyGafor.error ? `: ${italyGafor.error}` : ""}
        </p>
      </div>
    );
  }

  const from = b.validFrom ? new Date(b.validFrom) : null;
  const to = b.validTo ? new Date(b.validTo) : null;

  return (
    <div className="rounded-2xl border border-white/6 bg-black/20 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-[#f6f1e6]">Italy GAFOR (zones)</p>
        <span className="font-mono text-[11px] text-[#d7d2c4]/45">
          FBIY61 LIIB
          {b.periodCode ? ` · ${b.periodCode}` : ""}
        </span>
      </div>
      {from && to ? (
        <p className="mt-1 font-mono text-xs text-[#d7d2c4]/55">
          VT {formatUtcHm(from)}–{formatUtcHm(to)} UTC
        </p>
      ) : null}
      <ul className="mt-3 flex flex-col gap-1.5">
        {b.entries.map((e) => (
          <ZoneRow key={e.zoneLabel + e.category} entry={e} />
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-[#d7d2c4]/40">
        {italyGafor.attribution}
      </p>
    </div>
  );
}

function ZoneRow({ entry }: { entry: ItalyGaforZoneEntry }) {
  const alpine = entry.zones.includes(ITALY_GAFOR_ALPINE_ZONE);
  return (
    <li
      className={cn(
        "flex flex-wrap items-start justify-between gap-2 rounded-xl px-2 py-1.5",
        alpine ? "bg-emerald-400/10" : "bg-white/[0.03]",
      )}
    >
      <div>
        <p className="font-mono text-xs text-[#f3efe4]">
          Zone {entry.zoneLabel}
          {alpine ? " · Alpi / Alto Adige" : ""}
        </p>
        {entry.remarks ? (
          <p className="mt-0.5 font-mono text-[11px] text-[#d7d2c4]/55">
            {entry.remarks}
          </p>
        ) : null}
      </div>
      <Badge
        className={cn(
          "font-mono",
          entry.category === "O" && "bg-emerald-400/20 text-emerald-100",
          entry.category === "D" && "bg-amber-400/20 text-amber-100",
          entry.category === "M" && "bg-orange-400/20 text-orange-100",
          entry.category === "X" && "bg-rose-400/20 text-rose-100",
        )}
      >
        {entry.category}
        {entry.k ?? ""} · {categoryLabel(entry.category)}
      </Badge>
    </li>
  );
}

function RouteMapPanel({ routes }: { routes: GaforRoutesBundle }) {
  if (routes.routes.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2.5">
        <p className="text-sm font-medium text-[#f6f1e6]">AT routes 50 / 51</p>
        <p className="mt-1 text-xs text-[#d7d2c4]/65">
          Geometry unavailable{routes.error ? `: ${routes.error}` : ""}
        </p>
      </div>
    );
  }

  const lipb = projectAlpsGafor(LIPB.lon, LIPB.lat);

  return (
    <div className="rounded-2xl border border-white/6 bg-black/20 px-3 py-2.5">
      <p className="text-sm font-medium text-[#f6f1e6]">AT GAFOR routes → LIPB</p>
      <p className="mt-1 text-xs text-[#d7d2c4]/55">
        Official Austro Control geometry (no forecast colours)
      </p>
      <svg
        viewBox={`0 0 ${ALPS_GAFOR_MAP.width} ${ALPS_GAFOR_MAP.height}`}
        className="mt-3 h-auto w-full overflow-hidden rounded-lg border border-white/8 bg-[#0c1a16]"
        role="img"
        aria-label="Alpine GAFOR routes 50 and 51 to LIPB"
      >
        <rect
          width={ALPS_GAFOR_MAP.width}
          height={ALPS_GAFOR_MAP.height}
          className="fill-[#0c1a16]"
        />
        {routes.routes.map((route) => (
          <RoutePath key={route.id} route={route} />
        ))}
        <circle
          cx={lipb.x}
          cy={lipb.y}
          r={5}
          className="fill-emerald-300 stroke-[#10211c]"
          strokeWidth={1.5}
        />
        <text
          x={lipb.x + 8}
          y={lipb.y + 4}
          className="fill-emerald-100"
          style={{ fontSize: 14, fontFamily: "ui-monospace, monospace" }}
        >
          LIPB
        </text>
      </svg>
      <ul className="mt-2 flex flex-col gap-1">
        {routes.routes.map((route) => (
          <li
            key={route.id}
            className="flex items-baseline justify-between gap-2 font-mono text-[11px] text-[#d7d2c4]/70"
          >
            <span>
              <span
                className="mr-1.5 inline-block size-2 rounded-full"
                style={{ background: ROUTE_COLORS[route.id] ?? "#fff" }}
              />
              {route.id}: {route.routing.replace(/-/g, " · ")}
            </span>
            <span className="shrink-0 text-[#d7d2c4]/45">
              ref {route.refHeightFt} ft
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-[#d7d2c4]/40">{routes.attribution}</p>
    </div>
  );
}

function RoutePath({ route }: { route: GaforRoute }) {
  const d = alpsGaforLinePath(route.coordinates);
  if (!d) return null;
  return (
    <path
      d={d}
      fill="none"
      stroke={ROUTE_COLORS[route.id] ?? "#6ee7b7"}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.9}
    />
  );
}
