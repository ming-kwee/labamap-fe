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
 *
 * All endpoints require organizationId (query param or X-Organization-Id header).
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function orgHeaders(orgId?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (orgId) h["X-Organization-Id"] = orgId;
  return h;
}

function withOrg(url: string, orgId?: string): string {
  if (!orgId) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}organizationId=${encodeURIComponent(orgId)}`;
}

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
  async list(orgId?: string, params?: { active?: boolean; q?: string }): Promise<ProductCategory[]> {
    const qs = new URLSearchParams();
    if (params?.active !== undefined) qs.set("active", String(params.active));
    if (params?.q) qs.set("q", params.q);
    const base = `${BASE}${qs.toString() ? `?${qs}` : ""}`;
    const res = await fetch(withOrg(base, orgId), { method: "GET", headers: orgHeaders(orgId) });
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : ((raw as Record<string, unknown>)?.content as unknown[] ?? []);
    return (arr as ProductCategoryDoc[]).map(docToCategory);
  },

  /** GET /tree — full nested tree */
  async getTree(orgId?: string): Promise<ProductCategoryTree[]> {
    const res = await fetch(withOrg(`${BASE}/tree`, orgId), { method: "GET", headers: orgHeaders(orgId) });
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : [];
    return (arr as ProductCategoryDoc[]).map(docToTree);
  },

  /** GET /slugs — lightweight list for pickers */
  async getSlugs(orgId?: string): Promise<CategorySlugItem[]> {
    const res = await fetch(withOrg(`${BASE}/slugs`, orgId), { method: "GET", headers: orgHeaders(orgId) });
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
  async get(id: string, orgId?: string): Promise<ProductCategory> {
    const res = await fetch(withOrg(`${BASE}/${id}`, orgId), { method: "GET", headers: orgHeaders(orgId) });
    const doc = await handleResponse<ProductCategoryDoc>(res);
    if (!doc) throw new Error(`[CategoryService] GET ${id} returned no content`);
    return docToCategory(doc);
  },

  /** GET /{id}/children */
  async getChildren(id: string, orgId?: string): Promise<ProductCategory[]> {
    const res = await fetch(withOrg(`${BASE}/${id}/children`, orgId), { method: "GET", headers: orgHeaders(orgId) });
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : [];
    return (arr as ProductCategoryDoc[]).map(docToCategory);
  },

  /** GET /{id}/breadcrumb */
  async getBreadcrumb(id: string, orgId?: string): Promise<ProductCategory[]> {
    const res = await fetch(withOrg(`${BASE}/${id}/breadcrumb`, orgId), { method: "GET", headers: orgHeaders(orgId) });
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : [];
    return (arr as ProductCategoryDoc[]).map(docToCategory);
  },

  /** POST / — create new category */
  async create(
    cat: Omit<ProductCategory, "id" | "path" | "level" | "createdAt" | "updatedAt">,
    orgId?: string,
  ): Promise<ProductCategory> {
    const payload = categoryToPayload(cat);
    const res = await fetch(withOrg(BASE, orgId), {
      method: "POST",
      headers: orgHeaders(orgId),
      body: JSON.stringify(payload),
    });
    const doc = await handleResponse<ProductCategoryDoc>(res);
    if (!doc) throw new Error("[CategoryService] POST returned no content");
    return docToCategory(doc);
  },

  /** PUT /{id} — full update, supports reparenting */
  async update(
    id: string,
    cat: Omit<ProductCategory, "id" | "path" | "level" | "createdAt" | "updatedAt">,
    orgId?: string,
  ): Promise<ProductCategory> {
    const payload = categoryToPayload(cat);
    const res = await fetch(withOrg(`${BASE}/${id}`, orgId), {
      method: "PUT",
      headers: orgHeaders(orgId),
      body: JSON.stringify(payload),
    });
    const doc = await handleResponse<ProductCategoryDoc>(res);
    if (doc === null) {
      return {
        ...cat,
        id,
        path: "",
        level: 0,
        updatedAt: new Date().toISOString(),
      };
    }
    return docToCategory(doc);
  },

  /** PATCH /{id}/active */
  async setActive(id: string, active: boolean, orgId?: string): Promise<void> {
    const url = withOrg(`${BASE}/${id}/active?active=${active}`, orgId);
    const res = await fetch(url, { method: "PATCH", headers: orgHeaders(orgId) });
    await handleResponse<unknown>(res);
  },

  /** GET /{id}/effective-product-type — resolved type including ancestor inheritance */
  async getEffectiveProductType(id: string, orgId?: string): Promise<{
    productTypeId: string;
    productTypeName: string;
    inheritedFrom: string | null;
    inheritedFromName: string | null;
  } | null> {
    try {
      const res = await fetch(withOrg(`${BASE}/${id}/effective-product-type`, orgId), { method: "GET", headers: orgHeaders(orgId) });
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
  async delete(id: string, orgId?: string): Promise<void> {
    const res = await fetch(withOrg(`${BASE}/${id}`, orgId), { method: "DELETE", headers: orgHeaders(orgId) });
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
