/**
 * Unit test (pure logic, no browser) for the P1-M cascade badge resolver.
 * Addendum §4. Runs under the Playwright test runner but uses no `page`.
 */
import { test, expect } from "@playwright/test";
import { resolveCascadeVariant } from "../../src/modules/ai-admin/components/shared/cascadeOutcome";

test.describe("P1-M · resolveCascadeVariant", () => {
  test("no cascade data → null", () => {
    expect(resolveCascadeVariant({})).toBeNull();
  });

  test("not escalated → APM (green)", () => {
    const v = resolveCascadeVariant({ escalatedToAgent: false });
    expect(v?.kind).toBe("apm");
    expect(v?.label).toBe("APM");
  });

  test("escalated + AUTO_APPLIED → AI (auto)", () => {
    const v = resolveCascadeVariant({ escalatedToAgent: true, agentStatus: "AUTO_APPLIED" });
    expect(v?.kind).toBe("ai_auto");
    expect(v?.label).toContain("AI");
  });

  test("RECOMMENDATION_CREATED → needs review", () => {
    expect(resolveCascadeVariant({ escalatedToAgent: true, agentStatus: "RECOMMENDATION_CREATED" })?.kind).toBe("ai_review");
  });

  test("FALLBACK_APM → fallback badge", () => {
    const v = resolveCascadeVariant({ escalatedToAgent: true, agentStatus: "FALLBACK_APM" });
    expect(v?.kind).toBe("fallback_apm");
    expect(v?.label).toMatch(/fallback/i);
  });

  test("AGENT_FAILED → ai_failed", () => {
    expect(resolveCascadeVariant({ escalatedToAgent: true, agentStatus: "AGENT_FAILED" })?.kind).toBe("ai_failed");
  });
});
