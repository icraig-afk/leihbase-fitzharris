import { expect, test } from "@playwright/test";
import PocketBase, { ClientResponseError } from "pocketbase";
import { waitForMail } from "../lib/mail";
import { createProduct } from "../lib/product";
import { createUser, DEFAULT_PASSWORD, getTestStreetId } from "../lib/user";
import { getFutureDate, uniqueId } from "../lib/utils";
import { pocketbase } from "../services/pocketbase";

type Letter = { code: string; expires: string; street: string };

/** Asserts that the promise is rejected with the given PocketBase message */
async function expectError(promise: Promise<unknown>, message: string) {
  const error = await promise.then(
    () => null,
    (e) => e
  );
  expect(error).toBeInstanceOf(ClientResponseError);
  expect((error as ClientResponseError).response.message).toBe(message);
}

function anonymous() {
  return new PocketBase(
    process.env.POCKETBASE_BASE_URL || "http://127.0.0.1:8081"
  );
}

async function signup(data: Record<string, unknown>) {
  return anonymous()
    .collection("users")
    .create({
      name: "Neighbour",
      email: `neighbour-${uniqueId()}@example.com`,
      password: DEFAULT_PASSWORD,
      passwordConfirm: DEFAULT_PASSWORD,
      terms: true,
      ...data,
    });
}

/** Creates an unverified neighbour and returns its client */
async function createNeighbour() {
  const user = await createUser(undefined, undefined, "user", [], {
    addressVerified: false,
  });
  const pb = await pocketbase(user.email, DEFAULT_PASSWORD, false);
  return { user, pb };
}

async function createAdminClient() {
  const admin = await createUser(undefined, undefined, "admin");
  return pocketbase(admin.email, DEFAULT_PASSWORD, false);
}

function issue(pb: PocketBase, userId: string) {
  return pb.send<Letter>(`/api/address-verification/${userId}/issue`, {
    method: "POST",
  });
}

function redeem(pb: PocketBase, code: string) {
  return pb.send("/api/address-verification/redeem", {
    method: "POST",
    body: { code },
  });
}

async function reserve(pb: PocketBase, userId: string) {
  const product = await createProduct();
  return pb.collection("reservations").create({
    user: userId,
    product: product.id,
    start: getFutureDate(2),
    end: getFutureDate(4),
  });
}

test.describe("address verification", () => {
  test.describe("sign up", () => {
    test("requires street and house number", async () => {
      await expectError(signup({}), "Address_required.");
      await expectError(
        signup({ street: await getTestStreetId(), house_number: " " }),
        "Address_required."
      );
    });

    test("rejects streets that aren't active", async () => {
      const pb = await pocketbase();
      const street = await pb
        .collection("streets")
        .create({ name: `Closed Street ${uniqueId()}`, active: false });
      await expectError(
        signup({ street: street.id, house_number: "1" }),
        "Street_not_allowed."
      );
    });

    test("ignores a self-set verification flag", async () => {
      const user = await signup({
        street: await getTestStreetId(),
        house_number: "1",
        address_verified: true,
      });
      const pb = await pocketbase();
      expect(
        (await pb.collection("users").getOne(user.id)).address_verified
      ).toBe(false);
    });
  });

  test("admins are emailed about a new neighbour", async () => {
    const admin = await createUser(undefined, undefined, "admin");
    const name = `Neighbour ${uniqueId()}`;
    await signup({
      name,
      street: await getTestStreetId(),
      house_number: "7",
    });
    const mail = await waitForMail(admin.email, name);
    expect(mail.Subject).toBe(`New neighbour needs a code: ${name}`);
    expect(mail.HTML).toContain("7 Test Street");
    expect(mail.HTML).toContain("/admin/neighbours");
    // Superusers are notified too
    await waitForMail("test@example.com", name);
  });

  test("unverified neighbour can't reserve", async () => {
    const { user, pb } = await createNeighbour();
    await expectError(reserve(pb, user.id), "User_address_not_verified.");
  });

  test("user can't verify themselves", async () => {
    const { user, pb } = await createNeighbour();
    await pb.collection("users").update(user.id, { address_verified: true });
    const superuser = await pocketbase();
    expect(
      (await superuser.collection("users").getOne(user.id)).address_verified
    ).toBe(false);
  });

  test("only admins can list and issue codes", async () => {
    const { user, pb } = await createNeighbour();
    await expectError(
      pb.send("/api/address-verification/pending", {}),
      "Admins_only."
    );
    await expectError(issue(pb, user.id), "Admins_only.");
  });

  test("admin sees neighbour with address in pending list", async () => {
    const { user } = await createNeighbour();
    const admin = await createAdminClient();
    const { items } = await admin.send<{
      items: { id: string; street: string; house_number: string }[];
    }>("/api/address-verification/pending", {});
    const item = items.find((i) => i.id === user.id);
    expect(item?.street).toBe("Test Street");
    expect(item?.house_number).toBe("1");
  });

  test("correct code verifies the neighbour, who can then reserve", async () => {
    const { user, pb } = await createNeighbour();
    const admin = await createAdminClient();
    const letter = await issue(admin, user.id);
    expect(letter.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // Lower case and spaces are accepted
    await redeem(pb, letter.code.toLowerCase().replace("-", " "));
    await pb.collection("users").authRefresh();
    expect(pb.authStore.record?.address_verified).toBe(true);
    await reserve(pb, user.id);

    await expectError(redeem(pb, letter.code), "Already_verified.");
    await expectError(issue(admin, user.id), "Already_verified.");
  });

  test("re-issuing invalidates the earlier code", async () => {
    const { user, pb } = await createNeighbour();
    const admin = await createAdminClient();
    const first = await issue(admin, user.id);
    const second = await issue(admin, user.id);
    await expectError(redeem(pb, first.code), "Code_invalid.");
    await redeem(pb, second.code);
  });

  test("wrong codes are limited to 5 attempts", async () => {
    const { user, pb } = await createNeighbour();
    const admin = await createAdminClient();
    const letter = await issue(admin, user.id);
    for (let i = 0; i < 5; i++) {
      await expectError(redeem(pb, "AAAA-AAAA"), "Code_invalid.");
    }
    await expectError(redeem(pb, letter.code), "Too_many_attempts.");
  });

  test("expired codes are rejected", async () => {
    const { user, pb } = await createNeighbour();
    const admin = await createAdminClient();
    const letter = await issue(admin, user.id);
    const superuser = await pocketbase();
    const record = await superuser
      .collection("address_codes")
      .getFirstListItem(
        superuser.filter('user = {:user} && used = ""', { user: user.id })
      );
    await superuser
      .collection("address_codes")
      .update(record.id, { expires: new Date(Date.now() - 864e5) });
    await expectError(redeem(pb, letter.code), "Code_expired.");
  });

  test("address can't be changed once verified", async () => {
    const user = await createUser();
    const pb = await pocketbase(user.email, DEFAULT_PASSWORD, false);
    await expectError(
      pb.collection("users").update(user.id, { house_number: "99" }),
      "Address_locked."
    );
    // Other fields stay editable
    await pb.collection("users").update(user.id, { name: "Renamed" });
  });
});
