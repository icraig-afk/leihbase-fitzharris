import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { ClientResponseError, type RecordModel } from "pocketbase";
import { createBorrowAgreement } from "../lib/borrowAgreement";
import { createLocation } from "../lib/location";
import { login } from "../lib/login";
import { waitForMail } from "../lib/mail";
import { createProduct } from "../lib/product";
import { createUser, DEFAULT_PASSWORD } from "../lib/user";
import { waitForHydration } from "../lib/utils";
import { pocketbase } from "../services/pocketbase";

// Fork-only: data retention (pocketbase/pb_hooks/lib/retention.js). The
// periods are instance-wide settings, so these tests run on their own, after
// all other tests (see the "Data retention" project in playwright.config.ts).
test.describe.configure({ mode: "serial" });

const SETTINGS = {
  retention_inactive_days: 730,
  retention_warning_days: 30,
  retention_reservation_days: 730,
  retention_closed_days: 2190,
};

type RetentionResult = {
  codesDeleted: number;
  warningsSent: number;
  accountsClosed: number;
  closingSkipped: number;
  reservationsAnonymised: number;
  accountsDeleted: number;
  errors: string[];
};

async function getLeihbase() {
  const pb = await pocketbase();
  return (await pb.collection("leihbase").getFullList())[0]!;
}

async function setRetention(settings: Partial<typeof SETTINGS>) {
  const pb = await pocketbase();
  await pb.collection("leihbase").update((await getLeihbase()).id, settings);
}

async function runRetention() {
  const pb = await pocketbase();
  return pb.send<RetentionResult>("/api/retention/run", { method: "POST" });
}

/** A PocketBase date the given number of days ago */
function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ");
}

async function getUser(id: string) {
  const pb = await pocketbase();
  return pb.collection("users").getOne(id);
}

/**
 * Sets fields of a user as a superuser, e.g. to make them inactive
 */
async function updateUser(id: string, data: Record<string, unknown>) {
  const pb = await pocketbase();
  return pb.collection("users").update(id, data);
}

/**
 * Creates a reservation as a superuser, which can be in the past
 */
async function createPastReservation(
  user: RecordModel,
  [startDaysAgo, endDaysAgo]: [number, number],
  data: Record<string, unknown> = {}
) {
  const pb = await pocketbase();
  const product = await createProduct();
  return pb.collection("reservations").create({
    user: user.id,
    product: product.id,
    start: daysAgo(startDaysAgo),
    end: daysAgo(endDaysAgo),
    send_confirmation: false,
    ...data,
  });
}

test.describe("data retention", () => {
  test.beforeEach(async () => {
    await setRetention(SETTINGS);
  });

  test.afterEach(async () => {
    await setRetention({
      retention_inactive_days: 0,
      retention_warning_days: 0,
      retention_reservation_days: 0,
      retention_closed_days: 0,
    });
  });

  test("logins and visits are recorded as activity", async () => {
    const user = await createUser();
    expect((await getUser(user.id)).last_active).toBe("");

    await pocketbase(user.email, DEFAULT_PASSWORD, false);
    expect((await getUser(user.id)).last_active).not.toBe("");
  });

  test("users can't change the retention fields themselves", async () => {
    const user = await createUser();
    const userPb = await pocketbase(user.email, DEFAULT_PASSWORD, false);
    const before = await getUser(user.id);
    for (const data of [
      { last_active: daysAgo(1000) },
      { closed_at: daysAgo(1) },
      { close_requested: true },
    ]) {
      // Either rejected, or the hidden field is ignored
      await userPb
        .collection("users")
        .update(user.id, data)
        .catch((err) => expect(err).toBeInstanceOf(ClientResponseError));
    }
    const after = await getUser(user.id);
    expect(after.last_active).toBe(before.last_active);
    expect(after.closed_at).toBe("");
    expect(after.close_requested).toBe(false);
  });

  test("inactive accounts are warned, then closed, keeping their agreements", async () => {
    const location = await createLocation("multiple");
    const borrowAgreement = await createBorrowAgreement(location);
    const user = await createUser();
    const pb = await pocketbase();
    const acceptance = await pb
      .collection("borrow_agreement_acceptances")
      .create({ user: user.id, borrow_agreement: borrowAgreement.id });

    // Inactive for longer than the period minus the warning time: warned
    await updateUser(user.id, { last_active: daysAgo(720) });
    expect((await runRetention()).warningsSent).toBeGreaterThanOrEqual(1);
    const mail = await waitForMail(user.email, "will be closed");
    expect(mail.HTML).toContain("/login");
    const warned = await getUser(user.id);
    expect(warned.retention_warning_sent).not.toBe("");
    expect(warned.closed_at).toBe("");

    // Still inactive once the warning time has passed: closed
    await updateUser(user.id, {
      last_active: daysAgo(750),
      retention_warning_sent: daysAgo(31),
    });
    expect((await runRetention()).accountsClosed).toBeGreaterThanOrEqual(1);
    const closed = await getUser(user.id);
    expect(closed.closed_at).not.toBe("");
    expect(closed.name).toBe("Closed account");
    expect(closed.email).toBe(`closed-${user.id}@closed.invalid`);
    expect(closed.house_number).toBe("");
    await expect(
      pocketbase(user.email, DEFAULT_PASSWORD, false)
    ).rejects.toThrow();

    // The record of the accepted agreement is kept
    await expect(
      pb.collection("borrow_agreement_acceptances").getOne(acceptance.id)
    ).resolves.toBeDefined();

    // With a fingerprint of the email address, to find it again in a dispute
    expect(closed.closed_email_hash).toBe(
      createHash("sha256").update(user.email.toLowerCase()).digest("hex")
    );
    const found = await pb.send<
      { id: string; borrow_agreements: { borrow_agreement: string }[] }[]
    >("/api/retention/closed-accounts", {
      query: { email: ` ${user.email.toUpperCase()} ` },
    });
    expect(found.map((account) => account.id)).toEqual([user.id]);
    expect(found[0]!.borrow_agreements.map((a) => a.borrow_agreement)).toEqual([
      borrowAgreement.id,
    ]);

    // Only for superusers
    const other = await createUser();
    const otherPb = await pocketbase(other.email, DEFAULT_PASSWORD, false);
    await expect(
      otherPb.send("/api/retention/closed-accounts", {
        query: { email: user.email },
      })
    ).rejects.toThrow();
  });

  test("the privacy policy shows the retention periods as set", async ({
    page,
  }) => {
    const pb = await pocketbase();
    const periods = await pb.send("/api/retention/periods", {});
    expect(periods).toMatchObject({
      inactive: 730,
      warning: 30,
      reservations: 730,
      closed: 2190,
      address_code: 90,
    });

    const privacyPolicy = await pb.collection("privacy_policies").create({
      content:
        "<p>{LIBRARY_NAME}: closed after {RETENTION_INACTIVE}, warned {RETENTION_WARNING} before. Reservations: {RETENTION_RESERVATIONS}. Agreements: {RETENTION_CLOSED}. Codes: {RETENTION_ADDRESS_CODE}. Unknown: {RETENTION_OTHER}.</p>",
    });
    const leihbase = await getLeihbase();
    await pb
      .collection("leihbase")
      .update(leihbase.id, { privacy_policy: privacyPolicy.id });
    try {
      await page.goto("/privacy");
      await expect(page.getByTestId("agreement-content")).toHaveText(
        `${leihbase.name.trim()}: closed after 2 years, warned 30 days before. Reservations: 2 years. Agreements: 6 years. Codes: 90 days. Unknown: {RETENTION_OTHER}.`
      );

      // Changing a period changes the privacy policy
      await setRetention({ retention_inactive_days: 1095 });
      await page.goto("/privacy");
      await expect(page.getByTestId("agreement-content")).toContainText(
        "closed after 3 years"
      );
    } finally {
      await pb
        .collection("leihbase")
        .update(leihbase.id, { privacy_policy: "" });
    }
  });

  test("activity after the warning cancels it", async () => {
    const user = await createUser();
    await updateUser(user.id, { last_active: daysAgo(720) });
    await runRetention();
    expect((await getUser(user.id)).retention_warning_sent).not.toBe("");

    await pocketbase(user.email, DEFAULT_PASSWORD, false);
    const active = await getUser(user.id);
    expect(active.retention_warning_sent).toBe("");
    expect(active.closed_at).toBe("");
  });

  test("accounts with an item still out aren't closed", async () => {
    const user = await createUser();
    // Picked up, never returned
    await createPastReservation(user, [800, 790], {
      started: true,
      ended: false,
    });
    await updateUser(user.id, {
      last_active: daysAgo(800),
      retention_warning_sent: daysAgo(40),
    });

    expect((await runRetention()).closingSkipped).toBeGreaterThanOrEqual(1);
    expect((await getUser(user.id)).closed_at).toBe("");
  });

  test("staff accounts are never closed automatically", async () => {
    const manager = await createUser(undefined, undefined, "manager");
    await updateUser(manager.id, {
      last_active: daysAgo(1000),
      retention_warning_sent: daysAgo(40),
    });

    await runRetention();
    expect((await getUser(manager.id)).closed_at).toBe("");
  });

  test("old reservations are anonymised, keeping the item and dates", async () => {
    const user = await createUser();
    const reservation = await createPastReservation(user, [800, 790], {
      started: true,
      ended: true,
      message: "Can I pick it up at 5?",
      note: "<p>Paid the deposit in cash</p>",
    });
    const recent = await createPastReservation(user, [20, 10], {
      started: true,
      ended: true,
      message: "Recent",
    });

    expect(
      (await runRetention()).reservationsAnonymised
    ).toBeGreaterThanOrEqual(1);
    const pb = await pocketbase();
    const anonymised = await pb
      .collection("reservations")
      .getOne(reservation.id);
    expect(anonymised.user).toBe("");
    expect(anonymised.message).toBe("");
    expect(anonymised.note).toBe("");
    expect(anonymised.anonymised_at).not.toBe("");
    expect(anonymised.product).toBe(reservation.product);
    expect(anonymised.start).toBe(reservation.start);

    const kept = await pb.collection("reservations").getOne(recent.id);
    expect(kept.user).toBe(user.id);
    expect(kept.message).toBe("Recent");
  });

  test("closed accounts are deleted after the period, with their agreements", async () => {
    const location = await createLocation("multiple");
    const borrowAgreement = await createBorrowAgreement(location);
    const user = await createUser();
    const pb = await pocketbase();
    const acceptance = await pb
      .collection("borrow_agreement_acceptances")
      .create({ user: user.id, borrow_agreement: borrowAgreement.id });

    // Closed on request, longer ago than the period
    await updateUser(user.id, { close_requested: true });
    expect((await runRetention()).accountsClosed).toBeGreaterThanOrEqual(1);
    await updateUser(user.id, { closed_at: daysAgo(2200) });

    expect((await runRetention()).accountsDeleted).toBeGreaterThanOrEqual(1);
    await expect(pb.collection("users").getOne(user.id)).rejects.toThrow();
    await expect(
      pb.collection("borrow_agreement_acceptances").getOne(acceptance.id)
    ).rejects.toThrow();
  });

  test("used and expired address codes are deleted", async () => {
    const user = await createUser(undefined, undefined, "user", [], {
      addressVerified: false,
    });
    const pb = await pocketbase();
    const code = (data: Record<string, unknown>) =>
      pb.collection("address_codes").create({
        user: user.id,
        code_hash: "test",
        attempts: 0,
        ...data,
      });
    const used = await code({ expires: daysAgo(-30), used: daysAgo(1) });
    const expired = await code({ expires: daysAgo(1) });
    const active = await code({ expires: daysAgo(-30) });

    await runRetention();
    await expect(
      pb.collection("address_codes").getOne(used.id)
    ).rejects.toThrow();
    await expect(
      pb.collection("address_codes").getOne(expired.id)
    ).rejects.toThrow();
    await expect(
      pb.collection("address_codes").getOne(active.id)
    ).resolves.toBeDefined();
  });

  test("nothing is closed when the periods are off", async () => {
    await setRetention({ retention_inactive_days: 0 });
    const user = await createUser();
    await updateUser(user.id, {
      last_active: daysAgo(1000),
      retention_warning_sent: daysAgo(40),
    });

    await runRetention();
    expect((await getUser(user.id)).closed_at).toBe("");
  });

  test("users can't close their account while an item is out", async () => {
    const user = await createUser();
    const pb = await pocketbase();
    const product = await createProduct();
    await pb.collection("reservations").create({
      user: user.id,
      product: product.id,
      start: daysAgo(-5),
      end: daysAgo(-7),
      send_confirmation: false,
    });
    const userPb = await pocketbase(user.email, DEFAULT_PASSWORD, false);

    await expect(
      userPb.send("/api/account/close", { method: "POST" })
    ).rejects.toThrow("Account_has_open_reservation.");
    expect((await getUser(user.id)).closed_at).toBe("");
  });

  test("users close their own account from their profile", async ({ page }) => {
    const user = await createUser();

    await login(page, user.email, DEFAULT_PASSWORD);
    await page.getByTestId("close-account-link").click();
    await page.waitForURL("/profile/close-account");
    await waitForHydration(page);
    await page.getByTestId("close-account-button").click();
    await expect(page.getByTestId("account-closed")).toBeVisible();

    const closed = await getUser(user.id);
    expect(closed.closed_at).not.toBe("");
    expect(closed.email).toBe(`closed-${user.id}@closed.invalid`);
  });
});
