/// <reference path="../../pb_data/types.d.ts" />

// Fork-only: data retention, as described in the privacy policy. Run every
// night by retention.cron.pb.js. The periods are set on the leihbase record, in
// days; empty or 0 turns that part off.

const DAY_MS = 24 * 60 * 60 * 1000;
/** Record the activity of a user at most once a day */
const ACTIVITY_INTERVAL_MS = DAY_MS;
/** Discord rejects messages longer than 2000 characters */
const MAX_MESSAGE_LENGTH = 1900;

/**
 * The retention periods, in days, 0 when off
 */
function getSettings() {
  const leihbase = $app.findAllRecords("leihbase")[0];
  /** @param {string} field */
  const days = (field) => (leihbase ? leihbase.getInt(field) : 0) || 0;
  return {
    inactiveDays: days("retention_inactive_days"),
    warningDays: days("retention_warning_days"),
    reservationDays: days("retention_reservation_days"),
    closedDays: days("retention_closed_days"),
  };
}

/**
 * Parses a PocketBase date, `null` when empty
 * @param {string} value
 * @returns {Date | null}
 */
function parseDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value.replace(" ", "T"));
  return isNaN(date.getTime()) ? null : date;
}

/**
 * PocketBase date string of a JS date, for filters
 * @param {Date} date
 */
function toFilterDate(date) {
  return date.toISOString().replace("T", " ");
}

/**
 * Like `$app.findRecordsByFilter`, but only returns the records found
 * @param {string} collection
 * @param {string} filter
 * @param {string} sort
 * @param {number} limit
 * @param {number} offset
 * @param {{ [key: string]: any }} [params]
 * @returns {core.Record[]}
 */
function findAll(collection, filter, sort, limit, offset, params) {
  const records = params
    ? $app.findRecordsByFilter(collection, filter, sort, limit, offset, params)
    : $app.findRecordsByFilter(collection, filter, sort, limit, offset);
  /** @type {core.Record[]} */
  const found = [];
  for (const record of records) {
    if (record) {
      found.push(record);
    }
  }
  return found;
}

/**
 * Records that the user is active, at most once a day. Activity cancels a
 * pending warning about closing the account.
 * @param {core.Record} user
 */
function recordActivity(user) {
  const lastActive = parseDate(user.getString("last_active"));
  if (lastActive && Date.now() - lastActive.getTime() < ACTIVITY_INTERVAL_MS) {
    return;
  }
  // Load the user fresh, as the auth record may be enriched or outdated
  const record = $app.findRecordById("users", user.id);
  record.set("last_active", new DateTime());
  record.set("retention_warning_sent", "");
  $app.save(record);
}

/**
 * When the user was last active: their last login or visit (or else when they
 * signed up), or the end of their latest reservation, whichever is later
 * @param {core.Record} user
 * @returns {Date}
 */
function getLastActivity(user) {
  const dates = [
    parseDate(user.getString("last_active")) ||
      parseDate(user.getString("created")),
  ];
  const reservations = findAll("reservations", "user = {:user}", "-end", 1, 0, {
    user: user.id,
  });
  const latest = reservations[0];
  if (latest) {
    dates.push(parseDate(latest.getString("end")));
  }
  let time = 0;
  for (const date of dates) {
    if (date && date.getTime() > time) {
      time = date.getTime();
    }
  }
  return new Date(time);
}

/**
 * If the user has a reservation that isn't over: not cancelled or ended, and
 * the item is picked up or the end is still to come
 * @param {string} userId
 */
function hasOpenReservation(userId) {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const reservations = findAll(
    "reservations",
    "user = {:user} && cancelled = false && ended = false && (started = true || end >= {:today})",
    "",
    1,
    0,
    { user: userId, today: toFilterDate(startOfToday) }
  );
  return reservations.length > 0;
}

/**
 * Closes the account: removes the personal data and makes logging in
 * impossible, but keeps the record, so the agreements it accepted (and its
 * reservations, until they are anonymised) still refer to it
 * @param {core.Record} user
 */
function closeAccount(user) {
  const record = $app.findRecordById("users", user.id);
  record.set("name", "Closed account");
  record.setEmail(`closed-${record.id}@closed.invalid`);
  record.set("emailVisibility", false);
  record.setVerified(false);
  record.setPassword($security.randomString(40));
  record.set("avatar", "");
  record.set("street", "");
  record.set("house_number", "");
  record.set("address_extra", "");
  record.set("role", "user");
  record.set("manager_locations", []);
  record.set("close_requested", false);
  record.set("retention_warning_sent", "");
  record.set("closed_at", new DateTime());
  $app.save(record);

  // Codes posted to the address are no longer needed
  for (const code of findAll("address_codes", "user = {:user}", "", -1, 0, {
    user: record.id,
  })) {
    $app.delete(code);
  }
}

/**
 * Emails the user that their account will be closed, unless they log in
 * @param {core.Record} user
 * @param {Date} closingDate
 */
function sendWarning(user, closingDate) {
  const locale = $os.getenv("CONFIG_LOCALE") || "en";
  const settings = $app.settings();
  const loginUrl = `${settings.meta.appURL}/login`;
  const date = closingDate.toLocaleDateString(
    locale === "de" ? "de-DE" : "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
  );
  const name = String(user.getString("name") || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const text =
    locale === "de"
      ? {
          subject: `Dein Konto bei ${settings.meta.appName} wird geschlossen`,
          html: `<p>Hallo ${name},</p>
<p>du hast dein Konto bei ${settings.meta.appName} lange nicht genutzt. Wie in unserer Datenschutzerklärung beschrieben, schließen wir es am ${date} und löschen deine persönlichen Daten.</p>
<p>Wenn du dein Konto behalten möchtest, <a href="${loginUrl}">melde dich einfach vorher an</a>.</p>`,
        }
      : {
          subject: `Your ${settings.meta.appName} account will be closed`,
          html: `<p>Hi ${name},</p>
<p>you haven't used your ${settings.meta.appName} account for a long time. As described in our privacy policy, we'll close it on ${date} and remove your personal data.</p>
<p>If you'd like to keep your account, just <a href="${loginUrl}">log in</a> before then.</p>`,
        };
  $app.newMailClient().send(
    new MailerMessage({
      from: {
        address: settings.meta.senderAddress,
        name: settings.meta.senderName,
      },
      to: [{ address: user.getString("email") }],
      subject: text.subject,
      html: text.html,
    })
  );
}

/**
 * Posts a message to the alert webhook (CONFIG_MAIL_ALERT_WEBHOOK_URL), if set.
 * Never throws.
 * @param {string} content
 */
function postToWebhook(content) {
  const url = ($os.getenv("CONFIG_MAIL_ALERT_WEBHOOK_URL") || "").trim();
  if (!url) {
    return;
  }
  try {
    $http.send({
      url,
      method: "POST",
      body: JSON.stringify({
        content: content.slice(0, MAX_MESSAGE_LENGTH),
        allowed_mentions: { parse: [] },
      }),
      headers: { "Content-Type": "application/json" },
      timeout: 10,
    });
  } catch (err) {
    console.error("[retention] Failed to post to the webhook:", err);
  }
}

/**
 * Runs all retention steps, returns what was done
 * @param {Date} [now]
 */
function runRetention(now = new Date()) {
  const settings = getSettings();
  const result = {
    codesDeleted: 0,
    warningsSent: 0,
    accountsClosed: 0,
    closingSkipped: 0,
    reservationsAnonymised: 0,
    accountsDeleted: 0,
    errors: /** @type {string[]} */ ([]),
  };

  /**
   * Runs a step for a record, collecting errors instead of stopping
   * @param {string} step
   * @param {() => void} fn
   */
  const attempt = (step, fn) => {
    try {
      fn();
    } catch (err) {
      result.errors.push(`${step}: ${err}`);
      console.error(`[retention] ${step} failed:`, err);
    }
  };

  // 1. Address codes: kept until used or expired. The user keeps whether, and
  // when, their address was verified.
  for (const code of findAll(
    "address_codes",
    "used != '' || expires < {:now}",
    "",
    -1,
    0,
    { now: toFilterDate(now) }
  )) {
    attempt(`delete code ${code.id}`, () => {
      $app.delete(code);
      result.codesDeleted++;
    });
  }

  // 2. Accounts the user, or an admin, asked to close
  for (const user of findAll(
    "users",
    "close_requested = true && closed_at = ''",
    "",
    -1,
    0
  )) {
    attempt(`close requested account ${user.id}`, () => {
      if (hasOpenReservation(user.id)) {
        result.closingSkipped++;
        return;
      }
      closeAccount(user);
      result.accountsClosed++;
    });
  }

  // 3. Inactive accounts: warned first, then closed. Staff accounts are never
  // closed automatically.
  if (settings.inactiveDays > 0) {
    const inactiveSince = now.getTime() - settings.inactiveDays * DAY_MS;
    const warnSince = inactiveSince + settings.warningDays * DAY_MS;
    for (const user of findAll(
      "users",
      "role = 'user' && closed_at = ''",
      "",
      -1,
      0
    )) {
      attempt(`inactive account ${user.id}`, () => {
        const lastActivity = getLastActivity(user).getTime();
        let warningSent = parseDate(user.getString("retention_warning_sent"));

        // Active again since the warning (e.g. a reservation made by staff):
        // the warning no longer applies
        if (warningSent && lastActivity > warningSent.getTime()) {
          user.set("retention_warning_sent", "");
          $app.save(user);
          warningSent = null;
        }

        // Warn before closing
        if (settings.warningDays > 0 && !warningSent) {
          if (lastActivity <= warnSince) {
            sendWarning(
              user,
              new Date(now.getTime() + settings.warningDays * DAY_MS)
            );
            user.set("retention_warning_sent", new DateTime());
            $app.save(user);
            result.warningsSent++;
          }
          return;
        }

        // Close once inactive for the whole period, and warned long enough ago
        const warnedLongEnough =
          settings.warningDays === 0 ||
          (warningSent &&
            now.getTime() - warningSent.getTime() >=
              settings.warningDays * DAY_MS);
        if (lastActivity <= inactiveSince && warnedLongEnough) {
          if (hasOpenReservation(user.id)) {
            result.closingSkipped++;
            return;
          }
          closeAccount(user);
          result.accountsClosed++;
        }
      });
    }
  }

  // 4. Reservations: anonymised a while after they ended. The item and dates
  // are kept, so the statistics stay right.
  if (settings.reservationDays > 0) {
    for (const reservation of findAll(
      "reservations",
      "anonymised_at = '' && end < {:cutoff}",
      "",
      -1,
      0,
      {
        cutoff: toFilterDate(
          new Date(now.getTime() - settings.reservationDays * DAY_MS)
        ),
      }
    )) {
      attempt(`anonymise reservation ${reservation.id}`, () => {
        reservation.set("user", "");
        reservation.set("message", "");
        reservation.set("note", "");
        reservation.set("sent_emails", []);
        reservation.set("anonymised_at", new DateTime());
        $app.save(reservation);
        result.reservationsAnonymised++;
      });
    }
  }

  // 5. Closed accounts: deleted after the period, with the agreements they
  // accepted
  if (settings.closedDays > 0) {
    for (const user of findAll(
      "users",
      "closed_at != '' && closed_at < {:cutoff}",
      "",
      -1,
      0,
      {
        cutoff: toFilterDate(
          new Date(now.getTime() - settings.closedDays * DAY_MS)
        ),
      }
    )) {
      attempt(`delete closed account ${user.id}`, () => {
        $app.delete(user);
        result.accountsDeleted++;
      });
    }
  }

  return result;
}

/**
 * A short summary of a run, for the webhook
 * @param {ReturnType<typeof runRetention>} result
 */
function formatSummary(result) {
  const appName = $app.settings().meta.appName;
  const lines = [
    `🧹 **Data retention** (${appName})`,
    `Accounts closed: ${result.accountsClosed}, warnings sent: ${result.warningsSent}, closed accounts deleted: ${result.accountsDeleted}`,
    `Reservations anonymised: ${result.reservationsAnonymised}, address codes deleted: ${result.codesDeleted}`,
  ];
  if (result.closingSkipped > 0) {
    lines.push(
      `${result.closingSkipped} account(s) not closed because of an open reservation.`
    );
  }
  if (result.errors.length > 0) {
    lines.push(
      `⚠️ ${result.errors.length} error(s): ${result.errors.join("; ")}`
    );
  }
  return lines.join("\n");
}

module.exports = {
  getSettings,
  recordActivity,
  getLastActivity,
  hasOpenReservation,
  closeAccount,
  runRetention,
  formatSummary,
  postToWebhook,
};
