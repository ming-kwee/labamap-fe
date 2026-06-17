// ProductType types
// ProductType is the stable channel-agnostic classification bridge.
// Phase 2 (2026-06-15): added channelCategoryDefaults — replaces platform-category
// mapping table as the primary way to assign channel categories to products.

/** One entry in the ordered variant dimension list. */
export interface VariantDimension {
  attributeCode: string;   // e.g. "color", "storage_capacity"
  attributeName: string;   // display label, e.g. "Color"
  order: number;           // 1 = first axis (rows), 2 = second axis (columns), …
  required: boolean;
}

/**
 * Default channel category for a specific channel type.
 * Set at ProductType level — applies to ALL products of this type unless
 * the merchant overrides per product in Step 2.
 */
export interface ChannelCategoryDefault {
  channelType: string;        // "shopee" | "tokopedia" | "lazada" | "shopify" | …
  categoryId: string;         // channel-native category ID (externalId)
  categoryName: string;       // display name of the selected node (leaf or mid-node)
  categoryFullPath: string;   // "Pakaian › Pria › Atasan › Kaos" (denormalized, for display)
  /**
   * true  = leaf node — Step 2 pre-fills this as the committed channel category.
   * false = mid-node — Step 2 pre-navigates the CategoryTreePicker to this level;
   *         merchant must still pick the leaf per product.
   * Defaults to true on old data that predates this field (backward compat).
   */
  isLeaf: boolean;
  updatedAt?: string;
}

/** Frontend model */
export interface ProductType {
  id: string;
  name: string;                          // "Kaos Pria"
  slug: string;                          // "kaos-pria"
  description?: string;
  inheritFromTypeId?: string | null;
  inheritFromTypeName?: string | null;
  variantDimensions: VariantDimension[];
  channelCategoryDefaults: ChannelCategoryDefault[];
  attributeCount: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Raw backend document */
export interface ProductTypeDoc {
  id?: string;
  _id?: string;
  name: string;
  slug: string;
  description?: string;
  inheritFromTypeId?: string | null;
  inheritFromTypeName?: string | null;
  variantDimensions?: Array<{
    attributeCode: string;
    attributeName?: string;
    order: number;
    required?: boolean;
  }>;
  channelCategoryDefaults?: Array<{
    channelType: string;
    categoryId: string;
    categoryName: string;
    categoryFullPath: string;
    isLeaf?: boolean;
    updatedAt?: string;
  }>;
  attributeCount?: number;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function docToProductType(doc: ProductTypeDoc): ProductType {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = doc as any;
  return {
    id:                  r.id ?? r._id ?? "",
    name:                r.name ?? "",
    slug:                r.slug ?? "",
    description:         r.description ?? undefined,
    inheritFromTypeId:   r.inheritFromTypeId ?? null,
    inheritFromTypeName: r.inheritFromTypeName ?? null,
    variantDimensions: Array.isArray(r.variantDimensions)
      ? r.variantDimensions.map((d: any, i: number) => ({
          attributeCode: d.attributeCode ?? "",
          attributeName: d.attributeName ?? d.attributeCode ?? "",
          order:         d.order ?? i + 1,
          required:      d.required ?? true,
        }))
      : [],
    channelCategoryDefaults: Array.isArray(r.channelCategoryDefaults)
      ? r.channelCategoryDefaults.map((d: any) => ({
          channelType:      String(d.channelType ?? ""),
          categoryId:       String(d.categoryId ?? ""),
          categoryName:     String(d.categoryName ?? ""),
          categoryFullPath: String(d.categoryFullPath ?? d.categoryName ?? ""),
          // Absent on old data → assume leaf (safe: old code only allowed leaf selection)
          isLeaf:           d.isLeaf !== false,
          updatedAt:        d.updatedAt as string | undefined,
        }))
      : [],
    attributeCount: r.attributeCount ?? 0,
    active:         r.active ?? true,
    createdAt:      r.createdAt ?? undefined,
    updatedAt:      r.updatedAt ?? undefined,
  };
}

export function productTypeToPayload(
  pt: Omit<ProductType, "id" | "attributeCount" | "createdAt" | "updatedAt" | "inheritFromTypeName">
): Record<string, unknown> {
  return {
    name:               pt.name,
    slug:               pt.slug,
    description:        pt.description ?? null,
    inheritFromTypeId:  pt.inheritFromTypeId ?? null,
    variantDimensions:  pt.variantDimensions.map(d => ({
      attributeCode: d.attributeCode,
      attributeName: d.attributeName,
      order:         d.order,
      required:      d.required,
    })),
    channelCategoryDefaults: pt.channelCategoryDefaults.map(d => ({
      channelType:      d.channelType,
      categoryId:       d.categoryId,
      categoryName:     d.categoryName,
      categoryFullPath: d.categoryFullPath,
      isLeaf:           d.isLeaf,
    })),
    active: pt.active,
  };
}
