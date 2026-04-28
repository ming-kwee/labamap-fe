/**
 * Product Category Service
 *
 * Connects to: /labamap/api/v1/admin/product-categories
 * Backend: ProductCategoryAdminController (Spring Boot reactive + MongoDB)
 *
 * Endpoints:
 *   GET    /           — flat list (?active=, ?q=)
 *   GET    /tree       — full nested tree
 *   GET    /slugs      — slug+name+path list for pickers
 *   GET    /{id}       — single category
 *   GET    /{id}/children   — direct children
 *   GET    /{id}/breadcrumb — ancestor chain root → node
 *   POST   /           — create (slug uniqueness checked, path/level auto-computed)
 *   PUT    /{id}       — full update, reparent supported (cascades path)
 *   PATCH  /{id}/active    — toggle active
 *   DELETE /{id}       — blocked with 409 if active children exist
 */

import {
  ProductCategory,
  ProductCategoryTree,
  CategorySlugItem,
  ProductCategoryDoc,
  docToCategory,
  docToTree,
  categoryToPayload,
} from "../_types/category";

const BASE = "http://localhost:8888/labamap/api/v1/admin/product-categories";
const JSON_HEADERS = { "Content-Type": "application/json" };

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T | null> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch { /* ignore */ }
    throw new Error(`[CategoryService] ${res.status} ${message}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`[CategoryService] Response was not valid JSON: ${text.slice(0, 200)}`);
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const CategoryService = {
  /** GET / — flat list, optionally filtered */
  async list(params?: { active?: boolean; q?: string }): Promise<ProductCategory[]> {
    const qs = new URLSearchParams();
    if (params?.active !== undefined) qs.set("active", String(params.active));
    if (params?.q) qs.set("q", params.q);
    const url = `${BASE}${qs.toString() ? `?${qs}` : ""}`;
    const res = await fetch(url, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : ((raw as Record<string, unknown>)?.content as unknown[] ?? []);
    return (arr as ProductCategoryDoc[]).map(docToCategory);
  },

  /** GET /tree — full nested tree */
  async getTree(): Promise<ProductCategoryTree[]> {
    const res = await fetch(`${BASE}/tree`, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : [];
    return (arr as ProductCategoryDoc[]).map(docToTree);
  },

  /** GET /slugs — lightweight list for pickers */
  async getSlugs(): Promise<CategorySlugItem[]> {
    const res = await fetch(`${BASE}/slugs`, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (arr as any[])
      .map(r => ({
        id:    r.id ?? r._id ?? "",
        name:  r.name ?? "",
        slug:  r.slug ?? "",
        path:  r.path ?? "",
        level: r.level ?? 0,
      }))
      .filter(r => r.id !== "");
  },

  /** GET /{id} */
  async get(id: string): Promise<ProductCategory> {
    const res = await fetch(`${BASE}/${id}`, { method: "GET", headers: JSON_HEADERS });
    const doc = await handleResponse<ProductCategoryDoc>(res);
    if (!doc) throw new Error(`[CategoryService] GET ${id} returned no content`);
    return docToCategory(doc);
  },

  /** GET /{id}/children */
  async getChildren(id: string): Promise<ProductCategory[]> {
    const res = await fetch(`${BASE}/${id}/children`, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : [];
    return (arr as ProductCategoryDoc[]).map(docToCategory);
  },

  /** GET /{id}/breadcrumb */
  async getBreadcrumb(id: string): Promise<ProductCategory[]> {
    const res = await fetch(`${BASE}/${id}/breadcrumb`, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : [];
    return (arr as ProductCategoryDoc[]).map(docToCategory);
  },

  /** POST / — create new category */
  async create(
    cat: Omit<ProductCategory, "id" | "path" | "level" | "createdAt" | "updatedAt">
  ): Promise<ProductCategory> {
    const payload = categoryToPayload(cat);
    const res = await fetch(BASE, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
    const doc = await handleResponse<ProductCategoryDoc>(res);
    if (!doc) throw new Error("[CategoryService] POST returned no content");
    return docToCategory(doc);
  },

  /** PUT /{id} — full update, supports reparenting */
  async update(
    id: string,
    cat: Omit<ProductCategory, "id" | "path" | "level" | "createdAt" | "updatedAt">
  ): Promise<ProductCategory> {
    const payload = categoryToPayload(cat);
    const res = await fetch(`${BASE}/${id}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
    const doc = await handleResponse<ProductCategoryDoc>(res);
    if (doc === null) {
      // 204 No Content — reconstruct from sent payload
      return {
        ...cat,
        id,
        path: "",   // backend recomputes; caller should refetch tree
        level: 0,
        updatedAt: new Date().toISOString(),
      };
    }
    return docToCategory(doc);
  },

  /** PATCH /{id}/active */
  async setActive(id: string, active: boolean): Promise<void> {
    const res = await fetch(`${BASE}/${id}/active?active=${active}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
    });
    // Accept both 200 (body) and 204 (no body) — both mean success
    await handleResponse<unknown>(res);
  },

  /** GET /{id}/effective-product-type — resolved type including ancestor inheritance */
  async getEffectiveProductType(id: string): Promise<{
    productTypeId: string;
    productTypeName: string;
    inheritedFrom: string | null;
    inheritedFromName: string | null;
  } | null> {
    try {
      const res = await fetch(`${BASE}/${id}/effective-product-type`, { method: "GET", headers: JSON_HEADERS });
      if (res.status === 404 || res.status === 204) return null;
      return await handleResponse<{
        productTypeId: string;
        productTypeName: string;
        inheritedFrom: string | null;
        inheritedFromName: string | null;
      }>(res);
    } catch {
      return null;
    }
  },

  /** DELETE /{id} — throws with 409 message if active children exist */
  async delete(id: string): Promise<void> {
    const res = await fetch(`${BASE}/${id}`, { method: "DELETE", headers: JSON_HEADERS });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body.message ?? body.error ?? message;
      } catch { /* ignore */ }
      throw new Error(`[CategoryService] DELETE ${id}: ${res.status} ${message}`);
    }
  },
};
