"use client";

import { useState } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";

export function DataSourceStatus({
  opsError,
  liveError,
}: {
  /** FlightAware / ops overlay failure from the server. */
  opsError?: string | null;
  /** ADS-B (adsb.lol / OpenSky) failure from the live client poll. */
  liveError?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const degraded = Boolean(opsError || liveError);
  if (!degraded) return null;

  const summary = opsError
    ? "Live IFR overlay offline"
    : "Live ADS-B overlay offline";

  return (
    <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 text-amber-50">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition hover:bg-amber-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="size-2 shrink-0 rounded-full bg-amber-300 shadow-[0_0_8px_oklch(0.84_0.14_85/0.7)]"
          aria-hidden
        />
        <span className="min-w-0 flex-1 font-medium">{summary}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-amber-100/70 transition ${
            open ? "rotate-0" : "-rotate-90"
          }`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-t border-amber-300/15 px-3.5 py-2.5 text-sm text-amber-50/90">
          <p className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {opsError ? (
                <>
                  FlightAware: {opsError}. Showing the airport programmazione
                  only — same-day bizjets from the live board may be missing.
                </>
              ) : null}
              {opsError && liveError ? " " : null}
              {liveError ? (
                <>
                  ADS-B: {liveError}. Schedule still applies.
                </>
              ) : null}
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
