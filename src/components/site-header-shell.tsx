"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Dual-sentinel sticky compact: enter ~80px, exit ~40px. Sentinels sit outside the header. */
export function SiteHeaderShell({ children }: { children: ReactNode }) {
  const [compact, setCompact] = useState(false);
  const enterRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const enterEl = enterRef.current;
    const exitEl = exitRef.current;
    if (!enterEl || !exitEl) return;

    const enterObs = new IntersectionObserver(([entry]) => {
      if (entry && !entry.isIntersecting) setCompact(true);
    });
    const exitObs = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setCompact(false);
    });

    enterObs.observe(enterEl);
    exitObs.observe(exitEl);
    return () => {
      enterObs.disconnect();
      exitObs.disconnect();
    };
  }, []);

  return (
    <>
      <div aria-hidden className="pointer-events-none relative h-0 w-full">
        <div ref={exitRef} className="absolute top-10 left-0 h-px w-px" />
        <div ref={enterRef} className="absolute top-20 left-0 h-px w-px" />
      </div>
      <header
        data-compact={compact ? "true" : "false"}
        className="group/hdr z-50 border-b border-white/8 bg-[#0b1210]/70 backdrop-blur-xl lg:sticky lg:top-0"
      >
        {children}
      </header>
    </>
  );
}
