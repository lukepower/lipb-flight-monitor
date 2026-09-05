import { AIRPORT_CLOSE, AIRPORT_OPEN, LIPB } from "@/lib/constants";
import { addMinutes, fromZonedLocal } from "@/lib/time";

export type DaylightWindow = {
  dateLocal: string;
  dawn: Date;
  dusk: Date;
  sunrise: Date;
  sunset: Date;
  airportOpen: Date;
  airportClose: Date;
  vfrStart: Date;
  vfrEnd: Date;
};

const DAY_MS = 86_400_000;
const J1970 = 2_440_588;
const J2000 = 2_451_545;
const RAD = Math.PI / 180;
const E = RAD * 23.4397;

function toJulian(date: Date): number {
  return date.valueOf() / DAY_MS - 0.5 + J1970;
}
function fromJulian(j: number): Date {
  return new Date((j + 0.5 - J1970) * DAY_MS);
}
function toDays(date: Date): number {
  return toJulian(date) - J2000;
}
function solarMeanAnomaly(d: number): number {
  return RAD * (357.5291 + 0.98560028 * d);
}
function eclipticLongitude(m: number): number {
  const c =
    RAD * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  return m + c + RAD * 102.9372 + Math.PI;
}
function declination(l: number): number {
  return Math.asin(Math.sin(l) * Math.cos(E));
}
function julianCycle(d: number, lw: number): number {
  return Math.round(d - 0.0009 - lw / (2 * Math.PI));
}
function approxTransit(ht: number, lw: number, n: number): number {
  return 0.0009 + (ht + lw) / (2 * Math.PI) + n;
}
function solarTransitJ(ds: number, m: number, l: number): number {
  return J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);
}
function hourAngle(h: number, phi: number, dec: number): number {
  return Math.acos(
    (Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)),
  );
}

function sunEvent(date: Date, lat: number, lon: number, angleDeg: number, rising: boolean): Date {
  const lw = RAD * -lon;
  const phi = RAD * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const m = solarMeanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = declination(l);
  const w = hourAngle(angleDeg * RAD, phi, dec);
  const a = approxTransit(rising ? -w : w, lw, n);
  return fromJulian(solarTransitJ(a, m, l));
}

export function sunTimes(date: Date, lat = LIPB.lat, lon = LIPB.lon) {
  return {
    sunrise: sunEvent(date, lat, lon, -0.833, true),
    sunset: sunEvent(date, lat, lon, -0.833, false),
    dawn: sunEvent(date, lat, lon, -6, true),
    dusk: sunEvent(date, lat, lon, -6, false),
  };
}

export function daylightForDate(dateLocal: string): DaylightWindow {
  const noon = fromZonedLocal(dateLocal, "12:00");
  const times = sunTimes(noon);
  const airportOpen = fromZonedLocal(
    dateLocal,
    `${String(AIRPORT_OPEN.hour).padStart(2, "0")}:${String(AIRPORT_OPEN.minute).padStart(2, "0")}`,
  );
  const airportClose = fromZonedLocal(
    dateLocal,
    `${String(AIRPORT_CLOSE.hour).padStart(2, "0")}:${String(AIRPORT_CLOSE.minute).padStart(2, "0")}`,
  );
  const vfrStart = times.dawn > airportOpen ? times.dawn : airportOpen;
  const vfrEnd = times.dusk < airportClose ? times.dusk : airportClose;
  return {
    dateLocal,
    dawn: times.dawn,
    dusk: times.dusk,
    sunrise: times.sunrise,
    sunset: times.sunset,
    airportOpen,
    airportClose,
    vfrStart,
    vfrEnd,
  };
}

export function expandDaylight(dateLocal: string, padMin = 0) {
  const day = daylightForDate(dateLocal);
  return {
    ...day,
    vfrStart: addMinutes(day.vfrStart, -padMin),
    vfrEnd: addMinutes(day.vfrEnd, padMin),
  };
}
