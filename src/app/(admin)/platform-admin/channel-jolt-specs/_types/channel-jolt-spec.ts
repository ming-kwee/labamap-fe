// Channel JOLT Spec types
// Corresponds to the `channel_jolt_specs` MongoDB collection

export interface JoltMetadata {
  version?: string;
  mappingCount?: number;
  isManuallyConfigured?: boolean;
  generatedAt?: string;
  generatedBy?: string;
  strategyBreakdown?: Record<string, number>;
  confidence?: number | null;
  supersetSchemaHash?: string | null;
  /** 4-layer JOLT readiness check warnings from APM analyze.
   *  Includes "[JOLT-READINESS] Overall: READY|WARNINGS|NOT_READY" and per-check details.
   *  Present when spec was last regenerated after bff-v6 deploy. */
  warnings?: string[];
}

export interface ChannelJoltSpec {
  id: string;
  channelId: string;
  /** "clothing", "electronics", "default", etc. Null treated as "default" */
  categoryId: string | null;
  /** null = system default (applies to all orgs) */
  organizationId: string | null;
  isSystemDefault: boolean;
  isActive: boolean;
  /** Array of JOLT operation objects */
  joltSpec: unknown[];
  joltMetadata: JoltMetadata;
  supersetSchema: Record<string, unknown> | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * PUT /admin/channel-jolt-specs/{id}
 * Edit the spec content and optionally lock it from APM overwrite.
 */
export interface UpdateJoltSpecRequest {
  joltSpec: unknown[];
  /** true = lock from APM overwrite; false = re-open for auto-updates */
  markAsManuallyConfigured: boolean;
}

/** Response from bulk DELETE */
export interface BulkDeleteResponse {
  deleted: number;
  channelId: string;
}

// ─── Schema staleness (GET /admin/channel-jolt-specs/staleness) ────────────────
// docs/FRONTEND-JOLT-SPEC-SCHEMA-STALENESS.md §3. Tri-state; `status` is the source
// of truth (comparison is done by the backend). Additive — separate from the list.

export type SpecStalenessStatus = "STALE" | "FRESH" | "UNKNOWN";

export interface SpecStalenessItem {
  /** Matches ChannelJoltSpec.id — join key. */
  id: string;
  channelId: string;
  categoryId: string | null;
  organizationId: string | null;
  isSystemDefault: boolean;
  generatedBy?: string | null;
  /** apiVersion the spec targeted when generated vs the channel's current version. */
  specApiVersion?: string | null;
  channelApiVersion?: string | null;
  /** Fingerprints (for tooltip/diagnostics only — comparison already done backend-side). */
  specTargetSchemaHash?: string | null;
  channelApiSchemaHash?: string | null;
  status: SpecStalenessStatus;
}

export interface StalenessListParams {
  /** Limit to one channel. */
  channelId?: string;
  /** true = only STALE rows (default false = all statuses). */
  onlyStale?: boolean;
}

export function mapRawStalenessItem(raw: unknown): SpecStalenessItem {
  const r = raw as Record<string, unknown>;
  const status = String(r.status ?? "UNKNOWN").toUpperCase();
  return {
    id:              (r.id ?? r._id ?? "") as string,
    channelId:       (r.channelId ?? "") as string,
    categoryId:      r.categoryId != null ? String(r.categoryId) : null,
    organizationId:  r.organizationId != null ? String(r.organizationId) : null,
    isSystemDefault: Boolean(r.isSystemDefault ?? false),
    generatedBy:          (r.generatedBy as string | null | undefined) ?? null,
    specApiVersion:       (r.specApiVersion as string | null | undefined) ?? null,
    channelApiVersion:    (r.channelApiVersion as string | null | undefined) ?? null,
    specTargetSchemaHash: (r.specTargetSchemaHash as string | null | undefined) ?? null,
    channelApiSchemaHash: (r.channelApiSchemaHash as string | null | undefined) ?? null,
    status: (["STALE", "FRESH", "UNKNOWN"].includes(status) ? status : "UNKNOWN") as SpecStalenessStatus,
  };
}

export interface JoltSpecListParams {
  channelId?: string;
  categoryId?: string;
  organizationId?: string;
  isSystemDefault?: boolean;
  isManuallyConfigured?: boolean;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function mapRawJoltSpec(raw: unknown): ChannelJoltSpec {
  const r = raw as Record<string, unknown>;
  const meta = (r.joltMetadata ?? {}) as Record<string, unknown>;
  return {
    id:             (r.id ?? r._id ?? "") as string,
    channelId:      (r.channelId ?? "") as string,
    categoryId:     r.categoryId != null ? String(r.categoryId) : null,
    organizationId: r.organizationId != null ? String(r.organizationId) : null,
    isSystemDefault: Boolean(r.isSystemDefault ?? false),
    isActive:        Boolean(r.isActive ?? r.active ?? true),
    joltSpec:        Array.isArray(r.joltSpec) ? r.joltSpec : [],
    joltMetadata: {
      version:              meta.version as string | undefined,
      mappingCount:         meta.mappingCount != null ? Number(meta.mappingCount) : undefined,
      isManuallyConfigured: Boolean(meta.isManuallyConfigured ?? false),
      generatedAt:          meta.generatedAt as string | undefined,
      generatedBy:          meta.generatedBy as string | undefined,
      strategyBreakdown:    isStringNumberMap(meta.strategyBreakdown)
                              ? (meta.strategyBreakdown as Record<string, number>)
                              : undefined,
      confidence:           meta.confidence != null ? Number(meta.confidence) : null,
      supersetSchemaHash:   meta.supersetSchemaHash as string | null | undefined,
      warnings:             Array.isArray(meta.warnings) ? (meta.warnings as string[]) : undefined,
    },
    supersetSchema: (r.supersetSchema as Record<string, unknown> | null) ?? null,
    description:    r.description as string | null | undefined,
    createdAt: (r.createdAt ?? "") as string,
    updatedAt: (r.updatedAt ?? "") as string,
  };
}

function isStringNumberMap(v: unknown): boolean {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// ─── Provenance / audit helpers (who applied this JOLT to production) ─────────

export type SpecOrigin = "AI_AGENT" | "APM" | "MANUAL";

export const ORIGIN_LABELS: Record<SpecOrigin, string> = {
  AI_AGENT: "AI agent",
  APM: "APM",
  MANUAL: "Manual",
};

/** confidence threshold (%) at/above which a generated spec is auto-applied (config: autoApplyThreshold 0.92). */
export const AUTO_APPLY_CONFIDENCE = 92;

/**
 * Normalize confidence to a 0–100 percentage. joltMetadata stores it in TWO
 * scales depending on the writer (verified live): APM writes 0–100 (92.8),
 * the AI agent writes 0–1 (0.95). Coerce both to a percentage.
 */
export function confidencePct(spec: ChannelJoltSpec): number | null {
  const c = spec.joltMetadata.confidence;
  if (c == null) return null;
  return c <= 1 ? c * 100 : c;
}

/**
 * Classify who produced a spec, from joltMetadata.
 * - Manual: isManuallyConfigured=true (human-locked).
 * - AI agent: generatedBy mentions "agent"/"ai"/"llm"/"jolt-generation".
 * - APM: everything else auto-generated (adaptive-pattern-matching).
 */
export function specOrigin(spec: ChannelJoltSpec): SpecOrigin {
  const meta = spec.joltMetadata;
  if (meta.isManuallyConfigured) return "MANUAL";
  const by = (meta.generatedBy ?? "").toLowerCase();
  if (by.includes("agent") || by.startsWith("ai") || by.includes("llm") || by.includes("jolt-generation")) {
    return "AI_AGENT";
  }
  return "APM";
}

/** Auto-applied = generated (non-manual) at confidence ≥ threshold (scale-normalized). */
export function isAutoApplied(spec: ChannelJoltSpec): boolean {
  if (spec.joltMetadata.isManuallyConfigured) return false;
  const pct = confidencePct(spec);
  return pct != null && pct >= AUTO_APPLY_CONFIDENCE;
}
