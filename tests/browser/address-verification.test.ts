import { expect, test } from "@playwright/test";
import { login } from "../lib/login";
import { createProduct, navigateToProductPage } from "../lib/product";
import { createUser, DEFAULT_PASSWORD } from "../lib/user";
import { waitForClientMount, waitForHydration } from "../lib/utils";

test.describe("address verification", () => {
  test("admin posts a code, neighbour enters it and can reserve", async ({
    page,
  }) => {
    const neighbour = await createUser(undefined, undefined, "user", [], {
      addressVerified: false,
    });
    const admin = await createUser(undefined, undefined, "admin");
    const product = await createProduct();

    // Neighbour is asked for the code when reserving
    await login(page, neighbour.email, DEFAULT_PASSWORD);
    await expect(page.getByTestId("address-unverified-alert")).toBeVisible();
    await navigateToProductPage(page, product.id);
    await waitForClientMount(page.getByTestId("reserve-button"));
    await page.getByTestId("reserve-button").click();
    await expect(
      page
        .getByTestId("address-verification-dialog")
        .getByTestId("address-code-input")
    ).toBeVisible();
    await expect(page.getByTestId("opening-hours")).toBeHidden();

    // Admin creates the letter
    await page.context().clearCookies();
    await login(page, admin.email, DEFAULT_PASSWORD);
    await page.goto("/admin/neighbours");
    await waitForHydration(page);
    await page.getByTestId(`issue-${neighbour.id}`).click();
    const code = (await page.getByTestId("letter-code").innerText()).trim();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await expect(page.getByTestId("letter")).toContainText(code);

    // Neighbour enters the code
    await page.context().clearCookies();
    await login(page, neighbour.email, DEFAULT_PASSWORD);
    await page.goto("/profile/verify-address");
    await waitForHydration(page);
    // (the closed dialog holds a second code form, so scope to the page)
    const main = page.locator("main");
    await main.getByTestId("address-code-input").fill(code);
    await main.getByTestId("address-code-submit").click();
    await expect(main.getByTestId("address-verified")).toBeVisible();

    // and can now reserve
    await navigateToProductPage(page, product.id);
    await waitForClientMount(page.getByTestId("reserve-button"));
    await page.getByTestId("reserve-button").click();
    await expect(page.getByTestId("opening-hours")).toBeVisible();
  });
});
