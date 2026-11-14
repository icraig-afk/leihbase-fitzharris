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
 * The retention periods, in days (`null` when not used), for the
 * {RETENTION_…} placeholders in the privacy policy. Public, like the privacy
 * policy itself.
 */
routerAdd("GET", "/api/retention/periods", (e) => {
  /** @type {typeof import('./lib/retention')} */
  const { getPeriods } = require(`${__hooks}/lib/retention`);
  return e.json(200, getPeriods());
});

/**
 * Finds closed accounts by the email address they had, using the fingerprint
 * kept when closing, with the agreements they accepted. Superusers only, e.g.
 * for a dispute: GET /api/retention/closed-accounts?email=jane@example.com
 */
routerAdd(
  "GET",
  "/api/retention/closed-accounts",
  (e) => {
    /** @type {typeof import('./lib/retention')} */
    const { hashEmail } = require(`${__hooks}/lib/retention`);
    const email = String(e.request?.url?.query().get("email") || "");
    if (!email) {
      throw new BadRequestError("Email_required.");
    }
    const users = $app.findRecordsByFilter(
      "users",
      "closed_email_hash = {:hash}",
      "-closed_at",
      0,
      0,
      { hash: hashEmail(email) }
    );
    /**
     * @param {string} collection
     * @param {string} field
     * @param {string} user
     */
    const acceptances = (collection, field, user) =>
      $app
        .findRecordsByFilter(collection, "user = {:user}", "created", 0, 0, {
          user,
        })
        .filter((record) => !!record)
        .map((record) => ({
          [field]: record?.getString(field),
          accepted: record?.getString("created"),
        }));
    return e.json(
      200,
      users
        .filter((user) => !!user)
        .map((user) => ({
          id: user?.id,
          created: user?.getString("created"),
          closed_at: user?.getString("closed_at"),
          privacy_policies: acceptances(
            "privacy_policy_acceptances",
            "privacy_policy",
            user?.id || ""
          ),
          borrow_agreements: acceptances(
            "borrow_agreement_acceptances",
            "borrow_agreement",
            user?.id || ""
          ),
        }))
    );
  },
  $apis.requireSuperuserAuth()
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
