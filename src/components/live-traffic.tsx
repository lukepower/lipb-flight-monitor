"use client";

import { useEffect, useState } from "react";
import type { LiveTrack } from "@/lib/opensky";
import { formatLocalHm, zoneAbbrev } from "@/lib/time";

export function LiveTraffic() {
  const [tracks, setTracks] = useState<LiveTrack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [age, setAge] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        const data = (await res.json()) as {
          tracks: LiveTrack[];
          error?: string;
          fetchedAt: number;
        };
        if (cancelled) return;
        setTracks(data.tracks);
        setError(data.error ?? null);
        const at = new Date(data.fetchedAt);
        setAge(`${formatLocalHm(at)} LT (${zoneAbbrev(at)})`);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Live traffic unavailable");
        }
      }
    };
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#13201c] p-4">
      <h2 className="text-sm font-semibold tracking-wide text-emerald-200/90 uppercase">
        Live in ATZ / Valle Adige
      </h2>
      <p className="mt-1 text-xs text-[#d7d2c4]/60">
        OpenSky ADS-B — seen now, not a flight plan. {age ? `Updated ${age}` : "Loading…"}
      </p>
      {error ? (
        <p className="mt-2 text-sm text-amber-200">
          Live overlay unavailable ({error}). Schedule still applies.
        </p>
      ) : null}
      {tracks.length === 0 && !error ? (
        <p className="mt-2 text-sm text-[#d7d2c4]/80">No aircraft currently seen in the box.</p>
      ) : null}
      {tracks.length > 0 ? (
        <ul className="mt-3 divide-y divide-white/5">
          {tracks.map((t) => (
            <li key={t.icao24} className="flex justify-between py-2 text-sm">
              <span className="font-medium text-[#f3efe4]">{t.callsign}</span>
              <span className="text-[#d7d2c4]/70">
                {t.onGround
                  ? "on ground"
                  : `${t.altitudeFt?.toLocaleString() ?? "?"} ft · ${t.velocityKt ?? "?"} kt`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
