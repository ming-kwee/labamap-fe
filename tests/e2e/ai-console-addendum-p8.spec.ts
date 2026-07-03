/**
 * E2E: AI Console — addendum §8 (new backend capabilities).
 *  §8.1 P1-G distinguishes & lets you review AI-made field mappings.
 *  §8.5 Learning Dashboard shows AI-enrichment maturity.
 *  §8.2 API Schema Manager previews the merged schema the agent sees.
 *  §8.4 Config Panel shows the enrichMappings flag (when present).
 *
 * These screens use their own services (/admin/channel-field-mappings,
 * /admin/channel-category-schemas, /channels/{id}/schema), mocked per-test.
 */
import { test, expect, mock } from "./fixtures";

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

const AI_MAPPING = {
  id: "fm-ai", channelId: "shopify", sourceField: "color", targetField: "product.variants[0].option1",
  sourceAliases: [], targetAliases: [], confidence: 70, mappingStrategy: "AI_GENERATED",
  isRequired: false, isActive: true, successRate: 66, usageCount: 3,
  createdBy: "ai-agent-v1", verificationTier: "UNVERIFIED", successCount: 2, failureCount: 1,
  createdAt: "2026-07-02T00:00:00", updatedAt: "2026-07-02T00:00:00",
};
const SYSTEM_MAPPING = {
  id: "fm-sys", channelId: "shopify", sourceField: "title", targetField: "product.title",
  sourceAliases: [], targetAliases: [], confidence: 99, mappingStrategy: "EXACT",
  isRequired: true, isActive: true, successRate: 100, usageCount: 50,
  createdBy: "system", verificationTier: null, successCount: null, failureCount: null,
  createdAt: "2026-01-01T00:00:00", updatedAt: "2026-01-01T00:00:00",
};

// ─── §8.1 · P1-G AI mapping review ──────────────────────────────────────────

test.describe("Addendum §8.1 · Field Mappings — AI origin & review", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/admin/channel-field-mappings**", (route) => {
      if (route.request().method() === "GET") return route.fulfill(json([AI_MAPPING, SYSTEM_MAPPING]));
      return route.continue();
    });
  });

  test("shows AI origin badge, Beta counts and Promote action", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto("/platform-admin/channel-field-mappings");
    await expect(page.getByRole("heading", { name: "Channel Field Mappings" })).toBeVisible();

    // AI provenance banner + origin badge.
    await expect(page.getByText(/ditulis agent AI/)).toBeVisible();
    await expect(page.getByText(/AI · Unverified/)).toBeVisible();
    // Beta evidence counts (✓success ✗failure).
    await expect(page.getByText("✓2")).toBeVisible();
    await expect(page.getByText("✗1")).toBeVisible();
    // Promote button present for the AI/unverified mapping.
    await expect(page.getByRole("button", { name: "Promote" })).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("origin filter narrows to AI-made mappings", async ({ page }) => {
    await page.goto("/platform-admin/channel-field-mappings");
    await expect(page.getByText("product.title")).toBeVisible(); // system mapping shown initially

    await page.getByRole("combobox").filter({ hasText: "All origins" }).selectOption("ai");
    await expect(page.getByText("product.variants[0].option1")).toBeVisible();
    await expect(page.getByText("product.title")).toHaveCount(0);
  });

  test("Promote raises verification tier via PUT", async ({ page }) => {
    let promotedBody: Record<string, unknown> | null = null;
    await page.route("**/admin/channel-field-mappings/fm-ai", (route) => {
      if (route.request().method() === "PUT") {
        promotedBody = route.request().postDataJSON();
        return route.fulfill(json({ ...AI_MAPPING, verificationTier: "MANUALLY_TESTED" }));
      }
      return route.continue();
    });

    await page.goto("/platform-admin/channel-field-mappings");
    await page.getByRole("button", { name: "Promote" }).click();

    await expect(page.getByText(/dipromosikan ke Manually Tested/)).toBeVisible();
    expect(promotedBody).toMatchObject({ verificationTier: "MANUALLY_TESTED" });
  });

  // Deep-link support (addendum §8.3): ?channelId=&origin=ai pre-filters.
  test("§8.3 deep-link pre-filters to AI mappings", async ({ page }) => {
    await page.goto("/platform-admin/channel-field-mappings?channelId=shopify&origin=ai");
    await expect(page.getByText("product.variants[0].option1")).toBeVisible();
    await expect(page.getByText("product.title")).toHaveCount(0);
  });
});

// ─── §8.5 · Learning Dashboard maturity ─────────────────────────────────────

test.describe("Addendum §8.5 · AI enrichment maturity", () => {
  test("shows maturity section derived from field mappings", async ({ page }) => {
    await page.route("**/admin/channel-field-mappings**", (route) =>
      route.fulfill(json([AI_MAPPING, { ...AI_MAPPING, id: "fm-ai2", verificationTier: "VERIFIED_PRODUCTION" }, SYSTEM_MAPPING])),
    );
    await page.goto("/platform-admin/ai-learning");
    await expect(page.getByText("Kematangan AI enrichment (Jalur C)")).toBeVisible();
    await expect(page.getByText("Mapping buatan AI").first()).toBeVisible();
    // 2 AI mappings, 1 promoted (VERIFIED_PRODUCTION).
    await expect(page.getByText("Dipromosikan").first()).toBeVisible();
  });
});

// ─── §8.2 · API Schema Manager merged-schema preview ────────────────────────

test.describe("Addendum §8.2 · Merged schema preview", () => {
  test("previews the target paths the agent sees", async ({ page }) => {
    await page.route("**/admin/channel-category-schemas**", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill(json([
          { id: "sc-1", channelType: "shopify", categorySlug: "clothing", version: 3, apiSchemaExtension: { a: 1 }, isActive: true, changeNote: "x", createdAt: "2026-01-01", updatedAt: "2026-06-01" },
        ]));
      }
      return route.continue();
    });
    await page.route("**/channels/shopify/schema**", (route) =>
      route.fulfill(json({
        channelId: "shopify", fieldCount: 3,
        targetSchema: { "product.title": "", "product.variants[0].sku": "", "product.vendor": "" },
      })),
    );

    await page.goto("/platform-admin/channel-category-schemas");
    await page.getByRole("button", { name: "Preview" }).first().click();

    await expect(page.getByText(/Merged schema/)).toBeVisible();
    await expect(page.getByText("3 fields")).toBeVisible();
    await expect(page.getByText("product.variants[0].sku")).toBeVisible();
  });
});

// ─── §8.4 · Config enrichMappings runtime toggle ────────────────────────────

test.describe("Addendum §8.4 · enrichMappings runtime toggle", () => {
  test("renders ON when backend exposes the flag", async ({ page }) => {
    await page.route("**/admin/ai/config", (r) =>
      r.fulfill(json({ ...mock.config, recommendation: { ...mock.config.recommendation, enrichMappings: true } })),
    );
    await page.goto("/platform-admin/ai-config");
    await expect(page.getByText(/AI enrich field mappings \(Jalur C\): ON/)).toBeVisible();
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  test("toggle OFF confirms then calls the runtime kill-switch and reflects new state", async ({ page }) => {
    let enrich = true;
    let putCalled: string | null = null;
    await page.route("**/admin/ai/config", (r) =>
      r.fulfill(json({ ...mock.config, recommendation: { ...mock.config.recommendation, enrichMappings: enrich } })),
    );
    await page.route("**/admin/ai/config/enrich-mappings**", (route) => {
      putCalled = route.request().url();
      enrich = false;
      return route.fulfill(json({ enrichMappings: false, scope: "runtime", note: "Reverts to AI_ENRICH_MAPPINGS on restart" }));
    });

    await page.goto("/platform-admin/ai-config");
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");

    await page.getByRole("switch").click();
    // Confirmation before changing production AI behavior.
    await expect(page.getByTestId("confirm-dialog")).toBeVisible();
    await page.getByTestId("confirm-ok").click();

    // Toast reflects the backend note; switch flips to OFF after reload.
    await expect(page.getByText(/Jalur C\) OFF/)).toBeVisible();
    await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(putCalled).toContain("enabled=false");
  });
});
