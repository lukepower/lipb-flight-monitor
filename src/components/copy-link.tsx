"use client";

import { useState } from "react";
import { CalendarPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HoleThreshold } from "@/lib/constants";

export function CopyLink({
  href,
  label,
  minMinutes,
}: {
  href: string;
  label: string;
  minMinutes?: HoleThreshold;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      className="h-9 rounded-full border-white/15 bg-white/5 px-3.5 text-[#f3efe4] hover:bg-white/10"
      onClick={async () => {
        const url = new URL(href, window.location.origin);
        if (href.includes("vfr-windows.ics") && minMinutes) {
          url.searchParams.set("min", String(minMinutes));
        }
        await navigator.clipboard.writeText(url.toString());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <CalendarPlus className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
