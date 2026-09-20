import * as SunCalcNS from "suncalc";
import { AIRPORT_CLOSE, AIRPORT_OPEN, LIPB } from "@/lib/constants";
import { addMinutes, fromZonedLocal } from "@/lib/time";

type SunCalcApi = {
  getTimes: (
    date: Date,
    latitude: number,
    longitude: number,
  ) => {
    sunrise: Date | null;
    sunset: Date | null;
    dawn: Date | null;
    dusk: Date | null;
  };
};

function sunCalc(): SunCalcApi {
  const mod = SunCalcNS as unknown as SunCalcApi & { default?: SunCalcApi };
  const api = typeof mod.getTimes === "function" ? mod : mod.default;
  if (!api?.getTimes) {
    throw new Error("suncalc getTimes is unavailable");
  }
  return api;
}

function requiredInstant(value: Date | null | undefined, label: string): Date {
  if (!value || Number.isNaN(value.getTime())) {
    throw new Error(`suncalc returned no ${label} at LIPB`);
  }
  return value;
}

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

export function sunTimes(date: Date, lat = LIPB.lat, lon = LIPB.lon) {
  const times = sunCalc().getTimes(date, lat, lon);
  return {
    sunrise: requiredInstant(times.sunrise, "sunrise"),
    sunset: requiredInstant(times.sunset, "sunset"),
    dawn: requiredInstant(times.dawn, "dawn"),
    dusk: requiredInstant(times.dusk, "dusk"),
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
