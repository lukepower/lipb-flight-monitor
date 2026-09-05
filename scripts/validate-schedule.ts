import { schedule } from "../src/lib/schedule";

let errors = 0;

function fail(message: string) {
  errors += 1;
  console.error(message);
}

for (const pair of schedule.flights) {
  if (!pair.id) fail("missing id");
  if (!pair.days.length) fail(`${pair.id}: no days`);
  if (pair.validFrom > pair.validTo) fail(`${pair.id}: validFrom after validTo`);
  for (const leg of [pair.departure, pair.arrival]) {
    if (!/^\d{2}:\d{2}$/.test(leg.timeLocal)) {
      fail(`${pair.id}: bad time ${leg.timeLocal}`);
    }
    if (!/^BQ\d{4}$/.test(leg.flightNumber)) {
      fail(`${pair.id}: unexpected flight number ${leg.flightNumber}`);
    }
  }
}

if (errors) {
  process.exit(1);
}
console.log(`ok: ${schedule.flights.length} pairs`);
