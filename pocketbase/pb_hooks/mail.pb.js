/// <reference path="../pb_data/types.d.ts" />

// Every email (account emails, reservations, reminders, test emails) passes
// through here. A failure is reported through the mail alert webhook, then
// handled as before.
onMailerSend((e) => {
  try {
    e.next();
  } catch (err) {
    /** @type {typeof import('./lib/mailAlert')} */
    const { alertMailFailure } = require(`${__hooks}/lib/mailAlert`);
    console.error("[mail] Failed to send email:", err);
    alertMailFailure(e.message, err);
    throw err;
  }
});
