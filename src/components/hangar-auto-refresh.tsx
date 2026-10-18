"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_REFRESH_MS = 3 * 60_000;

/**
 * Periodically refreshes server-rendered hangar data (METAR, TAF, FlightAware ops,
 * wave-risk) when the tab is visible so wall-mounted club screens stay current.
 */
export function HangarAutoRefresh({
  intervalMs = DEFAULT_REFRESH_MS,
}: {
  intervalMs?: number;
}) {
  const router = useRouter();
  const lastRefreshRef = useRef<number>(0);

  useEffect(() => {
    lastRefreshRef.current = Date.now();
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        lastRefreshRef.current = Date.now();
        router.refresh();
      }
    };

    const id = window.setInterval(refreshIfVisible, intervalMs);
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRefreshRef.current >= intervalMs
      ) {
        refreshIfVisible();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, router]);

  return null;
}
