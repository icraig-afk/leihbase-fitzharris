import { expect, test } from "@playwright/test";
import { waitForHydration } from "../lib/utils";

test.describe("navbar", () => {
  test("menu icons keep their size and a long name fits", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);

    // Use a long instance name, without changing the shared leihbase record
    await page
      .locator("header .logo span")
      .evaluate(
        (el) => (el.textContent = "Fitzharry's Manor Estate Library of Things")
      );

    const icons = page.getByTestId("menu-button").locator("svg");
    await expect(icons).toHaveCount(2);
    for (const icon of await icons.all()) {
      const box = (await icon.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(20);
    }

    const logo = page.locator("header .logo");
    const logoBox = (await logo.boundingBox())!;
    const navbarBox = (await logo.locator("..").boundingBox())!;
    expect(logoBox.height).toBeLessThanOrEqual(navbarBox.height);
  });
});
