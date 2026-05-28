// Product Category types for omni-admin
import type { ChannelSyncSummary } from "../../channel-category-mapping/_types/channel-mapping";
export type { ChannelSyncSummary };

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;               // stable URL identifier, unique
  description?: string;
  imageUrl?: string;
  parentId?: string | null;   // null = root
  path: string;               // materialized path e.g. "electronics/smartphones"
  level: number;              // 0=root, 1=child, 2=grandchild
  sortOrder: number;
  active: boolean;
  metaTitle?: string;
  metaDescription?: string;
  productTypeId?: string | null;    // Phase 4: which ProductType schema this category uses
  productTypeName?: string | null;  // denormalized for display
  channelSyncSummary?: ChannelSyncSummary;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductCategoryTree extends ProductCategory {
  children: ProductCategoryTree[];
}

// ─── Backend document shape ────────────────────────────────────────────────────

export interface ProductCategoryDoc {
  id?: string;
  _id?: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  parentId?: string | null;
  path?: string;
  level?: number;
  sortOrder?: number;
  active?: boolean;
  metaTitle?: string;
  metaDescription?: string;
  children?: ProductCategoryDoc[];
  productTypeId?: string | null;
  productTypeName?: string | null;
  channelSyncSummary?: ChannelSyncSummary;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Slug picker item (from GET /slugs) ───────────────────────────────────────

export interface CategorySlugItem {
  id: string;
  name: string;
  slug: string;
  path: string;
  level: number;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function docToCategory(doc: ProductCategoryDoc): ProductCategory {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = doc as any;
  return {
    id:              r.id ?? r._id ?? "",
    name:            r.name ?? "",
    slug:            r.slug ?? "",
    description:     r.description ?? undefined,
    imageUrl:        r.imageUrl ?? undefined,
    parentId:        r.parentId ?? null,
    path:            r.path ?? "",
    level:           r.level ?? 0,
    sortOrder:       r.sortOrder ?? 0,
    active:          r.active ?? true,
    metaTitle:          r.metaTitle ?? undefined,
    metaDescription:    r.metaDescription ?? undefined,
    productTypeId:      r.productTypeId ?? null,
    productTypeName:    r.productTypeName ?? null,
    channelSyncSummary: r.channelSyncSummary ?? undefined,
    createdAt:          r.createdAt ?? undefined,
    updatedAt:          r.updatedAt ?? undefined,
  };
}

export function docToTree(doc: ProductCategoryDoc): ProductCategoryTree {
  return {
    ...docToCategory(doc),
    children: Array.isArray(doc.children) ? doc.children.map(docToTree) : [],
  };
}

export function categoryToPayload(
  cat: Omit<ProductCategory, "id" | "path" | "level" | "createdAt" | "updatedAt">
): Record<string, unknown> {
  return {
    name:            cat.name,
    slug:            cat.slug,
    description:     cat.description ?? null,
    imageUrl:        cat.imageUrl ?? null,
    parentId:        cat.parentId ?? null,
    sortOrder:       cat.sortOrder ?? 0,
    active:          cat.active ?? true,
    metaTitle:       cat.metaTitle ?? null,
    metaDescription: cat.metaDescription ?? null,
    productTypeId:   cat.productTypeId ?? null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Flatten a tree into a sorted list (breadth-first) */
export function flattenTree(
  nodes: ProductCategoryTree[],
  result: ProductCategoryTree[] = []
): ProductCategoryTree[] {
  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0) flattenTree(node.children, result);
  }
  return result;
}

/** Count total descendants in a subtree */
export function countDescendants(node: ProductCategoryTree): number {
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}
