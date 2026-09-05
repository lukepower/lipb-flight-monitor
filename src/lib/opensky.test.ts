import { describe, expect, it } from "vitest";
import { inLiveBox, mapAdsbLol } from "@/lib/opensky";

describe("live ADS-B mapping", () => {
  it("keeps a low aircraft inside the Valle Adige box", () => {
    const tracks = mapAdsbLol([
      {
        hex: "abc123",
        flight: "SWU1906 ",
        lat: 46.46,
        lon: 11.33,
        alt_baro: 4500,
        gs: 180,
      },
    ]);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].callsign).toBe("SWU1906");
    expect(tracks[0].altitudeFt).toBe(4500);
  });

  it("drops high overflights and positions outside the box", () => {
    const tracks = mapAdsbLol([
      {
        hex: "high",
        flight: "DLH1",
        lat: 46.46,
        lon: 11.33,
        alt_baro: 34000,
        gs: 430,
      },
      {
        hex: "west",
        flight: "EZY2",
        lat: 46.17,
        lon: 10.57,
        alt_baro: 8000,
        gs: 220,
      },
      { hex: "gnd", flight: "NJE1", lat: 46.46, lon: 11.33, alt_baro: "ground", gs: 0 },
    ]);
    expect(tracks.map((t) => t.callsign)).toEqual(["NJE1"]);
    expect(tracks[0].onGround).toBe(true);
  });

  it("knows the LIPB box bounds", () => {
    expect(inLiveBox(46.46, 11.33)).toBe(true);
    expect(inLiveBox(45.0, 11.33)).toBe(false);
  });
});
