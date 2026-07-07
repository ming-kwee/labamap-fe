/**
 * E2E: "Load from Product Type" — seeds the Master Product (JSON) input from a real
 * Product Type's fields instead of a blind hardcoded example.
 * docs/FRONTEND-SAMPLE-FROM-PRODUCT-TYPE-RECOMMENDATION.md
 *
 * Backend endpoint GET /admin/ai/sample-master-product?productTypeId= is mocked here
 * (it isn't deployed on the dev backend yet, and the demo org's types have 0 attrs).
 */
import { test, expect } from "./fixtures";

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const page1 = (content: unknown[]) => ({ content, page: 0, size: 1, totalElements: content.length, totalPages: 1, hasNext: false });

const PRODUCT_TYPES = [
  { id: "pt-apparel", name: "Apparel", slug: "apparel", active: true },
  { id: "pt-bag", name: "Bag", slug: "bag", active: true },
];
const SAMPLE = { name: "sample_name", brand: "sample_brand", price: 0, variants: [{ sku: "sample_sku", color: "black" }] };

test.describe("Load from Product Type (sample seeding)", () => {
  test.beforeEach(async ({ page }) => {
    // Latest session COMPLETED → no pre-flight banner interfering with the JOLT console.
    await page.route("**/admin/ai/sessions?**", (r) =>
      r.fulfill(json(page1([{ id: "ok", triggerType: "JOLT_GENERATION", channelId: "shopify", status: "COMPLETED", createdAt: "2026-07-06T10:00:00" }]))),
    );
    await page.route("**/admin/product-types**", (r) => r.fulfill(json(PRODUCT_TYPES)));
  });

  test("200 → populates the textarea from the Product Type sample (editable)", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.route("**/admin/ai/sample-master-product**", (r) => r.fulfill(json(SAMPLE)));

    await page.goto("/platform-admin/ai-generate");
    await page.locator('select:has(option[value="pt-apparel"])').selectOption("pt-apparel");
    await page.getByRole("button", { name: /Load from Product Type/ }).click();

    const textarea = page.locator("textarea");
    await expect(textarea).toContainText("sample_name");
    await expect(textarea).toContainText("sample_sku");
    // Still editable (not disabled).
    await expect(textarea).toBeEditable();
    expect(pageErrors).toEqual([]);
  });

  test("404 → shows the config message, does NOT fall back to a hardcoded example", async ({ page }) => {
    await page.route("**/admin/ai/sample-master-product**", (r) =>
      r.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ status: 404, message: "No active master attributes for productTypeId 'pt-bag' — configure the ProductType's attributes first." }),
      }),
    );

    await page.goto("/platform-admin/ai-generate");
    const before = await page.locator("textarea").inputValue();

    await page.locator('select:has(option[value="pt-bag"])').selectOption("pt-bag");
    await page.getByRole("button", { name: /Load from Product Type/ }).click();

    // Config message surfaced; textarea unchanged (no silent fallback).
    await expect(page.getByText(/No active master attributes/)).toBeVisible();
    await expect(page.getByText(/configure the ProductType's attributes first/)).toBeVisible();
    expect(await page.locator("textarea").inputValue()).toBe(before);
  });
});
