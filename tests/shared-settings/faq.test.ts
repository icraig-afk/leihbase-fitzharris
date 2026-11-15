import { expect, test } from "@playwright/test";
import Client, { ClientResponseError } from "pocketbase";
import { login } from "../lib/login";
import { createUser, DEFAULT_PASSWORD } from "../lib/user";
import { uniqueId, waitForClientMount, waitForHydration } from "../lib/utils";
import { pocketbase } from "../services/pocketbase";

// The FAQ is shown to every visitor, and adds a menu link once a question is
// published, so these tests run after the other browser tests (see the
// "Shared settings" project in playwright.config.ts).
test.describe.configure({ mode: "serial" });

function anonymousPb() {
  return new Client(process.env.POCKETBASE_BASE_URL || "http://127.0.0.1:8081");
}

async function createFaq(data: Record<string, unknown>) {
  const pb = await pocketbase();
  return pb.collection("faqs").create({
    question: `Question ${uniqueId()}?`,
    answer: "<p>An answer.</p>",
    published: true,
    ...data,
  });
}

test.describe("FAQ", () => {
  test.afterEach(async () => {
    const pb = await pocketbase();
    for (const faq of await pb.collection("faqs").getFullList()) {
      await pb.collection("faqs").delete(faq.id);
    }
  });

  test("visitors only see published questions, only admins edit", async () => {
    const published = await createFaq({ question: "How do deposits work?" });
    const draft = await createFaq({ published: false });

    const visible = await anonymousPb().collection("faqs").getFullList();
    expect(visible.map((faq) => faq.id)).toEqual([published.id]);

    const admin = await createUser(undefined, undefined, "admin");
    const adminPb = await pocketbase(admin.email, DEFAULT_PASSWORD, false);
    expect(
      (await adminPb.collection("faqs").getFullList()).map((faq) => faq.id)
    ).toContain(draft.id);

    const user = await createUser();
    const userPb = await pocketbase(user.email, DEFAULT_PASSWORD, false);
    await expect(
      userPb
        .collection("faqs")
        .create({ question: "Mine?", answer: "<p>No.</p>", published: true })
    ).rejects.toThrow(ClientResponseError);
    await expect(
      userPb.collection("faqs").update(published.id, { question: "Changed?" })
    ).rejects.toThrow(ClientResponseError);
  });

  test("questions get a link that stays when reworded, and go last", async () => {
    const first = await createFaq({ question: "How do deposits work?" });
    const second = await createFaq({ question: "How do deposits work?" });
    expect(first.slug).toBe("how-do-deposits-work");
    expect(second.slug).toBe("how-do-deposits-work-2");
    expect(second.position).toBeGreaterThan(first.position);

    const admin = await createUser(undefined, undefined, "admin");
    const adminPb = await pocketbase(admin.email, DEFAULT_PASSWORD, false);
    const reworded = await adminPb
      .collection("faqs")
      .update(first.id, { question: "What about deposits?", slug: "other" });
    expect(reworded.slug).toBe("how-do-deposits-work");
  });

  test("the FAQ page shows the questions in order, and opens them", async ({
    page,
  }) => {
    await createFaq({
      question: "Second question?",
      answer: "<p>Second answer.</p>",
      position: 2,
    });
    await createFaq({
      question: "First question?",
      answer: "<p>First answer.</p>",
      position: 1,
    });
    await createFaq({ question: "A draft?", published: false, position: 3 });

    await page.goto("/faq");
    await waitForHydration(page);
    const faqs = page.getByTestId("faq");
    await expect(faqs).toHaveCount(2);
    await expect(faqs.nth(0)).toContainText("First question?");
    await expect(faqs.nth(1)).toContainText("Second question?");

    // Opening a question shows its answer, and puts its link in the URL
    const trigger = page.locator("#faq-second-question-trigger");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page).toHaveURL(/\/faq#second-question$/);

    // The menu links to the FAQ
    await waitForClientMount(page.getByTestId("menu-button"));
    await page.getByTestId("menu-button").click();
    await expect(page.getByTestId("faq-link")).toBeVisible();
  });

  test("a link to a question opens it", async ({ page }) => {
    await createFaq({ question: "Can I extend a loan?" });
    await createFaq({ question: "What if something breaks?" });

    await page.goto("/faq#what-if-something-breaks");
    await waitForHydration(page);
    await expect(
      page.locator("#faq-what-if-something-breaks-trigger")
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.locator("#faq-can-i-extend-a-loan-trigger")
    ).toHaveAttribute("aria-expanded", "false");
  });

  test("admins add, reorder, unpublish and delete questions", async ({
    page,
  }) => {
    const admin = await createUser(undefined, undefined, "admin");
    await createFaq({ question: "Existing question?", position: 1 });

    await login(page, admin.email, DEFAULT_PASSWORD);
    await page.goto("/admin/faq");
    await waitForHydration(page);

    // Add
    await page.getByTestId("admin-faq-new-question").fill("Who can borrow?");
    await page
      .getByTestId("admin-faq-new-answer")
      .locator(".ql-editor")
      .fill("Everyone who lives on the estate.");
    await page.getByTestId("admin-faq-add").click();
    const rows = page.getByTestId("admin-faq");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText("Who can borrow?");

    // Move it up
    await rows.nth(1).getByTestId("admin-faq-up").click();
    await expect(rows.nth(0)).toContainText("Who can borrow?");

    // It's on the FAQ page, first
    const pb = await pocketbase();
    const visible = await pb
      .collection("faqs")
      .getFullList({ filter: "published = true", sort: "position" });
    expect(visible.map((faq) => faq.question)).toEqual([
      "Who can borrow?",
      "Existing question?",
    ]);
    expect(visible[0]!.answer).toContain("Everyone who lives on the estate.");

    // Unpublish it
    await rows
      .nth(0)
      .getByTestId("admin-faq-published")
      .uncheck({ force: true });
    await expect
      .poll(async () =>
        (await anonymousPb().collection("faqs").getFullList()).map(
          (faq) => faq.question
        )
      )
      .toEqual(["Existing question?"]);

    // Delete it
    await rows.nth(0).getByTestId("admin-faq-delete").click();
    await rows.nth(0).getByTestId("admin-faq-delete-confirm").click();
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText("Existing question?");
  });

  test("other users can't open the admin page", async ({ page }) => {
    const user = await createUser();
    await login(page, user.email, DEFAULT_PASSWORD);
    const response = await page.goto("/admin/faq");
    expect(response?.status()).toBe(404);
  });
});
