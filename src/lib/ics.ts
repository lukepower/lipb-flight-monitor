import { LIPB } from "@/lib/constants";
import { formatLocalHm, formatLocalLong } from "@/lib/time";
import type { Movement, OccupiedBlock, VfrWindow } from "@/lib/occupancy";
import type { WeatherQuality } from "@/lib/weather";

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function fold(line: string): string {
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    chunks.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

export type WindowEvent = {
  window: VfrWindow;
  weatherNote?: string;
  quality?: WeatherQuality;
};

export function vfrWindowsIcs(
  events: WindowEvent[],
  origin: string,
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LIPB VFR Windows//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:LIPB VFR windows",
    "X-WR-TIMEZONE:Europe/Rome",
  ];
  for (const { window, weatherNote, quality } of events) {
    const title = `VFR hole ${formatLocalHm(window.start)}–${formatLocalHm(window.end)} LT (${window.durationMin} min)`;
    const desc = [
      `Times in this title are Bolzano local (Europe/Rome). Calendar DTSTART/DTEND are UTC.`,
      `Traffic-free VFR window at ${LIPB.nameEn} / ${LIPB.nameDe} (${LIPB.icao}).`,
      "ATZ free and Valle Adige sector free (scheduled IFR only).",
      weatherNote ? `Weather: ${weatherNote}` : "Weather: no TAF/model for this slot.",
      quality && quality !== "unknown" ? `Weather quality: ${quality}` : "",
      "Planning aid only — confirm with Bolzano AFIU 120.600, AIP and NOTAM.",
    ]
      .filter(Boolean)
      .join("\\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:vfr-${window.dateLocal}-${window.start.getTime()}@lipb-vfr`,
      `DTSTAMP:${utcStamp(new Date())}`,
      `DTSTART:${utcStamp(window.start)}`,
      `DTEND:${utcStamp(window.end)}`,
      `SUMMARY:${escapeText(title)}`,
      `DESCRIPTION:${escapeText(desc.replace(/\\n/g, "\n"))}`,
      `LOCATION:${escapeText(`${LIPB.nameEn} Airport (${LIPB.icao})`)}`,
      `URL:${origin}/`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export function ifrBusyIcs(
  movements: Movement[],
  atz: OccupiedBlock[],
  origin: string,
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LIPB VFR Windows//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:LIPB IFR movements",
    "X-WR-TIMEZONE:Europe/Rome",
  ];
  for (const m of movements) {
    const title = `${m.direction === "arrival" ? "ARR" : "DEP"} ${m.flightNumber} ${m.otherCity}`;
    const desc = `${m.flightNumber} ${m.direction} ${m.otherCity} (${m.otherAirport}) at ${formatLocalLong(m.at)} ${formatLocalHm(m.at)} local. Scheduled SkyAlps / extra movement.`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:ifr-${m.id}@lipb-vfr`,
      `DTSTAMP:${utcStamp(new Date())}`,
      `DTSTART:${utcStamp(m.at)}`,
      `DTEND:${utcStamp(new Date(m.at.getTime() + 15 * 60_000))}`,
      `SUMMARY:${escapeText(title)}`,
      `DESCRIPTION:${escapeText(desc)}`,
      `LOCATION:${escapeText(`${LIPB.nameEn} Airport (${LIPB.icao})`)}`,
      `URL:${origin}/`,
      "END:VEVENT",
    );
  }
  for (const block of atz) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:atz-${block.start.getTime()}@lipb-vfr`,
      `DTSTAMP:${utcStamp(new Date())}`,
      `DTSTART:${utcStamp(block.start)}`,
      `DTEND:${utcStamp(block.end)}`,
      `SUMMARY:${escapeText("LIPB ATZ closed to VFR (IFR in progress)")}`,
      `DESCRIPTION:${escapeText(
        `ATZ occupied by ${block.movements.map((m) => m.flightNumber).join(", ")}`,
      )}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

export function publicOrigin(request: Request): string {
  const host =
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "localhost:43147";
  const proto =
    host.includes("localhost") || host.startsWith("127.")
      ? "http"
      : request.headers.get("x-forwarded-proto") || "https";
  if (host.startsWith("http")) return host.replace(/\/$/, "");
  return `${proto}://${host}`;
}
