import type { TafBundle } from "@/lib/weather";
import { formatLocalHm } from "@/lib/time";

export function TafStrip({ taf }: { taf: TafBundle }) {
  if (taf.error || !taf.periods.length) {
    return (
      <section className="rounded-2xl border border-white/10 bg-[#13201c] p-4">
        <h2 className="text-sm font-semibold tracking-wide text-emerald-200/90 uppercase">
          LIPB TAF
        </h2>
        <p className="mt-2 text-sm text-[#d7d2c4]/80">
          {taf.error ?? "No TAF periods decoded."}
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-white/10 bg-[#13201c] p-4 md:p-5">
      <h2 className="text-sm font-semibold tracking-wide text-emerald-200/90 uppercase">
        LIPB TAF
        {taf.validFrom && taf.validTo
          ? ` · ${formatLocalHm(taf.validFrom)}–${formatLocalHm(taf.validTo)}`
          : ""}
      </h2>
      <p className="mt-3 font-mono text-xs leading-relaxed text-[#d7d2c4]/80 md:text-sm">
        {taf.raw}
      </p>
      <ol className="mt-4 grid gap-2 md:grid-cols-2">
        {taf.periods.map((p, i) => (
          <li
            key={`${p.start?.toISOString() ?? i}-${p.change ?? "base"}`}
            className={`rounded-xl px-3 py-2 ${
              p.prevailing ? "bg-black/25" : "bg-amber-400/10 ring-1 ring-amber-300/30"
            }`}
          >
            <p className="text-xs tracking-wide text-[#d7d2c4]/60 uppercase">
              {p.change ?? "Base"}
              {p.probability ? ` ${p.probability}%` : ""}{" "}
              {p.start && p.end
                ? `${formatLocalHm(p.start)}–${formatLocalHm(p.end)}`
                : ""}
            </p>
            <p className="mt-1 text-sm text-[#f3efe4]">{p.summary}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
