"use client";

import { useEffect, useState } from "react";
import type { LiveTrack } from "@/lib/opensky";
import { formatLocalHm, zoneAbbrev } from "@/lib/time";

export type LiveTracksState = {
  tracks: LiveTrack[];
  error: string | null;
  source: string;
  age: string;
  loading: boolean;
};

const POLL_MS = 15_000;

/** Shared ADS-B poll for the ATZ map and today's movement highlights. */
export function useLiveTracks(): LiveTracksState {
  const [tracks, setTracks] = useState<LiveTrack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [age, setAge] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        const data = (await res.json()) as {
          tracks: LiveTrack[];
          error?: string;
          source?: string;
          fetchedAt: number;
        };
        if (cancelled) return;
        setTracks(data.tracks ?? []);
        setError(data.error ?? null);
        setSource(data.source ?? "");
        const at = new Date(data.fetchedAt);
        setAge(`${formatLocalHm(at)} LT (${zoneAbbrev(at)})`);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Live traffic unavailable");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = setInterval(load, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { tracks, error, source, age, loading };
}
