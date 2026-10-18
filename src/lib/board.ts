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
import {
  summarizeExtraHistory,
  type ExtraTrafficSummary,
} from "@/lib/history";
import { eachDate, movementsOnDate, schedule } from "@/lib/schedule";
import {
  addLocalDays,
  formatLocalDate,
  formatLocalHm,
  formatLocalLong,
  fromZonedLocal,
  todayLocalDate,
} from "@/lib/time";
import {
  soundingForInstant,
  soundingHazardsForInterval,
  type SoundingHazard,
  type SoundingHour,
} from "@/lib/sounding";
import {
  fetchAlpineWind,
  type AlpineWindBundle,
} from "@/lib/alpine-wind";
import {
  fetchGaforRoutes,
  type GaforRoutesBundle,
} from "@/lib/gafor-routes";
import {
  fetchItalyGafor,
  type ItalyGaforBundle,
} from "@/lib/italy-gafor";
import { fetchRadar, type RadarBundle } from "@/lib/radar";
import { fetchSatellite, type SatelliteBundle } from "@/lib/satellite";
import { fetchAdvisories, type AdvisoryBundle } from "@/lib/sigmet";
import { fetchSwll, type SwllBundle } from "@/lib/swll";
import {
  fetchMetar,
  fetchModelForecast,
  fetchTaf,
  weatherForWindow,
  type DecodedWx,
  type MetarBundle,
  type ModelForecast,
  type ModelHour,
  type TafBundle,
  type WeatherQuality,
} from "@/lib/weather";
import { fetchWebcams, type WebcamBundle } from "@/lib/webcams";
import { fetchWaveRisk, type WaveRiskBundle } from "@/lib/wave-risk";
import {
  fetchFoehnPressureForecast,
  fetchIcon2iOmega,
  fetchLipbVerdictColumn,
  loadTurbulenceVerdict,
  type TurbulenceVerdict,
} from "@/lib/turbulence-verdict";
import {
  worstVerdictForWindow,
  type TurbulenceVerdictLevel,
  type VerdictTimelineSlot,
  type WindowTurbulenceCoverage,
} from "@/lib/turbulence-verdict-shared";

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
  sounding: SoundingHour | null;
  soundingHazards: SoundingHazard[];
  turbulenceLevel: TurbulenceVerdictLevel | null;
  turbulenceCoverage: WindowTurbulenceCoverage;
  turbulenceLabel: string | null;
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

function asModelForecast(model: ModelHour[] | ModelForecast): ModelForecast {
  if (Array.isArray(model)) return { hours: model, soundings: [] };
  return model;
}

function serWindow(
  window: VfrWindow,
  taf: TafBundle,
  model: ModelForecast,
  crest: { strong: boolean; hourIso: string | null } | null = null,
  timeline: VerdictTimelineSlot[] = [],
  now: Date = new Date(),
): WindowView {
  const wx = weatherForWindow(window.start, window.end, taf, model.hours);
  const mid = new Date((window.start.getTime() + window.end.getTime()) / 2);
  const sounding = soundingForInstant(mid, model.soundings);
  const hazards = soundingHazardsForInterval(
    window.start,
    window.end,
    model.soundings,
    {
      crestStrong: crest?.strong === true,
      crestRefIso: crest?.hourIso,
    },
  );
  // Ignore already-elapsed part of an in-progress hole when folding turbulence.
  const nowMs = now.getTime();
  const foldStart =
    nowMs > window.start.getTime() && nowMs < window.end.getTime()
      ? now
      : window.start;
  const turb = worstVerdictForWindow(foldStart, window.end, timeline);
  return {
    ...serInterval(window),
    dateLocal: window.dateLocal,
    durationMin: window.durationMin,
    nearbyMovements: window.nearbyMovements,
    weatherSummary: wx.decoded?.summary ?? null,
    weatherSource: wx.source,
    quality: wx.quality,
    weather: wx.decoded,
    sounding,
    soundingHazards: hazards,
    turbulenceLevel: turb.level,
    turbulenceCoverage: turb.coverage,
    turbulenceLabel: turb.label,
  };
}

export function buildDayBoard(
  dateLocal: string,
  taf: TafBundle,
  model: ModelHour[] | ModelForecast = [],
  ops: Movement[] = [],
  crest: { strong: boolean; hourIso: string | null } | null = null,
  turbulenceTimeline: VerdictTimelineSlot[] = [],
  now: Date = new Date(),
): DayBoard {
  const forecast = asModelForecast(model);
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
    windows: windows.map((w) =>
      serWindow(w, taf, forecast, crest, turbulenceTimeline, now),
    ),
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
  waveRisk: WaveRiskBundle;
  tomorrowWaveRisk: WaveRiskBundle;
  turbulenceVerdict: TurbulenceVerdict;
  tomorrowTurbulenceVerdict: TurbulenceVerdict;
  generatedAt: string;
}> {
  const today = todayLocalDate(now);
  const tomorrow = addLocalDays(today, 1);
  const tomorrowNoon = fromZonedLocal(tomorrow, "12:00");
  const alpineWind = await fetchAlpineWind(now);
  const [{ metar, taf, model }, ops, waveRisk, advisories] = await Promise.all([
    loadWeather(),
    fetchLiveOps(now),
    fetchWaveRisk(now, { alpine: alpineWind }),
    fetchAdvisories(now),
  ]);
  const [tomorrowWaveRisk, turbulenceVerdict, tomorrowTurbulenceVerdict] =
    await Promise.all([
      fetchWaveRisk(now, {
        alpine: alpineWind,
        targetTime: tomorrowNoon,
      }),
      loadTurbulenceVerdict({
        now,
        lipbCell: waveRisk.lipb,
        foehnObserved: metar.foehn ?? null,
        lipbMetarAgeMin: metar.decoded.ageMin,
        lowiMetarAgeMin: metar.lowiAgeMin,
        alpine: alpineWind,
        advisories: advisories.advisories,
        mode: "live",
      }),
      loadTurbulenceVerdict({
        now: tomorrowNoon,
        lipbCell: null,
        foehnObserved: null,
        alpine: alpineWind,
        advisories: advisories.advisories,
        mode: "forecast",
        dateLocal: tomorrow,
        forecastDays: 7,
        forecastSpanKind: "tomorrow",
        logScope: false,
      }),
    ]);
  const todayCrest = {
    strong: waveRisk.localCrestStrong,
    hourIso: waveRisk.hourIso,
  };
  const tomorrowCrest = {
    strong: tomorrowWaveRisk.localCrestStrong,
    hourIso: tomorrowWaveRisk.hourIso,
  };
  return {
    today: buildDayBoard(
      today,
      taf,
      model,
      ops.movements,
      todayCrest,
      turbulenceVerdict.timeline,
      now,
    ),
    tomorrow: buildDayBoard(
      tomorrow,
      taf,
      model,
      ops.movements,
      tomorrowCrest,
      tomorrowTurbulenceVerdict.timeline,
      now,
    ),
    metar,
    taf,
    ops,
    waveRisk,
    tomorrowWaveRisk,
    turbulenceVerdict,
    tomorrowTurbulenceVerdict,
    generatedAt: now.toISOString(),
  };
}

export async function loadSky(now = new Date()): Promise<{
  metar: MetarBundle;
  alpineWind: AlpineWindBundle;
  webcams: WebcamBundle;
  radar: RadarBundle;
  satellite: SatelliteBundle;
  waveRisk: WaveRiskBundle;
  turbulenceVerdict: TurbulenceVerdict;
  swll: SwllBundle;
  italyGafor: ItalyGaforBundle;
  gaforRoutes: GaforRoutesBundle;
  advisories: AdvisoryBundle;
  generatedAt: string;
}> {
  const alpineWind = await fetchAlpineWind(now);
  const [
    metar,
    webcams,
    radar,
    satellite,
    waveRisk,
    swll,
    italyGafor,
    gaforRoutes,
    advisories,
  ] = await Promise.all([
    fetchMetar(),
    fetchWebcams(now),
    fetchRadar(now),
    fetchSatellite(now),
    fetchWaveRisk(now, { alpine: alpineWind }),
    fetchSwll(now),
    fetchItalyGafor(now),
    fetchGaforRoutes(now),
    fetchAdvisories(now),
  ]);
  const turbulenceVerdict = await loadTurbulenceVerdict({
    now,
    lipbCell: waveRisk.lipb,
    foehnObserved: metar.foehn ?? null,
    lipbMetarAgeMin: metar.decoded.ageMin,
    lowiMetarAgeMin: metar.lowiAgeMin,
    alpine: alpineWind,
    advisories: advisories.advisories,
  });
  return {
    metar,
    alpineWind,
    webcams,
    radar,
    satellite,
    waveRisk,
    turbulenceVerdict,
    swll,
    italyGafor,
    gaforRoutes,
    advisories,
    generatedAt: now.toISOString(),
  };
}

export type WeekDayOverview = {
  dateLocal: string;
  title: string;
  daylightHm: string;
  holeCount: number;
  /** Current + future holes only; set for today. */
  holesRemaining: number | null;
  longestHoleMin: number;
  modelWxSummary: string | null;
  turbulenceLabel: string;
  turbulenceLevel: TurbulenceVerdictLevel | null;
  lowerConfidence: boolean;
};

export async function loadWeek(now = new Date()) {
  const start = todayLocalDate(now);
  const dates = Array.from({ length: 7 }, (_, i) => addLocalDays(start, i));
  const alpineWind = await fetchAlpineWind(now);
  const [{ taf, model }, ops, advisories] = await Promise.all([
    loadWeather(),
    fetchLiveOps(now),
    fetchAdvisories(now),
  ]);

  const [foehnForecast, column] = await Promise.all([
    fetchFoehnPressureForecast(7).catch(() => []),
    fetchLipbVerdictColumn(undefined, 7).catch(() => ({
      elevationM: 0,
      hours: [],
    })),
  ]);

  const windDirByHour = new Map<string, number | null>();
  for (const h of column.hours) {
    windDirByHour.set(h.atIso, h.ridgeWindDirDeg);
  }
  // ICON-2I ω horizon ~48 h — reuse for near days; empty map beyond.
  const omega = await fetchIcon2iOmega(windDirByHour).catch(() => ({
    byHour: new Map(),
  }));

  const dayVerdicts = await Promise.all(
    dates.map(async (dateLocal, i) => {
      const noon = fromZonedLocal(dateLocal, "12:00");
      return loadTurbulenceVerdict({
        now: noon,
        lipbCell: null,
        foehnObserved: null,
        alpine: alpineWind,
        advisories: advisories.advisories,
        mode: "forecast",
        dateLocal,
        forecastDays: 7,
        forecastSpanKind: "daylight",
        logScope: false,
        lipbHours: column.hours,
        foehnForecast,
        omegaByHour: i >= 2 ? new Map() : omega.byHour,
      });
    }),
  );

  const days = dates.map((d, i) =>
    buildDayBoard(
      d,
      taf,
      model,
      ops.movements,
      null,
      dayVerdicts[i]?.timeline ?? [],
      now,
    ),
  );

  const overview: WeekDayOverview[] = days.map((day, i) => {
    const windows = day.windows;
    const longest = windows.reduce(
      (m, w) => Math.max(m, w.durationMin),
      0,
    );
    const turb = dayVerdicts[i]!;
    const daylightWorst = worstVerdictForWindow(
      new Date(day.daylight.vfrStartIso),
      new Date(day.daylight.vfrEndIso),
      turb.timeline,
    );
    const midMs =
      (Date.parse(day.daylight.vfrStartIso) +
        Date.parse(day.daylight.vfrEndIso)) /
      2;
    const modelHour = model.hours.find((h) => {
      const t = h.at instanceof Date ? h.at.getTime() : Date.parse(String(h.at));
      return Number.isFinite(t) && Math.abs(t - midMs) < 3 * 60 * 60_000;
    });
    const isToday = i === 0;
    const holesRemaining = isToday
      ? windows.filter((w) => Date.parse(w.endIso) > now.getTime()).length
      : null;
    return {
      dateLocal: day.dateLocal,
      title: day.title,
      daylightHm: `${day.daylight.sunriseHm}–${day.daylight.sunsetHm}`,
      holeCount: windows.length,
      holesRemaining,
      longestHoleMin: longest,
      modelWxSummary:
        modelHour?.summary ?? day.windows[0]?.weatherSummary ?? null,
      turbulenceLabel: daylightWorst.label,
      turbulenceLevel: daylightWorst.level,
      lowerConfidence: i >= 2,
    };
  });

  return {
    days,
    overview,
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

export async function loadSeasonExtraHistory(
  now = new Date(),
): Promise<ExtraTrafficSummary> {
  return summarizeExtraHistory({
    now,
    scheduledForDate: (dateLocal) =>
      movementsOnDate(dateLocal).filter((m) => m.source === "timetable"),
  });
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
