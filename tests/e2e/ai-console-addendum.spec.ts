/**
 * E2E: AI Console — addendum 2026-07-02 items.
 *  §2 agent error taxonomy (P1-F translates AGENT_FAILED by cause)
 *  §1 generate-jolt AUTO_APPLIED shows proposedJoltSpec + joltSpecId
 *  §4 P1-N config panel sync/async cascade hint
 */
import { test, expect, mock } from "./fixtures";

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

// ─── §2 · Agent error taxonomy (P1-F) ───────────────────────────────────────

test.describe("Addendum §2 · Agent error taxonomy", () => {
  const cases: Array<{ name: string; errorMessage: string; expect: RegExp }> = [
    { name: "rate-limit (retries exhausted)", errorMessage: "Retries exhausted: 3/3", expect: /Kuota LLM habis/ },
    { name: "model unavailable (limit: 0)", errorMessage: "quota exceeded, limit: 0", expect: /Model tak tersedia di plan/ },
    { name: "no structured output", errorMessage: "No JSON found in response", expect: /Output model tak valid/ },
    { name: "key missing", errorMessage: "ANTHROPIC_API_KEY is blank", expect: /LLM belum dikonfigurasi/ },
  ];

  for (const c of cases) {
    test(`translates ${c.name}`, async ({ page }) => {
      await page.route("**/admin/ai/generate-jolt**", (r) =>
        r.fulfill(json({ status: "AGENT_FAILED", errorMessage: c.errorMessage })),
      );
      await page.goto("/platform-admin/ai-generate");
      await page.getByRole("button", { name: /Jalankan Agent/ }).click();

      await expect(page.getByText("Agent failed")).toBeVisible();
      await expect(page.getByText(c.expect)).toBeVisible();
      // raw errorMessage is surfaced too (not hidden).
      await expect(page.getByText(c.errorMessage, { exact: false })).toBeVisible();
    });
  }
});

// ─── §1 · AUTO_APPLIED shows applied spec + joltSpecId ──────────────────────

test.describe("Addendum §1 · generate-jolt AUTO_APPLIED", () => {
  test("shows Applied JOLT spec and joltSpecId", async ({ page }) => {
    await page.route("**/admin/ai/generate-jolt**", (r) =>
      r.fulfill(
        json({
          status: "AUTO_APPLIED",
          confidenceScore: 0.95,
          proposedJoltSpec: [{ operation: "shift", spec: { name: "title" } }],
          joltSpecId: "6a45applied001",
        }),
      ),
    );
    await page.goto("/platform-admin/ai-generate");
    await page.getByRole("button", { name: /Jalankan Agent/ }).click();

    await expect(page.getByText("Auto-applied")).toBeVisible();
    await expect(page.getByText("Applied JOLT spec")).toBeVisible();
    await expect(page.getByText("6a45applied001")).toBeVisible();
  });
});

// ─── §4 P1-N · Config panel cascade sync/async hint ─────────────────────────

test.describe("Addendum §4 P1-N · Config cascade hint", () => {
  test("shows sync blocking hint when mode=sync", async ({ page }) => {
    await page.route("**/admin/ai/config", (r) =>
      r.fulfill(json({ ...mock.config, cascade: { ...mock.config.cascade, mode: "sync", escalationTimeoutSeconds: 90 } })),
    );
    await page.goto("/platform-admin/ai-config");
    await expect(page.getByText(/mode sync/)).toBeVisible();
    await expect(page.getByText(/terblok sampai 90s/)).toBeVisible();
  });

  test("shows async hint when mode=async", async ({ page }) => {
    await page.route("**/admin/ai/config", (r) =>
      r.fulfill(json({ ...mock.config, cascade: { ...mock.config.cascade, mode: "async" } })),
    );
    await page.goto("/platform-admin/ai-config");
    await expect(page.getByText(/mode async/)).toBeVisible();
    await expect(page.getByText(/menyempurnakan di background/)).toBeVisible();
  });
});
