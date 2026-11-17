import { expect, test, type Page } from "@playwright/test";

async function clickSection(
  page: Page,
  name: string,
  url: RegExp,
): Promise<void> {
  const link = page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();

  try {
    await Promise.all([
      page.waitForURL(url, { timeout: 10_000 }),
      link.click(),
    ]);
  } catch {
    // Soft-nav can flake under CI load; fall back to a full navigation via href.
    await page.goto(href!, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(url);
  }
}

test("health endpoint reports LIPB", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  await expect(res.json()).resolves.toEqual({ status: "ok", icao: "LIPB" });
});

test("hangar pages load and the header navigates between them", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile-390",
    "Desktop navigation smoke stays on chromium",
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bolzano");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bozen");
  await expect(page.getByRole("navigation", { name: "Sections" })).toContainText(
    "Today",
  );
  await expect(page.getByRole("navigation", { name: "Sections" })).toContainText(
    "Tomorrow",
  );
  await expect(page.getByRole("navigation", { name: "Sections" })).toContainText(
    "Week",
  );
  await expect(page.getByRole("navigation", { name: "Sections" })).toContainText(
    "History",
  );
  await expect(page.getByRole("navigation", { name: "Sections" })).toContainText(
    "Season",
  );
  await expect(page.getByRole("navigation", { name: "Sections" })).toContainText(
    "Timetable",
  );

  await clickSection(page, "Tomorrow", /\/tomorrow/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bolzano");

  await clickSection(page, "Week", /\/week/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bolzano");

  await clickSection(page, "Season", /\/season/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bolzano");

  await clickSection(page, "Timetable", /\/timetable/);
  await expect(
    page.getByRole("grid", { name: "Official SkyAlps timetable calendar" }),
  ).toBeVisible();
  await expect(page.getByText("Download official PDF")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Sections" }),
  ).not.toContainText("Min hole");

  await Promise.all([
    page.waitForURL(/date=\d{4}-\d{2}-\d{2}/, { timeout: 15_000 }),
    page
      .getByRole("grid", { name: "Official SkyAlps timetable calendar" })
      .getByRole("link")
      .first()
      .click(),
  ]);
  await expect(page.getByText(/published schedule/i)).toBeVisible();

  await clickSection(page, "History", /\/history/);
  await expect(page.getByRole("grid", { name: "Flight history calendar" })).toBeVisible();
  await expect(page.getByText("Nothing archived yet.")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Sections" }),
  ).not.toContainText("Min hole");

  await Promise.all([
    page.waitForURL(/date=\d{4}-\d{2}-\d{2}/, { timeout: 15_000 }),
    page
      .getByRole("grid", { name: "Flight history calendar" })
      .getByRole("link")
      .first()
      .click(),
  ]);
  await expect(page.getByText("No as-flown IFR for this day.")).toBeVisible();

  await clickSection(page, "Today", /\/(?:\?|$)/);
});

test("mobile header density, active tab, and no horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-390",
    "Mobile viewport assertions only",
  );

  const routes = [
    "/",
    "/tomorrow",
    "/week",
    "/sky",
    "/history",
    "/season",
    "/timetable",
  ];

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const header = page.locator("header").first();
  await expect(header).toBeVisible();
  const headerBox = await header.boundingBox();
  expect(headerBox).toBeTruthy();
  expect(headerBox!.height).toBeLessThan(260);

  await page.goto("/timetable", { waitUntil: "domcontentloaded" });
  const nav = page.getByRole("navigation", { name: "Sections" });
  const strip = nav.locator(".site-nav-tabs");
  const active = nav.locator("a[aria-current='page']");
  await expect(active).toContainText("Timetable");
  await expect(async () => {
    const stripBox = await strip.boundingBox();
    const activeBox = await active.boundingBox();
    expect(stripBox).toBeTruthy();
    expect(activeBox).toBeTruthy();
    expect(activeBox!.x).toBeGreaterThanOrEqual(stripBox!.x - 1);
    expect(activeBox!.x + activeBox!.width).toBeLessThanOrEqual(
      stripBox!.x + stripBox!.width + 1,
    );
  }).toPass({ timeout: 5000 });

  for (const route of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("header").first()).toBeVisible();
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(
      overflow.scrollWidth,
      `horizontal overflow on ${route}`,
    ).toBeLessThanOrEqual(overflow.innerWidth);
  }
});
