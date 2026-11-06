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
};
