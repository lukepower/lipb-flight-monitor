"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyLink({ href, label }: { href: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const url = new URL(href, window.location.origin).toString();
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}
