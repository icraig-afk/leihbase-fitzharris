import { expect, test } from "@playwright/test";
import { waitForMail } from "../lib/mail";
import { createUser } from "../lib/user";
import { waitForHydration } from "../lib/utils";
import { pocketbase } from "../services/pocketbase";

test.describe("password reset", () => {
  test("user can set a new password from the reset email", async ({ page }) => {
    const user = await createUser();
    const newPassword = "new-password-123";

    // Request the reset
    await page.goto("/reset-password");
    await waitForHydration(page);
    await page.locator("#email").fill(user.email);
    await page.getByRole("button", { name: "Submit" }).click();

    // The email links to the front-end page of this instance
    const mail = await waitForMail(user.email, "");
    const link = [...mail.HTML.matchAll(/href="([^"]+)"/g)]
      .map((match) => match[1].replace(/&amp;/g, "&"))
      .find((href) => href.includes("confirm-password-reset"));
    expect(link).toBeDefined();
    expect(link).toContain("/confirm-password-reset?token=");
    expect(link).not.toContain("leihbar-koeln");

    // Set the new password
    const url = new URL(link!);
    await page.goto(url.pathname + url.search);
    await waitForHydration(page);
    await page.getByTestId("password-input").fill(newPassword);
    await page.getByTestId("password-confirm-input").fill(newPassword);
    await page.getByTestId("submit-button").click();
    await expect(page.getByTestId("password-reset-success")).toBeVisible();

    // and log in with it
    const userPb = await pocketbase(user.email, newPassword, false);
    expect(userPb.authStore.isValid).toBe(true);
  });

  test("shows an error for an invalid link", async ({ page }) => {
    await page.goto("/confirm-password-reset?token=invalid");
    await waitForHydration(page);
    await page.getByTestId("password-input").fill("new-password-123");
    await page.getByTestId("password-confirm-input").fill("new-password-123");
    await page.getByTestId("submit-button").click();
    await expect(page.getByTestId("password-reset-error")).toBeVisible();
  });

  test("shows an error without a token", async ({ page }) => {
    await page.goto("/confirm-password-reset");
    await waitForHydration(page);
    await expect(page.getByTestId("password-reset-error")).toBeVisible();
    await expect(page.getByTestId("password-input")).toHaveCount(0);
  });
});
