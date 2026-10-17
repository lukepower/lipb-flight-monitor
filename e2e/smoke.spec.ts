import { expect, test } from "@playwright/test";

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

  await page.goto("/");
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

  await page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name: "Tomorrow" })
    .click();
  await expect(page).toHaveURL(/\/tomorrow/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bolzano");

  await page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name: "Week" })
    .click();
  await expect(page).toHaveURL(/\/week/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bolzano");

  await page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name: "Season" })
    .click();
  await expect(page).toHaveURL(/\/season/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bolzano");

  await page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name: "Timetable" })
    .click();
  await expect(page).toHaveURL(/\/timetable/);
  await expect(
    page.getByRole("grid", { name: "Official SkyAlps timetable calendar" }),
  ).toBeVisible();
  await expect(page.getByText("Download official PDF")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Sections" }),
  ).not.toContainText("Min hole");

  await page
    .getByRole("grid", { name: "Official SkyAlps timetable calendar" })
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByText(/published schedule/i)).toBeVisible();

  await page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name: "History" })
    .click();
  await expect(page).toHaveURL(/\/history/);
  await expect(page.getByRole("grid", { name: "Flight history calendar" })).toBeVisible();
  await expect(page.getByText("Nothing archived yet.")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Sections" }),
  ).not.toContainText("Min hole");

  await page
    .getByRole("grid", { name: "Flight history calendar" })
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/date=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByText("No as-flown IFR for this day.")).toBeVisible();

  await page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("link", { name: "Today" })
    .click();
  await expect(page).toHaveURL(/\/(?:\?|$)/);
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

  await page.goto("/");
  const header = page.locator("header").first();
  await expect(header).toBeVisible();
  const headerBox = await header.boundingBox();
  expect(headerBox).toBeTruthy();
  expect(headerBox!.height).toBeLessThan(260);

  await page.goto("/timetable");
  const nav = page.getByRole("navigation", { name: "Sections" });
  const strip = nav.locator(".site-nav-tabs");
  const active = nav.locator("a[aria-current='page']");
  await expect(active).toContainText("Timetable");
  const stripBox = await strip.boundingBox();
  const activeBox = await active.boundingBox();
  expect(stripBox).toBeTruthy();
  expect(activeBox).toBeTruthy();
  expect(activeBox!.x).toBeGreaterThanOrEqual(stripBox!.x - 1);
  expect(activeBox!.x + activeBox!.width).toBeLessThanOrEqual(
    stripBox!.x + stripBox!.width + 1,
  );

  for (const route of routes) {
    await page.goto(route);
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
