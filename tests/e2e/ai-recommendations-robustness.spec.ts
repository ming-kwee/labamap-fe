/**
 * E2E: Recommendations Review Queue — Trigger Analysis robustness.
 * Trigger Analysis runs the agent (same LLM 429 retry/backoff path as
 * generate-jolt) so it can take minutes. Must show elapsed timer + Cancel +
 * pre-flight warning; never an endless spinner.
 */
import { test, expect } from "./fixtures";

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const page1 = (content: unknown[]) => ({ content, page: 0, size: 1, totalElements: content.length, totalPages: 1, hasNext: false });

// The trigger-channel <select> is the 2nd combobox (1st is the status/channel filter).
const triggerSelect = (page: import("@playwright/test").Page) => page.getByRole("combobox").nth(1);

test.describe("P0-D · Trigger Analysis robustness", () => {
  test("pre-flight banner warns when the chosen channel's latest session was quota-failed", async ({ page }) => {
    await page.route("**/admin/ai/sessions?**", (r) =>
      r.fulfill(json(page1([{
        id: "s-q", triggerType: "PUBLISH_FAILED", channelId: "shopify", status: "FAILED",
        errorMessage: "Retries exhausted: 3/3", createdAt: "2026-07-03T10:00:00", ragContext: null,
      }])),
    ));
    await page.goto("/platform-admin/ai-recommendations");
    await expect(page.getByRole("heading", { name: "Recommendations Review Queue" })).toBeVisible();

    await triggerSelect(page).selectOption("shopify");
    await expect(page.getByText(/LLM sedang rate-limited/)).toBeVisible();
  });

  test("shows elapsed timer + Cancel during a slow trigger, and cancel aborts cleanly", async ({ page }) => {
    // Latest session COMPLETED → no pre-flight banner interfering.
    await page.route("**/admin/ai/sessions?**", (r) =>
      r.fulfill(json(page1([{ id: "ok", triggerType: "PUBLISH_FAILED", channelId: "shopify", status: "COMPLETED", createdAt: "2026-07-03T10:00:00" }]))),
    );
    await page.route("**/admin/ai/recommendations/trigger-analysis**", async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.fulfill(json({ ok: true }));
    });

    await page.goto("/platform-admin/ai-recommendations");
    await triggerSelect(page).selectOption("shopify");
    await page.getByRole("button", { name: /Trigger Analysis/ }).click();

    // Running: elapsed timer + Cancel button.
    await expect(page.getByText(/Menganalisis…/)).toBeVisible();
    await expect(page.getByText(/\d:\d\d/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Batalkan" })).toBeVisible();

    // Cancel → abort → toast + button returns.
    await page.getByRole("button", { name: "Batalkan" }).click();
    await expect(page.getByText(/Trigger dibatalkan/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Trigger Analysis/ })).toBeVisible();
  });

  test("product-type scope sends productTypeId + sample body to trigger-analysis", async ({ page }) => {
    await page.route("**/admin/ai/sessions?**", (r) =>
      r.fulfill(json(page1([{ id: "ok", triggerType: "PUBLISH_FAILED", channelId: "shopify", status: "COMPLETED", createdAt: "2026-07-03T10:00:00" }]))),
    );
    // Product types feed the optional scope picker; Apparel → clothing.
    await page.route("**/admin/product-types**", (r) => r.fulfill(json([
      { id: "pt-apparel", name: "Apparel", slug: "apparel", categorySlug: "clothing", active: true, attributeCount: 3 },
    ])));
    // Sample seeded from the picked type — sent as the trigger body (not empty).
    await page.route("**/admin/ai/sample-master-product**", (r) => r.fulfill(json({
      sample: { name: "sample_name", variants: [{ sku: "sample_sku" }] },
      meta: { globalFieldCount: 4, typeSpecificFieldCount: 3, variantDimensions: [], hasVariants: true },
    })));
    let triggerUrl = "";
    let triggerBody: unknown = null;
    await page.route("**/admin/ai/recommendations/trigger-analysis**", (route) => {
      triggerUrl = route.request().url();
      triggerBody = route.request().postDataJSON();
      return route.fulfill(json({ sessionId: "sess-1", status: "TRIGGERED" }));
    });

    await page.goto("/platform-admin/ai-recommendations");
    await triggerSelect(page).selectOption("shopify");
    // 3rd combobox = the product-type scope picker (added after the trigger channel select).
    await page.getByRole("combobox").nth(2).selectOption("pt-apparel");
    await expect(page.getByText(/Scope: kategori/)).toBeVisible();

    await page.getByRole("button", { name: /Trigger Analysis/ }).click();
    await expect(page.getByText(/kategori clothing selesai/)).toBeVisible();

    // Phase 0B parity with generate-jolt: the wire carries productTypeId (the ObjectId) and
    // the backend derives the category — NOT categoryId=<slug>. Body carries the seeded sample.
    expect(triggerUrl).toContain("productTypeId=pt-apparel");
    expect(triggerUrl).not.toContain("categoryId=");
    expect(JSON.stringify(triggerBody)).toContain("sample_sku");
  });
});
