/**
 * E2E: AI Admin Console — Phase 1 (P0-A … P0-D).
 *
 * Backend `/admin/ai/*` responses are mocked in ./fixtures, so these tests are
 * deterministic and run without a live backend. They verify rendering, data
 * binding, key interactions, and the operator-safety behaviours the spec
 * demands (degraded banners, server-down screen, zero-result guidance,
 * destructive-action confirmation, human-in-the-loop trust surface).
 */
import { test, expect, mock, mockRecommendation } from "./fixtures";

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

// ─── P0-A · Health & Config Dashboard ───────────────────────────────────────

test.describe("P0-A · AI Health & Config Dashboard", () => {
  test("renders active providers, coverage, learning & recommendations", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto("/platform-admin/ai-health");

    await expect(page.getByRole("heading", { name: "AI System Health" })).toBeVisible();
    // Provider transparency — the #1 operator safeguard.
    await expect(page.getByText("PGVECTOR")).toBeVisible();
    await expect(page.getByText("gemini-embedding-001", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Embedding ON")).toBeVisible();
    await expect(page.getByText("Agent ON")).toBeVisible();
    // RAG coverage (embedded vs live).
    await expect(page.getByText("88/88")).toBeVisible();
    await expect(page.getByText("Total embedding")).toBeVisible();
    // Learning health gauge: avgSuccessRate 95.45 → 95.5%.
    await expect(page.getByText("95.5%")).toBeVisible();
    // Recommendations card link to P0-D.
    await expect(page.getByRole("link", { name: /Buka Review Queue/ })).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("shows a degraded banner when embedding is disabled", async ({ page }) => {
    await page.route("**/admin/ai/embeddings/stats", (r) =>
      r.fulfill(json({ ...mock.embeddingsStats, embeddingEnabled: false })),
    );
    await page.goto("/platform-admin/ai-health");

    await expect(page.getByText(/RAG nonaktif/)).toBeVisible();
    await expect(page.getByText("Embedding OFF")).toBeVisible();
  });

  test("shows the server-down screen when the AI backend is unreachable", async ({ page }) => {
    await page.route("**/admin/ai/**", (r) => r.abort());
    await page.goto("/platform-admin/ai-health");

    await expect(page.getByText(/Server AI tidak dapat dihubungi/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Coba lagi/ })).toBeVisible();
  });
});

// ─── P0-B · RAG Index Management ────────────────────────────────────────────

test.describe("P0-B · RAG Index Management", () => {
  test("renders the coverage table with reindex actions", async ({ page }) => {
    await page.goto("/platform-admin/ai-rag-index");

    await expect(page.getByRole("heading", { name: "RAG Index Management" })).toBeVisible();
    await expect(page.getByText("Coverage per source type")).toBeVisible();
    await expect(page.getByRole("button", { name: /Reindex ALL/ })).toBeVisible();
    // Scope to table cells — "JOLT Spec"/"Field Mapping" also appear as sidebar links.
    await expect(page.getByRole("cell", { name: "JOLT Spec", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Field Mapping", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Semantic Knowledge", exact: true })).toBeVisible();
  });

  test("scan surfaces orphans and offers a cleanup action", async ({ page }) => {
    await page.route("**/admin/ai/embeddings/orphans-count**", (r) =>
      r.fulfill(
        json({
          sourceType: "ALL",
          totalOrphans: 2,
          queriedAt: "2026-07-01T13:00:00.000",
          details: [
            { sourceType: "JOLT_SPEC", orphanCount: 0, liveCount: 7, embeddedCount: 7 },
            { sourceType: "FIELD_MAPPING", orphanCount: 2, liveCount: 88, embeddedCount: 90 },
            { sourceType: "SEMANTIC_KNOWLEDGE", orphanCount: 0, liveCount: 3, embeddedCount: 3 },
          ],
        }),
      ),
    );
    await page.goto("/platform-admin/ai-rag-index");
    await page.getByRole("button", { name: /Scan orphan/ }).click();

    await expect(page.getByText(/2 embedding yatim/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Cleanup ALL/ })).toBeVisible();
  });

  test("reindex ALL confirms first, then reports the job result", async ({ page }) => {
    await page.goto("/platform-admin/ai-rag-index");
    await page.getByRole("button", { name: /Reindex ALL/ }).click();

    // Destructive/async action must confirm before running (recommendations §1.3).
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.getByTestId("confirm-ok").click();

    // Job status read from body, not just HTTP code.
    await expect(page.getByText(/Reindex ALL selesai/)).toBeVisible();
    await expect(page.getByText(/indexed/).first()).toBeVisible();
  });
});

// ─── P0-C · RAG Search Playground ───────────────────────────────────────────

test.describe("P0-C · RAG Search Playground", () => {
  test("runs a query and shows scored results", async ({ page }) => {
    await page.goto("/platform-admin/ai-search");

    await expect(page.getByRole("heading", { name: "RAG Search Playground" })).toBeVisible();
    // minScore starts at 0 → RAW mode (see raw scores of all top-K).
    await expect(page.getByText(/RAW mode/)).toBeVisible();

    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page.getByText(/3 hasil/)).toBeVisible();
    await expect(page.locator("table tbody tr")).toHaveCount(3);
    await expect(page.getByText("0.648")).toBeVisible(); // score 0.6477 → toFixed(3)
    // Channel badge inside the results table (exact — snippet text also contains "channelId=shopify").
    await expect(page.locator("table tbody").getByText("Shopify", { exact: true })).toBeVisible();
  });

  test("explains zero results as a threshold issue, not an empty index", async ({ page }) => {
    await page.route("**/admin/ai/search/test**", (r) =>
      r.fulfill(json({ ...mock.searchResults, resultCount: 0, results: [], minScore: 0.7 })),
    );
    await page.goto("/platform-admin/ai-search");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page.getByText("0 hasil").first()).toBeVisible();
    await expect(page.getByText(/threshold/).first()).toBeVisible();
  });
});

// ─── P0-D · Recommendations Review Queue ────────────────────────────────────

test.describe("P0-D · Recommendations Review Queue", () => {
  test("shows an informative empty state when the queue is empty", async ({ page }) => {
    await page.goto("/platform-admin/ai-recommendations");

    await expect(page.getByRole("heading", { name: "Recommendations Review Queue" })).toBeVisible();
    await expect(page.getByText(/Tidak ada rekomendasi menunggu review/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Trigger Analysis/ })).toBeVisible();
  });

  test("renders a pending recommendation and opens the trust-surface drawer", async ({ page }) => {
    await page.route("**/admin/ai/recommendations?**", (r) =>
      r.fulfill(
        json({ content: [mockRecommendation], page: 0, size: 20, totalElements: 1, totalPages: 1, hasNext: false }),
      ),
    );
    await page.route("**/admin/ai/recommendations/rec-e2e-001", (r) => r.fulfill(json(mockRecommendation)));

    await page.goto("/platform-admin/ai-recommendations");

    // Queue row: confidence badge + root cause.
    await expect(page.getByText("86% · MEDIUM")).toBeVisible();
    await expect(page.getByText(/Channel requires weight/).first()).toBeVisible();

    // Open detail drawer.
    await page.getByText("PUBLISH_FAILED").first().click();

    // Trust surface: why + analysis + ragEvidence + warnings must be visible.
    await expect(page.getByText(/Missing required field: variants\[0\]\.weight/)).toBeVisible();
    await expect(page.getByText("RAG Evidence")).toBeVisible();
    await expect(page.getByText(/Applies to all shopify apparel listings/)).toBeVisible();
    // exact — /Approve/ would also match the "Approved" status tab.
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();

    // Reject requires a reviewer name.
    await page.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(page.getByText(/Isi nama reviewer dulu/)).toBeVisible();
  });

  test("surfaces a 422 JOLT-compile rejection on approve (persistent, not silent)", async ({ page }) => {
    await page.route("**/admin/ai/recommendations?**", (r) =>
      r.fulfill(json({ content: [mockRecommendation], page: 0, size: 20, totalElements: 1, totalPages: 1, hasNext: false })),
    );
    await page.route("**/admin/ai/recommendations/rec-e2e-001", (r) => r.fulfill(json(mockRecommendation)));
    // Backend JOLT-compile guard rejects the proposed spec with 422.
    await page.route("**/admin/ai/recommendations/rec-e2e-001/approve**", (r) =>
      r.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ message: "proposed spec is not a valid JOLT transform — expected flat dot-notation shift" }),
      }),
    );

    await page.goto("/platform-admin/ai-recommendations");
    await page.getByText("PUBLISH_FAILED").first().click();

    // Reviewer required → then Approve → confirm.
    await page.getByPlaceholder("nama / email admin").fill("qa@bhakti.co.id");
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByTestId("confirm-ok").click();

    // 422 surfaced persistently in the drawer (not a disappearing toast), with the reason
    // and a next-step hint. The drawer stays open so the reviewer can act.
    await expect(page.getByText("Approve ditolak backend")).toBeVisible();
    await expect(page.getByText(/not a valid JOLT transform/)).toBeVisible();
    await expect(page.getByText(/Reject rekomendasi ini, atau perbaiki/)).toBeVisible();
  });
});
