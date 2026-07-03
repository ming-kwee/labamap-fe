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
    warnings: ["[JOLT-READINESS] Overall: READY", "✓ All required fields mapped"],
  },
  // cascade block → APM resolved it (no escalation)
  escalatedToAgent: false,
};

test.describe("Publish Diagnostics", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/channels/*/schema/complex**", (r) =>
      r.fulfill(json({ schema: { "product.title": "", "product.variants[0].grams": 0, "product.vendor": "" } })),
    );
    await page.route("**/adaptive-pattern-matching/analyze", (r) => r.fulfill(json(ANALYZE_RESULT)));
  });

  test("runs analyze and shows the full technical breakdown", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto("/platform-admin/publish-diagnostics");
    await expect(page.getByRole("heading", { name: "Publish Diagnostics" })).toBeVisible();

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
    // Unmapped + JOLT readiness.
    await expect(page.getByText("Unmapped fields")).toBeVisible();
    await expect(page.getByText(/JOLT-READINESS/)).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("blocks run on invalid product JSON", async ({ page }) => {
    await page.goto("/platform-admin/publish-diagnostics");
    await page.locator("textarea").fill("{ broken ");
    await expect(page.getByText(/JSON tidak valid/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Jalankan Diagnostics/ })).toBeDisabled();
  });
});
