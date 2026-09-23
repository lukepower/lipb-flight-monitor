import { describe, expect, it } from "vitest";
import {
  chartsFromCmsItems,
  isSwllChartName,
  isSwllValidAt,
  pickSwllImageUrl,
  SWLL_VALIDITY_HALF_MS,
} from "@/lib/swll";

describe("isSwllChartName", () => {
  it("accepts CNMC fax ITALIA_SW charts", () => {
    expect(
      isSwllChartName(
        "MAPPE/CNMC_FAX_202609240000_ITALIA_SW@@@@@@_999100@@@@@@_000_000_@@@@.GIF",
      ),
    ).toBe(true);
  });

  it("rejects WAIY advisories and empty names", () => {
    expect(isSwllChartName("MAPPE/WAIY32CMET202609231523.jpg")).toBe(false);
    expect(isSwllChartName(null)).toBe(false);
    expect(isSwllChartName("")).toBe(false);
  });
});

describe("pickSwllImageUrl", () => {
  it("prefers Large webp then falls back to native", () => {
    const native =
      "https://cm.meteoam.it/native/chart.GIF?channelToken=x";
    const largeWebp =
      "https://cm.meteoam.it/Large/chart.GIF?format=webp&channelToken=x";
    expect(
      pickSwllImageUrl({
        fields: {
          native: { links: [{ href: native }] },
          renditions: [
            {
              name: "Large",
              formats: [
                { format: "jpg", links: [{ href: "https://x/jpg" }] },
                { format: "webp", links: [{ href: largeWebp }] },
              ],
            },
          ],
        },
      }),
    ).toEqual({ url: largeWebp, nativeUrl: native });

    expect(
      pickSwllImageUrl({
        fields: { native: { links: [{ href: native }] }, renditions: [] },
      }),
    ).toEqual({ url: native, nativeUrl: native });

    expect(pickSwllImageUrl({})).toBeNull();
  });
});

describe("chartsFromCmsItems", () => {
  it("filters, sorts newest-first, and caps length", () => {
    const charts = chartsFromCmsItems([
      {
        id: "old",
        name: "MAPPE/CNMC_FAX_202609230600_ITALIA_SW@@@@@@.GIF",
        fields: {
          forecastdate: { value: "2026-09-23T06:00:00.000+00:00" },
          native: { links: [{ href: "https://x/old.gif" }] },
        },
      },
      {
        id: "adv",
        name: "MAPPE/WAIY32CMET202609231523.jpg",
        fields: {
          date: { value: "2026-09-23T15:24:00.000+00:00" },
          native: { links: [{ href: "https://x/adv.jpg" }] },
        },
      },
      {
        id: "new",
        name: "MAPPE/CNMC_FAX_202609240000_ITALIA_SW@@@@@@.GIF",
        fields: {
          forecastdate: { value: "2026-09-24T00:00:00.000+00:00" },
          native: { links: [{ href: "https://x/new.gif" }] },
        },
      },
    ]);
    expect(charts.map((c) => c.id)).toEqual(["new", "old"]);
    expect(charts[0]?.url).toBe("https://x/new.gif");
  });
});

describe("isSwllValidAt", () => {
  it("is true within VT ±3 h", () => {
    const vt = new Date("2026-09-24T00:00:00.000Z");
    expect(isSwllValidAt(vt, new Date(vt.getTime() + SWLL_VALIDITY_HALF_MS))).toBe(
      true,
    );
    expect(
      isSwllValidAt(vt, new Date(vt.getTime() + SWLL_VALIDITY_HALF_MS + 1)),
    ).toBe(false);
  });
});
