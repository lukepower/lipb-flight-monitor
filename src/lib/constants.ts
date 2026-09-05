export const LIPB = {
  icao: "LIPB",
  iata: "BZO",
  nameEn: "Bolzano",
  nameDe: "Bozen",
  lat: 46.4603,
  lon: 11.3264,
  elevationM: 241,
  timezone: "Europe/Rome",
} as const;

export const OCCUPANCY = {
  arrivalSectorBeforeMin: 12,
  arrivalAtzBeforeMin: 8,
  arrivalAtzAfterMin: 5,
  departureAtzBeforeMin: 5,
  departureAtzAfterMin: 8,
  departureSectorAfterMin: 10,
} as const;

/** Per-movement runway strip on the hangar graph (not the AIP ATZ buffer). */
export const RUNWAY = {
  arrivalApproachMin: 15,
  departureSecurityMin: 15,
  eventBarMin: 2,
} as const;

export const MIN_WINDOW_MINUTES = 45;

export const AIRPORT_OPEN = { hour: 4, minute: 30 } as const;
export const AIRPORT_CLOSE = { hour: 22, minute: 0 } as const;

/** Bolzano ATZ + Valle Adige toward Trento */
export const OPENSKY_BBOX = {
  lamin: 45.95,
  lamax: 46.65,
  lomin: 10.95,
  lomax: 11.55,
} as const;

export const AFIU_FREQ = "120.600";
export const CAT_VFR_MIN_VIS_KM = 5;
