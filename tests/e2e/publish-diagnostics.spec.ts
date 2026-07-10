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
const STORES = [
  { masterProductId: "p-1", storeId: "shopify-01", channelType: "shopify", organizationId: "o", status: "DRAFT", masterOverrides: { name: "Shopify Tee" }, channelData: { vendor: "Acme" }, variantOverrides: {}, completionPercentage: 100, readyToPublish: true, savedAt: "2026-01-01" },
];

// Product-aware readiness report (POST /channels/publish/analyze). readyToPublish:false is a
// valid 200 verdict — the report renders, it is not an error.
const PUBLISH_ANALYSIS = {
  masterProductId: "p-1",
  storeId: "shopify-01",
  channelType: "shopify",
  categoryId: "clothing",
  readyToPublish: false,
  readinessScore: 75,
  masterProduct: { source: "mongodb", found: true, fieldCount: 24, hasVariants: true, variantCount: 2 },
  channelData: { step2DataFound: true, completionPercentage: 80, missingRequiredFields: ["material"] },
  mergedData: { fieldCount: 31 },
  adaptiveMapping: {
    status: "EXCELLENT",
    overallConfidence: 95.0,
    totalMappings: 29,
    // Realistic stage-4 findings: a many-source conflict, JOLT readiness checks (one with a
    // field list), the overall line, and plain notes — the FE parses these into a structure.
    warnings: [
      "[MAPPING-CONFLICT] target 'product.description' menerima 14 sumber. USED: properties.productTypeId.description (95%, nama cocok). IGNORED: properties.category.description (95%); properties.productId.description (95%); properties.price.description (95%).",
      "[JOLT-READINESS] Overall: WARNINGS",
      "✓ Check 1 (Compile): JOLT spec parsed successfully by Chainr.",
      "⚠ Check 3 (Required coverage): 8 required target(s) missing from spec: [product.variants[0].weight, product.variants[0].size, product.variants[0].sku]",
      "Injected 11 critical field(s) that were below confidence threshold",
    ],
  },
  joltSpec: { found: true, source: "adaptive_pattern_matching", operationCount: 5 },
  transformation: { success: true, outputTopLevelKeys: ["product"], transformedData: { product: { title: "Shopify Tee" } } },
  postProcessing: { ruleCount: 3, rules: [{ name: "r1", priority: 10 }] },
  issues: [{ severity: "WARNING", category: "CHANNEL_DATA", field: "material", message: "Missing required field 'material'" }],
  suggestions: ["Fill required field 'material' in Step 2"],
};

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

  test("Product mode: product-aware readiness via /channels/publish/analyze", async ({ page }) => {
    await page.route("**/admin/master-products?**", (r) => r.fulfill(json(PRODUCTS)));
    await page.route("**/ecommerce/channel-product-data/p-1", (r) => r.fulfill(json(STORES)));
    let analyzeBody: Record<string, unknown> | null = null;
    await page.route("**/channels/publish/analyze", (r) => {
      analyzeBody = r.request().postDataJSON();
      return r.fulfill(json(PUBLISH_ANALYSIS));
    });

    await page.goto("/platform-admin/publish-diagnostics");
    // Product mode is default. Run disabled until a product is chosen (store optional now).
    await expect(page.getByRole("button", { name: /Jalankan Diagnostics/ })).toBeDisabled();

    await page.getByRole("combobox").first().selectOption("p-1");
    // Store optional — a product alone enables the run.
    await expect(page.getByRole("button", { name: /Jalankan Diagnostics/ })).toBeEnabled();
    await page.getByRole("combobox").nth(1).selectOption("shopify-01");
    await expect(page.getByText(/Mendiagnosa input publish/)).toBeVisible();

    await page.getByRole("button", { name: /Jalankan Diagnostics/ }).click();

    // New product-aware readiness report — a NOT-READY verdict still renders (valid 200).
    await expect(page.getByText("Kesiapan publish")).toBeVisible();
    await expect(page.getByText("NOT READY")).toBeVisible();
    await expect(page.getByText(/Issues \(1\)/)).toBeVisible();
    await expect(page.getByText(/Missing required field/)).toBeVisible();
    await expect(page.getByText("Saran perbaikan")).toBeVisible();
    await expect(page.getByText(/Pipeline \(7 stage\)/)).toBeVisible();

    // Stage-4 warnings are parsed into a readable structure (not a raw amber-chip dump):
    // a conflict card (target + used source + collapsed ignored count) and a checks table.
    await expect(page.getByText("Adaptive mapping — detail")).toBeVisible();
    // Two axes labeled separately so "EXCELLENT" (match quality) doesn't contradict the
    // JOLT readiness verdict; the divergence explainer reconciles them.
    await expect(page.getByText("Kualitas pemetaan")).toBeVisible();
    await expect(page.getByText("Kesiapan JOLT").first()).toBeVisible();
    await expect(page.getByText(/Bukan kontradiksi/)).toBeVisible();
    await expect(page.getByText(/Konflik pemetaan \(1\)/)).toBeVisible();
    await expect(page.getByText("product.description", { exact: true })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^Pemeriksaan kesiapan JOLT$/ })).toBeVisible();
    await expect(page.getByText(/Check 1 \(Compile\)/).first()).toBeVisible();
    // "Lihat spec ini" deep-links to the JOLT specs editor for this channel × category, in a
    // new tab so the diagnostics run isn't lost on navigation.
    const specLink = page.getByRole("link", { name: /Lihat spec ini/ });
    await expect(specLink).toBeVisible();
    await expect(specLink).toHaveAttribute("href", "/platform-admin/channel-jolt-specs?channelId=shopify&categoryId=clothing");
    await expect(specLink).toHaveAttribute("target", "_blank");
    // The long IGNORED path list is collapsed by default; expanding reveals the paths
    // (raw-response JSON viewer stays collapsed, so this is the only source of the text).
    const ignoredToggle = page.getByText(/3 sumber lain diabaikan/);
    await expect(ignoredToggle).toBeVisible();
    await expect(page.getByText("properties.category.description", { exact: true })).toHaveCount(0);
    await ignoredToggle.click();
    await expect(page.getByText("properties.category.description", { exact: true })).toBeVisible();

    // Request carries masterProductId + storeId; NO manual categoryId (backend derives it).
    expect(JSON.stringify(analyzeBody)).toContain("\"masterProductId\":\"p-1\"");
    expect(JSON.stringify(analyzeBody)).toContain("\"storeId\":\"shopify-01\"");
    expect(JSON.stringify(analyzeBody)).not.toContain("categoryId");
  });
});
