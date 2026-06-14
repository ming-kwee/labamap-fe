// Channel Configuration types
// Corresponds to `channel_configurations` collection — read + targeted sub-field updates only.
// Full document replace is intentionally not exposed.

export interface FieldBoost {
  sourcePattern: string;
  targetPattern: string;
  confidenceBoost: number;
  reason?: string;
  /** e.g. "category=electronics" — null/undefined = applies to all */
  condition?: string | null;
}

export interface PostProcessingOperation {
  type: string; // "ENRICH_IMAGES" | "CONCAT_INTO" | "GENERATE_OPTIONS"
  sourceField?: string;
  targetField?: string;
  [key: string]: unknown;
}

export interface PostProcessingRule {
  name: string;
  enabled: boolean;
  operations: PostProcessingOperation[];
}

export interface IntegrationConfig {
  /** API path signed for every publish request (non-null activates HMAC signing, e.g. Shopee) */
  publishApiPath?: string;
  /** Credential key whose value is the signing identity prepended to sign message */
  publishHmacSigningCredentialKey?: string;
  [key: string]: unknown;
}

export interface ChannelConfiguration {
  channelId: string;
  channelName: string;
  isActive: boolean;
  version?: string;
  fieldBoosts: FieldBoost[];
  postProcessingRules: PostProcessingRule[];
  integrationConfig?: IntegrationConfig;
  categoryRequirements?: Record<string, unknown>;
  /** productAdminUrlTemplate, categoryGidPrefix, categoryGidFieldPath, etc. */
  metadata?: Record<string, unknown>;
  updatedAt?: string;
}

// ─── Field-Boost request types ────────────────────────────────────────────────

export type FieldBoostAction = "add" | "remove" | "replace";

export type FieldBoostRequest =
  | { action: "add";     boost: FieldBoost }
  | { action: "remove";  sourcePattern: string; targetPattern: string }
  | { action: "replace"; boosts: FieldBoost[] };

// ─── Post-Processing-Rule request types ───────────────────────────────────────

export type PostProcessingRuleAction = "upsert" | "remove" | "enable" | "disable";

export type PostProcessingRuleRequest =
  | { action: "upsert";   rule: PostProcessingRule }
  | { action: "remove";   name: string }
  | { action: "enable";   name: string }
  | { action: "disable";  name: string };

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapFieldBoost(raw: unknown): FieldBoost {
  const r = raw as Record<string, unknown>;
  return {
    sourcePattern:   String(r.sourcePattern  ?? ""),
    targetPattern:   String(r.targetPattern  ?? ""),
    confidenceBoost: Number(r.confidenceBoost ?? 0),
    reason:          r.reason    as string | undefined,
    condition:       r.condition as string | null | undefined,
  };
}

function mapRule(raw: unknown): PostProcessingRule {
  const r = raw as Record<string, unknown>;
  return {
    name:       String(r.name ?? ""),
    enabled:    Boolean(r.enabled ?? true),
    operations: Array.isArray(r.operations) ? r.operations as PostProcessingOperation[] : [],
  };
}

export function mapRawConfig(raw: unknown): ChannelConfiguration {
  const r = raw as Record<string, unknown>;
  return {
    channelId:            String(r.channelId   ?? r.id ?? ""),
    channelName:          String(r.channelName ?? r.channelId ?? ""),
    isActive:             Boolean(r.isActive   ?? r.active ?? true),
    version:              r.version  as string | undefined,
    fieldBoosts:          Array.isArray(r.fieldBoosts)         ? r.fieldBoosts.map(mapFieldBoost)         : [],
    postProcessingRules:  Array.isArray(r.postProcessingRules) ? r.postProcessingRules.map(mapRule)        : [],
    integrationConfig:    r.integrationConfig as IntegrationConfig | undefined,
    categoryRequirements: r.categoryRequirements as Record<string, unknown> | undefined,
    metadata:             r.metadata             as Record<string, unknown> | undefined,
    updatedAt:            r.updatedAt as string | undefined,
  };
}
