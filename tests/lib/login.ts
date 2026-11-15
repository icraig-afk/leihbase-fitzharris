import { expect, type Page } from "@playwright/test";
import { waitForHydration } from "./utils";

/**
 * Logs in, and lands on the profile page, which most tests continue from.
 * Without a page to return to, logging in goes to the homepage.
 */
export async function login(
  page: Page,
  email = "test@example.com",
  password = "testtest"
) {
  await page.goto("/login?return=%2Fprofile");
  await waitForHydration(page);
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(password);
  await page.getByTestId("submit-button").click();
  await page.waitForURL(/\/profile/);
  await expect(page).toHaveURL("/profile");
}
