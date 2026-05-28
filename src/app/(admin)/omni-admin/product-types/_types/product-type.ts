// ProductType types — Phase 4 of the Category Ownership Architecture
// ProductType is the stable bridge between ProductCategory (merchant data)
// and MasterAttribute (platform engineer data).

/** One entry in the ordered variant dimension list. */
export interface VariantDimension {
  attributeCode: string;   // e.g. "color", "storage_capacity"
  attributeName: string;   // display label, e.g. "Color"
  order: number;           // 1 = first axis (rows), 2 = second axis (columns), …
  required: boolean;
}

/** Frontend model */
export interface ProductType {
  id: string;
  name: string;                          // "Smartphone"
  slug: string;                          // "smartphone"
  description?: string;
  inheritFromTypeId?: string | null;     // parent type for attribute inheritance
  inheritFromTypeName?: string | null;   // denormalized for display
  variantDimensions: VariantDimension[]; // ordered SKU matrix axes
  attributeCount: number;                // how many MasterAttributes reference this type
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
    variantDimensions:   Array.isArray(r.variantDimensions)
      ? r.variantDimensions.map((d: any, i: number) => ({
          attributeCode: d.attributeCode ?? "",
          attributeName: d.attributeName ?? d.attributeCode ?? "",
          order:         d.order ?? i + 1,
          required:      d.required ?? true,
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
    active: pt.active,
  };
}
