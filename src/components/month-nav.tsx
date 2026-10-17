import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

const btn =
  "inline-flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-[#f3efe4]/85 transition hover:bg-white/8";
const disabledBtn =
  "inline-flex shrink-0 items-center gap-1 rounded-full border border-white/5 px-3 py-1.5 text-sm text-[#f3efe4]/35";

export function MonthNav({
  title,
  prevHref,
  nextHref,
  canPrev,
  canNext,
}: {
  title: string;
  prevHref: string;
  nextHref: string;
  canPrev: boolean;
  canNext: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {canPrev ? (
        <Link href={prevHref} className={btn}>
          <ChevronLeft className="size-3.5" />
          Earlier
        </Link>
      ) : (
        <span className={disabledBtn} aria-disabled="true">
          <ChevronLeft className="size-3.5" />
          Earlier
        </span>
      )}
      <h2 className="whitespace-nowrap font-serif text-xl tracking-tight text-[#f6f1e6] sm:text-2xl">
        {title}
      </h2>
      {canNext ? (
        <Link href={nextHref} className={btn}>
          Later
          <ChevronRight className="size-3.5" />
        </Link>
      ) : (
        <span className={disabledBtn} aria-disabled="true">
          Later
          <ChevronRight className="size-3.5" />
        </span>
      )}
    </div>
  );
}
