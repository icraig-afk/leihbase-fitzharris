/// <reference path="../../pb_data/types.d.ts" />

// Fork-only: community requests ("Does anyone have 2 screws?"). Address-verified
// neighbours ask the community for an item. Neighbours who take part are
// emailed (within a daily cap, the rest the next day), and answer yes or no
// from the email or the website; a yes reaches the requester only, with the
// helper's name, email address and note. The requester's email address is
// never sent to neighbours.

const DAY_MS = 24 * 60 * 60 * 1000;
/** At most this many open requests per member */
const MAX_OPEN_REQUESTS = 3;
/** Requests can't be needed for longer than this ahead */
const MAX_DAYS_AHEAD = 90;
/** Emails a day when no cap is set */
const DEFAULT_DAILY_CAP = 80;
/** Shown in subjects, so they stay short */
const SUBJECT_DESCRIPTION_LENGTH = 60;

/**
 * Like `$app.findRecordsByFilter`, but only returns the records found
 * @param {string} collection
 * @param {string} filter
 * @param {string} sort
 * @param {number} limit
 * @param {{ [key: string]: any }} [params]
 * @returns {core.Record[]}
 */
function findAll(collection, filter, sort, limit, params) {
  const records = $app.findRecordsByFilter(
    collection,
    filter,
    sort,
    limit,
    0,
    params || {}
  );
  /** @type {core.Record[]} */
  const found = [];
  for (const record of records) {
    if (record) {
      found.push(record);
    }
  }
  return found;
}

function getLeihbase() {
  return $app.findAllRecords("leihbase")[0];
}

/** If community requests are on: they need neighbour verification too */
function isEnabled() {
  const leihbase = getLeihbase();
  return (
    !!leihbase &&
    leihbase.getBool("community_requests") &&
    leihbase.getBool("address_verification")
  );
}

function getDailyCap() {
  const leihbase = getLeihbase();
  return (
    (leihbase && leihbase.getInt("community_requests_daily_cap")) ||
    DEFAULT_DAILY_CAP
  );
}

/**
 * If the user can ask and answer: a verified email address and address, and
 * an account that isn't closed
 * @param {core.Record} user
 */
function isParticipant(user) {
  return (
    user.getBool("verified") &&
    user.getBool("address_verified") &&
    !user.getString("closed_at")
  );
}

/** Start of today, UTC */
function startOfToday() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/**
 * Parses a PocketBase date, `null` when empty
 * @param {string} value
 */
function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value.replace(" ", "T"));
  return isNaN(date.getTime()) ? null : date;
}

/** @param {Date} date */
function toFilterDate(date) {
  return date.toISOString().replace("T", " ");
}

/** @param {string} text */
function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The first name, from a full name */
function firstName(/** @type {string} */ name) {
  return (
    String(name || "")
      .trim()
      .split(/\s+/)[0] || ""
  );
}

/** @param {string} token */
function hashToken(token) {
  return $security.sha256(token);
}

/**
 * Validates a new request, and fills in the fields set by the server. Throws a
 * BadRequestError when not allowed.
 * @param {core.Record} request
 * @param {core.Record} requester
 */
function prepareNewRequest(request, requester) {
  if (!isEnabled()) {
    throw new BadRequestError("Community_requests_disabled.");
  }
  if (!isParticipant(requester)) {
    throw new BadRequestError("Not_a_participant.");
  }
  const open = findAll(
    "community_requests",
    "requester = {:user} && status = 'open'",
    "",
    MAX_OPEN_REQUESTS,
    { user: requester.id }
  );
  if (open.length >= MAX_OPEN_REQUESTS) {
    throw new BadRequestError("Too_many_open_requests.");
  }

  const description = String(request.getString("description") || "")
    // No HTML
    .replace(/<\/?("[^"]*"|'[^']*'|[^>])*(>|$)/g, "")
    .trim();
  if (!description) {
    throw new BadRequestError("Description_required.");
  }

  const neededFrom = parseDate(request.getString("needed_from"));
  const neededUntil = parseDate(request.getString("needed_until"));
  const today = startOfToday();
  if (
    !neededFrom ||
    !neededUntil ||
    neededUntil < today ||
    neededUntil < neededFrom ||
    neededUntil.getTime() > today.getTime() + MAX_DAYS_AHEAD * DAY_MS
  ) {
    throw new BadRequestError("Invalid_dates.");
  }

  request.set("description", description);
  request.set("requester_first_name", firstName(requester.getString("name")));
  request.set("status", "open");
  request.set("closed_at", "");
  request.set("closed_reason", "");
}

/**
 * Creates an email delivery to every neighbour who takes part, except the
 * requester
 * @param {core.Record} request
 */
function createDeliveries(request) {
  const recipients = findAll(
    "users",
    "verified = true && address_verified = true && closed_at = '' && community_requests_opt_out = false && id != {:requester}",
    "created",
    0,
    { requester: request.getString("requester") }
  );
  const collection = $app.findCollectionByNameOrId(
    "community_request_deliveries"
  );
  for (const recipient of recipients) {
    const delivery = new Record(collection);
    delivery.set("request", request.id);
    delivery.set("recipient", recipient.id);
    $app.save(delivery);
  }
  return recipients.length;
}

/**
 * Dates of a request, e.g. "16/11/2026 to 20/11/2026"
 * @param {core.Record} request
 * @param {string} locale
 */
function formatNeeded(request, locale) {
  /** @type {typeof import('./email')} */
  const { formatDate } = require(`${__hooks}/lib/email`);
  // Both are required, so always set
  const from = /** @type {Date} */ (
    parseDate(request.getString("needed_from"))
  );
  const until = /** @type {Date} */ (
    parseDate(request.getString("needed_until"))
  );
  return locale.startsWith("de")
    ? `${formatDate(from, locale)} bis ${formatDate(until, locale)}`
    : `${formatDate(from, locale)} to ${formatDate(until, locale)}`;
}

function sender() {
  const settings = $app.settings();
  return {
    address: settings.meta.senderAddress,
    name: settings.meta.senderName,
  };
}

/**
 * Emails a neighbour about a request, with links to answer and to opt out
 * @param {core.Record} request
 * @param {core.Record} recipient
 * @param {string} token
 */
function sendRequestEmail(request, recipient, token) {
  const locale = $os.getenv("CONFIG_LOCALE") || "en";
  const appUrl = $app.settings().meta.appURL;
  const name = request.getString("requester_first_name");
  const description = request.getString("description");
  const shortDescription =
    description.length > SUBJECT_DESCRIPTION_LENGTH
      ? `${description.slice(0, SUBJECT_DESCRIPTION_LENGTH)}…`
      : description;
  const link = (/** @type {string} */ path) =>
    `${appUrl}${path}?token=${encodeURIComponent(token)}`;
  const yes = `${link("/requests/respond")}&answer=yes`;
  const no = `${link("/requests/respond")}&answer=no`;
  const unsubscribe = link("/requests/unsubscribe");

  const text = locale.startsWith("de")
    ? {
        subject: `${name} fragt: ${shortDescription}`,
        intro: `${escapeHtml(name)} aus der Nachbarschaft fragt, ob jemand Folgendes hat:`,
        needed: `Gebraucht: ${formatNeeded(request, locale)}`,
        yes: "Ja, ich kann helfen",
        no: "Nein",
        footer: `Du bekommst diese E-Mail, weil du an den Anfragen der Nachbarschaft teilnimmst. <a href="${unsubscribe}">Keine Anfragen mehr bekommen</a>.`,
      }
    : {
        subject: `${name} asks: ${shortDescription}`,
        intro: `${escapeHtml(name)}, a neighbour, asks if anyone has:`,
        needed: `Needed: ${formatNeeded(request, locale)}`,
        yes: "Yes, I can help",
        no: "No",
        footer: `You get this email because you take part in neighbours' requests. <a href="${unsubscribe}">Stop these emails</a>.`,
      };

  $app.newMailClient().send(
    new MailerMessage({
      from: sender(),
      to: [{ address: recipient.getString("email") }],
      subject: text.subject,
      html: `<p>${text.intro}</p>
<blockquote>${escapeHtml(description)}</blockquote>
<p>${text.needed}</p>
<p><a href="${yes}"><strong>${text.yes}</strong></a> &nbsp;·&nbsp; <a href="${no}">${text.no}</a></p>
<p><small>${text.footer}</small></p>`,
    })
  );
}

/**
 * Sends queued emails of open requests, within the daily cap. Deliveries of
 * closed requests are dropped. Returns how many were sent.
 */
function sendQueued() {
  const sentToday = findAll(
    "community_request_deliveries",
    "sent_at >= {:today}",
    "",
    0,
    { today: toFilterDate(startOfToday()) }
  ).length;
  let remaining = getDailyCap() - sentToday;
  let sent = 0;
  if (remaining <= 0) {
    return sent;
  }

  const queued = findAll(
    "community_request_deliveries",
    "sent_at = ''",
    "created",
    remaining + 50
  );
  for (const delivery of queued) {
    if (remaining <= 0) {
      break;
    }
    let request;
    let recipient;
    try {
      request = $app.findRecordById(
        "community_requests",
        delivery.getString("request")
      );
      recipient = $app.findRecordById("users", delivery.getString("recipient"));
    } catch (_) {
      $app.delete(delivery);
      continue;
    }
    // Closed in the meantime, or the neighbour no longer takes part
    if (
      request.getString("status") !== "open" ||
      !isParticipant(recipient) ||
      recipient.getBool("community_requests_opt_out")
    ) {
      $app.delete(delivery);
      continue;
    }

    const token = $security.randomString(40);
    try {
      sendRequestEmail(request, recipient, token);
    } catch (err) {
      // E.g. the mail server is down: try again later, and don't burn the
      // remaining deliveries
      console.error("[community-requests] Failed to send:", err);
      break;
    }
    delivery.set("token_hash", hashToken(token));
    delivery.set("sent_at", new DateTime());
    $app.save(delivery);
    remaining--;
    sent++;
  }
  return sent;
}

/**
 * Finds the delivery of a token, `null` when unknown
 * @param {string} token
 */
function findDelivery(token) {
  if (!token) {
    return null;
  }
  const deliveries = findAll(
    "community_request_deliveries",
    "token_hash = {:hash} && sent_at != ''",
    "",
    1,
    { hash: hashToken(token) }
  );
  return deliveries[0] || null;
}

/**
 * Emails the requester that a neighbour can help, with the helper's name,
 * email address and note. Replies go to the helper.
 * @param {core.Record} request
 * @param {core.Record} response
 */
function sendYesEmail(request, response) {
  const locale = $os.getenv("CONFIG_LOCALE") || "en";
  const appUrl = $app.settings().meta.appURL;
  const requester = $app.findRecordById(
    "users",
    request.getString("requester")
  );
  const helper = escapeHtml(response.getString("responder_name"));
  const email = escapeHtml(response.getString("responder_email"));
  const note = response.getString("note");
  const description = escapeHtml(request.getString("description"));
  const text = locale.startsWith("de")
    ? {
        subject: `${response.getString("responder_name")} kann dir helfen`,
        intro: `Gute Nachricht: <strong>${helper}</strong> kann dir bei deiner Anfrage helfen:`,
        contact: `Schreib einfach eine Antwort auf diese E-Mail, oder an <a href="mailto:${email}">${email}</a>, um es zu vereinbaren.`,
        note: "Nachricht:",
        link: "Alle Antworten ansehen",
      }
    : {
        subject: `${response.getString("responder_name")} can help`,
        intro: `Good news: <strong>${helper}</strong> can help with your request:`,
        contact: `Just reply to this email, or write to <a href="mailto:${email}">${email}</a>, to arrange it.`,
        note: "Their note:",
        link: "See all answers",
      };
  $app.newMailClient().send(
    new MailerMessage({
      from: sender(),
      to: [{ address: requester.getString("email") }],
      headers: { "Reply-To": response.getString("responder_email") },
      subject: text.subject,
      html: `<p>${text.intro}</p>
<blockquote>${description}</blockquote>
${note ? `<p>${text.note}</p><blockquote>${escapeHtml(note)}</blockquote>` : ""}
<p>${text.contact}</p>
<p><a href="${appUrl}/requests">${text.link}</a></p>`,
    })
  );
}

/**
 * Stores the answer of a neighbour, and emails the requester on a (new) yes.
 * Throws a BadRequestError when not allowed.
 * @param {core.Record} request
 * @param {core.Record} responder
 * @param {string} answer
 * @param {string} note
 */
function respond(request, responder, answer, note) {
  if (!isEnabled()) {
    throw new BadRequestError("Community_requests_disabled.");
  }
  if (answer !== "yes" && answer !== "no") {
    throw new BadRequestError("Invalid_answer.");
  }
  if (request.getString("status") !== "open") {
    throw new BadRequestError("Request_closed.");
  }
  if (request.getString("requester") === responder.id) {
    throw new BadRequestError("Own_request.");
  }
  if (!isParticipant(responder)) {
    throw new BadRequestError("Not_a_participant.");
  }

  const existing = findAll(
    "community_request_responses",
    "request = {:request} && responder = {:responder}",
    "",
    1,
    { request: request.id, responder: responder.id }
  )[0];
  const wasYes = !!existing && existing.getString("answer") === "yes";
  const response =
    existing ||
    new Record($app.findCollectionByNameOrId("community_request_responses"));
  response.set("request", request.id);
  response.set("responder", responder.id);
  response.set("responder_name", responder.getString("name"));
  response.set("responder_email", responder.getString("email"));
  response.set("answer", answer);
  response.set(
    "note",
    String(note || "")
      .replace(/<\/?("[^"]*"|'[^']*'|[^>])*(>|$)/g, "")
      .trim()
      .slice(0, 500)
  );
  $app.save(response);

  if (answer === "yes" && !wasYes) {
    try {
      sendYesEmail(request, response);
    } catch (err) {
      console.error("[community-requests] Failed to email the requester:", err);
    }
  }
  return response;
}

/**
 * Closes a request, and drops its unsent emails
 * @param {core.Record} request
 * @param {"requester" | "expired" | "admin" | "account_closed"} reason
 */
function closeRequest(request, reason) {
  request.set("status", "closed");
  request.set("closed_at", new DateTime());
  request.set("closed_reason", reason);
  $app.save(request);
  dropUnsent(request.id);
}

/** @param {string} requestId */
function dropUnsent(requestId) {
  for (const delivery of findAll(
    "community_request_deliveries",
    "request = {:request} && sent_at = ''",
    "",
    0,
    { request: requestId }
  )) {
    $app.delete(delivery);
  }
}

/** Closes requests no longer needed. Returns how many. */
function closeExpired() {
  const expired = findAll(
    "community_requests",
    "status = 'open' && needed_until < {:today}",
    "",
    0,
    { today: toFilterDate(startOfToday()) }
  );
  for (const request of expired) {
    closeRequest(request, "expired");
  }
  return expired.length;
}

/**
 * Closes the open requests of a user, e.g. when their account is closed
 * @param {string} userId
 */
function closeRequestsOf(userId) {
  for (const request of findAll(
    "community_requests",
    "requester = {:user} && status = 'open'",
    "",
    0,
    { user: userId }
  )) {
    closeRequest(request, "account_closed");
  }
}

module.exports = {
  MAX_OPEN_REQUESTS,
  isEnabled,
  isParticipant,
  prepareNewRequest,
  createDeliveries,
  sendQueued,
  findDelivery,
  respond,
  closeRequest,
  dropUnsent,
  closeExpired,
  closeRequestsOf,
};
