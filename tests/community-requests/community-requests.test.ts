import { expect, test, type Page } from "@playwright/test";
import Client, { ClientResponseError, type RecordModel } from "pocketbase";
import { login } from "../lib/login";
import { waitForMail } from "../lib/mail";
import { createUser, DEFAULT_PASSWORD } from "../lib/user";
import { getFutureDate, uniqueId, waitForHydration } from "../lib/utils";
import { pocketbase } from "../services/pocketbase";

// Fork-only: community requests (pocketbase/pb_hooks/lib/communityRequests.js).
// Switched on for the whole instance, and emails every neighbour who takes
// part, so these tests run on their own, after all other tests (see the
// "Community requests" project in playwright.config.ts).
test.describe.configure({ mode: "serial" });

async function getLeihbase() {
  const pb = await pocketbase();
  return (await pb.collection("leihbase").getFullList())[0]!;
}

async function setLeihbase(data: Record<string, unknown>) {
  const pb = await pocketbase();
  await pb.collection("leihbase").update((await getLeihbase()).id, data);
}

/** A neighbour who takes part, logged in */
async function createNeighbour(
  options: { addressVerified?: boolean; optOut?: boolean } = {}
) {
  const user = await createUser(
    `neighbour-${uniqueId()}@example.com`,
    undefined,
    "user",
    [],
    { addressVerified: options.addressVerified ?? true }
  );
  if (options.optOut) {
    const pb = await pocketbase();
    await pb
      .collection("users")
      .update(user.id, { community_requests_opt_out: true });
  }
  const userPb = await pocketbase(user.email, DEFAULT_PASSWORD, false);
  return { user, userPb };
}

function createRequest(
  pb: Client,
  user: RecordModel,
  data: Record<string, unknown> = {}
) {
  return pb.collection("community_requests").create({
    requester: user.id,
    description: "2 wood screws, 4 x 40 mm",
    needed_from: getFutureDate(0),
    needed_until: getFutureDate(7),
    ...data,
  });
}

/** The deliveries of a request to the given users */
async function getDeliveries(request: RecordModel, users: RecordModel[]) {
  const pb = await pocketbase();
  const deliveries = await pb
    .collection("community_request_deliveries")
    .getFullList({
      filter: pb.filter("request = {:request}", { request: request.id }),
    });
  const ids = users.map((user) => user.id);
  return deliveries.filter((delivery) => ids.includes(delivery.recipient));
}

/** The token from the request email to the user */
async function getToken(user: RecordModel) {
  const mail = await waitForMail(user.email, "asks:");
  const token = mail.HTML.match(/token=([^&"]+)/)?.[1];
  expect(token).toBeTruthy();
  return decodeURIComponent(token!);
}

function anonymousPb() {
  return new Client(process.env.POCKETBASE_BASE_URL || "http://127.0.0.1:8081");
}

async function runJob() {
  const pb = await pocketbase();
  return pb.send<{ closed: number; sent: number }>(
    "/api/community-requests/run",
    { method: "POST" }
  );
}

test.describe("community requests", () => {
  test.beforeAll(async () => {
    // Users of other tests don't take part, so each request only emails the
    // neighbours of its own test
    const pb = await pocketbase();
    const users = await pb.collection("users").getFullList({
      filter: "community_requests_opt_out = false",
      fields: "id",
    });
    for (const user of users) {
      await pb
        .collection("users")
        .update(user.id, { community_requests_opt_out: true });
    }
  });

  test.beforeEach(async () => {
    await setLeihbase({
      community_requests: true,
      community_requests_daily_cap: 100000,
    });
  });

  test.afterAll(async () => {
    await setLeihbase({
      community_requests: false,
      community_requests_daily_cap: 0,
    });
  });

  test("only verified neighbours can ask, and only when switched on", async () => {
    const { user: unverified, userPb: unverifiedPb } = await createNeighbour({
      addressVerified: false,
    });
    await expect(createRequest(unverifiedPb, unverified)).rejects.toThrow(
      ClientResponseError
    );

    await setLeihbase({ community_requests: false });
    const { user, userPb } = await createNeighbour();
    await expect(createRequest(userPb, user)).rejects.toThrow(
      "Community_requests_disabled."
    );
  });

  test("neighbours who take part get the request, without the requester's email address", async () => {
    const { user: requester, userPb } = await createNeighbour();
    const { user: neighbour } = await createNeighbour();
    const { user: optedOut } = await createNeighbour({ optOut: true });
    const { user: unverified } = await createNeighbour({
      addressVerified: false,
    });

    const request = await createRequest(userPb, requester);
    const deliveries = await getDeliveries(request, [
      requester,
      neighbour,
      optedOut,
      unverified,
    ]);
    expect(deliveries.map((d) => d.recipient)).toEqual([neighbour.id]);
    expect(deliveries[0]!.sent_at).not.toBe("");

    const mail = await waitForMail(neighbour.email, "asks:");
    expect(mail.Subject).toContain("Test asks: 2 wood screws");
    expect(mail.HTML).toContain("2 wood screws, 4 x 40 mm");
    expect(mail.HTML).not.toContain(requester.email);
  });

  test("a yes from the email reaches the requester only, with the helper's details", async () => {
    const { user: requester, userPb: requesterPb } = await createNeighbour();
    const { user: helper } = await createNeighbour();
    const request = await createRequest(requesterPb, requester);
    const token = await getToken(helper);

    // The confirmation page shows the request, not the requester's details
    const delivery = await anonymousPb().send(
      "/api/community-requests/delivery",
      {
        query: { token },
      }
    );
    expect(delivery.description).toBe("2 wood screws, 4 x 40 mm");
    expect(JSON.stringify(delivery)).not.toContain(requester.email);

    await anonymousPb().send("/api/community-requests/respond", {
      method: "POST",
      body: { token, answer: "yes", note: "Pick them up any evening" },
    });
    const mail = await waitForMail(requester.email, "can help");
    expect(mail.HTML).toContain(helper.email);
    expect(mail.HTML).toContain("Pick them up any evening");

    const responses = await requesterPb
      .collection("community_request_responses")
      .getFullList({
        filter: requesterPb.filter("request = {:request}", {
          request: request.id,
        }),
      });
    expect(responses.map((r) => [r.answer, r.responder_email])).toEqual([
      ["yes", helper.email],
    ]);

    // A wrong token doesn't work
    await expect(
      anonymousPb().send("/api/community-requests/respond", {
        method: "POST",
        body: { token: "wrong", answer: "yes" },
      })
    ).rejects.toThrow("Invalid_token.");
  });

  test("answering on the website, and closing", async () => {
    const { user: requester, userPb: requesterPb } = await createNeighbour();
    const { userPb: neighbourPb } = await createNeighbour();
    const request = await createRequest(requesterPb, requester);
    const respond = (pb: Client, answer: string) =>
      pb.send("/api/community-requests/respond-logged-in", {
        method: "POST",
        body: { request: request.id, answer },
      });

    await expect(respond(neighbourPb, "no")).resolves.toEqual({ answer: "no" });
    await expect(respond(requesterPb, "yes")).rejects.toThrow("Own_request.");

    // Only the requester closes it
    await expect(
      neighbourPb
        .collection("community_requests")
        .update(request.id, { status: "closed" })
    ).rejects.toThrow(ClientResponseError);
    const closed = await requesterPb
      .collection("community_requests")
      .update(request.id, { status: "closed" });
    expect(closed.closed_reason).toBe("requester");

    // Closed requests can't be answered, and neighbours no longer see them
    await expect(respond(neighbourPb, "yes")).rejects.toThrow(
      "Request_closed."
    );
    await expect(
      neighbourPb.collection("community_requests").getOne(request.id)
    ).rejects.toThrow();
  });

  test("the daily cap holds, and the rest go out later", async () => {
    const { user: requester, userPb } = await createNeighbour();
    const { user: neighbour } = await createNeighbour();
    // Earlier tests already sent emails today
    await setLeihbase({ community_requests_daily_cap: 1 });

    const request = await createRequest(userPb, requester);
    expect((await getDeliveries(request, [neighbour]))[0]!.sent_at).toBe("");

    await setLeihbase({ community_requests_daily_cap: 100000 });
    expect((await runJob()).sent).toBeGreaterThanOrEqual(1);
    expect((await getDeliveries(request, [neighbour]))[0]!.sent_at).not.toBe(
      ""
    );
  });

  test("requests close once no longer needed", async () => {
    const { user: requester, userPb } = await createNeighbour();
    const request = await createRequest(userPb, requester, {
      needed_until: getFutureDate(0),
    });
    const pb = await pocketbase();
    await pb
      .collection("community_requests")
      .update(request.id, { needed_until: getFutureDate(-2) });

    await runJob();
    const expired = await pb
      .collection("community_requests")
      .getOne(request.id);
    expect(expired.status).toBe("closed");
    expect(expired.closed_reason).toBe("expired");
  });

  test("neighbours opt out from the email", async () => {
    const { user: requester, userPb } = await createNeighbour();
    const { user: neighbour } = await createNeighbour();
    await createRequest(userPb, requester);
    const token = await getToken(neighbour);

    await anonymousPb().send("/api/community-requests/opt-out", {
      method: "POST",
      body: { token },
    });
    const pb = await pocketbase();
    expect(
      (await pb.collection("users").getOne(neighbour.id))
        .community_requests_opt_out
    ).toBe(true);
  });

  test("at most 3 open requests", async () => {
    const { user, userPb } = await createNeighbour();
    for (let i = 0; i < 3; i++) {
      await createRequest(userPb, user, { description: `Thing ${i}` });
    }
    await expect(createRequest(userPb, user)).rejects.toThrow(
      "Too_many_open_requests."
    );
  });

  test("dates must be from today, for at most 90 days", async () => {
    const { user, userPb } = await createNeighbour();
    for (const dates of [
      { needed_until: getFutureDate(-1) },
      { needed_until: getFutureDate(120) },
      { needed_from: getFutureDate(5), needed_until: getFutureDate(2) },
    ]) {
      await expect(createRequest(userPb, user, dates)).rejects.toThrow(
        "Invalid_dates."
      );
    }
  });

  test("asking and answering on the website", async ({ page, browser }) => {
    const { user: requester } = await createNeighbour();
    const { user: helper } = await createNeighbour();

    // Ask from the home page
    await login(page, requester.email, DEFAULT_PASSWORD);
    await page.goto("/");
    await waitForHydration(page);
    await page.getByTestId("ask-community-button").click();
    await page.waitForURL("/requests/new");
    await waitForHydration(page);
    await page.getByTestId("request-description").fill("A ladder for an hour");
    await pickDate(page, "request-needed-until");
    await page.getByTestId("request-submit").click();
    await page.waitForURL(/\/requests\?sent=1/);
    await expect(page.getByTestId("my-request")).toContainText(
      "A ladder for an hour"
    );

    // The helper answers from the link in the email, without logging in
    const token = await getToken(helper);
    const helperContext = await browser.newContext();
    const helperPage = await helperContext.newPage();
    await helperPage.goto(
      `/requests/respond?token=${encodeURIComponent(token)}&answer=yes`
    );
    await waitForHydration(helperPage);
    await expect(helperPage.getByTestId("respond-description")).toContainText(
      "A ladder for an hour"
    );
    await helperPage.getByTestId("respond-note").fill("Come round at 6");
    await helperPage.getByTestId("respond-submit").click();
    await expect(helperPage.getByTestId("respond-sent")).toBeVisible();
    await helperContext.close();

    // The requester sees the answer
    await page.goto("/requests");
    await waitForHydration(page);
    await expect(page.getByTestId("request-answer")).toContainText(
      helper.email
    );
    await expect(page.getByTestId("request-answer")).toContainText(
      "Come round at 6"
    );
  });

  test("the profile switch turns the emails off", async ({ page }) => {
    const { user } = await createNeighbour();
    await login(page, user.email, DEFAULT_PASSWORD);
    const toggle = page.getByTestId("request-emails-switch");
    await expect(toggle).toBeChecked();
    await toggle.uncheck({ force: true });

    const pb = await pocketbase();
    await expect
      .poll(
        async () =>
          (await pb.collection("users").getOne(user.id))
            .community_requests_opt_out
      )
      .toBe(true);
  });

  test("neighbours without a verified address see why they can't ask", async ({
    page,
  }) => {
    const { user } = await createNeighbour({ addressVerified: false });
    await login(page, user.email, DEFAULT_PASSWORD);
    await page.goto("/requests/new");
    await waitForHydration(page);
    await expect(page.getByTestId("requests-unverified")).toBeVisible();
    await expect(page.getByTestId("request-submit")).toHaveCount(0);
  });
});

/**
 * Picks the first available day of next month in a date input
 */
async function pickDate(page: Page, testId: string) {
  await page.getByTestId(testId).click();
  const calendar = page.getByTestId(`${testId}-calendar`);
  await expect(calendar).toBeVisible();
  await calendar.locator("div button").nth(1).click({ force: true });
  await calendar
    .locator("shadow=calendar-month >> td button:not([aria-disabled=true])")
    .first()
    .click();
}
