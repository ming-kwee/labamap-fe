/**
 * E2E: AI Admin Console — Phase 2 (P1-E, P1-F, P1-H, P1-L).
 *
 * Backend `/admin/ai/*` responses are mocked in ./fixtures. Verifies the
 * observability & tuning screens: agent sessions (grounding + failure cause),
 * JOLT generation console (result + quota failure), learning dashboard, and the
 * read-only config/cascade panel.
 */
import { test, expect } from "./fixtures";

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

// ─── P1-E · Agent Sessions ──────────────────────────────────────────────────

test.describe("P1-E · Agent Sessions", () => {
  test("lists sessions for a channel and shows grounding proof", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await page.goto("/platform-admin/ai-sessions");
    await expect(page.getByRole("heading", { name: "Agent Sessions" })).toBeVisible();

    // List requires a channel — pick one.
    await page.getByRole("combobox").selectOption("shopify");
    await expect(page.getByText("JOLT_GENERATION").first()).toBeVisible();

    // Open the COMPLETED session → grounding (ragContext) must be visible.
    await page.getByText("COMPLETED").first().click();
    await expect(page.getByText("RAG Context")).toBeVisible();
    await expect(page.getByText(/Agent grounded ke RAG/)).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test("classifies a FAILED session as a quota problem", async ({ page }) => {
    await page.goto("/platform-admin/ai-sessions");
    await page.getByRole("combobox").selectOption("shopify");
    await page.getByText("FAILED").first().click();

    await expect(page.getByText(/Kuota LLM habis/)).toBeVisible();
    await expect(page.getByText(/Retries exhausted/)).toBeVisible();
  });

  test("opens a session directly from a ?sessionId= deep link", async ({ page }) => {
    await page.goto("/platform-admin/ai-sessions?sessionId=sess-ok-1");
    // Drawer opens without needing to pick a channel first.
    await expect(page.getByText("RAG Context")).toBeVisible();
    await expect(page.getByText("Agent Steps")).toBeVisible();
  });
});

// ─── P1-F · JOLT Generation Console ─────────────────────────────────────────

test.describe("P1-F · JOLT Generation Console", () => {
  test("runs the agent and renders the proposed spec", async ({ page }) => {
    await page.goto("/platform-admin/ai-generate");
    await expect(page.getByRole("heading", { name: "JOLT Generation Console" })).toBeVisible();

    // Category ID is empty by default (no phantom override) → set one to enable the run.
    await page.getByPlaceholder("mis. clothing").fill("clothing");
    await page.getByRole("button", { name: /Jalankan Agent/ }).click();

    await expect(page.getByText("Recommendation created")).toBeVisible();
    await expect(page.getByText("Proposed JOLT spec")).toBeVisible();
    await expect(page.getByText(/confidence 81%/)).toBeVisible();
  });

  test("shows an actionable cause when the agent fails on quota", async ({ page }) => {
    await page.route("**/admin/ai/generate-jolt**", (r) =>
      r.fulfill(json({ status: "AGENT_FAILED", errorMessage: "Retries exhausted: 3/3" })),
    );
    await page.goto("/platform-admin/ai-generate");
    // Category ID is empty by default (no phantom override) → set one to enable the run.
    await page.getByPlaceholder("mis. clothing").fill("clothing");
    await page.getByRole("button", { name: /Jalankan Agent/ }).click();

    await expect(page.getByText("Agent failed")).toBeVisible();
    await expect(page.getByText(/Kuota LLM habis/)).toBeVisible();
  });

  test("blocks the run when the product JSON is invalid", async ({ page }) => {
    await page.goto("/platform-admin/ai-generate");
    await page.locator("textarea").fill("{ not valid json ");
    await expect(page.getByText(/JSON tidak valid/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Jalankan Agent/ })).toBeDisabled();
  });
});

// ─── P1-H · Learning Dashboard ──────────────────────────────────────────────

test.describe("P1-H · Learning Dashboard", () => {
  test("renders KPIs and empty states for per-channel data", async ({ page }) => {
    await page.goto("/platform-admin/ai-learning");
    await expect(page.getByRole("heading", { name: "Learning Dashboard" })).toBeVisible();
    await expect(page.getByText("Avg mapping success")).toBeVisible();
    await expect(page.getByText("95.5%")).toBeVisible();
    // channels[] empty in mock → explicit empty state, not a blank table.
    await expect(page.getByText(/Belum ada data per-channel/)).toBeVisible();
  });
});

// ─── P1-L · Config & Cascade Panel ──────────────────────────────────────────

test.describe("P1-L · Config & Cascade Panel", () => {
  test("shows effective providers, thresholds and cascade state", async ({ page }) => {
    await page.goto("/platform-admin/ai-config");
    await expect(page.getByRole("heading", { name: "AI Config & Cascade" })).toBeVisible();
    await expect(page.getByText("minSimilarityScore").first()).toBeVisible();
    // cascade.enabled === false → APM-only badge.
    await expect(page.getByText(/APM-only/)).toBeVisible();
  });
});
