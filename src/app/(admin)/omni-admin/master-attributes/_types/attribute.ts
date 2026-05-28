// Master Attribute types for omnichannel admin setup

export type AttributeType =
  | "TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "DECIMAL"
  | "BOOLEAN"
  | "SELECT"
  | "MULTI_SELECT"
  | "DATE"
  | "DATE_RANGE"
  | "COLOR"
  | "URL"
  | "IMAGE_URL"
  | "TAGS";

export type AttributeScope = "GLOBAL" | "CATEGORY_SPECIFIC";

/** Maps to the backend `active` flag — DRAFT is frontend-only (unsaved). */
export type AttributeStatus = "ACTIVE" | "INACTIVE" | "DRAFT";

/** Backend group classification. Corresponds to ?group= query param. */
export type AttributeGroup = "ATTRIBUTE" | "OPTION" | "VARIANT";

/**
 * How visible this attribute is in the product form.
 * Mirrors backend `displayLevel` string.
 */
export type DisplayLevel = "essential" | "basic" | "enhanced" | "advanced" | "category-specific";

/** Which product scope the attribute applies to. */
export type AppliesTo = "both" | "product" | "variant";

/** How the attribute relates to product variants. */
export type VariantScope = "product_only" | "variant_only" | "dual";

/** Where the dropdown options come from. */
export type OptionsSource = "STATIC" | "MERCHANT_API";

export interface AttributeOption {
  id: string;
  value: string;
  label: string;
  color?: string;
  sortOrder: number;
}

export interface ChannelMapping {
  channelType: string;
  channelLabel: string;
  channelFieldName: string;
  transform: "DIRECT" | "MAP" | "FORMAT";
}

// ─── Frontend model (used by all components) ───────────────────────────────────

export interface MasterAttribute {
  id: string;                   // mapped from backend `id` (Spring Boot ObjectId)

  // Core identity
  name: string;                 // from backend `description` (short human label, e.g. "Collection")
  code: string;                 // from backend `fieldName` (system identifier, e.g. "collection_id")
  description?: string;         // from backend `mappingHint` (long help text shown to merchants)

  // Type & scope
  type: AttributeType;
  scope: AttributeScope;        // derived: CATEGORY_SPECIFIC if applicableCategories.length > 0

  // Behavior
  required: boolean;
  sortOrder: number;            // from backend `priority`

  // Display level
  displayLevel?: DisplayLevel;

  // Schema classification (corresponds to backend filter params)
  section?: string;             // e.g. "product_info", "pricing_inventory", "variants", "shipping"
  group?: AttributeGroup;
  appliesTo?: AppliesTo;

  // Channel
  isChannelField?: boolean;
  isChannelOverridable?: boolean;
  isVariantChannelOverridable?: boolean;
  variantScope?: VariantScope;
  supportedChannels?: string[];  // e.g. ["shopify", "amazon"]
  optionsSource?: OptionsSource;
  merchantApiOperation?: string;
  masterFieldName?: string;      // for channel→master value mapping

  // SELECT / MULTI_SELECT
  options?: AttributeOption[];

  // Validation (from backend `validationRules` object)
  maxLength?: number;
  placeholder?: string;
  validationRegex?: string;
  validationMessage?: string;
  minValue?: number;
  maxValue?: number;

  // Data type hint (String, Number, Enum, etc.)
  dataType?: string;

  // Assignment
  categoryIds: string[];        // from backend `applicableCategories`  (Phase 1/2 — legacy)
  productTypeIds: string[];     // from backend `productTypeIds`         (Phase 4 — preferred)
  channelMappings?: ChannelMapping[];

  // Lifecycle
  status: AttributeStatus;      // derived: active=true→ACTIVE, false→INACTIVE, unsaved→DRAFT
  usageCount: number;           // populated from separate usage endpoint
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// ─── Backend document shape (raw API response) ─────────────────────────────────
// Mirrors the actual JSON returned by MasterAttributeAdminController.
// Key difference from naive expectation: `description` is the SHORT label,
// `fieldName` is the system code, `priority` is the sort order.

/** Raw `{label, value}` option shape returned by backend. */
interface BackendAttributeOption {
  label: string;
  value: string;
  id?: string;
  color?: string;
  sortOrder?: number;
  priority?: number;
}

export interface MasterAttributeDoc {
  id: string;                   // Spring Boot serializes ObjectId as `id`
  _id?: string;                 // may also appear as `_id` depending on Jackson config
  fieldName: string;            // system code identifier (→ frontend `code`)
  description: string;          // SHORT human label (→ frontend `name`)
  mappingHint?: string;         // longer help text (→ frontend `description`)
  section?: string;
  fieldType: string;            // raw type string — may be mixed case: "text", "TEXTAREA", "image", …
  dataType?: string;
  displayLevel?: DisplayLevel;
  required: boolean | null;     // backend allows null for required
  active: boolean;
  priority: number;             // sort order (→ frontend `sortOrder`)
  group?: AttributeGroup;
  appliesTo?: AppliesTo;
  isChannelField?: boolean;
  isChannelOverridable?: boolean;
  isVariantChannelOverridable?: boolean;
  variantScope?: VariantScope;
  optionsSource?: OptionsSource;
  options?: BackendAttributeOption[];
  supportedChannels?: string[];
  applicableCategories?: string[];   // category ids (→ frontend `categoryIds`)   Phase 1/2
  productTypeIds?: string[];         // product type ids (→ frontend `productTypeIds`) Phase 4
  validationRules?: {
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  conditionalVisibility?: {
    showWhen?: unknown;
    behaviour?: string;
  };
  merchantApiOperation?: string;
  masterFieldName?: string;
  version?: string;
  channelMappings?: ChannelMapping[];
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

// ─── fieldType normalisation map ──────────────────────────────────────────────
// Backend sends mixed-case values; we normalise to our AttributeType enum.

const FIELD_TYPE_MAP: Record<string, AttributeType> = {
  text:              "TEXT",
  TEXT:              "TEXT",
  number:            "NUMBER",
  NUMBER:            "NUMBER",
  decimal:           "DECIMAL",
  DECIMAL:           "DECIMAL",
  float:             "DECIMAL",
  FLOAT:             "DECIMAL",
  boolean:           "BOOLEAN",
  BOOLEAN:           "BOOLEAN",
  select:            "SELECT",
  SELECT:            "SELECT",
  enum:              "SELECT",
  ENUM:              "SELECT",
  multi_select:      "MULTI_SELECT",
  MULTI_SELECT:      "MULTI_SELECT",
  multiselect:       "MULTI_SELECT",
  MULTISELECT:       "MULTI_SELECT",
  textarea:          "LONG_TEXT",
  TEXTAREA:          "LONG_TEXT",
  long_text:         "LONG_TEXT",
  LONG_TEXT:         "LONG_TEXT",
  image:             "IMAGE_URL",
  IMAGE:             "IMAGE_URL",
  image_url:         "IMAGE_URL",
  IMAGE_URL:         "IMAGE_URL",
  array:             "TAGS",
  ARRAY:             "TAGS",
  tags:              "TAGS",
  TAGS:              "TAGS",
  date:              "DATE",
  DATE:              "DATE",
  date_range:        "DATE_RANGE",
  DATE_RANGE:        "DATE_RANGE",
  color:             "COLOR",
  COLOR:             "COLOR",
  url:               "URL",
  URL:               "URL",
};

function normaliseFieldType(raw: unknown): AttributeType {
  if (typeof raw !== "string") return "TEXT";
  return FIELD_TYPE_MAP[raw] ?? FIELD_TYPE_MAP[raw.toLowerCase()] ?? "TEXT";
}

// ─── Mappers ────────────────────────────────────────────────────────────────────

/**
 * Maps a raw backend document to the frontend MasterAttribute model.
 *
 * Critical mappings (backend → frontend):
 *   `id`                  → `id`
 *   `fieldName`           → `code`  (system identifier)
 *   `description`         → `name`  (short human label)
 *   `mappingHint`         → `description` (long help text)
 *   `fieldType`           → `type`  (normalised via FIELD_TYPE_MAP)
 *   `priority`            → `sortOrder`
 *   `applicableCategories`→ `categoryIds`
 *   `applicableCategories.length > 0` → scope = "CATEGORY_SPECIFIC"
 *
 * The `r` cast lets us probe undeclared keys without TypeScript errors,
 * which guards against both alternative serialisations and future backend
 * schema additions.
 */
export function docToAttribute(doc: MasterAttributeDoc): MasterAttribute {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = doc as any;

  const id: string  = r.id ?? r._id ?? "";
  const code: string = r.fieldName ?? r.code ?? r.fieldCode ?? r.attributeCode ?? "";
  const name: string = r.description ?? r.name ?? r.fieldName ?? code;
  const description: string | undefined = r.mappingHint ?? r.mappingDescription ?? undefined;

  const type = normaliseFieldType(r.fieldType ?? r.type);

  const sortOrder: number = r.priority ?? r.sortOrder ?? r.order ?? 0;

  // active flag: backend may use active / isActive / enabled / status=="ACTIVE"
  let active = true;
  if      (typeof r.active === "boolean")   active = r.active;
  else if (typeof r.isActive === "boolean") active = r.isActive;
  else if (typeof r.enabled === "boolean")  active = r.enabled;
  else if (typeof r.status === "string")    active = r.status.toUpperCase() === "ACTIVE";

  // categoryIds from applicableCategories (preferred) or legacy categoryIds
  const rawCats = r.applicableCategories ?? r.categoryIds ?? r.categories ?? r.categoryList ?? [];
  const categoryIds: string[] = Array.isArray(rawCats)
    ? rawCats.map((c: unknown) =>
        typeof c === "string" ? c : (c as Record<string, string>)?.id ?? String(c)
      )
    : [];

  // scope derived from whether any categories are assigned
  const scope: AttributeScope = categoryIds.length > 0 ? "CATEGORY_SPECIFIC" : "GLOBAL";

  // Convert backend {label, value} option shape to frontend AttributeOption
  const rawOptions = r.options ?? r.selectOptions ?? [];
  const options: AttributeOption[] = Array.isArray(rawOptions) && rawOptions.length > 0
    ? (rawOptions as BackendAttributeOption[]).map((o, i) => ({
        id:        o.id      ?? `o_${i}`,
        value:     o.value   ?? "",
        label:     o.label   ?? o.value ?? "",
        color:     o.color,
        sortOrder: o.sortOrder ?? o.priority ?? i + 1,
      }))
    : [];

  // Extract validation constraints from the validationRules sub-object
  const vr = r.validationRules ?? {};

  return {
    id,
    name,
    code,
    description,
    type,
    scope,
    required:                     r.required ?? false,
    sortOrder,
    displayLevel:                 r.displayLevel,
    section:                      r.section,
    group:                        r.group,
    appliesTo:                    r.appliesTo,
    isChannelField:               r.isChannelField  ?? false,
    isChannelOverridable:         r.isChannelOverridable ?? false,
    isVariantChannelOverridable:  r.isVariantChannelOverridable ?? false,
    variantScope:                 r.variantScope,
    supportedChannels:            Array.isArray(r.supportedChannels) ? r.supportedChannels : [],
    optionsSource:                r.optionsSource ?? "STATIC",
    merchantApiOperation:         r.merchantApiOperation,
    masterFieldName:              r.masterFieldName,
    options:                      options.length > 0 ? options : undefined,
    maxLength:                    vr.maxLength ?? r.maxLength,
    placeholder:                  r.placeholder,
    validationRegex:              vr.pattern ?? r.validationRegex ?? r.regex,
    validationMessage:            vr.message ?? r.validationMessage,
    minValue:                     vr.min     ?? r.minValue ?? r.min,
    maxValue:                     vr.max     ?? r.maxValue ?? r.max,
    dataType:                     r.dataType,
    categoryIds,
    productTypeIds:               Array.isArray(r.productTypeIds) ? r.productTypeIds : [],
    channelMappings:              r.channelMappings ?? [],
    status:                       active ? "ACTIVE" : "INACTIVE",
    usageCount:                   r.usageCount ?? 0,
    createdAt:                    r.createdAt ?? "",
    updatedAt:                    r.updatedAt ?? "",
    createdBy:                    r.createdBy,
    updatedBy:                    r.updatedBy,
  };
}

/**
 * Converts frontend model to backend payload for POST / PUT.
 *
 * Critical reverse mappings (frontend → backend):
 *   `code`        → `fieldName`
 *   `name`        → `description`
 *   `description` → `mappingHint`
 *   `type`        → `fieldType` (sent as lowercase to match backend convention)
 *   `sortOrder`   → `priority`
 *   `categoryIds` → `applicableCategories`
 *   validation    → nested `validationRules` object
 *
 * Returns a plain Record so callers can add/strip top-level keys freely.
 */
export function attributeToDocPayload(
  attr: Omit<MasterAttribute, "id" | "usageCount" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
): Record<string, unknown> {
  return {
    fieldName:                   attr.code,
    description:                 attr.name,
    mappingHint:                 attr.description,
    fieldType:                   attr.type.toLowerCase(),
    priority:                    attr.sortOrder,
    active:                      attr.status !== "INACTIVE",
    required:                    attr.required || null,
    section:                     attr.section,
    group:                       attr.group,
    displayLevel:                attr.displayLevel,
    appliesTo:                   attr.appliesTo,
    isChannelField:              attr.isChannelField  ?? false,
    isChannelOverridable:        attr.isChannelOverridable  ?? false,
    isVariantChannelOverridable: attr.isVariantChannelOverridable ?? false,
    variantScope:                attr.variantScope,
    supportedChannels:           attr.supportedChannels ?? [],
    optionsSource:               attr.optionsSource ?? "STATIC",
    merchantApiOperation:        attr.merchantApiOperation,
    masterFieldName:             attr.masterFieldName,
    options:                     (attr.options ?? []).map(o => ({ label: o.label, value: o.value })),
    applicableCategories:        attr.categoryIds,
    productTypeIds:              attr.productTypeIds ?? [],
    validationRules: {
      maxLength: attr.maxLength   ?? null,
      min:       attr.minValue    ?? null,
      max:       attr.maxValue    ?? null,
      pattern:   attr.validationRegex   ?? null,
      message:   attr.validationMessage ?? null,
    },
    channelMappings:             attr.channelMappings ?? [],
    dataType:                    attr.dataType,
  };
}

// ─── Filter / sort types ───────────────────────────────────────────────────────

export type SortField = "sortOrder" | "name" | "type" | "usageCount" | "updatedAt";
export type SortDir = "asc" | "desc";

export interface AttributeFilters {
  search: string;
  categoryId: string;
  productTypeId: string;   // Phase 4 — "all" | "unassigned" | "<typeId>"
  status: AttributeStatus | "all";
  type: AttributeType | "all";
  required: boolean | "all";
  sortField: SortField;
  sortDir: SortDir;
}

/** Query params accepted by GET /api/v1/admin/master-attributes */
export interface AttributeListParams {
  section?: string;
  group?: AttributeGroup;
  channelType?: string;
  isChannelField?: boolean;
  productTypeId?: string;  // Phase 4 — filter by productTypeId
}

export interface AttributeCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  level?: number;   // depth in product category hierarchy (0=root, 1=child, …)
  path?: string;    // materialized path e.g. "electronics/smartphones"
  parentId?: string;
  attributeCount: number;
}
