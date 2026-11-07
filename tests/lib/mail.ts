const MAILPIT_BASE_URL =
  process.env.MAILPIT_BASE_URL || "http://127.0.0.1:8025";

type MailSummary = {
  ID: string;
  Subject: string;
  To: { Address: string }[];
};

/**
 * Waits for an email to the given address whose subject contains the given
 * text, as received by mailpit
 */
export async function waitForMail(
  to: string,
  subject: string,
  timeout = 10000
) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const response = await fetch(
      `${MAILPIT_BASE_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`
    );
    const { messages = [] } = (await response.json()) as {
      messages?: MailSummary[];
    };
    const message = messages.find((m) => m.Subject.includes(subject));
    if (message) {
      const detail = await fetch(
        `${MAILPIT_BASE_URL}/api/v1/message/${message.ID}`
      );
      return (await detail.json()) as MailSummary & { HTML: string };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email to ${to} with subject containing "${subject}"`);
}
