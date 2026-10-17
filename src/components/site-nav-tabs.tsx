"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarRange,
  Clock,
  CloudSun,
  History,
  SunMedium,
  Sunrise,
  type LucideIcon,
} from "lucide-react";
import type { HoleThreshold } from "@/lib/constants";

const PATHS = {
  today: "/",
  tomorrow: "/tomorrow",
  week: "/week",
  sky: "/sky",
  history: "/history",
  season: "/season",
  timetable: "/timetable",
} as const;

export type SiteNavActive = keyof typeof PATHS;

const LINKS: {
  href: string;
  id: SiteNavActive;
  label: string;
  icon: LucideIcon;
}[] = [
  { href: PATHS.today, id: "today", label: "Today", icon: Clock },
  { href: PATHS.tomorrow, id: "tomorrow", label: "Tomorrow", icon: Sunrise },
  { href: PATHS.week, id: "week", label: "Week", icon: CalendarRange },
  { href: PATHS.sky, id: "sky", label: "Sky", icon: CloudSun },
  { href: PATHS.history, id: "history", label: "History", icon: History },
  { href: PATHS.season, id: "season", label: "Season", icon: SunMedium },
  { href: PATHS.timetable, id: "timetable", label: "Timetable", icon: BookOpen },
];

export function SiteNavTabs({
  active,
  minMinutes,
}: {
  active: SiteNavActive;
  minMinutes: HoleThreshold;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [fade, setFade] = useState({ left: false, right: false });

  const updateFade = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const max = scrollWidth - clientWidth;
    setFade({
      left: scrollLeft > 2,
      right: max > 2 && scrollLeft < max - 2,
    });
  }, []);

  const scrollActiveIntoView = useCallback(() => {
    const container = stripRef.current;
    const el = linkRefs.current.get(active);
    if (!container || !el) return;
    const contRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const left =
      container.scrollLeft +
      (elRect.left - contRect.left) -
      (contRect.width - elRect.width) / 2;
    container.scrollTo({ left: Math.max(0, left), behavior: "instant" });
    updateFade();
  }, [active, updateFade]);

  useEffect(() => {
    scrollActiveIntoView();
  }, [scrollActiveIntoView]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    updateFade();
    el.addEventListener("scroll", updateFade, { passive: true });
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateFade);
      ro.disconnect();
    };
  }, [updateFade]);

  const maskImage =
    fade.left && fade.right
      ? "linear-gradient(to right, transparent, black 12px, black calc(100% - 12px), transparent)"
      : fade.left
        ? "linear-gradient(to right, transparent, black 12px, black 100%)"
        : fade.right
          ? "linear-gradient(to right, black 0%, black calc(100% - 12px), transparent)"
          : undefined;

  return (
    <div
      ref={stripRef}
      className="site-nav-tabs relative flex min-w-0 flex-1 overflow-x-auto rounded-full border border-white/10 bg-black/25 p-1 md:flex-none"
      style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
    >
      {LINKS.map((link) => {
        const Icon = link.icon;
        const on = active === link.id;
        return (
          <Link
            key={link.id}
            ref={(node) => {
              if (node) linkRefs.current.set(link.id, node);
              else linkRefs.current.delete(link.id);
            }}
            href={`${link.href}?min=${minMinutes}`}
            aria-current={on ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ${
              on
                ? "bg-emerald-300 text-[#10211c] shadow-[0_0_24px_oklch(0.86_0.14_155/0.35)]"
                : "text-[#f3efe4]/80 hover:bg-white/8 hover:text-[#f6f1e6]"
            }`}
          >
            <Icon className="size-3.5" />
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
