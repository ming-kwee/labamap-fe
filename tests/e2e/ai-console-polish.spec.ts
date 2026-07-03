/**
 * E2E: AI Console — optional polish (addendum §3.1 + §5.3).
 *  §3.1 Health Dashboard shows "LLM: rate-limited" when the latest agent
 *       session across channels failed on quota/rate-limit.
 *  §5.3 Search Playground explains RAG ranks by meaning, not spelling.
 */
import { test, expect } from "./fixtures";

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const page1 = (content: unknown[]) => ({ content, page: 0, size: 1, totalElements: content.length, totalPages: 1, hasNext: false });

// ─── §3.1 · LLM rate-limited badge ──────────────────────────────────────────

test.describe("Addendum §3.1 · LLM rate-limited signal", () => {
  test("shows badge when the latest session failed on quota", async ({ page }) => {
    // Every channel probe returns a recent FAILED quota session.
    await page.route("**/admin/ai/sessions?**", (r) =>
      r.fulfill(json(page1([{
        id: "s-fail", triggerType: "JOLT_GENERATION", channelId: "shopify", status: "FAILED",
        errorMessage: "Retries exhausted: 3/3", createdAt: "2026-07-03T08:00:00", ragContext: null,
      }])),
    ));
    await page.goto("/platform-admin/ai-health");
    await expect(page.getByText("PGVECTOR")).toBeVisible();
    await expect(page.getByText("LLM: rate-limited")).toBeVisible();
  });

  test("no badge when the latest session completed successfully", async ({ page }) => {
    await page.route("**/admin/ai/sessions?**", (r) =>
      r.fulfill(json(page1([{
        id: "s-ok", triggerType: "JOLT_GENERATION", channelId: "shopify", status: "COMPLETED",
        errorMessage: null, createdAt: "2026-07-03T08:00:00",
        ragContext: { retrievedJoltSpecs: 2, retrievedFieldMappings: 8, topSimilarityScore: 0.66 },
      }])),
    ));
    await page.goto("/platform-admin/ai-health");
    await expect(page.getByText("PGVECTOR")).toBeVisible();
    await expect(page.getByText("LLM: rate-limited")).toHaveCount(0);
  });

  test("no badge when a non-quota failure is latest (e.g. known-fixed bug)", async ({ page }) => {
    await page.route("**/admin/ai/sessions?**", (r) =>
      r.fulfill(json(page1([{
        id: "s-dots", triggerType: "JOLT_GENERATION", channelId: "shopify", status: "FAILED",
        errorMessage: "Map key product.published contains dots", createdAt: "2026-07-03T08:00:00", ragContext: null,
      }])),
    ));
    await page.goto("/platform-admin/ai-health");
    await expect(page.getByText("PGVECTOR")).toBeVisible();
    await expect(page.getByText("LLM: rate-limited")).toHaveCount(0);
  });
});

// ─── §5.3 · Search meaning-not-spelling hint ────────────────────────────────

test.describe("Addendum §5.3 · Search semantic hint", () => {
  test("explains results are ranked by meaning", async ({ page }) => {
    await page.goto("/platform-admin/ai-search");
    await expect(page.getByRole("heading", { name: "RAG Search Playground" })).toBeVisible();
    await expect(page.getByText(/pencarian makna, bukan ejaan/)).toBeVisible();
  });
});
