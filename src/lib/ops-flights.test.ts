import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fromZonedLocal } from "@/lib/time";
import {
  canonicalIdent,
  displayIdent,
  isLiveMovement,
  mergeMovements,
  operatorFor,
  parseFaClock,
  parseFlightAwareMarkdown,
} from "@/lib/ops-flights";
import type { Movement } from "@/lib/occupancy";

const saturday = fromZonedLocal("2026-09-05", "13:30");
const sunday = fromZonedLocal("2026-09-06", "09:00");

const sample = readFileSync(
  resolve(process.cwd(), "data/ops-sample.md"),
  "utf8",
);

function sched(
  flightNumber: string,
  direction: Movement["direction"],
  dateLocal: string,
  time: string,
  otherAirport = "OLB",
  otherCity = "Olbia",
): Movement {
  return {
    id: `${flightNumber}-${direction}-${dateLocal}`,
    flightNumber,
    direction,
    otherAirport,
    otherCity,
    at: fromZonedLocal(dateLocal, time),
    dateLocal,
    source: "timetable",
  };
}

describe("FlightAware clock", () => {
  it("parses 12-hour CEST and italic estimates", () => {
    expect(parseFaClock("07:14a CEST")?.hm).toBe("07:14");
    expect(parseFaClock("02:37p CEST")?.hm).toBe("14:37");
    expect(parseFaClock("_03:00p CEST_")?.hm).toBe("15:00");
    expect(parseFaClock("_03:00p CEST_")?.estimated).toBe(true);
    expect(parseFaClock("Sat 07:14AM CEST")?.hm).toBe("07:14");
    expect(
      parseFaClock(
        "_09:55AM CEST ([?](http://www.flightaware.com/about/faq.rvt#flightresultunknown))_",
      )?.hm,
    ).toBe("09:55");
  });
});

describe("canonical idents", () => {
  it("maps SkyAlps and Georgian operator codes", () => {
    expect(canonicalIdent("SWU1906")).toBe("BQ1906");
    expect(canonicalIdent("BQ1906")).toBe("BQ1906");
    expect(canonicalIdent("TGZ1777")).toBe("A91777");
  });

  it("uses the same mapping for display and names known operators", () => {
    expect(displayIdent("SWU1906")).toBe("BQ1906");
    expect(operatorFor("BQ1906")).toBe("SkyAlps");
    expect(operatorFor("NJE123A")).toBe("NetJets");
    expect(operatorFor("XXXX")).toBeUndefined();
  });
});

describe("parseFlightAwareMarkdown", () => {
  const movements = parseFlightAwareMarkdown(sample, saturday);

  it("keeps IFR, charter and state and drops local circuits", () => {
    const idents = movements.map((m) => m.flightNumber);
    expect(idents).toContain("BQ1906");
    expect(idents).toContain("BQ1938");
    expect(idents).toContain("A91777");
    expect(idents).toContain("GDK56R");
    expect(idents).toContain("NJE935C");
    expect(idents).toContain("TJD265");
    expect(idents).toContain("NJE334P");
    expect(idents).toContain("JFA97Z");
    expect(idents).toContain("IAM9001");
    expect(idents).toContain("BN2110");
    expect(idents.some((id) => id.includes("FIAMM"))).toBe(false);
    expect(idents.some((id) => id.includes("VOLP"))).toBe(false);
    expect(idents).not.toContain("I-HDOL");
    expect(idents).not.toContain("I-KIRK");
    expect(idents).not.toContain("D-EJCI");
  });

  it("uses the LIPB column and history date", () => {
    const olbia = movements.find(
      (m) => m.flightNumber === "BQ1906" && m.direction === "departure",
    );
    expect(olbia?.dateLocal).toBe("2026-09-05");
    expect(olbia?.at.getTime()).toBe(fromZonedLocal("2026-09-05", "07:14").getTime());
    expect(olbia?.operator).toBe("SkyAlps");
    expect(olbia?.aircraft).toBe("DH8D");

    const jetfly = movements.find((m) => m.flightNumber === "JFA97Z");
    expect(jetfly?.dateLocal).toBe("2026-09-06");
    expect(jetfly?.direction).toBe("departure");
  });

  it("treats Georgian outbound to an ADS-B gap as a real IFR movement", () => {
    const geo = movements.find(
      (m) => m.flightNumber === "A91777" && m.direction === "departure",
    );
    expect(geo?.otherCity).toMatch(/Zonguldak/i);
    expect(geo?.aircraft).toBe("GLEX");
  });
});

describe("mergeMovements", () => {
  it("lets ops time win on the same SkyAlps flight and adds charters", () => {
    const timetable = [
      sched("BQ1906", "departure", "2026-09-05", "07:00"),
      sched("BQ2344", "departure", "2026-09-05", "07:55", "PVK", "Preveza"),
      sched("BQ1907", "arrival", "2026-09-05", "10:50"),
    ];
    const ops = parseFlightAwareMarkdown(sample, saturday);
    const merged = mergeMovements(timetable, ops);
    const olbia = merged.find((m) => m.flightNumber === "BQ1906");
    expect(olbia?.at.getTime()).toBe(fromZonedLocal("2026-09-05", "07:14").getTime());
    expect(olbia?.scheduledAt?.getTime()).toBe(
      fromZonedLocal("2026-09-05", "07:00").getTime(),
    );
    const preveza = merged.find(
      (m) => m.direction === "departure" && m.otherAirport === "PVK",
    );
    expect(preveza?.flightNumber).toBe("BQ1938");
    expect(merged.some((m) => m.flightNumber === "GDK56R")).toBe(true);
    expect(merged.some((m) => m.flightNumber === "TJD265")).toBe(true);
    expect(merged.some((m) => m.flightNumber === "BN2110")).toBe(true);
  });
});

describe("LIVE badge", () => {
  const movements = parseFlightAwareMarkdown(sample, saturday);

  it("keeps a same-day airborne arrival live, and drops it the next morning", () => {
    const airborne = movements.find((m) => m.flightNumber === "NJE440A");
    expect(airborne?.dateLocal).toBe("2026-09-05");
    expect(airborne?.status).toBe("enroute");
    expect(isLiveMovement(airborne!, saturday)).toBe(true);
    expect(isLiveMovement(airborne!, sunday)).toBe(false);
  });

  it("does not call a later day's En Route row live, even with a firm clock", () => {
    const sundayArr = movements.find((m) => m.flightNumber === "BQ1911");
    expect(sundayArr?.dateLocal).toBe("2026-09-06");
    expect(sundayArr?.status).toBe("scheduled");
    expect(isLiveMovement(sundayArr!, saturday)).toBe(false);
    expect(isLiveMovement(sundayArr!, sunday)).toBe(false);

    const jetfly = movements.find((m) => m.flightNumber === "JFA97Z");
    expect(jetfly?.dateLocal).toBe("2026-09-06");
    expect(isLiveMovement(jetfly!, saturday)).toBe(false);
  });

  it("does not treat italic En Route estimates as live", () => {
    const bn = movements.find((m) => m.flightNumber === "BN2110");
    expect(bn?.status).toBe("estimated");
    expect(isLiveMovement(bn!, saturday)).toBe(false);
    const sky = movements.find((m) => m.flightNumber === "BQ1905");
    expect(sky?.status).toBe("estimated");
    expect(isLiveMovement(sky!, saturday)).toBe(false);
  });
});
