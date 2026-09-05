"use client";

import { HoleThresholdProvider } from "@/components/hole-threshold";

export function Providers({ children }: { children: React.ReactNode }) {
  return <HoleThresholdProvider>{children}</HoleThresholdProvider>;
}
