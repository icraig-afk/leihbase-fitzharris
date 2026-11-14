/// <reference path="../pb_data/types.d.ts" />

// Fork-only: community requests, see lib/communityRequests.js

onRecordCreateRequest((e) => {
  /** @type {typeof import('./lib/communityRequests')} */
  const { prepareNewRequest, createDeliveries, sendQueued } = require(
    `${__hooks}/lib/communityRequests`
  );
  const { record } = e;
  if (!record || !e.auth) {
    throw new BadRequestError("Record_not_defined.");
  }
  prepareNewRequest(record, e.auth);

  e.next();

  // Email the neighbours. The request is already saved, so don't fail the
  // request when this fails: the hourly job sends what's left.
  try {
    createDeliveries(record);
    sendQueued();
  } catch (err) {
    console.error("[community-requests] Failed to send the request:", err);
  }
}, "community_requests");

onRecordUpdateRequest((e) => {
  /** @type {typeof import('./lib/communityRequests')} */
  const { dropUnsent } = require(`${__hooks}/lib/communityRequests`);
  const { record } = e;
  if (!record) {
    throw new BadRequestError("Record_not_defined.");
  }

  // Requests can only be closed, by the requester or an admin (update rule).
  // Superusers can edit everything in /_/.
  const body = e.requestInfo().body;
  const fields = Object.keys(body);
  const isClosing = body.status === "closed";
  if (
    !e.hasSuperuserAuth() &&
    (fields.some((field) => field !== "status") || !isClosing)
  ) {
    throw new BadRequestError("Only_closing_allowed.");
  }
  if (!isClosing) {
    e.next();
    return;
  }
  if (record.original().getString("status") !== "open") {
    throw new BadRequestError("Request_closed.");
  }
  const isRequester = e.auth?.id === record.getString("requester");
  record.set("closed_at", new DateTime());
  record.set("closed_reason", isRequester ? "requester" : "admin");

  e.next();
  dropUnsent(record.id);
}, "community_requests");

/**
 * Answers a request from the email, without logging in: the token in the email
 * identifies the neighbour. Body: { token, answer: "yes" | "no", note }
 */
routerAdd("POST", "/api/community-requests/respond", (e) => {
  /** @type {typeof import('./lib/communityRequests')} */
  const { findDelivery, respond } = require(`${__hooks}/lib/communityRequests`);
  const body = e.requestInfo().body;
  const delivery = findDelivery(String(body.token || ""));
  if (!delivery) {
    throw new BadRequestError("Invalid_token.");
  }
  const request = $app.findRecordById(
    "community_requests",
    delivery.getString("request")
  );
  const responder = $app.findRecordById(
    "users",
    delivery.getString("recipient")
  );
  const response = respond(
    request,
    responder,
    String(body.answer || ""),
    String(body.note || "")
  );
  return e.json(200, { answer: response.getString("answer") });
});

/**
 * Answers a request on the website. Body: { request, answer, note }
 */
routerAdd(
  "POST",
  "/api/community-requests/respond-logged-in",
  (e) => {
    /** @type {typeof import('./lib/communityRequests')} */
    const { respond } = require(`${__hooks}/lib/communityRequests`);
    const body = e.requestInfo().body;
    let request;
    try {
      request = $app.findRecordById(
        "community_requests",
        String(body.request || "")
      );
    } catch (_) {
      throw new NotFoundError("Request_not_found.");
    }
    if (!e.auth) {
      throw new UnauthorizedError("Login_required.");
    }
    const responder = $app.findRecordById("users", e.auth.id);
    const response = respond(
      request,
      responder,
      String(body.answer || ""),
      String(body.note || "")
    );
    return e.json(200, { answer: response.getString("answer") });
  },
  $apis.requireAuth("users")
);

/**
 * The request of an email's token, for the page that confirms the answer.
 * Only what the email showed: no account details.
 */
routerAdd("GET", "/api/community-requests/delivery", (e) => {
  /** @type {typeof import('./lib/communityRequests')} */
  const { findDelivery } = require(`${__hooks}/lib/communityRequests`);
  const delivery = findDelivery(
    String(e.request?.url?.query().get("token") || "")
  );
  if (!delivery) {
    throw new BadRequestError("Invalid_token.");
  }
  const request = $app.findRecordById(
    "community_requests",
    delivery.getString("request")
  );
  const recipient = $app.findRecordById(
    "users",
    delivery.getString("recipient")
  );
  const existing = $app.findRecordsByFilter(
    "community_request_responses",
    "request = {:request} && responder = {:responder}",
    "",
    1,
    0,
    { request: request.id, responder: recipient.id }
  )[0];
  return e.json(200, {
    requester_first_name: request.getString("requester_first_name"),
    description: request.getString("description"),
    needed_from: request.getString("needed_from"),
    needed_until: request.getString("needed_until"),
    status: request.getString("status"),
    answer: existing ? existing.getString("answer") : null,
    note: existing ? existing.getString("note") : "",
    opted_out: recipient.getBool("community_requests_opt_out"),
  });
});

/**
 * Stops the request emails, from the link in an email. Body: { token }
 */
routerAdd("POST", "/api/community-requests/opt-out", (e) => {
  /** @type {typeof import('./lib/communityRequests')} */
  const { findDelivery } = require(`${__hooks}/lib/communityRequests`);
  const delivery = findDelivery(String(e.requestInfo().body.token || ""));
  if (!delivery) {
    throw new BadRequestError("Invalid_token.");
  }
  const recipient = $app.findRecordById(
    "users",
    delivery.getString("recipient")
  );
  recipient.set("community_requests_opt_out", true);
  $app.save(recipient);
  return e.noContent(204);
});

/**
 * Runs the hourly job now: sends queued emails and closes expired requests.
 * Superusers only, e.g. for tests.
 */
routerAdd(
  "POST",
  "/api/community-requests/run",
  (e) => {
    /** @type {typeof import('./lib/communityRequests')} */
    const { closeExpired, sendQueued } = require(
      `${__hooks}/lib/communityRequests`
    );
    return e.json(200, { closed: closeExpired(), sent: sendQueued() });
  },
  $apis.requireSuperuserAuth()
);

// Every hour: close requests no longer needed, and send what the daily cap
// held back
cronAdd("community-requests", "0 * * * *", () => {
  /** @type {typeof import('./lib/communityRequests')} */
  const { closeExpired, sendQueued } = require(
    `${__hooks}/lib/communityRequests`
  );
  try {
    const closed = closeExpired();
    const sent = sendQueued();
    if (closed + sent > 0) {
      console.log(
        `[cron/community-requests] closed ${closed}, sent ${sent} email(s)`
      );
    }
  } catch (err) {
    console.error("[cron/community-requests] failed:", err);
  }
});
