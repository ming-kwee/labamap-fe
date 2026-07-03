/**
 * E2E: JOLT Specs provenance/audit (who auto-applied to production).
 * Adds Generated-by column + Origin filter + auto-applied stat so a reviewer
 * can see what the AI agent silently applied without going through review.
 * Note: joltMetadata.confidence is stored in two scales — APM 0–100, agent 0–1.
 */
import { test, expect } from "./fixtures";

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

const SPECS = [
  { id: "s-ai", channelId: "shopify", categoryId: "clothing", organizationId: null, isSystemDefault: false, isActive: true, joltSpec: [], supersetSchema: null,
    joltMetadata: { generatedBy: "ai-agent-v1", confidence: 0.95, isManuallyConfigured: false, mappingCount: 8 }, createdAt: "2026-07-02", updatedAt: "2026-07-02" },
  { id: "s-apm", channelId: "shopify", categoryId: "default", organizationId: null, isSystemDefault: false, isActive: true, joltSpec: [], supersetSchema: null,
    joltMetadata: { generatedBy: "adaptive-pattern-matching", confidence: 92.8, isManuallyConfigured: false, mappingCount: 29 }, createdAt: "2026-06-25", updatedAt: "2026-06-25" },
  { id: "s-man", channelId: "amazon", categoryId: "default", organizationId: null, isSystemDefault: true, isActive: true, joltSpec: [], supersetSchema: null,
    joltMetadata: { generatedBy: "DefaultJoltSpecDataLoader", confidence: null, isManuallyConfigured: true, mappingCount: 1 }, createdAt: "2026-06-11", updatedAt: "2026-06-11" },
];

test.describe("P2-I · JOLT Specs provenance", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/admin/channel-jolt-specs**", (route) => {
      if (route.request().method() === "GET") return route.fulfill(json(SPECS));
      return route.continue();
    });
  });

  test("shows Generated-by badges, correct confidence scale, and auto-applied stat", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto("/platform-admin/channel-jolt-specs");
    await expect(page.getByRole("heading", { name: /Channel JOLT Specs|JOLT Spec/ })).toBeVisible();

    // Origin badges present (scoped to table — these words also appear in the info banner).
    const table = page.locator("table");
    await expect(table.getByText("AI agent").first()).toBeVisible();
    await expect(table.getByText("APM").first()).toBeVisible();
    await expect(table.getByText("Manual").first()).toBeVisible();

    // Confidence scale normalized: agent 0.95 → 95%, APM 92.8 → 93% (NOT 1% / 93).
    await expect(table.getByText("95%").first()).toBeVisible();
    await expect(table.getByText("93%").first()).toBeVisible();

    // Stat tile + the "auto" chip on the high-confidence generated rows.
    await expect(page.getByText("AI auto-applied")).toBeVisible();
    await expect(table.getByText("auto", { exact: true }).first()).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("Origin filter narrows to AI-agent specs", async ({ page }) => {
    await page.goto("/platform-admin/channel-jolt-specs");
    const table = page.locator("table");
    await expect(table.getByText("AI agent").first()).toBeVisible();
    await expect(table.getByText("APM").first()).toBeVisible();

    await page.getByRole("combobox").filter({ hasText: "All origins" }).selectOption("AI_AGENT");
    await expect(table.getByText("AI agent").first()).toBeVisible();
    await expect(table.getByText("APM")).toHaveCount(0); // APM + Manual rows filtered out
    await expect(table.getByText("Manual")).toHaveCount(0);
  });

  test("Auto-applied filter keeps only high-confidence generated specs", async ({ page }) => {
    await page.goto("/platform-admin/channel-jolt-specs");
    const table = page.locator("table");
    await page.getByRole("combobox").filter({ hasText: "All origins" }).selectOption("auto_applied");
    // AI (0.95) and APM (92.8) qualify; manual (locked) filtered out.
    await expect(table.getByText("AI agent").first()).toBeVisible();
    await expect(table.getByText("APM").first()).toBeVisible();
    await expect(table.getByText("Manual")).toHaveCount(0);
  });
});
