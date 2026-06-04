// Field Semantic Knowledge types — APM knowledge base
// Corresponds to the `field_semantic_knowledge` MongoDB collection

export const KNOWN_CATEGORIES = ["product", "variant", "media", "pricing", "shipping"] as const;
export type SemanticCategory = typeof KNOWN_CATEGORIES[number] | string;

export const KNOWN_DATA_TYPES = ["string", "number", "boolean", "array"] as const;
export type SemanticDataType = typeof KNOWN_DATA_TYPES[number];

export const KNOWN_SEMANTIC_TYPES = [
  "PRODUCT_NAME", "PRICE", "SKU", "BRAND", "PRODUCT_DESCRIPTION",
  "CATEGORY", "WEIGHT", "SIZE", "COLOR", "MATERIAL_TYPE",
  "IMAGES", "TAGS", "BARCODE", "INVENTORY",
] as const;

export const SEMANTIC_TYPE_DESCRIPTIONS: Record<string, string> = {
  PRODUCT_NAME:        "Product title — name, title, productName",
  PRICE:               "Price value — price, basePrice, salePrice",
  SKU:                 "Stock-keeping unit — sku, seller_sku, itemCode",
  BRAND:               "Manufacturer or brand — brand, vendor, manufacturer",
  PRODUCT_DESCRIPTION: "Long description — description, body_html, details",
  CATEGORY:            "Product category — category, productType, categoryId",
  WEIGHT:              "Product weight — weight, itemWeight, packageWeight",
  SIZE:                "Size dimension — size, dimensions, itemSize",
  COLOR:               "Product color — color, colour, colorName",
  MATERIAL_TYPE:       "Material composition — material, fabric, materialType",
  IMAGES:              "Product images — mainImage, images, gallery",
  TAGS:                "Product tags — tags, keywords, labels",
  BARCODE:             "Product barcode — barcode, upc, ean, gtin",
  INVENTORY:           "Stock quantity — inventory_quantity, stock, quantity",
};

export interface FieldSemanticKnowledge {
  id: string;
  /** Unique identifier — immutable after creation */
  fieldName: string;
  semanticType: string;
  category: string;
  dataType: string;
  baseConfidence: number;
  aliases: string[];
  keywords: string[];
  commonPatterns: string[];
  /** Empty array = applies to all channels */
  validChannels: string[];
  isCommon: boolean;
  isRequired: boolean;
  isActive: boolean;
  description?: string;
  /** Read-only — learned from APM usage */
  usageCount?: number;
  /** Read-only — learned from APM usage */
  successRate?: number;
  createdAt: string;
  updatedAt: string;
}

/** POST body — all fields used at creation */
export interface CreateKnowledgeRequest {
  fieldName: string;
  semanticType: string;
  category?: string;
  dataType?: string;
  baseConfidence?: number;
  aliases?: string[];
  keywords?: string[];
  commonPatterns?: string[];
  validChannels?: string[];
  isCommon?: boolean;
  isRequired?: boolean;
  description?: string;
}

/**
 * PUT body — update an existing entry.
 * fieldName is immutable — backend ignores it if included.
 */
export interface UpdateKnowledgeRequest {
  semanticType?: string;
  category?: string;
  dataType?: string;
  baseConfidence?: number;
  aliases?: string[];
  keywords?: string[];
  commonPatterns?: string[];
  validChannels?: string[];
  isCommon?: boolean;
  isRequired?: boolean;
  description?: string;
}

export interface KnowledgeListParams {
  semanticType?: string;
  category?: string;
  channelId?: string;
  search?: string;
  isCommon?: boolean;
  isRequired?: boolean;
  isActive?: boolean;
  minConfidence?: number;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function mapRawKnowledge(raw: unknown): FieldSemanticKnowledge {
  const r = raw as Record<string, unknown>;
  return {
    id:             (r.id ?? r._id ?? "") as string,
    fieldName:      (r.fieldName ?? "") as string,
    semanticType:   (r.semanticType ?? "") as string,
    category:       (r.category ?? "product") as string,
    dataType:       (r.dataType ?? "string") as string,
    baseConfidence: Number(r.baseConfidence ?? 85),
    aliases:        Array.isArray(r.aliases) ? (r.aliases as string[]) : [],
    keywords:       Array.isArray(r.keywords) ? (r.keywords as string[]) : [],
    commonPatterns: Array.isArray(r.commonPatterns) ? (r.commonPatterns as string[]) : [],
    validChannels:  Array.isArray(r.validChannels) ? (r.validChannels as string[]) : [],
    isCommon:       Boolean(r.isCommon ?? false),
    isRequired:     Boolean(r.isRequired ?? false),
    isActive:       Boolean(r.isActive ?? r.active ?? true),
    description:    r.description as string | undefined,
    usageCount:     r.usageCount != null ? Number(r.usageCount) : undefined,
    successRate:    r.successRate != null ? Number(r.successRate) : undefined,
    createdAt:      (r.createdAt ?? "") as string,
    updatedAt:      (r.updatedAt ?? "") as string,
  };
}
