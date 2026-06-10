import { expect, test } from "@playwright/test";

/**
 * PLAN Phase 4 smoke: login → seeded dashboard totals → create hedge →
 * MTM appears → run scenario. Requires the seeded local DB and
 * AUTH_PASSWORD from .env (dev default "fpf-dev-password").
 */
const PASSWORD = process.env.AUTH_PASSWORD ?? "fpf-dev-password";

test("login → dashboard → hedge CRUD → scenario", async ({ page }) => {
  // unauthenticated users are redirected to /login by proxy.ts
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  await page.fill("#email", "rk@katz.com.pa");
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // seeded book MTM ≈ $67,859 on the MTM card
  await expect(page.getByText("Hedge MTM")).toBeVisible();
  await expect(page.getByText(/\$67,8\d\d/).first()).toBeVisible();

  // hedge blotter shows the 3 GS NDFs with MTM
  await page.goto("/hedges");
  await expect(page.getByText("1,828,329")).toBeVisible();
  await expect(page.getByText("Goldman Sachs").first()).toBeVisible();

  // create a hedge and see it appear with a computed MTM
  await page.getByRole("button", { name: "+ New hedge" }).click();
  await page.fill('input[name="notionalLocal"]', "1000000");
  await page.fill('input[name="contractRate"]', "0.29000000");
  await page.fill('input[name="fixingDate"]', "2026-12-15");
  await page.fill('input[name="settlementDate"]', "2026-12-17");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("1,000,000")).toBeVisible();

  // scenario lab: run PEN −10% and read a P&L number
  await page.goto("/lab");
  await page.getByRole("button", { name: "-10%" }).click();
  await expect(page.getByText("Net P&L:")).toBeVisible({ timeout: 20_000 });

  // clean up the created hedge so the seed book stays canonical
  await page.goto("/hedges");
  page.on("dialog", (d) => d.accept());
  const row = page.locator("tr", { hasText: "1,000,000" }).first();
  await row.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("1,000,000")).toBeHidden();
});
