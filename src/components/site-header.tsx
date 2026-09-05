import Link from "next/link";
import { AFIU_FREQ, LIPB } from "@/lib/constants";
import { CopyLink } from "@/components/copy-link";

export function SiteHeader({
  active,
}: {
  active: "today" | "week" | "season";
}) {
  const links = [
    { href: "/", id: "today" as const, label: "Today" },
    { href: "/week", id: "week" as const, label: "Week" },
    { href: "/season", id: "season" as const, label: "Season" },
  ];
  return (
    <header className="border-b border-white/10 bg-[#0c1412]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium tracking-[0.2em] text-emerald-300/80 uppercase">
            Hangar board · {LIPB.icao} / {LIPB.iata}
          </p>
          <h1 className="mt-1 font-serif text-3xl tracking-tight text-[#f3efe4] md:text-4xl">
            {LIPB.nameEn} / {LIPB.nameDe}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[#d7d2c4]/80">
            Scheduled IFR holes for VFR. Confirm with AFIU {AFIU_FREQ}. Night VFR
            is not allowed.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          {links.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                active === link.id
                  ? "bg-emerald-300 text-[#10211c]"
                  : "bg-white/5 text-[#f3efe4] hover:bg-white/10"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <CopyLink href="/api/calendar/vfr-windows.ics" label="Subscribe .ics" />
        </nav>
      </div>
    </header>
  );
}
