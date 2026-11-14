/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  /** @type {typeof import('./lib/privacyPolicy')} */
  const { getCurrentPrivacyPolicy } = require(`${__hooks}/lib/privacyPolicy`);

  const { record } = e;
  if (!record) {
    throw new BadRequestError("Record_not_defined.");
  }

  // Only the current privacy policy can be accepted
  if (
    !e.hasSuperuserAuth() &&
    record.getString("privacy_policy") !== getCurrentPrivacyPolicy()
  ) {
    throw new BadRequestError("Privacy_policy_not_current.");
  }

  e.next();
}, "privacy_policy_acceptances");
