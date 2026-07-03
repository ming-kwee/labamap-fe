/**
 * E2E: JOLT Generation Console robustness (long-run / rate-limit UX).
 * Backend can take minutes on LLM 429 retry/backoff — the console must show an
 * honest elapsed timer, a Cancel button (AbortController), and a pre-flight
 * warning when the LLM is already rate-limited. No endless spinner.
 */
import { test, expect } from "./fixtures";

const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
const page1 = (content: unknown[]) => ({ content, page: 0, size: 1, totalElements: content.length, totalPages: 1, hasNext: false });

test.describe("P1-F · long-run robustness", () => {
  test("pre-flight banner warns when latest session was quota-failed", async ({ page }) => {
    await page.route("**/admin/ai/sessions?**", (r) =>
      r.fulfill(json(page1([{
        id: "s-q", triggerType: "JOLT_GENERATION", channelId: "shopify", status: "FAILED",
        errorMessage: "Retries exhausted: 3/3", createdAt: "2026-07-03T10:00:00", ragContext: null,
      }])),
    ));
    await page.goto("/platform-admin/ai-generate");
    await expect(page.getByRole("heading", { name: "JOLT Generation Console" })).toBeVisible();
    await expect(page.getByText(/LLM sedang rate-limited/)).toBeVisible();
  });

  test("shows elapsed timer + Cancel during a slow run, and cancel aborts cleanly", async ({ page }) => {
    // Latest session COMPLETED → no pre-flight banner interfering.
    await page.route("**/admin/ai/sessions?**", (r) =>
      r.fulfill(json(page1([{ id: "ok", triggerType: "JOLT_GENERATION", channelId: "shopify", status: "COMPLETED", createdAt: "2026-07-03T10:00:00" }]))),
    );
    // generate-jolt hangs long enough to observe the running state, then (if not
    // aborted) would resolve. The AbortController cancels it first.
    await page.route("**/admin/ai/generate-jolt**", async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.fulfill(json({ status: "AUTO_APPLIED", proposedJoltSpec: [], joltSpecId: "x" }));
    });

    await page.goto("/platform-admin/ai-generate");
    await page.getByRole("button", { name: /Jalankan Agent/ }).click();

    // Running state: elapsed timer (m:ss) + Cancel button visible.
    await expect(page.getByRole("button", { name: "Batalkan" })).toBeVisible();
    await expect(page.getByText(/Agent sedang bekerja…/)).toBeVisible();
    await expect(page.getByText(/\d:\d\d/).first()).toBeVisible();

    // Cancel → abort → actionable message, back to idle (run button returns).
    await page.getByRole("button", { name: "Batalkan" }).click();
    await expect(page.getByText(/Dibatalkan/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Jalankan Agent/ })).toBeVisible();
  });
});
