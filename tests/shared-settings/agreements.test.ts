import { expect, test, type Page } from "@playwright/test";
import Client, { ClientResponseError, type RecordModel } from "pocketbase";
import {
  createBorrowAgreement,
  getBorrowAgreementAcceptances,
} from "../lib/borrowAgreement";
import { createLocation } from "../lib/location";
import { login } from "../lib/login";
import { createProduct } from "../lib/product";
import { closeReservationDialog, reserve } from "../lib/reservation";
import { createUser, DEFAULT_PASSWORD } from "../lib/user";
import {
  getFutureDate,
  uniqueId,
  waitForClientMount,
  waitForHydration,
} from "../lib/utils";
import { pocketbase } from "../services/pocketbase";

// Instance-wide agreements (the privacy policy, and borrowing terms for all
// locations) apply to every user and location, so these tests run on their
// own, after all other tests (see the "Shared settings" project in
// playwright.config.ts). They're all in this file and run serially, as they
// would affect each other.
test.describe.configure({ mode: "serial" });

async function getLeihbase() {
  const pb = await pocketbase();
  return (await pb.collection("leihbase").getFullList())[0]!;
}

// Reset the instance-wide agreements after each test
test.afterEach(async () => {
  const pb = await pocketbase();
  await pb.collection("leihbase").update((await getLeihbase()).id, {
    borrow_agreement: "",
    privacy_policy: "",
  });
});

/**
 * Creates a privacy policy and sets it as the current one
 */
async function createPrivacyPolicy(content = "<p>We collect your name.</p>") {
  const pb = await pocketbase();
  const privacyPolicy = await pb
    .collection("privacy_policies")
    .create({ content });
  await pb
    .collection("leihbase")
    .update((await getLeihbase()).id, { privacy_policy: privacyPolicy.id });
  return privacyPolicy;
}

function anonymousPb() {
  return new Client(process.env.POCKETBASE_BASE_URL || "http://127.0.0.1:8081");
}

/**
 * Sign-up data of a new user, as the sign-up form sends it
 */
function signupData(extra: Record<string, unknown> = {}) {
  return {
    name: "Test User",
    email: `agreements-${uniqueId()}@example.com`,
    password: DEFAULT_PASSWORD,
    passwordConfirm: DEFAULT_PASSWORD,
    ...extra,
  };
}

/**
 * Creates instance-wide borrowing terms and sets them as the current ones
 */
async function createInstanceBorrowAgreement(
  content = "<p>Treat all items with care.</p>"
) {
  const pb = await pocketbase();
  const borrowAgreement = await pb
    .collection("borrow_agreements")
    .create({ content });
  await pb
    .collection("leihbase")
    .update((await getLeihbase()).id, { borrow_agreement: borrowAgreement.id });
  return borrowAgreement;
}

async function createBorrower() {
  const user = await createUser();
  const userPb = await pocketbase(user.email, DEFAULT_PASSWORD, false);
  return { user, userPb };
}

async function createStaff(
  role: "manager" | "admin",
  locations: string[] = []
) {
  const user = await createUser(undefined, undefined, role, locations);
  const pb = await pocketbase(user.email, DEFAULT_PASSWORD, false);
  return { user, pb };
}

function reserveApi(
  pb: Client,
  user: RecordModel,
  product: RecordModel,
  [start, end]: [number, number],
  borrowAgreement?: RecordModel
) {
  return pb.collection("reservations").create({
    user: user.id,
    product: product.id,
    start: getFutureDate(start),
    end: getFutureDate(end),
    borrow_agreement: borrowAgreement?.id,
  });
}

test.describe("instance-wide borrowing terms", () => {
  test("apply to all locations, and one acceptance covers them all", async () => {
    const borrowAgreement = await createInstanceBorrowAgreement();
    const firstProduct = await createProduct(await createLocation("multiple"));
    const secondProduct = await createProduct(await createLocation("multiple"));
    const { user, userPb } = await createBorrower();

    await expect(
      reserveApi(userPb, user, firstProduct, [1, 2])
    ).rejects.toThrow("Borrow_agreement_not_accepted.");

    // Accepting them along with a reservation at one location...
    await reserveApi(userPb, user, firstProduct, [1, 2], borrowAgreement);
    expect(
      (await getBorrowAgreementAcceptances(user.id)).map(
        (a) => a.borrow_agreement
      )
    ).toEqual([borrowAgreement.id]);

    // ...allows reserving at another location without accepting again
    await expect(
      reserveApi(userPb, user, secondProduct, [3, 4])
    ).resolves.toBeDefined();
  });

  test("public locations show the borrowing terms that apply", async () => {
    const borrowAgreement = await createInstanceBorrowAgreement();
    const usesInstance = await createLocation("multiple");
    const ownTerms = await createLocation("multiple");
    const ownBorrowAgreement = await createBorrowAgreement(ownTerms);
    const pb = new Client(
      process.env.POCKETBASE_BASE_URL || "http://127.0.0.1:8081"
    );

    const publicUsesInstance = await pb
      .collection("public_locations")
      .getOne(usesInstance.id);
    expect(publicUsesInstance.borrow_agreement).toBe(borrowAgreement.id);
    const publicOwnTerms = await pb
      .collection("public_locations")
      .getOne(ownTerms.id);
    expect(publicOwnTerms.borrow_agreement).toBe(ownBorrowAgreement.id);
  });

  test("a location's own borrowing terms take precedence", async () => {
    const instanceBorrowAgreement = await createInstanceBorrowAgreement();
    const location = await createLocation("multiple");
    const ownBorrowAgreement = await createBorrowAgreement(location);
    const product = await createProduct(location);
    const { user, userPb } = await createBorrower();

    // Accepting the instance-wide terms isn't enough here
    await userPb.collection("borrow_agreement_acceptances").create({
      user: user.id,
      borrow_agreement: instanceBorrowAgreement.id,
    });
    await expect(reserveApi(userPb, user, product, [1, 2])).rejects.toThrow(
      "Borrow_agreement_not_accepted."
    );
    await expect(
      reserveApi(userPb, user, product, [1, 2], ownBorrowAgreement)
    ).resolves.toBeDefined();
  });

  test("a new version has to be accepted again, a minor edit doesn't", async () => {
    const borrowAgreement = await createInstanceBorrowAgreement();
    const location = await createLocation("multiple");
    // A product per reservation: users can't reserve a product twice
    const [first, second, third] = await Promise.all([
      createProduct(location),
      createProduct(location),
      createProduct(location),
    ]);
    const { user, userPb } = await createBorrower();
    await reserveApi(userPb, user, first!, [1, 2], borrowAgreement);

    // Minor edit: updated in place
    const pb = await pocketbase();
    await pb
      .collection("borrow_agreements")
      .update(borrowAgreement.id, { content: "<p>Treat items with care.</p>" });
    await expect(
      reserveApi(userPb, user, second!, [3, 4])
    ).resolves.toBeDefined();

    // New version
    await createInstanceBorrowAgreement("<p>New terms.</p>");
    await expect(reserveApi(userPb, user, third!, [5, 6])).rejects.toThrow(
      "Borrow_agreement_not_accepted."
    );

    // The previous version can no longer be accepted
    await expect(
      userPb
        .collection("borrow_agreement_acceptances")
        .create({ user: user.id, borrow_agreement: borrowAgreement.id })
    ).rejects.toThrow("Borrow_agreement_not_current.");
  });

  test("managers record and see acceptances in the store", async () => {
    const borrowAgreement = await createInstanceBorrowAgreement();
    const location = await createLocation("multiple");
    const { pb: managerPb } = await createStaff("manager", [location.id]);
    const { user } = await createBorrower();

    const acceptance = await managerPb
      .collection("borrow_agreement_acceptances")
      .create({ user: user.id, borrow_agreement: borrowAgreement.id });
    expect(acceptance.recorded_by).not.toBe("");

    const listed = await managerPb
      .collection("borrow_agreement_acceptances")
      .getFullList({
        filter: managerPb.filter("user = {:user}", { user: user.id }),
      });
    expect(listed.map((a) => a.id)).toEqual([acceptance.id]);
  });

  test("admins can only change the borrowing terms of the instance", async () => {
    const leihbase = await getLeihbase();
    const { pb: adminPb } = await createStaff("admin");
    const borrowAgreement = await adminPb
      .collection("borrow_agreements")
      .create({ content: "<p>Set by an admin.</p>" });

    await adminPb
      .collection("leihbase")
      .update(leihbase.id, { borrow_agreement: borrowAgreement.id });
    expect((await getLeihbase()).borrow_agreement).toBe(borrowAgreement.id);

    // Other instance settings stay superuser-only
    await expect(
      adminPb.collection("leihbase").update(leihbase.id, { name: "Renamed" })
    ).rejects.toThrow(ClientResponseError);
    expect((await getLeihbase()).name).toBe(leihbase.name);

    // Borrowing terms of a location can't become the instance's
    const location = await createLocation("multiple");
    const locationBorrowAgreement = await createBorrowAgreement(location);
    await expect(
      adminPb
        .collection("leihbase")
        .update(leihbase.id, { borrow_agreement: locationBorrowAgreement.id })
    ).rejects.toThrow("Borrow_agreement_of_location.");
  });

  test("managers can't change the borrowing terms of the instance", async () => {
    const leihbase = await getLeihbase();
    const location = await createLocation("multiple");
    const { pb: managerPb } = await createStaff("manager", [location.id]);
    const pb = await pocketbase();
    const borrowAgreement = await pb
      .collection("borrow_agreements")
      .create({ content: "<p>Not set by a manager.</p>" });

    await expect(
      managerPb
        .collection("leihbase")
        .update(leihbase.id, { borrow_agreement: borrowAgreement.id })
    ).rejects.toThrow(ClientResponseError);
  });

  test("admin edits them in the instance settings, and users accept them after logging in", async ({
    page,
    browser,
  }) => {
    const location = await createLocation("multiple");
    const product = await createProduct(location);
    const { user: admin } = await createStaff("admin", [location.id]);

    // Admin enters the borrowing terms
    await login(page, admin.email, DEFAULT_PASSWORD);
    await page.goto(`/admin/${location.slug}/settings`);
    await waitForHydration(page);
    await page.getByTestId("instance-settings-link").click();
    await page.waitForURL("/admin/settings");
    await waitForHydration(page);
    await page
      .getByTestId("borrow-agreement-editor")
      .locator(".ql-editor")
      .fill("Treat all items with care, at every location.");
    await page.getByTestId("save-button").click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    expect((await getLeihbase()).borrow_agreement).not.toBe("");

    // The location settings mention them
    await page.goto(`/admin/${location.slug}/settings`);
    await waitForHydration(page);
    await expect(
      page.getByTestId("borrow-agreement-instance-info")
    ).toBeVisible();

    // A user who signed up before is asked to accept them after logging in, in
    // their own browser
    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    const email = `instance-terms-${uniqueId()}@example.com`;
    const user = await createUser(email, DEFAULT_PASSWORD);
    await loginExpectingReview(userPage, email);
    await expect(
      userPage.getByTestId("agreement-borrow_agreement")
    ).toContainText("at every location");
    await userPage.getByTestId("accept-borrow_agreement").check();
    await userPage.getByTestId("accept-agreements").click();
    await userPage.waitForURL("/profile");
    expect(await getBorrowAgreementAcceptances(user.id)).toHaveLength(1);

    // Reserving doesn't ask for them again
    await userPage.goto(`/l/${location.slug}/p/${product.id}`);
    await reserve(userPage, 0, 1);
    await closeReservationDialog(userPage);
    await userContext.close();
  });
});

/**
 * Logs in, expecting to be asked to review and accept changed agreements
 */
async function loginExpectingReview(page: Page, email: string) {
  await page.goto("/login");
  await waitForHydration(page);
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(DEFAULT_PASSWORD);
  await page.getByTestId("submit-button").click();
  await page.waitForURL(/\/profile\/agreements/);
  await waitForHydration(page);
}

test.describe("privacy policy", () => {
  test("sign-up requires accepting the current version, and stores the acceptance", async () => {
    const privacyPolicy = await createPrivacyPolicy();

    await expect(
      anonymousPb()
        .collection("users")
        .create(signupData({ terms: true }))
    ).rejects.toThrow("Terms_required.");

    const user = await anonymousPb()
      .collection("users")
      .create(signupData({ privacy_policy: privacyPolicy.id }));
    const pb = await pocketbase();
    const acceptances = await pb
      .collection("privacy_policy_acceptances")
      .getFullList({ filter: pb.filter("user = {:user}", { user: user.id }) });
    expect(acceptances.map((a) => a.privacy_policy)).toEqual([
      privacyPolicy.id,
    ]);
    expect((await pb.collection("users").getOne(user.id)).terms).toBe(true);
  });

  test("only the current version can be accepted, by the user themselves", async () => {
    const firstVersion = await createPrivacyPolicy();
    const { user, userPb } = await createBorrower();
    const { user: otherUser } = await createBorrower();
    const secondVersion = await createPrivacyPolicy("<p>We collect more.</p>");

    await expect(
      userPb
        .collection("privacy_policy_acceptances")
        .create({ user: user.id, privacy_policy: firstVersion.id })
    ).rejects.toThrow("Privacy_policy_not_current.");
    await expect(
      userPb
        .collection("privacy_policy_acceptances")
        .create({ user: otherUser.id, privacy_policy: secondVersion.id })
    ).rejects.toThrow(ClientResponseError);
    await expect(
      userPb
        .collection("privacy_policy_acceptances")
        .create({ user: user.id, privacy_policy: secondVersion.id })
    ).resolves.toBeDefined();
  });

  test("only admins edit it, everyone can read it", async () => {
    const privacyPolicy = await createPrivacyPolicy();
    await expect(
      anonymousPb().collection("privacy_policies").getOne(privacyPolicy.id)
    ).resolves.toBeDefined();

    const { userPb } = await createBorrower();
    await expect(
      userPb.collection("privacy_policies").create({ content: "<p>No.</p>" })
    ).rejects.toThrow(ClientResponseError);

    const { pb: adminPb } = await createStaff("admin");
    const created = await adminPb
      .collection("privacy_policies")
      .create({ content: "<p>Yes.</p>" });
    await adminPb
      .collection("leihbase")
      .update((await getLeihbase()).id, { privacy_policy: created.id });
    expect((await getLeihbase()).privacy_policy).toBe(created.id);
  });

  test("sign-up requires accepting the borrowing terms of all locations too", async () => {
    const borrowAgreement = await createInstanceBorrowAgreement();

    await expect(
      anonymousPb()
        .collection("users")
        .create(signupData({ terms: true }))
    ).rejects.toThrow("Borrow_agreement_required.");

    const user = await anonymousPb()
      .collection("users")
      .create(
        signupData({ terms: true, borrow_agreement: borrowAgreement.id })
      );
    expect(
      (await getBorrowAgreementAcceptances(user.id)).map(
        (a) => a.borrow_agreement
      )
    ).toEqual([borrowAgreement.id]);
  });

  test("sign-up page links to both, and stores both acceptances", async ({
    page,
  }) => {
    const privacyPolicy = await createPrivacyPolicy(
      "<p>We collect your name and email address.</p>"
    );
    const borrowAgreement = await createInstanceBorrowAgreement();

    await page.goto("/signup");
    await waitForHydration(page);
    await waitForClientMount(page.getByTestId("submit-button"));
    await expect(
      page.getByTestId("tac-checkbox").locator("xpath=..").getByRole("link")
    ).toHaveAttribute("href", "/privacy");
    await expect(
      page
        .getByTestId("borrowing-terms-checkbox")
        .locator("xpath=..")
        .getByRole("link")
    ).toHaveAttribute("href", "/borrowing-terms");

    const email = `agreements-${uniqueId()}@example.com`;
    await page.getByTestId("name-input").fill("Agreeing User");
    await page.getByTestId("email-input").fill(email);
    await page.getByTestId("password-input").fill(DEFAULT_PASSWORD);
    await page.getByTestId("tac-checkbox").check();
    await page.getByTestId("borrowing-terms-checkbox").check();
    await page.getByTestId("submit-button").click();
    await page.waitForURL("/profile");

    const pb = await pocketbase();
    const user = await pb
      .collection("users")
      .getFirstListItem(pb.filter("email = {:email}", { email }));
    const privacyAcceptances = await pb
      .collection("privacy_policy_acceptances")
      .getFullList({ filter: pb.filter("user = {:user}", { user: user.id }) });
    expect(privacyAcceptances.map((a) => a.privacy_policy)).toEqual([
      privacyPolicy.id,
    ]);
    expect(
      (await getBorrowAgreementAcceptances(user.id)).map(
        (a) => a.borrow_agreement
      )
    ).toEqual([borrowAgreement.id]);

    // The public pages show them
    await page.goto("/privacy");
    await expect(page.getByTestId("agreement-content")).toContainText(
      "name and email address"
    );
    await page.goto("/borrowing-terms");
    await expect(page.getByTestId("agreement-content")).toContainText(
      "Treat all items with care."
    );
  });

  test("users are asked to accept a new version on their next visit", async ({
    page,
  }) => {
    const firstVersion = await createPrivacyPolicy();
    const { user, userPb } = await createBorrower();
    await userPb
      .collection("privacy_policy_acceptances")
      .create({ user: user.id, privacy_policy: firstVersion.id });

    // Accepted the current version: not asked
    await login(page, user.email, DEFAULT_PASSWORD);

    // A new version: asked on the next visit, and taken back afterwards
    const secondVersion = await createPrivacyPolicy(
      "<p>We now also collect your phone number.</p>"
    );
    await page.goto("/profile");
    await page.waitForURL(/\/profile\/agreements\?return=/);
    await waitForHydration(page);
    await expect(page.getByTestId("agreement-privacy_policy")).toContainText(
      "phone number"
    );
    await expect(page.getByTestId("accept-agreements")).toBeDisabled();
    await page.getByTestId("accept-privacy_policy").check();
    await page.getByTestId("accept-agreements").click();
    await page.waitForURL("/profile");

    const pb = await pocketbase();
    const acceptances = await pb
      .collection("privacy_policy_acceptances")
      .getFullList({
        filter: pb.filter("user = {:user}", { user: user.id }),
        sort: "created",
      });
    expect(acceptances.map((a) => a.privacy_policy)).toEqual([
      firstVersion.id,
      secondVersion.id,
    ]);

    // Not asked again
    await page.goto("/profile");
    await waitForHydration(page);
    await expect(page).toHaveURL("/profile");
  });

  test("a minor edit doesn't ask users again", async ({ page }) => {
    const privacyPolicy = await createPrivacyPolicy();
    const { user, userPb } = await createBorrower();
    await userPb
      .collection("privacy_policy_acceptances")
      .create({ user: user.id, privacy_policy: privacyPolicy.id });
    const pb = await pocketbase();
    await pb
      .collection("privacy_policies")
      .update(privacyPolicy.id, { content: "<p>We collect your name!</p>" });

    await login(page, user.email, DEFAULT_PASSWORD);
    await page.goto("/profile");
    await waitForHydration(page);
    await expect(page).toHaveURL("/profile");
  });

  test("admin edits it in the instance settings", async ({ page }) => {
    const location = await createLocation("multiple");
    const { user: admin } = await createStaff("admin", [location.id]);

    await login(page, admin.email, DEFAULT_PASSWORD);
    await page.goto("/admin/settings");
    await waitForHydration(page);
    await page
      .getByTestId("privacy-policy-editor")
      .locator(".ql-editor")
      .fill("We only collect what we need.");
    await page.getByTestId("save-button").click();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    expect((await getLeihbase()).privacy_policy).not.toBe("");

    await page.goto("/privacy");
    await expect(page.getByTestId("agreement-content")).toContainText(
      "only collect what we need"
    );
  });
});
