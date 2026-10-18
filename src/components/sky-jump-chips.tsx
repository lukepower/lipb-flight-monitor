"use client";

const CHIPS = [
  { id: "sky-turbulence", label: "Turbulence" },
  { id: "sky-wind", label: "Wind" },
  { id: "sky-swll", label: "SWLL" },
  { id: "sky-gafor", label: "GAFOR" },
  { id: "sky-sigmet", label: "SIGMET" },
  { id: "sky-radar", label: "Radar" },
  { id: "sky-webcams", label: "Webcams" },
] as const;

export function SkyJumpChips() {
  return (
    <nav
      aria-label="Sky sections"
      className="sticky top-0 z-20 -mx-4 flex gap-1.5 overflow-x-auto px-4 py-2 md:static md:mx-0 md:px-0 [mask-image:linear-gradient(90deg,#000_85%,transparent)] md:[mask-image:none]"
    >
      {CHIPS.map((chip) => (
        <a
          key={chip.id}
          href={`#${chip.id}`}
          className="shrink-0 rounded-full border border-white/12 bg-black/40 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-emerald-100/90 uppercase backdrop-blur-sm hover:bg-white/10"
          onClick={(e) => {
            e.preventDefault();
            document
              .getElementById(chip.id)
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          {chip.label}
        </a>
      ))}
    </nav>
  );
}
