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
  { id: "pt-apparel", name: "Apparel", slug: "apparel", active: true, attributeCount: 5 },
  // attributeCount: 0 is NOT a blocker — the sample still returns global common fields.
  { id: "pt-bag", name: "Bag", slug: "bag", active: true, attributeCount: 0 },
];
// Backend update #2 (2026-07-08): response is the envelope { sample, meta } — the FE seeds the
// textarea from `.sample` and labels it from `.meta`. Variant axes (color/size) come from meta.
const SAMPLE = { name: "sample_name", brand: "sample_brand", price: 0, variants: [{ sku: "sample_sku", color: "sample_color" }] };
const SAMPLE_RESPONSE = {
  sample: SAMPLE,
  meta: { globalFieldCount: 5, typeSpecificFieldCount: 2, variantDimensions: ["color", "size"], hasVariants: true },
};

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
    await page.route("**/admin/ai/sample-master-product**", (r) => r.fulfill(json(SAMPLE_RESPONSE)));

    await page.goto("/platform-admin/ai-generate");
    // Pre-load reassurance: global fields always included, so attributeCount 0 still works.
    await expect(page.getByText(/Field global .* selalu disertakan/)).toBeVisible();

    await page.locator('select:has(option[value="pt-apparel"])').selectOption("pt-apparel");
    await page.getByRole("button", { name: /Load from Product Type/ }).click();

    // Post-load: accurate composition from meta (resolves the "global only" misconception).
    await expect(page.getByText(/Sample dimuat/)).toBeVisible();
    await expect(page.getByText(/5 global/)).toBeVisible();
    await expect(page.getByText(/axes: color, size/)).toBeVisible();

    const textarea = page.locator("textarea");
    await expect(textarea).toContainText("sample_name");
    await expect(textarea).toContainText("sample_sku");
    // Textarea gets `.sample`, not the raw { sample, meta } envelope.
    await expect(textarea).not.toContainText("globalFieldCount");
    // Still editable (not disabled).
    await expect(textarea).toBeEditable();
    expect(pageErrors).toEqual([]);
  });

  test("404 → shows the config message, does NOT fall back to a hardcoded example", async ({ page }) => {
    await page.route("**/admin/ai/sample-master-product**", (r) =>
      r.fulfill({
        status: 404,
        contentType: "application/json",
        // Catalog-level config signal (no master attributes at all), per the 2026-07-07 backend update.
        body: JSON.stringify({ status: 404, message: "No active master attributes found — configure master product attributes (at minimum the common global fields) first." }),
      }),
    );

    await page.goto("/platform-admin/ai-generate");
    const before = await page.locator("textarea").inputValue();

    await page.locator('select:has(option[value="pt-bag"])').selectOption("pt-bag");
    await page.getByRole("button", { name: /Load from Product Type/ }).click();

    // Config message surfaced; textarea unchanged (no silent fallback).
    await expect(page.getByText(/No active master attributes/)).toBeVisible();
    await expect(page.getByText(/configure master product attributes/)).toBeVisible();
    expect(await page.locator("textarea").inputValue()).toBe(before);
  });
});
