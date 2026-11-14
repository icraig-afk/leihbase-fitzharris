/// <reference path="../pb_data/types.d.ts" />

// Fork-only: data retention, as described in the privacy policy (see
// lib/retention.js)

// Every night at 03:00. Posts a summary to the alert webhook when something
// was done or failed, and on the 1st of the month, so it's visible the job
// still runs.
cronAdd("data-retention", "0 3 * * *", () => {
  /** @type {typeof import('./lib/retention')} */
  const { runRetention, formatSummary, postToWebhook } = require(
    `${__hooks}/lib/retention`
  );
  const result = runRetention();
  const summary = formatSummary(result);
  console.log(`[cron/data-retention] ${summary.replace(/\n/g, " | ")}`);

  const didSomething =
    result.accountsClosed +
      result.warningsSent +
      result.accountsDeleted +
      result.reservationsAnonymised +
      result.closingSkipped >
    0;
  if (
    didSomething ||
    result.errors.length > 0 ||
    new Date().getUTCDate() === 1
  ) {
    postToWebhook(summary);
  }
});

// Logins and visits (the web app refreshes the login on every visit) count as
// activity of the user
onRecordAuthRequest((e) => {
  e.next();
  try {
    /** @type {typeof import('./lib/retention')} */
    const { recordActivity } = require(`${__hooks}/lib/retention`);
    if (e.record) {
      recordActivity(e.record);
    }
  } catch (err) {
    console.error("[retention] Failed to record activity:", err);
  }
}, "users");

/**
 * Closes the account of the logged in user, on their own request. Not possible
 * while they have an open reservation.
 */
routerAdd(
  "POST",
  "/api/account/close",
  (e) => {
    /** @type {typeof import('./lib/retention')} */
    const { closeAccount, hasOpenReservation } = require(
      `${__hooks}/lib/retention`
    );
    const user = e.auth;
    if (!user || user.collection().name !== "users") {
      throw new UnauthorizedError("Login_required.");
    }
    if (hasOpenReservation(user.id)) {
      throw new BadRequestError("Account_has_open_reservation.");
    }
    closeAccount(user);
    return e.noContent(204);
  },
  $apis.requireAuth("users")
);

/**
 * Runs the data retention now, instead of waiting for the night. Superusers
 * only, e.g. for tests.
 */
routerAdd(
  "POST",
  "/api/retention/run",
  (e) => {
    /** @type {typeof import('./lib/retention')} */
    const { runRetention } = require(`${__hooks}/lib/retention`);
    return e.json(200, runRetention());
  },
  $apis.requireSuperuserAuth()
);
