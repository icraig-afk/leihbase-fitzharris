import { expect, test } from "@playwright/test";
import PocketBase, { ClientResponseError } from "pocketbase";
import { DEFAULT_PASSWORD, getTestStreetId, TEST_STREET } from "../lib/user";
import { uniqueId, waitForClientMount, waitForHydration } from "../lib/utils";
import { pocketbase } from "../services/pocketbase";

// Fork-only: Operating Policy & Borrower Agreement checkbox on sign-up.
// Changes the sign-up of the whole instance, so runs on its own, after all
// other tests (see the "Shared settings" project in playwright.config.ts)
test.describe.configure({ mode: "serial" });

const LINK = "https://example.com/borrower-terms";

function anonymousPb() {
  return new PocketBase(
    process.env.POCKETBASE_BASE_URL || "http://127.0.0.1:8081"
  );
}

async function signupData(extra: Record<string, unknown> = {}) {
  return {
    name: "Test User",
    email: `borrower-terms-${uniqueId()}@example.com`,
    password: DEFAULT_PASSWORD,
    passwordConfirm: DEFAULT_PASSWORD,
    terms: true,
    street: await getTestStreetId(),
    house_number: "1",
    ...extra,
  };
}

test.describe("borrower terms", () => {
  let leihbaseId: string;

  test.beforeAll(async () => {
    const pb = await pocketbase();
    leihbaseId = (await pb.collection("leihbase").getFullList())[0]!.id;
    await pb
      .collection("leihbase")
      .update(leihbaseId, { borrower_terms_link: LINK });
  });

  test.afterAll(async () => {
    const pb = await pocketbase();
    await pb
      .collection("leihbase")
      .update(leihbaseId, { borrower_terms_link: "" });
  });

  test("sign-up is rejected without accepting", async () => {
    try {
      await anonymousPb()
        .collection("users")
        .create(await signupData());
      throw new Error("Expected sign-up to be rejected");
    } catch (err) {
      expect(err).toBeInstanceOf(ClientResponseError);
      expect((err as ClientResponseError).response.message).toBe(
        "Borrower_terms_required."
      );
    }
  });

  test("stores when the terms were accepted, which users can't change", async () => {
    const pb = await pocketbase();
    const data = await signupData({
      borrower_terms: true,
      // Ignored, set by the server
      borrower_terms_accepted: "2000-01-01 00:00:00.000Z",
    });
    const before = Date.now();
    const created = await anonymousPb().collection("users").create(data);

    const user = await pb.collection("users").getOne(created.id);
    const accepted = new Date(user.borrower_terms_accepted).getTime();
    expect(accepted).toBeGreaterThanOrEqual(before - 60_000);

    // Users can't change it afterwards
    await pb.collection("users").update(created.id, { verified: true });
    const userPb = await pocketbase(data.email, DEFAULT_PASSWORD, false);
    // Users can't change it afterwards: the update is either rejected, or the
    // hidden field is ignored
    await userPb
      .collection("users")
      .update(created.id, {
        borrower_terms_accepted: "2000-01-01 00:00:00.000Z",
      })
      .catch((err) => expect(err).toBeInstanceOf(ClientResponseError));
    const unchanged = await pb.collection("users").getOne(created.id);
    expect(unchanged.borrower_terms_accepted).toBe(
      user.borrower_terms_accepted
    );
  });

  test("superusers can create users without accepting", async () => {
    const pb = await pocketbase();
    const created = await pb.collection("users").create(await signupData());
    expect(created.id).toBeTruthy();
  });

  test("sign-up page requires the checkbox, and links to the terms", async ({
    page,
  }) => {
    await page.goto("/signup");
    await waitForHydration(page);
    await waitForClientMount(page.getByTestId("submit-button"));

    await expect(
      page.getByRole("link", { name: "Operating Policy & Borrower Agreement" })
    ).toHaveAttribute("href", LINK);

    await page.getByTestId("name-input").fill("John");
    await page
      .getByTestId("email-input")
      .fill(`john-${uniqueId()}@example.com`);
    await page.getByTestId("password-input").fill(DEFAULT_PASSWORD);
    await page
      .getByTestId("street-select")
      .selectOption({ label: TEST_STREET });
    await page.getByTestId("house-number-input").fill("12");
    await page.getByTestId("tac-checkbox").check();

    // Not accepted yet: the browser blocks submitting
    await page.getByTestId("submit-button").click();
    await expect(
      page.locator("[data-testid=borrower-terms-checkbox][required]:invalid")
    ).toHaveCount(1);

    await page.getByTestId("borrower-terms-checkbox").check();
    await page.getByTestId("submit-button").click();
    await expect(page.getByTestId("signup-error")).toHaveCount(0);
    await page.waitForURL(/\/profile/);
  });
});
