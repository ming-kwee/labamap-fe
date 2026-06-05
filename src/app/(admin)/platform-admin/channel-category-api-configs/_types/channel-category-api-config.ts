// Channel Category API Config types
// Corresponds to `channel_category_api_config` collection.
// importConfig and taxonomyConfig are read-only (code-managed, not editable via admin API).

export interface CategoryTreeApiConfig {
  baseUrl?: string;
  httpMethod?: string;
  childrenUrlPath?: string;
  authStrategy?: string;
  authCredentialKey?: string;
  authHeaderName?: string;
  itemsJsonPath?: string;
  nodeIdField?: string;
  nodeNameField?: string;
  nodeHasChildrenField?: string;
  treeStructure?: string;         // "FLAT_WITH_PARENT_ID" | "NESTED"
  nestedChildrenField?: string;
  fullTreeStrategy?: string;      // "SINGLE_CALL" | "RECURSIVE"
  paginationStrategy?: string;    // "NONE" | ...
  searchEndpoint?: string;
  [key: string]: unknown;
}

export interface AttributeApiConfig {
  urlPath?: string;
  categoryIdQueryParam?: string;
  graphqlQuery?: string;
  graphqlIdVariable?: string;
  itemsJsonPath?: string;
  nestedArrayField?: string;
  idField?: string;
  nameField?: string;
  requiredField?: string;
  isCustomizedField?: string;
  valuesField?: string;
  valueIdField?: string;
  valueNameField?: string;
  [key: string]: unknown;
}

export interface TaxonomyFetchConfig {
  fetchStrategy?: string;
  apiPath?: string;
  apiVersion?: string;
  dataPath?: string;
  [key: string]: unknown;
}

export interface TaxonomyConfig {
  enabled: boolean;
  fetchConfig?: TaxonomyFetchConfig;
}

export interface ImportConfig {
  capable: boolean;
  slugField?: string;
  productCountField?: string;
  collectionType?: string;
  [key: string]: unknown;
}

export interface ChannelCategoryApiConfig {
  id?: string;
  channelType: string;
  label?: string;
  treeApiConfig?: CategoryTreeApiConfig;
  attributeConfig?: AttributeApiConfig;
  taxonomyConfig?: TaxonomyConfig;
  importConfig?: ImportConfig;
  enabled: boolean;
  updatedAt?: string;
}

export interface CreateChannelCategoryApiConfigRequest {
  channelType: string;
  label?: string;
  enabled: boolean;
  treeApiConfig?: CategoryTreeApiConfig;
  attributeConfig?: AttributeApiConfig;
}

// ─── Mapper ────────────────────────────────────────────────────────────────────

export function mapRawConfig(raw: unknown): ChannelCategoryApiConfig {
  const r = raw as Record<string, unknown>;
  return {
    id:              r.id as string | undefined,
    channelType:     String(r.channelType ?? ""),
    label:           r.label as string | undefined,
    treeApiConfig:   r.treeApiConfig as CategoryTreeApiConfig | undefined,
    attributeConfig: r.attributeConfig as AttributeApiConfig | undefined,
    taxonomyConfig:  r.taxonomyConfig as TaxonomyConfig | undefined,
    importConfig:    r.importConfig as ImportConfig | undefined,
    enabled:         Boolean(r.enabled ?? true),
    updatedAt:       r.updatedAt as string | undefined,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function treeStrategyLabel(cfg?: CategoryTreeApiConfig): string {
  if (!cfg) return "—";
  const parts: string[] = [];
  if (cfg.fullTreeStrategy) parts.push(cfg.fullTreeStrategy);
  if (cfg.treeStructure)    parts.push(cfg.treeStructure);
  return parts.join(" / ") || "—";
}

export function attributeApiTypeLabel(cfg?: AttributeApiConfig): string {
  if (!cfg) return "—";
  if (cfg.graphqlQuery) return "GraphQL";
  if (cfg.urlPath)      return "REST GET";
  return "REST";
}
