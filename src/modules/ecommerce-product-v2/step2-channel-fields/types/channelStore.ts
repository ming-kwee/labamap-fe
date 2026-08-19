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

/**
 * Listing lifecycle status per (masterProduct × store) — backend P0-1/P0-2.
 * `DELISTED` (P0-2/G6) = removed from the channel; product data kept for audit and re-publish.
 */
export type ChannelProductStatus = "DRAFT" | "READY" | "PUBLISHED" | "FAILED" | "DELISTED";

/**
 * Idempotent publish operation the backend actually performed (P0-2).
 *  - CREATE — a new listing was created on the channel.
 *  - NOOP   — content unchanged since the last publish; no channel call was made.
 *  - UPDATE — an existing live listing was updated (behind `channel-update-enabled`).
 *  - DELIST — the listing was removed from the channel (delist flow).
 */
export type PublishOperation = "CREATE" | "NOOP" | "UPDATE" | "DELIST";

/**
 * Sync/workflow status. `PROCESSING`/`PENDING` are non-terminal (keep polling).
 * `BLOCKED` = idempotent-update gate: editing a live listing while `channel-update-enabled`
 * is off — actionable, NOT a hard failure (the merchant delists then re-publishes).
 */
export type SyncStatus = "COMPLETED" | "FAILED" | "PROCESSING" | "PENDING" | "BLOCKED" | "DRY_RUN";

export interface ChannelProductData {
  masterProductId: string;
  storeId: string;
  /** Human-readable store name (falls back to storeId when the backend omits it). */
  storeName?: string;
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

  // ── Listing identity (P0-1) — present once a listing has been created on the channel ──
  /** External listing id returned by the channel (Shopify product id, Shopee item_id, …). */
  channelProductId?: string;
  /** Deep-link to the listing in the channel admin. */
  channelUrl?: string;
  /** Monotonic count of publish attempts for this listing. */
  publishAttempts?: number;
  /** Time of the last attempt (success or failure) — differs from publishedAt (success only). */
  lastAttemptAt?: string;
  /** Sync workflow id of the last attempt (POST-then-poll handle; admin Temporal deep-link). */
  syncWorkflowId?: string;

  // ── Reverse-sync stamps (R0) — surfaced by ChannelProductDataResponse ──
  /** Frozen channel API version the listing was last published with. */
  publishedApiVersion?: string;
  /** Channel's own `updated_at` observed on the last reverse pull/webhook. */
  channelUpdatedAt?: string;
  /** Last time reverse sync pulled this listing back into the platform. */
  lastReverseSyncedAt?: string;
}

// ─── Listing lifecycle read models (P0-1) ─────────────────────────────────────

/**
 * Lightweight listing-state projection — `GET …/channel-product-data/{masterProductId}/listings`.
 * One row per (masterProduct × store): the badge + contextual action source of truth for Step 3.
 */
export interface ListingState {
  storeId: string;
  channelType: ChannelType;
  status: ChannelProductStatus;
  channelProductId?: string;
  channelUrl?: string;
  publishAttempts?: number;
  publishedAt?: string;
  lastAttemptAt?: string;
  publishError?: string;
  syncWorkflowId?: string;
}

/**
 * One per-hit step inside a publish attempt (masked), from the sync `step_results[]`.
 * Powers granular progress ("upload image 2/5", "create product") and points at the failed step.
 */
export interface PublishStep {
  stepName: string;
  status: "OK" | "ERROR" | "SKIP";
  httpStatus?: number;
  channelSuccess?: boolean;
  iterationIndex?: number;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  at?: string;
}

/**
 * One publish attempt — `GET …/channel-product-data/{masterProductId}/{storeId}/history`.
 * Append-only audit timeline (newest first).
 */
export interface PublishHistoryEntry {
  id?: string;
  publishId?: string;
  operation?: PublishOperation;
  success: boolean;
  syncStatus?: SyncStatus | string;
  channelProductId?: string;
  errorCode?: string;
  errorMessage?: string;
  durationMs?: number;
  dryRun?: boolean;
  userId?: string;
  steps?: PublishStep[];
  syncWorkflowId?: string;
  createdAt: string;
}

// ─── Delist (P0-2/G6) ─────────────────────────────────────────────────────────

export interface DelistRequest {
  masterProductId: string;
  storeId: string;
  organizationId: string;
}

export interface DelistResponse {
  success?: boolean;
  operation?: PublishOperation;
  /** Sync/workflow status — `PROCESSING` means keep polling; delist is idempotent. */
  syncStatus?: SyncStatus | string;
  status?: string;
  channelProductId?: string;
  message?: string;
}

// ─── Publish diff (dirty-state) — DiffEngine 02-frontend-dirty-state ───────────
//
// Authoritative "is anything changed since last publish?" per (product × store).
// FE cannot compute this reliably (baseline content-hashes live only in the backend
// listing-state), so it asks the read-only `POST /channels/publish/diff` endpoint, which
// runs the desired-state extractor + diff planner + operation decider WITHOUT publishing.

/** The operation a publish would perform right now — `UPDATE_BLOCKED` = dirty but UPDATE not wired. */
export type PublishDiffDecision = "CREATE" | "NOOP" | "UPDATE" | "UPDATE_BLOCKED";
export type PublishDiffListingStatus = "NEVER_PUBLISHED" | "PUBLISHED" | "DELISTED";

/** Per-resource add/update/delete/noop buckets (SKUs, or "SKU::url" for variant images). */
export interface PublishDiffBuckets {
  add?: string[];
  update?: string[];
  delete?: string[];
  noop?: string[];
}

export interface PublishDiffRequest {
  masterProductId: string;
  storeId: string;
  /** Optional unsaved draft desired-state; omit to let the backend hydrate from stored master + Step-2. */
  masterProductData?: Record<string, unknown>;
}

export interface PublishDiffResponse {
  masterProductId: string;
  storeId: string;
  channelType: ChannelType;
  listingStatus: PublishDiffListingStatus;
  decision: PublishDiffDecision;
  /** Primary signal: `false` ⟺ decision NOOP (publish would touch nothing → "Up to date"). */
  dirty: boolean;
  /** `false` → this channel doesn't support UPDATE yet (decision may be UPDATE_BLOCKED). */
  updateSupported?: boolean;
  /** Product body (name/description/price) changed? */
  product?: { changed: boolean };
  variants?: PublishDiffBuckets;
  productImages?: PublishDiffBuckets;
  variantImages?: PublishDiffBuckets;
  summary?: { variantsChanged?: number; imagesChanged?: number; totalChanges?: number };
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
   * @deprecated Legacy "eligible pool" of variant-driving attributes (Color, Size, Pattern) with
   * their full taxonomy value lists. Historically the frontend let the seller pick from these and
   * "Apply", which conflated *eligible-to-be-an-axis* (a channel taxonomy fact) with *is-an-axis-for-
   * this-product* (a Step 1 fact) — and dumped the full taxonomy vocabulary into option{n}_values.
   *
   * The authoritative variant structure now comes from {@link variantAxes} (server-resolved
   * intersection of the channel's permitted axes × the product's Step 1 variant dimensions). This
   * field is retained only as a *value-vocabulary hint* (datalist suggestions) and for backward
   * compatibility while the backend rolls out `variantAxes`. Never derive the axis SET from it.
   */
  variantOptionSuggestions?: ChannelFormField[];
  /**
   * Server-resolved variant axes for THIS product on THIS channel. Computed backend-side as
   *   variantOptionAttributeNames (permitted/eligible) ∩ Step-1 variant dimensions (declared),
   * with values realized from the product's actual SKUs. When present, the frontend renders these
   * directly — no selection UI, no client-side intersection. option{n}_name / option{n}_values in
   * channelData follow these deterministically. Absent (undefined) until the backend ships the
   * contract, in which case the frontend derives an equivalent structure from the master snapshot.
   */
  variantAxes?: ResolvedVariantAxis[];
  /** Axis-level problems to surface (dimension not expressible on channel, incomplete SKU matrix). */
  axisValidation?: AxisValidationIssue[];
}

/**
 * One resolved variant axis (option1/option2/option3 for Shopify; sales-attribute for
 * TikTok/Lazada). The axis SET and per-SKU values are facts about the product's Step 1 SKUs —
 * the channel only contributes the value vocabulary and the option ordering constraint.
 */
export interface ResolvedVariantAxis {
  /** 1-based option position (1..3). Order comes from the Step 1 dimension order, not seller choice. */
  optionIndex: number;
  /** Step 1 dimension code, e.g. "color". Join key for value lookups. */
  attributeCode: string;
  /** Human-readable dimension name → option{n}_name, e.g. "Color". */
  name: string;
  /** Distinct values the product's variants actually use → option{n}_values. NEVER the full taxonomy. */
  values: string[];
  /** sku → the value that SKU uses on this axis. Seeds variantOverrides[sku]["option{n}"]. */
  perSku: Record<string, string>;
  /** Channel taxonomy vocabulary for this axis — datalist suggestions only, not a hard constraint. */
  valueVocabulary?: Array<{ label: string; channelValueId?: string }>;
}

export type AxisValidationSeverity = "WARNING" | "BLOCKING";

export interface AxisValidationIssue {
  /** The Step 1 dimension the issue concerns, e.g. "Fabric". */
  dimension: string;
  /**
   * NOT_EXPRESSIBLE_ON_CHANNEL — a Step 1 variant dimension is not in the channel's permitted axes.
   * INCOMPLETE_MATRIX        — a SKU is missing a value for an axis (would yield an invalid payload).
   * TOO_MANY_AXES            — the product has more variant dimensions than the channel allows (>3).
   */
  code: "NOT_EXPRESSIBLE_ON_CHANNEL" | "INCOMPLETE_MATRIX" | "TOO_MANY_AXES";
  severity: AxisValidationSeverity;
  message: string;
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
  /**
   * Images I4: canonical master image gallery (mainImage merged with galleryImages, mainImage first),
   * shown read-only in the Step-2 per-store image editor as the inheritance baseline. Optional — when
   * the backend snapshot omits it the editor falls back to `[mainImage, ...galleryImages]`.
   */
  images?: string[];
  /** Images I4: raw gallery images (excl. mainImage). Fallback source when `images` is absent. */
  galleryImages?: string[];
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

// ─── Images I2/I4: per-channel image spec + validation ───────────────────────
// The channel's image constraints modelled as DATA (docs/images/03), read at runtime and never
// hardcoded in the FE. Served by GET /api/v1/admin/channel-image-specs/{channelType}. All fields are
// optional because the seeder fills a verified subset per channel (warning-first / fill-if-null).

/** Variant-image-specific overrides of the base spec (some channels cap variant images differently). */
export interface ChannelImageSpecVariantRule {
  maxCount?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface ChannelImageSpec {
  channelType: string;
  /** Optional category scope — some channels vary requirements per category. */
  categorySlug?: string;
  /** Max number of images (e.g. Shopee 9, Shopify 250). */
  maxCount?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** e.g. ["1:1","3:4"] — empty/absent = any ratio allowed. */
  allowedAspectRatios?: string[];
  /** Shortcut for the common "main image must be square" rule. */
  requireSquare?: boolean;
  maxBytes?: number;
  /** e.g. ["jpeg","png","webp"]. */
  allowedFormats?: string[];
  /** e.g. Amazon main image requires a WHITE background. */
  backgroundRequirement?: "NONE" | "WHITE" | string;
  variant?: ChannelImageSpecVariantRule;
  /** true = channel pulls the image from our public URL (Shopee/TikTok) → URL must be publicly fetchable. */
  channelSideUpload?: boolean;
}

export type ImageIssueSeverity = "ERROR" | "WARNING" | "INFO";

/**
 * One spec violation returned by the validate endpoint. Observe-first: these are surfaced as
 * inline warnings in Step-2, never blocking save (docs/images/03 §4, docs/images/06 §4).
 * `code` ∈ { MAX_COUNT, MIN_WIDTH, MIN_HEIGHT, ASPECT_RATIO, MAX_BYTES, FORMAT_NOT_ALLOWED, … }.
 */
export interface ImageIssue {
  severity: ImageIssueSeverity | string;
  code: string;
  message: string;
  /** The offending image URL, when the issue is per-image (count issues have no url). */
  url?: string;
}

/** One image to validate. Dimensions are filled server-side from the recorded ImageAsset (I2b). */
export interface ImageValidationItem {
  url: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
}

export interface ImageValidationRequest {
  categorySlug?: string;
  images: ImageValidationItem[];
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

/**
 * A single actionable, per-field error from the publish pre-flight gate (HTTP 400).
 * The gate returns `errors[] { field, errorCode, message, suggestion }` when a
 * merchant-fixable field is missing. Spring bean-validation errors (`defaultMessage`)
 * are normalised into this same shape by the service layer.
 *
 * `errorCode:"MISSING_REQUIRED_FIELD"` marks a merchant-fixable content block
 * (distinct from `"PUBLISH_FAILED"`, a system/channel error).
 */
export interface PublishFieldError {
  field: string;
  errorCode?: string;
  message?: string;
  suggestion?: string;
}

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
  /**
   * Backend may return "COMPLETED" (workflow terminal state) — treat same as "PUBLISHED".
   * "BLOCKED" is the pre-flight gate verdict: publish never reached the channel because a
   * merchant-fixable field is missing (see `fieldErrors`) — distinct from a real "FAILED".
   * "PROCESSING" is a NON-terminal verdict: the sync workflow is still running (the server-side
   * poll timed out) — it is NOT a failure. The FE keeps polling the persisted store status until
   * it settles (see `classifyPublishOutcome` / `pollUntilTerminal`, doc 04 §"Workflow polling").
   */
  status: "PUBLISHED" | "COMPLETED" | "FAILED" | "BLOCKED" | "PROCESSING" | "DELISTED";
  publishedAt?: string;
  /** Human-readable summary (joined field messages, or a system error message). */
  error?: string;
  /** Structured per-field errors from the pre-flight gate — for inline field highlighting. */
  fieldErrors?: PublishFieldError[];
  /** Idempotent operation the backend performed (P0-2) — CREATE/NOOP/UPDATE/DELIST. */
  operation?: PublishOperation;
  /** External listing id (present once created); enables the "Live + link" badge. */
  channelProductId?: string;
  /** Deep-link to the listing in the channel admin. */
  channelUrl?: string;
}

/**
 * Response of `POST /channels/publish` — mirrors the sync API's `SyncApiResponse`
 * (doc 04-sync-api-integration.md §SyncApiResponse / §"Workflow polling").
 *
 * The publish is POST-then-poll on the backend; on server-side poll timeout the backend
 * returns a NON-terminal body (`success:false`, `syncStatus:"PROCESSING"`) instead of a hard
 * failure. Fields beyond `status` are optional so older/plainer bodies keep deserializing.
 */
export interface PublishSingleResponse {
  /** Workflow/sync status: "COMPLETED" | "PUBLISHED" | "FAILED" | "PROCESSING" | "PENDING" | … */
  status?: string;
  /** Terminal success flag from the sync API — `true` is an explicit terminal success. */
  success?: boolean;
  /** Sync workflow status; may arrive instead of / alongside `status`. */
  syncStatus?: string;
  /** Sync workflow id (POST-then-poll handle); present when the backend hands the poll back. */
  workflowId?: string;
  publishedAt?: string;
  message?: string;
  warnings?: string[];
  errors?: Array<{ code?: string; message?: string; field?: string; details?: string }>;
  /** Idempotent operation performed (P0-2): CREATE / NOOP / UPDATE / DELIST. */
  operation?: PublishOperation;
  /** External listing id — the "Live + link" badge source. */
  channelProductId?: string;
  /** Deep-link to the listing in the channel admin. */
  channelUrl?: string;
  /** Per-hit granular steps for this attempt (create → media → variants). */
  syncSteps?: PublishStep[];
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

// Publish-analysis types (POST /channels/publish/analyze) live in
// ../../types/publish-analysis.ts — matching the current backend contract (doc §2).
