import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cn("panel p-4 md:p-6", className)}>{children}</section>;
}

export function SectionKicker({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-emerald-200/75 uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}
