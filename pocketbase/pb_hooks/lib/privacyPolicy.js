/// <reference path="../../pb_data/types.d.ts" />

/**
 * Returns the id of the current privacy policy, set on the leihbase record, or
 * an empty string
 * @returns {string}
 */
function getCurrentPrivacyPolicy() {
  try {
    const leihbase = $app.findAllRecords("leihbase")[0];
    return leihbase?.getString("privacy_policy") || "";
  } catch (e) {
    return "";
  }
}

/**
 * Stores that the user accepted the privacy policy
 * @param {string} user
 * @param {string} privacyPolicy
 */
function savePrivacyPolicyAcceptance(user, privacyPolicy) {
  const acceptance = new Record(
    $app.findCollectionByNameOrId("privacy_policy_acceptances")
  );
  acceptance.set("user", user);
  acceptance.set("privacy_policy", privacyPolicy);
  $app.save(acceptance);
}

module.exports = {
  getCurrentPrivacyPolicy,
  savePrivacyPolicyAcceptance,
};
