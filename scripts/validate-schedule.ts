import { schedule } from "../src/lib/schedule";

let errors = 0;

function fail(message: string) {
  errors += 1;
  console.error(message);
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

if (errors) {
  process.exit(1);
}
console.log(
  `ok: ${schedule.movements.length} day movements (${schedule.season.from} → ${schedule.season.to})`,
);
