"use client";

import { motion } from "motion/react";
import { Plane, Radar } from "lucide-react";
import { Panel, SectionKicker } from "@/components/panel";
import type { LiveTracksState } from "@/components/use-live-tracks";
import { ValleyMap } from "@/components/valley-map";
import { trackKey } from "@/lib/valley-map";

export function LiveTraffic({ live }: { live: LiveTracksState }) {
  const { tracks, error, source, age, loading } = live;
  const feed = source || "ADS-B";
  return (
    <Panel>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <SectionKicker>
          <Radar className="size-3.5" /> Live in ATZ / Valle Adige
        </SectionKicker>
        <p className="font-mono text-xs text-[#d7d2c4]/55">
          {feed}
          {loading ? " · Loading…" : age ? ` · Updated ${age}` : ""}
        </p>
      </div>

      <ValleyMap tracks={loading ? [] : tracks} />

      {loading ? (
        <p className="mt-3 text-sm text-[#d7d2c4]/75">Checking the live ADS-B feed…</p>
      ) : null}
      {!loading && error ? (
        <p className="mt-3 text-sm text-amber-200">
          Live overlay unavailable ({error}). Schedule still applies.
        </p>
      ) : null}
      {!loading && !error && tracks.length === 0 ? (
        <p className="mt-3 text-sm text-[#d7d2c4]/75">
          No aircraft currently seen in the box (below FL160).
        </p>
      ) : null}
      {!loading && tracks.length > 0 ? (
        <ul className="mt-4 divide-y divide-white/6">
          {tracks.map((t, i) => (
            <motion.li
              key={trackKey(t, i)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.28 }}
              className="flex items-center justify-between gap-3 py-2.5 text-sm"
            >
              <span className="inline-flex items-center gap-2 font-mono font-medium text-[#f6f1e6]">
                <Plane
                  className={`size-3.5 ${t.onGround ? "text-amber-300" : "text-emerald-300"}`}
                />
                {t.callsign}
              </span>
              <span className="font-mono text-[#d7d2c4]/70">
                {t.onGround
                  ? "on ground"
                  : `${t.altitudeFt?.toLocaleString() ?? "?"} ft · ${t.velocityKt ?? "?"} kt`}
              </span>
            </motion.li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
