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
