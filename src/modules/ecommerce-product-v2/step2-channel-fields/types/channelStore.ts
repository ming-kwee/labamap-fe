// ─── Channel Store Connection Types ──────────────────────────────────────────
// Corresponds to the channel_store_connections MongoDB collection

export type ChannelType =
  | "shopify"
  | "wix"
  | "amazon"
  | "ebay"
  | "tiktok"
  | "lazada"
  | "tokopedia"
  | "facebook"
  | "shopee"
  | "walmart";

/** Phase E: connection lifecycle status derived by backend from isActive + reconnectRequired + disconnectReason */
export type ConnectionStatus = 'ACTIVE' | 'RECONNECT_REQUIRED' | 'DISCONNECTED' | 'INACTIVE';

export interface ChannelStoreConnection {
  storeId: string;
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  region?: string;
  organizationId: string;
  /** Credentials are masked ("***MASKED***") in API responses */
  credentials: Record<string, string>;
  isActive: boolean;
  displayOrder: number;
  /** ISO 8601 string or epoch-seconds number depending on backend Jackson config */
  connectedAt: string | number;
  /** ISO 8601 string or epoch-seconds number depending on backend Jackson config */
  lastSyncedAt?: string | number;

  // ── Phase D + E new fields ──────────────────────────────────────────────
  /** Phase E: true when the OAuth token has expired/been revoked — merchant must re-authorize */
  reconnectRequired?: boolean;
  /** Phase E: derived status — drives badge color and action buttons in the UI */
  connectionStatus?: ConnectionStatus;
  /** Phase D: ISO datetime when the store was deactivated by a marketplace webhook */
  disconnectedAt?: string;
  /** Phase D: machine-readable reason ("app_uninstalled" | "deauthorize" | "app_removed" | "manual" | …) */
  disconnectReason?: string;
  /** From ChannelConfiguration.taxonomyConfig.enabled — true = use TaxonomyMapperModal, not import wizard */
  taxonomyEnabled?: boolean;
  /** Derived from !taxonomyEnabled — true = can use the import wizard (WooCommerce, Etsy) */
  importCapable?: boolean;
  /** From ChannelCategoryApiConfig.treeCapable — true = REST/HMAC browsable category tree (Shopee, Amazon, TikTok, eBay, Lazada). Deployed 2026-06-15. */
  treeCapable?: boolean;
}

/**
 * One credential field in a connect-store or update-credentials request.
 * Mirrors the backend CredentialEntry DTO.
 *
 * credId       — matches CredentialFieldSchema.credId (backend schema identifier)
 * chnlCredName — becomes the key in the stored credentials map (e.g. "accessToken")
 * chnlCredValue — the actual secret value
 */
export interface CredentialEntry {
  credId: string;
  chnlCredName: string;
  chnlCredValue: string;
}

export interface StoreConnectionRequest {
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  storeId?: string;
  region?: string;
  displayOrder?: number;
  /** Structured credential list — each entry maps credId → chnlCredName → value */
  credentials: CredentialEntry[];
}

// ─── Credential Schema Types ──────────────────────────────────────────────────
// Returned by GET /api/v1/channel-stores/credential-schema/{channelType}

export interface CredentialFieldSchema {
  /** Backend internal identifier — used as the key in the structured credentials payload */
  credId: string;
  /** Canonical credential name — used as the key in Record<string,string> credentials map */
  chnlCredName: string;
  label: string;
  inputType: "text" | "password" | "email" | "url" | "number";
  sensitive: boolean;
  required: boolean;
  helpText?: string;
}

// ─── Channel Product Data Types ───────────────────────────────────────────────
// Corresponds to the channel_product_data MongoDB collection

export type ChannelProductStatus = "DRAFT" | "READY" | "PUBLISHED" | "FAILED";

export interface ChannelProductData {
  masterProductId: string;
  storeId: string;
  channelType: ChannelType;
  organizationId: string;
  status: ChannelProductStatus;
  /** Per-field overrides of master product data for this channel (keys with null = reset to master) */
  masterOverrides: Record<string, unknown>;
  channelData: Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;
  completionPercentage: number;
  readyToPublish: boolean;
  publishedAt?: string;
  publishError?: string;
  savedAt: string;
}

export interface ChannelStepSaveRequest {
  masterProductId: string;
  storeId: string;
  channelType: ChannelType;
  /** Per-field overrides of master product data for this channel; keys absent = inheriting master */
  masterOverrides: Record<string, unknown>;
  channelData: Record<string, unknown>;
  variantOverrides: Record<string, Record<string, unknown>>;
  /**
   * Scenario D: the selected category leaf node ID.
   * Backend uses this to validate category-specific required fields when computing
   * completionPercentage. Omit if the store's schema has no CATEGORY_TREE field.
   */
  categoryId?: string;
}

// ─── Scenario D: Category-Dependent Dynamic Field Injection ───────────────────

/**
 * Category-specific fields fetched from the channel after the seller picks a leaf
 * category in the CATEGORY_TREE picker. Returned by:
 *   GET /api/v1/merchant-data/{channelType}/{storeId}/category-attributes
 *       ?categoryId={leafId}&organizationId=...
 *
 * The backend also pre-fetches this when building the schema if a category is already
 * saved, and embeds it in ChannelSchemaPerStore.categoryAttributeSection so the form
 * is pre-populated without an extra round-trip on load.
 */
export interface CategoryAttributeSection {
  categoryId: string;
  categoryName: string;
  /** Human-readable breadcrumb labels from root to the selected leaf,
   *  e.g. ["Electronics", "Mobile Phones", "Smartphones"] */
  categoryPath: string[];
  /** Fields that are required for this category — seller must fill all before publish */
  requiredFields: ChannelFormField[];
  /** Optional category-specific fields — product-level metadata (Neckline, Sleeve length, etc.) */
  optionalFields: ChannelFormField[];
  /**
   * Variant-driving attributes (Color, Size, Pattern) — rendered in the variant options panel,
   * NOT in the optional section. Empty [] for channels without variantOptionAttributeNames config.
   * Use option.label (not option.value) when building channelData — Shopify takes human-readable
   * labels, not taxonomy GIDs.
   */
  variantOptionSuggestions: ChannelFormField[];
}

// ─── Completion Summary ───────────────────────────────────────────────────────

export interface StoreCompletionEntry {
  storeId: string;
  storeName: string;
  channelType: ChannelType;
  completionPercentage: number;
  status: ChannelProductStatus;
}

export interface CompletionSummaryResponse {
  overallReady: boolean;
  stores: StoreCompletionEntry[];
}

// ─── Step 2 Schema Types ──────────────────────────────────────────────────────
// Schema generated by POST /api/v1/ecommerce/form-schema/channel-step

export type ChannelFieldType =
  | "TEXT"
  | "TEXTAREA"
  | "NUMBER"
  | "SELECT"
  | "MULTISELECT"
  | "CHECKBOX"
  | "RADIO"
  | "DATE"
  | "URL"
  | "EMAIL"
  | "COLOR"
  /** Scenario C: multi-level hierarchical category tree picker */
  | "CATEGORY_TREE";

// ─── Scenario E: Conditional Rule Types ──────────────────────────────────────

/**
 * One rule in a field's conditionalRules array.
 * The rule fires when triggerField's current value is in triggerValues.
 *
 * SHOW     — field is visible only while this rule (or another SHOW rule) matches.
 * HIDE     — field is hidden while this rule matches.
 * REQUIRE  — field becomes required while this rule matches.
 * OPTIONAL — field becomes optional while this rule matches.
 * SET_VALIDATION — validationOverride merges on top of base validationRules.
 */
export interface ChannelFieldConditionalRule {
  triggerField: string;
  triggerValues: unknown[];
  effect: "SHOW" | "HIDE" | "REQUIRE" | "OPTIONAL" | "SET_VALIDATION";
  validationOverride?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
}

// ─── Scenario C: Category Tree Types ─────────────────────────────────────────

/** One node returned by GET /merchant-data/{channelType}/{storeId}/categories */
export interface CategoryTreeNode {
  id: string;
  name: string;
  /** true = this node has children; false = leaf node that can be selected */
  hasChildren: boolean;
}

/**
 * Configuration attached to CATEGORY_TREE fields in the schema response.
 * Tells the frontend how to navigate the category hierarchy.
 */
export interface CategoryTreeConfig {
  /**
   * Root-level endpoint (no parentId).
   * e.g. "/merchant-data/lazada/{storeId}/categories?organizationId=org_123"
   */
  rootEndpoint: string;
  /**
   * Endpoint template for loading child nodes. Use {parentId} as placeholder.
   * e.g. "/merchant-data/lazada/{storeId}/categories?parentId={parentId}&organizationId=org_123"
   */
  childEndpoint: string;
  /** Maximum tree depth — used for UI hints and validation */
  maxDepth: number;
  /** If true, the seller must navigate to a leaf node; non-leaf selection is blocked */
  requireLeafNode: boolean;
  /**
   * Optional: backend pre-populates the breadcrumb path for the currently saved value.
   * Allows the picker to show "Electronics › Mobile Phones › Smartphones" on load
   * without the frontend needing to reconstruct the path by re-fetching.
   * The last entry is the committed leaf node.
   */
  selectedPath?: CategoryTreeNode[];
  /**
   * Optional: full-text search endpoint for large taxonomies (e.g. Shopify).
   * GET {searchEndpoint}?q={query}
   * Returns TaxonomyCategory[] with fullName and ancestorIds.
   * When absent the picker falls back to filtering the currently-loaded level.
   */
  searchEndpoint?: string;
  /**
   * Pre-navigation hint from ProductType.channelCategoryDefaults (isLeaf=false).
   * CategoryTreePicker opens the browse panel at this level when there is no committed
   * selectedPath. Merchant still must pick a leaf — this is not a committed value.
   */
  preFillPath?: CategoryTreeNode[];
}

export interface ChannelFormField {
  fieldName: string;
  fieldType: ChannelFieldType;
  label: string;
  required: boolean;
  helpText?: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  validationRules?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
  currentValue?: unknown;
  /** true = this field is driven from EcommerceMasterAttributeDocument.isChannelOverridable */
  isMasterField?: boolean;
  /** master product's current value for this field, resolved by backend at schema-gen time */
  masterValue?: unknown;
  // ── Scenario A: Merchant-sourced options ──────────────────────────────────
  /**
   * STATIC       = options[] is complete and static — no fetch needed (default).
   * MERCHANT_API = options are live from the merchant's account.
   *   - Eager embed: backend called the channel API during schema generation and
   *     embedded results in options[]. Frontend requires no changes.
   *   - Lazy load: options[] is empty; backend sets optionsEndpoint so the
   *     frontend fetches when the field is rendered.
   * MASTER_MAPPED = options come from the channel's taxonomy; a masterMappedSuggestion
   *   is provided so the frontend can offer a one-click accept banner.
   */
  optionsSource?: "STATIC" | "MERCHANT_API" | "MASTER_MAPPED";
  /**
   * Relative URL pre-built by the backend for lazy-load fields.
   * Example: /merchant-data/shopify/store-abc/field-options?fieldName=location_id&organizationId=org_123
   * Only present when optionsSource === "MERCHANT_API" and options[] is empty (lazy path).
   */
  optionsEndpoint?: string;
  // ── Scenario C: Hierarchical category tree ────────────────────────────────
  /**
   * Only present when fieldType === "CATEGORY_TREE".
   * Contains the endpoints and config the frontend needs to navigate the tree.
   */
  categoryTreeConfig?: CategoryTreeConfig;
  // ── Scenario B: Master-to-channel value mapping ───────────────────────────
  /**
   * When the backend finds a mapping from the master product's field value to a
   * channel-specific taxonomy code, it includes this suggestion so the frontend
   * can offer a one-click "Accept" banner above the field.
   *
   * confidence levels:
   *   EXACT — a confirmed mapping exists; accept automatically or prompt once.
   *   FUZZY — a close but unconfirmed match; seller must verify before accepting.
   *   NONE  — no mapping found; seller must manually pick from options[].
   */
  masterMappedSuggestion?: MasterMappedSuggestion;
  // ── Scenario E: Cross-field conditional dependencies ─────────────────────
  /**
   * Rules evaluated against the current form values to dynamically control
   * visibility, required-ness, and validation of this field.
   * Backend also evaluates these rules in completionPercentage calculation.
   */
  conditionalRules?: ChannelFieldConditionalRule[];
}

/** Scenario B: suggestion produced by ChannelValueMappingService on the backend */
export interface MasterMappedSuggestion {
  /** The master product field name that was the source of the suggestion */
  masterField: string;
  /** The raw master product value (e.g. "cotton", "navy blue") */
  masterValue: unknown;
  /** The channel-specific value to use (e.g. "LZ_MAT_001", "COLOUR_0036") */
  suggestedValue: unknown;
  /** Human-readable label for suggestedValue (e.g. "Cotton", "Navy Blue") */
  suggestedLabel: string;
  /** How confident the mapping is */
  confidence: "EXACT" | "FUZZY" | "NONE";
}

export interface VariantOverrideRow {
  sku: string;
  variantLabel: string;
  currentOverrides: Record<string, unknown>;
}

export type SectionName =
  | "required"
  | "recommended"
  | "variant_overrides"
  | "optional"
  | "master_overrides"
  /** Scenario A: fields whose options come from the merchant's live account (warehouses, shipping templates, etc.) */
  | "merchant_data";

// ─── Master Product Snapshot ─────────────────────────────────────────────────
// Lightweight view of master product sent in ChannelStepSchemaResponse (Step 2)

export interface MasterProductSnapshot {
  name: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  quantity?: number;
  sku?: string;
  weight?: number;
  dimensions?: { length: number; width: number; height: number; unit: string };
  mainImage?: string;
  variants?: Array<{
    sku: string;
    variantLabel: string;
    /**
     * Structured option key-value pairs from Step 1, e.g. { Color: "Black", Size: "XS" }.
     * Preserved from sessionStorage so Step 2 can auto-populate per-variant option{n} values
     * when the seller clicks "Apply as variant options" in the suggestion panel.
     * Keys are the option dimension names exactly as entered in Step 1.
     */
    variantOptions?: Record<string, string>;
    /** All master variant attributes — open map so any fieldName resolves correctly in the variant table */
    [fieldName: string]: unknown;
  }>;
  /**
   * Phase 5: populated by backend when the master product has a ProductType with variantDimensions.
   * Used by ChannelStoreTab to display an informational banner about the variant structure.
   * Phase 2 (2026-06-15): productTypeId used to fetch channelCategoryDefaults for pre-fill.
   */
  productTypeId?: string;
  productTypeName?: string;
  productTypeVariantDimensions?: Array<{
    attributeCode: string;
    attributeName: string;
    order: number;
    required: boolean;
  }>;
}

export interface ChannelFormSection {
  sectionName: SectionName;
  label: string;
  priority: number;
  /** Only present when sectionName = "variant_overrides" */
  displayAs?: "TABLE";
  fields?: ChannelFormField[];
  /** Only for variant_overrides section */
  variantFields?: ChannelFormField[];
  variants?: VariantOverrideRow[];
}

export interface CompletionStats {
  requiredTotal:          number;  // channel + category combined
  requiredFilled:         number;  // channel + category combined
  channelRequiredTotal:   number;  // from channelConfig.requiredFieldObjects + Path A overrides
  channelRequiredFilled:  number;
  categoryRequiredTotal:  number;  // from live category attribute API (Path B); 0 when no category
  categoryRequiredFilled: number;
  recommendedTotal:       number;
  recommendedFilled:      number;
}

export interface ChannelSchemaPerStore {
  channelType: ChannelType;
  storeId: string;
  storeName: string;
  storeUrl: string;
  displayOrder: number;
  completionStatus: ChannelProductStatus;
  completionPercentage: number;
  sections: ChannelFormSection[];
  completionStats: CompletionStats;
  /**
   * Scenario D: pre-fetched by backend when a category is already saved.
   * Frontend renders these as a "Category-specific fields" section and also
   * re-fetches when the seller changes the category during the session.
   * Absent when no CATEGORY_TREE field exists or no category is saved yet.
   */
  categoryAttributeSection?: CategoryAttributeSection;
}

/**
 * Lightweight per-store descriptor for the Step 2 tab bar (no `sections`).
 * From `GET /ecommerce/form-schema/channel-step/stores`. Lets the wizard render the
 * tab bar + completion badges instantly (O(1)) and lazy-load each store's full
 * schema on demand. See docs/BACKEND-STEP2-LAZY-CHANNEL-SCHEMA-RECOMMENDATION.md.
 */
export interface ChannelStepStore {
  storeId: string;
  channelType: ChannelType;
  storeName: string;
  storeUrl: string;
  displayOrder: number;
  completionStatus: ChannelProductStatus;
  completionPercentage: number;
  /** Optional — the lightweight list may omit it; only the full schema guarantees it. */
  completionStats?: CompletionStats;
}

export interface ChannelStepStoresResponse {
  masterProductId: string;
  productTypeId?: string;
  stores: ChannelStepStore[];
}

export interface ChannelStepSchemaResponse {
  step: 2;
  masterProductId: string;
  /** Snapshot of master product fields sent by backend for display & override UX */
  masterProduct?: MasterProductSnapshot;
  channels: ChannelSchemaPerStore[];
}

export interface ChannelStepRequest {
  masterProductId: string;
  organizationId: string;
  /** Optional — when set, backend returns only this store's schema (channels: [one]).
   *  Omit for the full all-stores response (backward compatible). */
  storeId?: string;
  /** @deprecated Backend now fetches variants from DB using masterProductId. No longer sent. */
  masterVariants?: Array<{ sku: string; label: string }>;
}

// ─── OAuth Initiation Types (Phase B) ────────────────────────────────────────
// Frontend calls GET /api/v1/oauth/initiate → gets authorizationUrl → redirects browser

export interface OAuthInitiateRequest {
  channelType: ChannelType;
  organizationId: string;
  storeName: string;
  region?: string;
  /** Required for Shopify — the {yourstore}.myshopify.com domain */
  shop?: string;
  /** For reconnect flow — backend uses this to update existing store record instead of creating new */
  storeId?: string;
}

export interface OAuthInitiateResponse {
  authorizationUrl: string;
  nonce: string;
  channelType: ChannelType;
}

// ─── Publish Types ────────────────────────────────────────────────────────────

export interface PublishSingleRequest {
  masterProductId: string;
  storeId: string;
  organizationId: string;
  userId?: string;
  /** Full flattened master product fields — required by backend to merge Step 2 channel data into */
  masterProductData?: Record<string, unknown>;
  /** Channel type, e.g. "shopify" — used by backend for routing and JOLT lookup */
  channelId?: string;
  /** Field mappings from pattern matching analysis (optional — backend uses stored JOLT if omitted) */
  fieldMappings?: unknown[];
  /** JOLT spec (optional — backend uses stored JOLT if omitted) */
  joltSpec?: unknown[];
  categoryId?: string;
  dryRun?: boolean;
  /** Per-SKU variant field overrides from Step 2 variant table — forwarded to backend post-JOLT merge */
  variantOverrides?: Record<string, Record<string, unknown>>;
  /** Per-channel master field overrides from Step 2 master override section */
  masterOverrides?: Record<string, unknown>;
}

export interface StorePublishResult {
  storeId: string;
  storeName?: string;
  /** Backend may return "COMPLETED" (workflow terminal state) — treat same as "PUBLISHED" */
  status: "PUBLISHED" | "COMPLETED" | "FAILED";
  publishedAt?: string;
  error?: string;
}

export interface BatchPublishRequest {
  masterProductId: string;
  organizationId: string;
  storeIds: string[];
}

export interface BatchPublishResponse {
  batchId: string;
  masterProductId: string;
  results: StorePublishResult[];
}

// ─── Publish Analysis Types ────────────────────────────────────────────────────
// POST /api/v1/channels/publish/analyze

export interface PublishAnalysisRequest {
  masterProductId: string;
  storeId: string;
  organizationId: string;
}

export interface MasterProductStageAnalysis {
  found: boolean;
  source: string;
  fieldCount: number;
  variantCount: number;
}

export interface ChannelDataStageAnalysis {
  completionPercentage: number;
  totalChannelFields: number;
  filledRequired: number;
  missingRequired: number;
  missingRequiredFields: string[];
}

export interface MergedInputStageAnalysis {
  fieldCount: number;
  fields: Record<string, unknown>;
}

export interface JoltSpecStageAnalysis {
  found: boolean;
  source: string;
  version?: string;
  operationCount: number;
}

export interface TransformationStageAnalysis {
  success: boolean;
  error?: string;
  topLevelKeys: string[];
  unmappedInputFields: string[];
  transformedData?: Record<string, unknown>;
}

export interface PostProcessingRuleDetail {
  priority: number;
  enabled: boolean;
  sourcePath: string;
  targetPath: string;
  description?: string;
}

export interface PostProcessingStageAnalysis {
  ruleCount: number;
  rules: PostProcessingRuleDetail[];
}

export interface AnalysisIssue {
  severity: "ERROR" | "WARNING" | "INFO";
  stage: string;
  message: string;
  field?: string;
}

export interface PublishAnalysisResponse {
  masterProductId: string;
  storeId: string;
  organizationId: string;
  readinessScore: number;
  issues: AnalysisIssue[];
  masterProduct: MasterProductStageAnalysis;
  channelData: ChannelDataStageAnalysis;
  mergedInput: MergedInputStageAnalysis;
  joltSpec: JoltSpecStageAnalysis;
  transformation: TransformationStageAnalysis;
  postProcessing: PostProcessingStageAnalysis;
}
