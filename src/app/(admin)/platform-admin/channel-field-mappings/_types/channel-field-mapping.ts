// Channel Field Mapping types — APM Tier 1 (CHANNEL_SPECIFIC)
// Corresponds to the `channel_field_mappings` MongoDB collection

// Includes strategies the agent/heuristics emit (AI_GENERATED, PATTERN, …) so
// the manager can display AI-written mappings — addendum §8.1 (AI Mapping Enrichment).
export type MappingStrategy =
  | "EXACT_OVERRIDE"
  | "EXACT"
  | "SEMANTIC"
  | "EXCLUDE"
  | "EXCLUDE_SOURCE"
  | "AI_GENERATED"
  | "PATTERN"
  | "PATTERN_TRANSFORM"
  | "CHANNEL_SPECIFIC"
  | "ALIAS_MAPPING";

export const STRATEGY_LABELS: Record<MappingStrategy, string> = {
  EXACT_OVERRIDE:   "Exact Override",
  EXACT:            "Exact",
  SEMANTIC:         "Semantic",
  EXCLUDE:          "Exclude Target",
  EXCLUDE_SOURCE:   "Exclude Source",
  AI_GENERATED:     "AI Generated",
  PATTERN:          "Pattern",
  PATTERN_TRANSFORM:"Pattern Transform",
  CHANNEL_SPECIFIC: "Channel Specific",
  ALIAS_MAPPING:    "Alias",
};

// Not every strategy has a human-authoring description (some are agent-only).
export const STRATEGY_DESCRIPTIONS: Partial<Record<MappingStrategy, string>> = {
  EXACT_OVERRIDE: "Highest priority — bypasses semantic matching. Use to fix a wrong learned mapping.",
  EXACT:          "Direct verified mapping. Known correct pair.",
  SEMANTIC:       "Semantic matching — confidence-based fuzzy pair.",
  EXCLUDE:        "Exclude target field from matching candidates. Channel-only field with no master equivalent.",
  EXCLUDE_SOURCE: "Exclude source field from matching. Field that should never be auto-matched.",
  AI_GENERATED:   "Ditulis otomatis oleh agent AI saat AUTO_APPLY (AI Mapping Enrichment). Awalnya UNVERIFIED — pantau successCount/failureCount lalu promosikan/hapus.",
};

// ─── Verification tier (Beta-distribution confidence) — addendum §8.1 ────────
// Ladder: UNVERIFIED → MANUALLY_TESTED → VERIFIED_PRODUCTION → CERTIFIED_HIGH_VOLUME.
export type VerificationTier =
  | "UNVERIFIED"
  | "MANUALLY_TESTED"
  | "VERIFIED_PRODUCTION"
  | "CERTIFIED_HIGH_VOLUME";

export const VERIFICATION_TIERS: VerificationTier[] = [
  "UNVERIFIED",
  "MANUALLY_TESTED",
  "VERIFIED_PRODUCTION",
  "CERTIFIED_HIGH_VOLUME",
];

export const TIER_LABELS: Record<VerificationTier, string> = {
  UNVERIFIED:            "Unverified",
  MANUALLY_TESTED:       "Manually Tested",
  VERIFIED_PRODUCTION:   "Verified (production)",
  CERTIFIED_HIGH_VOLUME: "Certified (high-volume)",
};

/** Confidence ceiling per tier (from SCORE-ACCURACY-DEEP-ANALYSIS). */
export const TIER_CEILING: Record<VerificationTier, number> = {
  UNVERIFIED: 60,
  MANUALLY_TESTED: 75,
  VERIFIED_PRODUCTION: 90,
  CERTIFIED_HIGH_VOLUME: 99,
};

/**
 * Evidence required (net successes = successCount − failureCount) to promote INTO
 * each tier, enforced by the backend promote guard (addendum §8.1). MANUALLY_TESTED
 * needs none (a human vouches). Backend rejects with 422 if unmet.
 */
export const TIER_EVIDENCE: Record<VerificationTier, number> = {
  UNVERIFIED: 0,
  MANUALLY_TESTED: 0,
  VERIFIED_PRODUCTION: 5,
  CERTIFIED_HIGH_VOLUME: 50,
};

/** net successes = successCount − failureCount (0 when counters absent). */
export function netSuccess(m: ChannelFieldMapping): number {
  return (m.successCount ?? 0) - (m.failureCount ?? 0);
}

/** Next tier up when promoting; null if already at the top / unknown. */
export function nextTier(t?: VerificationTier | null): VerificationTier | null {
  if (!t) return "MANUALLY_TESTED"; // UNVERIFIED-equivalent → first promotion
  const i = VERIFICATION_TIERS.indexOf(t);
  return i >= 0 && i < VERIFICATION_TIERS.length - 1 ? VERIFICATION_TIERS[i + 1] : null;
}

/**
 * Can this mapping be promoted to `target` right now (client-side guard mirroring
 * the backend)? MANUALLY_TESTED always allowed; evidence tiers need netSuccess ≥ threshold.
 */
export function canPromoteTo(m: ChannelFieldMapping, target: VerificationTier): boolean {
  const need = TIER_EVIDENCE[target] ?? 0;
  return need === 0 || netSuccess(m) >= need;
}

/** A mapping the AI agent wrote via AI Mapping Enrichment. */
export function isAiGenerated(m: ChannelFieldMapping): boolean {
  return (m.createdBy ?? "").toLowerCase().startsWith("ai") || m.mappingStrategy === "AI_GENERATED";
}

export interface ChannelFieldMapping {
  id: string;
  channelId: string;
  sourceField: string;
  sourceAliases: string[];
  targetField: string;
  targetAliases: string[];
  confidence: number;
  mappingStrategy: MappingStrategy;
  isRequired: boolean;
  isActive: boolean;
  /** Read-only — learned from publish history */
  successRate: number;
  /** Read-only — learned from publish history */
  usageCount: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
  // ── Provenance & Beta-evidence (addendum §8.1) ────────────────────────────
  /** e.g. "system" | "ai-agent-v1" | undefined. */
  createdBy?: string;
  verificationTier?: VerificationTier | null;
  /** Beta-distribution numerator/denominator — real publish outcomes. */
  successCount?: number | null;
  failureCount?: number | null;
  /** Tier-capped effective confidence (may differ from configured confidence). */
  effectiveConfidence?: number | null;
  isRecommended?: boolean;
  lastUsedAt?: string | null;
}

/** POST body — create a new mapping */
export interface CreateMappingRequest {
  channelId: string;
  sourceField: string;
  sourceAliases?: string[];
  targetField: string;
  targetAliases?: string[];
  confidence?: number;
  mappingStrategy?: MappingStrategy;
  isRequired?: boolean;
  description?: string;
}

/**
 * PUT body — update an existing mapping.
 * channelId, sourceField, targetField are immutable after creation — backend ignores them.
 * Do NOT include targetField here; delete and recreate to change the identity triple.
 */
export interface UpdateMappingRequest {
  sourceAliases?: string[];
  targetAliases?: string[];
  confidence?: number;
  mappingStrategy?: MappingStrategy;
  isRequired?: boolean;
  description?: string;
  /** Promote a mapping's verification tier (addendum §8.1). */
  verificationTier?: VerificationTier;
}

/** Query params for GET /admin/channel-field-mappings */
export interface MappingListParams {
  channelId?: string;
  sourceField?: string;
  targetField?: string;
  strategy?: MappingStrategy;
  isRequired?: boolean;
  /** Default true (active only). Pass false to include deactivated. */
  isActive?: boolean;
  minConfidence?: number;
  /** Filter by author, e.g. "ai-agent-v1" (addendum §8.1). */
  createdBy?: string;
  /** Filter by verification tier, e.g. "UNVERIFIED" (addendum §8.1). */
  verificationTier?: VerificationTier;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function mapRawMapping(raw: unknown): ChannelFieldMapping {
  const r = raw as Record<string, unknown>;
  return {
    id:               (r.id ?? r._id ?? "") as string,
    channelId:        (r.channelId ?? "") as string,
    sourceField:      (r.sourceField ?? "") as string,
    sourceAliases:    Array.isArray(r.sourceAliases) ? (r.sourceAliases as string[]) : [],
    targetField:      (r.targetField ?? "") as string,
    targetAliases:    Array.isArray(r.targetAliases) ? (r.targetAliases as string[]) : [],
    confidence:       Number(r.confidence ?? 99),
    mappingStrategy:  (r.mappingStrategy ?? "EXACT_OVERRIDE") as MappingStrategy,
    isRequired:       Boolean(r.isRequired ?? false),
    isActive:         Boolean(r.isActive ?? r.active ?? true),
    successRate:      Number(r.successRate ?? 100),
    usageCount:       Number(r.usageCount ?? 0),
    description:      r.description as string | undefined,
    createdAt:        (r.createdAt ?? "") as string,
    updatedAt:        (r.updatedAt ?? "") as string,
    createdBy:        (r.createdBy as string | undefined) ?? undefined,
    verificationTier: (r.verificationTier as VerificationTier | null | undefined) ?? null,
    successCount:     r.successCount == null ? null : Number(r.successCount),
    failureCount:     r.failureCount == null ? null : Number(r.failureCount),
    effectiveConfidence: r.effectiveConfidence == null ? null : Number(r.effectiveConfidence),
    isRecommended:    r.isRecommended == null ? undefined : Boolean(r.isRecommended),
    lastUsedAt:       (r.lastUsedAt as string | null | undefined) ?? null,
  };
}
