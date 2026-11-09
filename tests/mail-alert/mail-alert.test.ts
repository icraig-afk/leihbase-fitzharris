import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { pocketbase } from "../services/pocketbase";

// Matches CONFIG_MAIL_ALERT_WEBHOOK_URL set in playwright.config.ts
const MAIL_ALERT_WEBHOOK_PORT = 9450;

// These tests break the mail server settings, so they run on their own, after
// all other tests (see the "Mail alert" project in playwright.config.ts)
test.describe.configure({ mode: "serial" });

test.describe("mail alert", () => {
  let server: Server;
  const received: { content: string }[] = [];

  test.beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push(JSON.parse(body));
        res.writeHead(204).end();
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(MAIL_ALERT_WEBHOOK_PORT, "127.0.0.1", resolve)
    );
  });

  test.afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test("a failed email is alerted once per hour through the webhook", async () => {
    const pb = await pocketbase();
    const settings = await pb.settings.getAll();
    try {
      // Point the mail server to a closed port
      await pb.settings.update({ smtp: { ...settings.smtp, port: 1 } });

      // The failure is still reported to the caller, as before
      await expect(
        pb.settings.testEmail("users", "alert-test@example.com", "verification")
      ).rejects.toThrow();

      // and alerted, without the full recipient address
      await expect.poll(() => received.length).toBe(1);
      const alert = received[0]!.content;
      expect(alert).toContain("Email failed to send");
      expect(alert).toContain("a***@example.com");
      expect(alert).not.toContain("alert-test@example.com");

      // A second failure within the hour isn't alerted again
      await expect(
        pb.settings.testEmail("users", "alert-test@example.com", "verification")
      ).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(received.length).toBe(1);
    } finally {
      await pb.settings.update({ smtp: settings.smtp });
    }
  });
});
