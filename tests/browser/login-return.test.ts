import { expect, test, type Page } from "@playwright/test";
import { createProduct } from "../lib/product";
import { createUser, DEFAULT_PASSWORD } from "../lib/user";
import { waitForClientMount, waitForHydration } from "../lib/utils";

/** Fills in and submits the login form, on the login page */
async function submitLogin(page: Page, email: string) {
  await waitForHydration(page);
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(DEFAULT_PASSWORD);
  await page.getByTestId("submit-button").click();
}

test.describe("login return", () => {
  test("logging in from the menu returns to the page", async ({ page }) => {
    const product = await createProduct();
    const user = await createUser();
    const productPath = `/l/test-store/p/${product.id}`;

    await page.goto(productPath);
    await waitForHydration(page);
    await waitForClientMount(page.getByTestId("menu-button"));
    await page.getByTestId("menu-button").click();
    await page.getByTestId("login-link").click();
    await page.waitForURL(/\/login\?return=/);

    await submitLogin(page, user.email);
    await page.waitForURL((url) => url.pathname === productPath);
  });

  test("without a page to return to, logging in goes to the homepage", async ({
    page,
  }) => {
    const user = await createUser();
    await page.goto("/login");
    await submitLogin(page, user.email);
    await page.waitForURL((url) => url.pathname === "/");
  });

  test("never returns to another website", async ({ page, baseURL }) => {
    const user = await createUser();
    for (const path of ["//example.com/", "/\\example.com/"]) {
      await page.goto(`/login?return=${encodeURIComponent(path)}`);
      await submitLogin(page, user.email);
      await page.waitForURL((url) => url.pathname === "/");
      expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
      // Log out for the next round
      await page.context().clearCookies();
      await page.evaluate(() => localStorage.clear());
    }
  });

  test("the page to return to is kept when switching to signing up", async ({
    page,
  }) => {
    await page.goto("/login?return=%2Fl%2Ftest-store");
    await waitForHydration(page);
    await page.getByRole("main").getByTestId("signup-link").click();
    await page.waitForURL(
      (url) =>
        url.pathname === "/signup" &&
        url.searchParams.get("return") === "/l/test-store"
    );

    // The menu keeps it too
    await waitForClientMount(page.getByTestId("menu-button"));
    await page.getByTestId("menu-button").click();
    await page.getByTestId("login-link").click();
    await page.waitForURL(
      (url) =>
        url.pathname === "/login" &&
        url.searchParams.get("return") === "/l/test-store"
    );
  });
});
