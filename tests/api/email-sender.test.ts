import { expect, test } from "@playwright/test";
import { ALL_DAYS_OPENING_HOURS, createLocation } from "../lib/location";
import { waitForMail } from "../lib/mail";
import { createProduct } from "../lib/product";
import { createUser, DEFAULT_PASSWORD } from "../lib/user";
import { getFutureDate } from "../lib/utils";
import { pocketbase } from "../services/pocketbase";

type Address = { Address: string; Name: string };

test.describe("email sender", () => {
  test("location emails are sent from the sender address, with replies to the location", async () => {
    const pb = await pocketbase();
    const { meta } = await pb.settings.getAll();
    const location = await createLocation("multiple", ALL_DAYS_OPENING_HOURS);
    const product = await createProduct(location);
    const user = await createUser();
    const userPb = await pocketbase(user.email, DEFAULT_PASSWORD, false);

    await userPb.collection("reservations").create({
      user: user.id,
      product: product.id,
      location: location.id,
      start: getFutureDate(1),
      end: getFutureDate(2),
      send_confirmation: true,
    });

    const mail = (await waitForMail(user.email, "")) as Awaited<
      ReturnType<typeof waitForMail>
    > & { From: Address; ReplyTo: Address[] };
    expect(mail.From.Address).toBe(meta.senderAddress);
    expect(mail.From.Name).toBe(location.name);
    expect(mail.ReplyTo.map((r) => r.Address)).toEqual([location.email]);
  });
});
