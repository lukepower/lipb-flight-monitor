import { daylightForDate } from "@/lib/daylight";
import {
  mergeOccupied,
  runwayWindows,
  securityCongestion,
  vfrWindowsForDay,
  type Movement,
  type OccupiedBlock,
  type VfrWindow,
} from "@/lib/occupancy";
import { fetchLiveOps, mergeMovements, type OpsBundle } from "@/lib/ops-flights";
import { HOLE_FLOOR } from "@/lib/constants";
import { eachDate, movementsOnDate, schedule } from "@/lib/schedule";
import {
  addLocalDays,
  formatLocalDate,
  formatLocalHm,
  formatLocalLong,
  todayLocalDate,
} from "@/lib/time";
import {
  fetchMetar,
  fetchModelForecast,
  fetchTaf,
  weatherForWindow,
  type DecodedWx,
  type MetarBundle,
  type ModelHour,
  type TafBundle,
  type WeatherQuality,
} from "@/lib/weather";

export type SerializedMovement = {
  id: string;
  flightNumber: string;
  direction: "arrival" | "departure";
  otherAirport: string;
  otherCity: string;
  atIso: string;
  atHm: string;
  dateLocal: string;
  note?: string;
  operator?: string;
  aircraft?: string;
  source?: Movement["source"];
  status?: Movement["status"];
  scheduledHm?: string;
};

export type SerializedInterval = {
  startIso: string;
  endIso: string;
  startHm: string;
  endHm: string;
};

export type WindowView = SerializedInterval & {
  dateLocal: string;
  durationMin: number;
  nearbyMovements: number;
  weatherSummary: string | null;
  weatherSource: string;
  quality: WeatherQuality;
  weather: DecodedWx | null;
};

export type DayBoard = {
  dateLocal: string;
  title: string;
  daylight: {
    vfrStartHm: string;
    vfrEndHm: string;
    sunriseHm: string;
    sunsetHm: string;
    vfrStartIso: string;
    vfrEndIso: string;
  };
  movements: SerializedMovement[];
  atz: (SerializedInterval & { flights: string[] })[];
  sector: (SerializedInterval & { flights: string[] })[];
  runway: (SerializedInterval & {
    direction: "arrival" | "departure";
    flight: string;
    eventIso: string;
    eventHm: string;
  })[];
  security: (SerializedInterval & { flights: string[] })[];
  windows: WindowView[];
};

function serMovement(m: Movement): SerializedMovement {
  const scheduledHm = m.scheduledAt ? formatLocalHm(m.scheduledAt) : undefined;
  const atHm = formatLocalHm(m.at);
  return {
    id: m.id,
    flightNumber: m.flightNumber,
    direction: m.direction,
    otherAirport: m.otherAirport,
    otherCity: m.otherCity,
    atIso: m.at.toISOString(),
    atHm,
    dateLocal: m.dateLocal,
    note: m.note,
    operator: m.operator,
    aircraft: m.aircraft,
    source: m.source,
    status: m.status,
    scheduledHm: scheduledHm && scheduledHm !== atHm ? scheduledHm : undefined,
  };
}

function serInterval(i: { start: Date; end: Date }): SerializedInterval {
  return {
    startIso: i.start.toISOString(),
    endIso: i.end.toISOString(),
    startHm: formatLocalHm(i.start),
    endHm: formatLocalHm(i.end),
  };
}

function serBlock(block: OccupiedBlock) {
  return {
    ...serInterval(block),
    flights: block.movements.map((m) => m.flightNumber),
  };
}

function serWindow(
  window: VfrWindow,
  taf: TafBundle,
  model: ModelHour[],
): WindowView {
  const wx = weatherForWindow(window.start, window.end, taf, model);
  return {
    ...serInterval(window),
    dateLocal: window.dateLocal,
    durationMin: window.durationMin,
    nearbyMovements: window.nearbyMovements,
    weatherSummary: wx.decoded?.summary ?? null,
    weatherSource: wx.source,
    quality: wx.quality,
    weather: wx.decoded,
  };
}

export function buildDayBoard(
  dateLocal: string,
  taf: TafBundle,
  model: ModelHour[],
  ops: Movement[] = [],
): DayBoard {
  const movements = mergeMovements(
    movementsOnDate(dateLocal),
    ops.filter((m) => m.dateLocal === dateLocal),
  );
  const day = daylightForDate(dateLocal);
  const windows = vfrWindowsForDay(dateLocal, movements, HOLE_FLOOR);
  return {
    dateLocal,
    title: formatLocalLong(day.vfrStart),
    daylight: {
      vfrStartHm: formatLocalHm(day.vfrStart),
      vfrEndHm: formatLocalHm(day.vfrEnd),
      sunriseHm: formatLocalHm(day.sunrise),
      sunsetHm: formatLocalHm(day.sunset),
      vfrStartIso: day.vfrStart.toISOString(),
      vfrEndIso: day.vfrEnd.toISOString(),
    },
    movements: movements.map(serMovement),
    atz: mergeOccupied(movements, "atz").map(serBlock),
    sector: mergeOccupied(movements, "sector").map(serBlock),
    runway: runwayWindows(movements).map((w) => ({
      ...serInterval(w),
      direction: w.direction,
      flight: w.movement.flightNumber,
      eventIso: w.event.toISOString(),
      eventHm: formatLocalHm(w.event),
    })),
    security: securityCongestion(movements).map((block) => ({
      ...serInterval(block),
      flights: block.movements.map((m) => m.flightNumber),
    })),
    windows: windows.map((w) => serWindow(w, taf, model)),
  };
}

export async function loadWeather() {
  const [metar, taf, model] = await Promise.all([
    fetchMetar(),
    fetchTaf(),
    fetchModelForecast(),
  ]);
  return { metar, taf, model };
}

export async function loadHangar(now = new Date()): Promise<{
  today: DayBoard;
  tomorrow: DayBoard;
  metar: MetarBundle;
  taf: TafBundle;
  ops: OpsBundle;
  generatedAt: string;
}> {
  const today = todayLocalDate(now);
  const tomorrow = addLocalDays(today, 1);
  const [{ metar, taf, model }, ops] = await Promise.all([
    loadWeather(),
    fetchLiveOps(now),
  ]);
  return {
    today: buildDayBoard(today, taf, model, ops.movements),
    tomorrow: buildDayBoard(tomorrow, taf, model, ops.movements),
    metar,
    taf,
    ops,
    generatedAt: now.toISOString(),
  };
}

export async function loadWeek(now = new Date()) {
  const start = todayLocalDate(now);
  const dates = Array.from({ length: 7 }, (_, i) => addLocalDays(start, i));
  const [{ metar, taf, model }, ops] = await Promise.all([
    loadWeather(),
    fetchLiveOps(now),
  ]);
  return {
    days: dates.map((d) => buildDayBoard(d, taf, model, ops.movements)),
    metar,
    taf,
    ops,
    generatedAt: now.toISOString(),
  };
}

export function movementsFromDays(days: DayBoard[]): Movement[] {
  return days.flatMap((day) =>
    day.movements.map((m) => ({
      id: m.id,
      flightNumber: m.flightNumber,
      direction: m.direction,
      otherAirport: m.otherAirport,
      otherCity: m.otherCity,
      at: new Date(m.atIso),
      dateLocal: m.dateLocal,
      note: m.note,
      operator: m.operator,
      aircraft: m.aircraft,
      source: m.source,
      status: m.status,
    })),
  );
}

export function loadSeason(now = new Date()) {
  const today = todayLocalDate(now);
  const from = today > schedule.season.from ? today : schedule.season.from;
  const to = schedule.season.to;
  const dates = eachDate(from, to);
  const movements = dates.flatMap(movementsOnDate);
  const windows = dates.flatMap((d) =>
    vfrWindowsForDay(d, movements, HOLE_FLOOR),
  );
  return {
    from,
    to,
    dates,
    windows: windows.map((w) => ({
      dateLocal: w.dateLocal,
      startIso: w.start.toISOString(),
      endIso: w.end.toISOString(),
      durationMin: w.durationMin,
      nearbyMovements: w.nearbyMovements,
    })),
    generatedAt: now.toISOString(),
  };
}

export function calendarWindows(days: DayBoard[]) {
  return days.flatMap((day) =>
    day.windows.map((w) => ({
      window: {
        start: new Date(w.startIso),
        end: new Date(w.endIso),
        dateLocal: w.dateLocal,
        durationMin: w.durationMin,
        nearbyMovements: w.nearbyMovements,
      },
      weatherNote:
        w.weatherSummary && w.weatherSource !== "none"
          ? `${w.weatherSource === "model" ? "Model (not TAF): " : "TAF: "}${w.weatherSummary}`
          : undefined,
      quality: w.quality,
    })),
  );
}

export { formatLocalDate };
