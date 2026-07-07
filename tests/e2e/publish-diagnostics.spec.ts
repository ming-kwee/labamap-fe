/**
 * E2E: Publish Diagnostics (platform-admin).
 * The engineering-facing counterpart of the merchant Step-3 publish page —
 * shows the full APM/cascade/tier/mapping/JOLT breakdown that was removed from
 * the merchant flow. Backend analyze + schema endpoints are mocked.
 */
import { test, expect } from "./fixtures";

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

const ANALYZE_RESULT = {
  overallConfidence: 92,
  fieldMappings: [
    { sourcePath: "name", targetPath: "product.title", confidence: 98, matchStrategy: "EXACT" },
    { sourcePath: "weight", targetPath: "product.variants[0].grams", confidence: 88, matchStrategy: "SEMANTIC" },
  ],
  joltSpec: [{ operation: "shift", spec: { name: "product.title" } }],
  unmappedSourceFields: ["barcode"],
  unmappedTargetFields: ["product.vendor"],
  status: "COMPLETED",
  matchingMetadata: {
    knowledgeBasedMatches: 1, semanticMatches: 1, similarityMatches: 0, patternMatches: 0,
    totalMatches: 2, processingTimeMs: 143,
    warnings: [
      "[JOLT-READINESS] Overall: WARNINGS",
      "✓ All required fields mapped",
      "⚠ 2 optional fields unmapped",
      "[JOLT-CONFLICT ERROR] target='product.title' sources=[name, seo_title] — multiple sources map to one target",
    ],
  },
  // cascade block → APM resolved it (no escalation)
  escalatedToAgent: false,
};

// Product-mode fixtures.
const PRODUCTS = { content: [{ productId: "p-1", name: "Classic Cotton T-Shirt", basePrice: 19.99, variantCount: 2 }], totalElements: 1, totalPages: 1, page: 0, size: 200 };
const PRODUCT_DETAIL = { id: "p-1", organizationId: "org-e7dac9f8-6353-4168-b9a1-6a7791d71b02", name: "Classic Cotton T-Shirt", sku: "ACME-1", basePrice: 19.99, currency: "USD", category: "clothing", variantCount: 2, variants: [], status: "ACTIVE", createdAt: "2026-01-01", updatedAt: "2026-01-01", channelDistribution: [] };
const STORES = [
  { masterProductId: "p-1", storeId: "shopify-01", channelType: "shopify", organizationId: "o", status: "DRAFT", masterOverrides: { name: "Shopify Tee" }, channelData: { vendor: "Acme" }, variantOverrides: {}, completionPercentage: 100, readyToPublish: true, savedAt: "2026-01-01" },
];

test.describe("Publish Diagnostics", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/channels/*/schema/complex**", (r) =>
      r.fulfill(json({ schema: { "product.title": "", "product.variants[0].grams": 0, "product.vendor": "" } })),
    );
    await page.route("**/adaptive-pattern-matching/analyze", (r) => r.fulfill(json(ANALYZE_RESULT)));
  });

  test("JSON mode: runs analyze and shows the full technical breakdown", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto("/platform-admin/publish-diagnostics");
    await expect(page.getByRole("heading", { name: "Publish Diagnostics" })).toBeVisible();

    // Switch to Paste JSON mode.
    await page.getByRole("button", { name: "Paste JSON" }).click();
    await page.getByRole("button", { name: /Jalankan Diagnostics/ }).click();

    // Engine outcome + confidence + cascade badge (APM, since escalatedToAgent=false).
    await expect(page.getByText("Keputusan engine")).toBeVisible();
    await expect(page.getByText("92%").first()).toBeVisible();
    await expect(page.getByText("APM").first()).toBeVisible();
    // 5-tier breakdown.
    await expect(page.getByText("Matching strategy breakdown")).toBeVisible();
    await expect(page.getByText("Knowledge-Based")).toBeVisible();
    // Field mappings table.
    await expect(page.getByText(/Field mappings \(2\)/)).toBeVisible();
    await expect(page.getByText("product.variants[0].grams")).toBeVisible();
    // Unmapped section.
    await expect(page.getByText("Unmapped fields")).toBeVisible();

    // JOLT readiness rendered as a parsed TABLE (not a raw log dump):
    // overall status badge + parsed rows; raw "[JOLT-READINESS]" text is gone.
    await expect(page.getByText("Status keseluruhan:")).toBeVisible();
    await expect(page.getByText(/JOLT-READINESS/)).toHaveCount(0); // parsed, not dumped
    await expect(page.getByRole("cell", { name: "All required fields mapped" })).toBeVisible();
    await expect(page.getByText(/Konflik target: product\.title/)).toBeVisible();
    await expect(page.getByText(/sources: name, seo_title/)).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("JSON mode: blocks run on invalid product JSON", async ({ page }) => {
    await page.goto("/platform-admin/publish-diagnostics");
    await page.getByRole("button", { name: "Paste JSON" }).click();
    await page.locator("textarea").fill("{ broken ");
    await expect(page.getByText(/JSON tidak valid/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Jalankan Diagnostics/ })).toBeDisabled();
  });

  test("Product mode: pick product + store replicates the publish input and runs", async ({ page }) => {
    await page.route("**/admin/master-products?**", (r) => r.fulfill(json(PRODUCTS)));
    await page.route("**/admin/master-products/p-1?**", (r) => r.fulfill(json(PRODUCT_DETAIL)));
    await page.route("**/ecommerce/channel-product-data/p-1", (r) => r.fulfill(json(STORES)));
    let analyzeBody: Record<string, unknown> | null = null;
    await page.route("**/adaptive-pattern-matching/analyze", (r) => {
      analyzeBody = r.request().postDataJSON();
      return r.fulfill(json(ANALYZE_RESULT));
    });

    await page.goto("/platform-admin/publish-diagnostics");
    // Product mode is default. Run button disabled until product+store chosen.
    await expect(page.getByRole("button", { name: /Jalankan Diagnostics/ })).toBeDisabled();

    await page.getByRole("combobox").first().selectOption("p-1");
    await page.getByRole("combobox").nth(1).selectOption("shopify-01");
    await expect(page.getByText(/Mendiagnosa input publish/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Jalankan Diagnostics/ })).toBeEnabled();

    await page.getByRole("button", { name: /Jalankan Diagnostics/ }).click();
    await expect(page.getByText("Keputusan engine")).toBeVisible();

    // The analyze request must carry the Step-2 override (masterOverrides.name) merged in.
    expect(JSON.stringify(analyzeBody)).toContain("Shopify Tee");
    expect(JSON.stringify(analyzeBody)).toContain("\"persistJolt\":false");
  });
});
