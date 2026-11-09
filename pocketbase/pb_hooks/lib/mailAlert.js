// Alerts about failed emails through a webhook (e.g. a Discord channel), as
// emailing about a broken mail server isn't possible. Enabled by setting
// CONFIG_MAIL_ALERT_WEBHOOK_URL.

/** At most one alert per hour, so an outage doesn't flood the channel */
const ALERT_INTERVAL_MS = 60 * 60 * 1000;
/** Discord rejects messages longer than 2000 characters */
const MAX_MESSAGE_LENGTH = 1900;

const STORE_LAST_ALERT = "mailAlert.lastAlert";
const STORE_SUPPRESSED = "mailAlert.suppressed";

/**
 * Returns the webhook URL, or an empty string when alerts are disabled
 * @returns {string}
 */
function getWebhookUrl() {
  return ($os.getenv("CONFIG_MAIL_ALERT_WEBHOOK_URL") || "").trim();
}

/**
 * Hides most of an email address, so the alert doesn't expose who the email
 * was for: "jane@example.com" becomes "j***@example.com"
 * @param {string} address
 * @returns {string}
 */
function maskAddress(address) {
  const [name, domain] = String(address || "").split("@");
  if (!domain) {
    return "***";
  }
  return `${name.slice(0, 1)}***@${domain}`;
}

/**
 * Returns the alert text for a failed email
 * @param {{ subject: string, to: string[], error: string, suppressed: number }} failure
 * @returns {string}
 */
function formatAlert({ subject, to, error, suppressed }) {
  const appName = $app.settings().meta.appName;
  const appUrl = $app.settings().meta.appURL;
  const lines = [
    `⚠️ **Email failed to send** (${appName}, ${appUrl})`,
    `**Subject:** ${subject || "(none)"}`,
    `**To:** ${to.map(maskAddress).join(", ") || "(none)"}`,
    `**Error:** ${error}`,
  ];
  if (suppressed > 0) {
    lines.push(
      `${suppressed} more email(s) failed since the last alert, which weren't alerted separately.`
    );
  }
  lines.push(
    "Check Settings > Mail settings in PocketBase, and send a test email."
  );
  const text = lines.join("\n");
  return text.length > MAX_MESSAGE_LENGTH
    ? `${text.slice(0, MAX_MESSAGE_LENGTH)}…`
    : text;
}

/**
 * Sends an alert about a failed email, at most once per ALERT_INTERVAL_MS.
 * Never throws: a failing alert must not change how the email failure is
 * handled.
 * @param {mailer.Message | undefined} message
 * @param {unknown} err
 */
function alertMailFailure(message, err) {
  const url = getWebhookUrl();
  if (!url) {
    return;
  }
  try {
    const store = $app.store();
    const now = Date.now();
    const lastAlert = store.get(STORE_LAST_ALERT) || 0;
    const suppressed = store.get(STORE_SUPPRESSED) || 0;
    if (now - lastAlert < ALERT_INTERVAL_MS) {
      store.set(STORE_SUPPRESSED, suppressed + 1);
      return;
    }
    store.set(STORE_LAST_ALERT, now);
    store.set(STORE_SUPPRESSED, 0);

    const content = formatAlert({
      subject: message?.subject || "",
      to: (message?.to || []).map((recipient) => recipient.address),
      error: String(err),
      suppressed,
    });
    const res = $http.send({
      url,
      method: "POST",
      // Discord expects `content`, `allowed_mentions` prevents pings
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      headers: { "Content-Type": "application/json" },
      timeout: 10,
    });
    if (res.statusCode >= 300) {
      console.error(
        `[mail-alert] Webhook answered with status ${res.statusCode}`
      );
    }
  } catch (alertErr) {
    console.error("[mail-alert] Failed to send alert:", alertErr);
  }
}

module.exports = {
  alertMailFailure,
  maskAddress,
};
