import { schedule } from "../src/lib/schedule";
import {
  listOfficialMonths,
  loadOfficialMonth,
  type OfficialMonthFile,
} from "../src/lib/official-schedule";

let errors = 0;
let warnings = 0;

function fail(message: string) {
  errors += 1;
  console.error(message);
}

function warn(message: string) {
  warnings += 1;
  console.warn(`warning: ${message}`);
}

if (!schedule.source) fail("missing source");
if (!schedule.timezone) fail("missing timezone");
if (!schedule.season?.from || !schedule.season?.to) fail("missing season range");
if (schedule.season.from > schedule.season.to) {
  fail("season.from after season.to");
}
if (!Array.isArray(schedule.movements) || schedule.movements.length === 0) {
  fail("no movements");
}

const kinds = new Set(["scheduled", "ferry", "charter"]);
const seen = new Set<string>();

for (const m of schedule.movements) {
  if (!m.id) fail("missing id");
  else if (seen.has(m.id)) fail(`duplicate id ${m.id}`);
  else seen.add(m.id);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.dateLocal)) {
    fail(`${m.id}: bad dateLocal ${m.dateLocal}`);
  }
  if (m.dateLocal < schedule.season.from || m.dateLocal > schedule.season.to) {
    fail(`${m.id}: dateLocal outside season`);
  }
  if (!/^\d{2}:\d{2}$/.test(m.timeLocal)) {
    fail(`${m.id}: bad time ${m.timeLocal}`);
  }
  if (!/^(BN|BQ)\d{3,4}$/.test(m.flightNumber)) {
    fail(`${m.id}: unexpected flight number ${m.flightNumber}`);
  }
  if (m.direction !== "arrival" && m.direction !== "departure") {
    fail(`${m.id}: bad direction ${m.direction}`);
  }
  if (!/^[A-Z]{3}$/.test(m.otherAirport)) {
    fail(`${m.id}: bad airport ${m.otherAirport}`);
  }
  if (!m.otherCity) fail(`${m.id}: missing otherCity`);
  if (!kinds.has(m.kind)) fail(`${m.id}: bad kind ${m.kind}`);
}

function validateOfficialMonth(file: OfficialMonthFile) {
  if (!file.source) fail(`official ${file.month}: missing source`);
  if (file.timezone !== "Europe/Rome") {
    fail(`official ${file.month}: unexpected timezone ${file.timezone}`);
  }
  if (!file.from || !file.to || file.from > file.to) {
    fail(`official ${file.month}: bad from/to`);
  }
  if (!Array.isArray(file.movements) || file.movements.length === 0) {
    fail(`official ${file.month}: no movements`);
  }

  const seenOfficial = new Set<string>();
  for (const m of file.movements) {
    if (!m.id) fail(`official ${file.month}: missing id`);
    else if (seenOfficial.has(m.id)) {
      fail(`official ${file.month}: duplicate id ${m.id}`);
    } else seenOfficial.add(m.id);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.dateLocal)) {
      fail(`${m.id}: bad dateLocal ${m.dateLocal}`);
    }
    if (m.dateLocal < file.from || m.dateLocal > file.to) {
      fail(`${m.id}: dateLocal outside month range`);
    }
    if (!m.dateLocal.startsWith(file.month)) {
      fail(`${m.id}: dateLocal not in month ${file.month}`);
    }
    if (!/^\d{2}:\d{2}$/.test(m.timeLocal)) {
      fail(`${m.id}: bad time ${m.timeLocal}`);
    }
    if (!/^BQ\d{3,4}$/.test(m.flightNumber)) {
      fail(`${m.id}: unexpected flight number ${m.flightNumber}`);
    }
    if (m.direction !== "arrival" && m.direction !== "departure") {
      fail(`${m.id}: bad direction ${m.direction}`);
    }
    if (!/^[A-Z]{3}$/.test(m.otherAirport)) {
      fail(`${m.id}: bad airport ${m.otherAirport}`);
    }
    if (!m.otherCity) fail(`${m.id}: missing otherCity`);
  }

  // Diff scheduled programmazione legs on overlapping dates (warnings only).
  const programmed = schedule.movements.filter(
    (m) =>
      m.kind === "scheduled" &&
      m.dateLocal >= file.from &&
      m.dateLocal <= file.to,
  );
  const key = (m: {
    flightNumber: string;
    direction: string;
    otherAirport: string;
    timeLocal: string;
    dateLocal: string;
  }) =>
    `${m.dateLocal}|${m.flightNumber}|${m.direction}|${m.otherAirport}|${m.timeLocal}`;

  const officialKeys = new Set(file.movements.map(key));
  const programmedKeys = new Set(programmed.map(key));

  let onlyOfficial = 0;
  let onlyProgrammed = 0;
  for (const k of officialKeys) {
    if (!programmedKeys.has(k)) onlyOfficial += 1;
  }
  for (const k of programmedKeys) {
    if (!officialKeys.has(k)) onlyProgrammed += 1;
  }

  if (onlyOfficial || onlyProgrammed) {
    warn(
      `official ${file.month}: differs from programmazione (official-only ${onlyOfficial}, programmed-only ${onlyProgrammed})`,
    );
  } else {
    console.log(
      `ok: official ${file.month} matches programmazione (${file.movements.length} scheduled legs)`,
    );
  }
}

const officialMonths = listOfficialMonths();
for (const month of officialMonths) {
  const file = loadOfficialMonth(month);
  if (!file) {
    fail(`official ${month}: could not load`);
    continue;
  }
  validateOfficialMonth(file);
}

if (errors) {
  process.exit(1);
}
console.log(
  `ok: ${schedule.movements.length} day movements (${schedule.season.from} → ${schedule.season.to})`,
);
if (officialMonths.length) {
  console.log(`ok: ${officialMonths.length} official month file(s)`);
}
if (warnings) {
  console.log(`ok with ${warnings} warning(s)`);
}
