// Channel Field Mapping types — APM Tier 1 (CHANNEL_SPECIFIC)
// Corresponds to the `channel_field_mappings` MongoDB collection

export type MappingStrategy =
  | "EXACT_OVERRIDE"
  | "EXACT"
  | "SEMANTIC"
  | "EXCLUDE"
  | "EXCLUDE_SOURCE";

export const STRATEGY_LABELS: Record<MappingStrategy, string> = {
  EXACT_OVERRIDE:  "Exact Override",
  EXACT:           "Exact",
  SEMANTIC:        "Semantic",
  EXCLUDE:         "Exclude Target",
  EXCLUDE_SOURCE:  "Exclude Source",
};

export const STRATEGY_DESCRIPTIONS: Record<MappingStrategy, string> = {
  EXACT_OVERRIDE: "Highest priority — bypasses semantic matching. Use to fix a wrong learned mapping.",
  EXACT:          "Direct verified mapping. Known correct pair.",
  SEMANTIC:       "Semantic matching — confidence-based fuzzy pair.",
  EXCLUDE:        "Exclude target field from matching candidates. Channel-only field with no master equivalent.",
  EXCLUDE_SOURCE: "Exclude source field from matching. Field that should never be auto-matched.",
};

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
  };
}
