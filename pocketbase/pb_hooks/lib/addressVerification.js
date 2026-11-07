/// <reference path="../../pb_data/types.d.ts" />

/**
 * Neighbour verification: users pick an allowed street on sign-up, and can
 * only reserve after entering a one-time code that is sent to them by post.
 */

// Without 0/O and 1/I, which are easily confused on paper
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const CODE_VALID_DAYS = 90;
const MAX_ATTEMPTS = 5;

/**
 * Returns whether neighbour verification is enabled on the leihbase record
 * @returns {boolean}
 */
function isEnabled() {
  const leihbase = $app.findAllRecords("leihbase")[0];
  return !!leihbase && leihbase.getBool("address_verification");
}

/**
 * Returns a new random code, e.g. "K7QM4XTR"
 * @returns {string}
 */
function generateCode() {
  return $security.randomStringWithAlphabet(CODE_LENGTH, CODE_ALPHABET);
}

/**
 * Formats a code for display, e.g. "K7QM-4XTR"
 * @param {string} code
 * @returns {string}
 */
function formatCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Normalizes user input: uppercase, without spaces and dashes
 * @param {string} input
 * @returns {string}
 */
function normalizeCode(input) {
  return String(input || "")
    .toUpperCase()
    .replace(/[\s-]/g, "");
}

/**
 * @param {string} code
 * @returns {string}
 */
function hashCode(code) {
  return $security.sha256(code);
}

/**
 * Returns a date as PocketBase date string
 * @param {Date} date
 * @returns {string}
 */
function toPocketbaseDate(date) {
  return date.toISOString().replace("T", " ");
}

/**
 * Returns the newest unused code record of a user, if any
 * @param {string} userId
 * @returns {core.Record | null}
 */
function findActiveCode(userId) {
  const records = $app.findRecordsByFilter(
    "address_codes",
    'user = {:user} && used = ""',
    "-created",
    1,
    0,
    { user: userId }
  );
  return records[0] || null;
}

/**
 * Returns the address data of a user, used for the admin list and the letter
 * @param {core.Record} user
 */
function getAddress(user) {
  let street = null;
  if (user.getString("street")) {
    try {
      street = $app.findRecordById("streets", user.getString("street"));
    } catch (_) {
      street = null;
    }
  }
  return {
    street: street ? street.getString("name") : "",
    house_number: user.getString("house_number"),
    address_extra: user.getString("address_extra"),
    postcode: street ? street.getString("postcode") : "",
    town: street ? street.getString("town") : "",
  };
}

/**
 * Escapes text for use in HTML emails
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Returns the email addresses of all admins and superusers
 * @returns {string[]}
 */
function getAdminEmails() {
  const admins = $app.findRecordsByFilter(
    "users",
    'role = "admin" && email != ""',
    "",
    0,
    0
  );
  const superusers = $app.findAllRecords("_superusers");
  const emails = [...admins, ...superusers]
    .map((record) => (record ? record.getString("email") : ""))
    .filter((email) => !!email);
  return [...new Set(emails)];
}

/**
 * Emails admins and superusers that a new neighbour needs a letter with a
 * code
 * @param {core.Record} user
 */
function notifyAdminsOfNewNeighbour(user) {
  const recipients = getAdminEmails();
  if (recipients.length === 0) {
    return;
  }

  const locale = $os.getenv("CONFIG_LOCALE") || "en";
  const settings = $app.settings();
  const address = getAddress(user);
  const addressLine = escapeHtml(
    [`${address.house_number} ${address.street}`, address.address_extra]
      .filter(Boolean)
      .join(", ")
  );
  const name = escapeHtml(user.getString("name"));
  const email = escapeHtml(user.getString("email"));
  const link = `${settings.meta.appURL}/admin/neighbours`;

  const text =
    locale === "de"
      ? {
          subject: `Neue Nachbar:in braucht einen Code: ${user.getString("name")}`,
          intro:
            "Jemand hat sich neu registriert und braucht einen Brief mit Code, um reservieren zu können.",
          action: "Brief erstellen und drucken",
        }
      : {
          subject: `New neighbour needs a code: ${user.getString("name")}`,
          intro:
            "Someone new has signed up and needs a letter with their code before they can reserve.",
          action: "Create and print the letter",
        };

  const message = new MailerMessage({
    from: {
      address: settings.meta.senderAddress,
      name: settings.meta.senderName,
    },
    to: recipients.map((address) => ({ address })),
    subject: text.subject,
    html: `<p>${text.intro}</p>
<p><strong>${name}</strong><br>${email}<br>${addressLine}</p>
<p><a href="${link}">${text.action}</a></p>`,
  });
  $app.newMailClient().send(message);
}

module.exports = {
  CODE_VALID_DAYS,
  MAX_ATTEMPTS,
  isEnabled,
  generateCode,
  formatCode,
  normalizeCode,
  hashCode,
  toPocketbaseDate,
  findActiveCode,
  getAddress,
  getAdminEmails,
  notifyAdminsOfNewNeighbour,
};
