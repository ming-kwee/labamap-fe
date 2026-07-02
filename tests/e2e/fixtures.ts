/**
 * Shared fixtures for AI Console e2e tests.
 *
 *  - Seeds a valid admin session into localStorage (keys per TokenManager in
 *    src/shared/contexts/AuthContext.tsx) and mocks `/auth/session/validate`,
 *    so the AuthLayout guard renders the admin pages instead of the sign-in form.
 *  - Installs DEFAULT mocks for every `/admin/ai/*` endpoint the P0 screens call,
 *    with realistic shapes captured from the live backend. Individual tests can
 *    register their own `page.route(...)` BEFORE navigating to override a
 *    specific endpoint (last-registered route wins in Playwright).
 */
import { test as base, expect, type BrowserContext } from "@playwright/test";

// ─── Seed identity (full shape so OrganizationContext dev-mode doesn't throw) ─

const USER = {
  userId: "d69e80e4-4936-44f7-9efb-f2c5349c9071",
  email: "labamap@gmail.com",
  firstName: "Demo",
  lastName: "Admin",
  role: "ORGANIZATION_ADMIN",
  status: "ACTIVE",
  lastLoginAt: "2026-07-01T00:00:00.000Z",
  permissions: ["*"],
};

const ORG = {
  organizationId: "org-e7dac9f8-6353-4168-b9a1-6a7791d71b02",
  organizationName: "Labamap Demo",
  platformTenantId: "tenant-1",
  businessDomain: "ecommerce",
  subscriptionTier: "ENTERPRISE",
  status: "ACTIVE",
  settings: {
    defaultProductCategory: "general",
    enabledChannels: ["shopify", "tiktok", "lazada"],
    defaultCurrency: "USD",
    timezone: "Asia/Jakarta",
    businessRulesEnabled: true,
    realTimeValidationEnabled: true,
  },
  features: {
    maxProducts: 100000,
    maxUsers: 100,
    businessRulesLimit: "unlimited",
    channelIntegrations: ["shopify", "tiktok", "lazada"],
    advancedAnalytics: true,
    customBranding: true,
  },
};

const ROLE = {
  role: "ADMIN",
  departmentId: "dept-1",
  departmentName: "Platform",
  permissions: ["*"],
  assignedCategories: [],
  assignedChannels: [],
  businessRulesPermissions: {
    canCreateRules: true,
    canModifyRules: true,
    canViewRules: true,
    assignedRuleCategories: [],
  },
};

// ─── Default mock payloads (shapes captured from live backend 2026-07-01) ────

export const mock = {
  embeddingsStats: {
    embeddingEnabled: true,
    vectorStore: "pgvector",
    embeddingProvider: "gemini",
    embeddingModel: "gemini-embedding-001",
    dimensions: 1536,
    llmProvider: "gemini",
    llmModel: "gemini-2.0-flash",
    atlasIndexName: "ai_schema_embeddings_vector_idx",
    counts: { JOLT_SPEC: 7, FIELD_MAPPING: 88, SEMANTIC_KNOWLEDGE: 3, total: 98 },
    sourceCounts: { JOLT_SPEC: 7, FIELD_MAPPING: 88, SEMANTIC_KNOWLEDGE: 3 },
    queriedAt: "2026-07-01T13:00:00.000",
  },
  learningStats: {
    period: "last_30_days",
    channels: [],
    fieldMappings: { avgSuccessRate: 95.45, totalMappings: 88, lowSuccessRate: 4 },
    modelHealth: {
      mappingEmbeddingCount: 88,
      joltEmbeddingCount: 7,
      pendingRecommendations: 3,
      agentEnabled: true,
      embeddingEnabled: true,
    },
    calibration: [],
  },
  recommendationsStats: { pending: 3, approved: 12, rejected: 1, total: 16 },
  config: {
    enabled: true,
    llm: { provider: "gemini", model: "gemini-2.0-flash", keyConfigured: true },
    embedding: { provider: "gemini", model: "gemini-embedding-001", dimensions: 1536, keyConfigured: true },
    vectorStore: { provider: "pgvector", minSimilarityScore: 0.58, searchLimit: 5, atlasIndexName: "ai_schema_embeddings_vector_idx" },
    agent: { maxTokens: 8192, maxToolRounds: 5, agentTimeoutSeconds: 5 },
    recommendation: { autoApplyThreshold: 0.92, recommendThreshold: 0.7, expiryDays: 30 },
    cascade: { enabled: false, escalationThreshold: 85.0, mode: "sync", escalationTimeoutSeconds: 30 },
    reindexOnStartup: false,
  },
  orphansCountClean: {
    sourceType: "ALL",
    totalOrphans: 0,
    queriedAt: "2026-07-01T13:00:00.000",
    details: [
      { sourceType: "JOLT_SPEC", orphanCount: 0, liveCount: 7, embeddedCount: 7 },
      { sourceType: "FIELD_MAPPING", orphanCount: 0, liveCount: 88, embeddedCount: 88 },
      { sourceType: "SEMANTIC_KNOWLEDGE", orphanCount: 0, liveCount: 3, embeddedCount: 3 },
    ],
  },
  searchResults: {
    query: "product color and size variant",
    channelId: "all",
    sourceType: "FIELD_MAPPING",
    minScore: 0.0,
    resultCount: 3,
    results: [
      { score: 0.6477, snippet: "sourceField=color targetField=product.variants[0].color channelId=wix strategy=EXACT_OVERRIDE", referenceId: "6a43dcdd0749e31ae1af5d57", channelId: "wix", categoryId: "null" },
      { score: 0.6420, snippet: "sourceField=color targetField=product.variants[0].color channelId=shopify strategy=EXACT_OVERRIDE", referenceId: "6a43dcdc0749e31ae1af5d46", channelId: "shopify", categoryId: "null" },
      { score: 0.6407, snippet: "sourceField=size targetField=product.variants[0].size channelId=wix strategy=EXACT_OVERRIDE", referenceId: "6a43dcdd0749e31ae1af5d58", channelId: "wix", categoryId: "null" },
    ],
  },
  emptyRecommendations: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0, hasNext: false },
  reindexOk: { status: "COMPLETED", sourceType: "ALL", total: 98, indexed: 98, skipped: 0, failed: 0 },

  // ── Phase 2 (P1) ──────────────────────────────────────────────────────────
  sessions: {
    content: [
      {
        id: "sess-ok-1",
        triggerType: "JOLT_GENERATION",
        channelId: "shopify",
        categoryId: "clothing",
        status: "COMPLETED",
        ragContext: { retrievedJoltSpecs: 2, retrievedFieldMappings: 8, topSimilarityScore: 0.66 },
        agentSteps: [
          { tool: "search_field_mappings", input: { query: "color" }, resultCount: 5 },
          { tool: "emit_jolt", ok: true },
        ],
        summary: { fieldsMapped: 8, warnings: 0 },
        totalTokensUsed: 1234,
        durationMs: 8250,
        errorMessage: null,
        createdAt: "2026-07-01T10:00:00",
        completedAt: "2026-07-01T10:00:08",
      },
      {
        id: "sess-fail-1",
        triggerType: "JOLT_GENERATION",
        channelId: "shopify",
        categoryId: "clothing",
        status: "FAILED",
        ragContext: null,
        agentSteps: null,
        summary: null,
        totalTokensUsed: null,
        durationMs: 19242,
        errorMessage: "Retries exhausted: 3/3",
        createdAt: "2026-07-01T09:34:49",
        completedAt: "2026-07-01T09:34:49",
      },
    ],
    page: 0,
    size: 20,
    totalElements: 2,
    totalPages: 1,
    hasNext: false,
  },
  generateResult: {
    status: "RECOMMENDATION_CREATED",
    confidenceScore: 0.81,
    proposedJoltSpec: [{ operation: "shift", spec: { name: "title", price: "variants[0].price" } }],
    explanation: "Mapped 8 fields; 2 channel-specific overrides applied.",
    validationSummary: { valid: true, warnings: [] },
    agentSessionId: "sess-ok-1",
  },

  // ── Phase 3 (P2-K · Value Mappings) ───────────────────────────────────────
  valueMappings: {
    content: [
      {
        id: "vm-1",
        channelType: "tiktok",
        masterFieldName: "color",
        channelFieldName: "colour_id",
        fallbackStrategy: "PROMPT_USER",
        mappings: [
          { masterValue: "black", channelValue: "COLOUR_0001", channelLabel: "Black" },
          { masterValue: "white", channelValue: "COLOUR_0002", channelLabel: "White" },
        ],
        createdAt: "2026-03-08T15:58:49",
        updatedAt: "2026-06-30T22:12:22",
      },
      {
        id: "vm-2",
        channelType: "shopify",
        masterFieldName: "material",
        channelFieldName: "fabric",
        fallbackStrategy: "USE_CLOSEST",
        mappings: [{ masterValue: "cotton", channelValue: "COTTON", channelLabel: "Cotton" }],
        createdAt: "2026-03-08T15:58:49",
        updatedAt: "2026-06-30T22:12:22",
      },
    ],
    page: 0,
    size: 200,
    totalElements: 2,
    totalPages: 1,
    hasNext: false,
  },
};

/** A pending recommendation with the full trust-surface fields for P0-D. */
export const mockRecommendation = {
  id: "rec-e2e-001",
  status: "PENDING",
  priority: "HIGH",
  channelId: "shopify",
  categoryId: "cat-apparel",
  triggerType: "PUBLISH_FAILED",
  triggerContext: {
    masterProductId: "mp-123",
    publishAttemptId: "pa-456",
    errorMessage: "Missing required field: variants[0].weight",
    joltSpecIdBefore: "js-old-1",
  },
  analysis: {
    rootCause: "Channel requires weight on each variant; master maps it only at product level.",
    affectedFields: ["variants[].weight"],
    missingChannelRequirements: ["weight"],
    confidenceScore: 0.86,
    confidenceLevel: "MEDIUM",
    ragEvidence: [{ mappingId: "fm-1", sourceField: "weight", targetField: "variants[0].weight", score: 0.71 }],
    warnings: ["Applies to all shopify apparel listings — review before approving."],
  },
  proposedFix: { type: "JOLT_PATCH", currentJoltSpecId: "js-old-1" },
  expiresAt: "2026-07-25T00:00:00.000Z",
  agentSessionId: "sess-789",
  createdAt: "2026-07-01T10:00:00.000Z",
};

// ─── Route helpers ───────────────────────────────────────────────────────────

function json(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

/** Install default mocks for all AI admin endpoints on a context. */
export async function installAiMocks(context: BrowserContext) {
  await context.route("**/admin/ai/embeddings/stats", (r) => r.fulfill(json(mock.embeddingsStats)));
  await context.route("**/admin/ai/learning/stats**", (r) => r.fulfill(json(mock.learningStats)));
  await context.route("**/admin/ai/recommendations/stats", (r) => r.fulfill(json(mock.recommendationsStats)));
  await context.route("**/admin/ai/config", (r) => r.fulfill(json(mock.config)));
  await context.route("**/admin/ai/embeddings/orphans-count**", (r) => r.fulfill(json(mock.orphansCountClean)));
  await context.route("**/admin/ai/search/test**", (r) => r.fulfill(json(mock.searchResults)));
  // NOTE: '/recommendations/stats' is registered above; this catch-all for the
  // LIST must be registered AFTER so it wins only for the non-stats path.
  await context.route("**/admin/ai/recommendations?**", (r) => r.fulfill(json(mock.emptyRecommendations)));
  await context.route("**/admin/ai/reindex**", (r) => r.fulfill(json(mock.reindexOk)));
  // Phase 2. NOTE: Playwright globs treat "?" literally, so "sessions?**" only
  // matches the list (has a query string) and not "sessions/{id}" (detail).
  await context.route("**/admin/ai/sessions?**", (r) => r.fulfill(json(mock.sessions)));
  await context.route("**/admin/ai/sessions/*", (r) =>
    r.fulfill(json(mock.sessions.content[0])),
  );
  await context.route("**/admin/ai/generate-jolt**", (r) => r.fulfill(json(mock.generateResult)));
  // Phase 3 · P2-K value mappings (GET list). Writes are overridden per-test.
  await context.route("**/admin/channel-mappings?**", (r) => r.fulfill(json(mock.valueMappings)));
}

// ─── Extended test with auth + default mocks ─────────────────────────────────

export const test = base.extend<{ context: BrowserContext }>({
  context: async ({ context }, use) => {
    await context.addInitScript((seed) => {
      localStorage.setItem("labamap_access_token", "e2e-token");
      localStorage.setItem("labamap_refresh_token", "e2e-refresh");
      localStorage.setItem("labamap_user_data", JSON.stringify(seed.user));
      localStorage.setItem(
        "labamap_org_data",
        JSON.stringify({ organization: seed.org, userOrganizationRole: seed.role }),
      );
    }, { user: USER, org: ORG, role: ROLE });

    await context.route("**/auth/session/validate", (r) =>
      r.fulfill(json({ sessionValidation: { valid: true } })),
    );

    await installAiMocks(context);
    await use(context);
  },
});

export { expect };
