import { expect, test } from "@playwright/test";

test("health endpoint reports LIPB", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  await expect(res.json()).resolves.toEqual({ status: "ok", icao: "LIPB" });
});

test("hangar pages load and the header navigates between them", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bolzano");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bozen");
  await expect(page.getByRole("navigation")).toContainText("Today");
  await expect(page.getByRole("navigation")).toContainText("Week");
  await expect(page.getByRole("navigation")).toContainText("History");
  await expect(page.getByRole("navigation")).toContainText("Season");

  await page.getByRole("navigation").getByRole("link", { name: "Week" }).click();
  await expect(page).toHaveURL(/\/week/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bolzano");

  await page.getByRole("navigation").getByRole("link", { name: "Season" }).click();
  await expect(page).toHaveURL(/\/season/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Bolzano");

  await page.getByRole("navigation").getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history/);
  await expect(page.getByText("Nothing archived yet.")).toBeVisible();

  await page.getByRole("navigation").getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/(?:\?|$)/);
});
