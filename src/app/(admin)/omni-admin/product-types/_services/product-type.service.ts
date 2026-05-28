/**
 * Product Type Service
 *
 * Connects to: /labamap/api/v1/admin/product-types
 * Backend: ProductTypeAdminController (Spring Boot reactive + MongoDB)
 *
 * Endpoints:
 *   GET    /           — flat list (?active=)
 *   GET    /{id}       — single type
 *   POST   /           — create
 *   PUT    /{id}       — full update
 *   PATCH  /{id}/active?active=boolean — toggle active
 *   DELETE /{id}       — blocked with 409 if categories reference this type
 */

import { ProductType, ProductTypeDoc, docToProductType, productTypeToPayload } from "../_types/product-type";

const BASE = "http://localhost:8888/labamap/api/v1/admin/product-types";
const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleResponse<T>(res: Response): Promise<T | null> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch { /* ignore */ }
    throw new Error(`[ProductTypeService] ${res.status} ${message}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`[ProductTypeService] Response was not valid JSON: ${text.slice(0, 200)}`);
  }
}

export const ProductTypeService = {
  async list(params?: { active?: boolean }): Promise<ProductType[]> {
    const qs = params?.active !== undefined ? `?active=${params.active}` : "";
    const res = await fetch(`${BASE}${qs}`, { method: "GET", headers: JSON_HEADERS });
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw) ? raw : ((raw as Record<string, unknown>)?.content as unknown[] ?? []);
    return (arr as ProductTypeDoc[]).map(docToProductType);
  },

  async get(id: string): Promise<ProductType> {
    const res = await fetch(`${BASE}/${id}`, { method: "GET", headers: JSON_HEADERS });
    const doc = await handleResponse<ProductTypeDoc>(res);
    if (!doc) throw new Error(`[ProductTypeService] GET ${id} returned no content`);
    return docToProductType(doc);
  },

  async create(
    pt: Omit<ProductType, "id" | "attributeCount" | "createdAt" | "updatedAt" | "inheritFromTypeName">
  ): Promise<ProductType> {
    const payload = productTypeToPayload(pt);
    const res = await fetch(BASE, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(payload) });
    const doc = await handleResponse<ProductTypeDoc>(res);
    if (!doc) throw new Error("[ProductTypeService] POST returned no content");
    return docToProductType(doc);
  },

  async update(
    id: string,
    pt: Omit<ProductType, "id" | "attributeCount" | "createdAt" | "updatedAt" | "inheritFromTypeName">
  ): Promise<ProductType> {
    const payload = productTypeToPayload(pt);
    const { id: _id, _id: _mongoId, ...clean } = payload as typeof payload & { id?: string; _id?: string };
    const res = await fetch(`${BASE}/${id}`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(clean) });
    const doc = await handleResponse<ProductTypeDoc>(res);
    if (doc === null) {
      return { ...pt, id, attributeCount: 0, updatedAt: new Date().toISOString() };
    }
    return docToProductType(doc);
  },

  async setActive(id: string, active: boolean): Promise<void> {
    const res = await fetch(`${BASE}/${id}/active?active=${active}`, { method: "PATCH", headers: JSON_HEADERS });
    await handleResponse<unknown>(res);
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${BASE}/${id}`, { method: "DELETE", headers: JSON_HEADERS });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body.message ?? body.error ?? message;
      } catch { /* ignore */ }
      throw new Error(`[ProductTypeService] DELETE ${id}: ${res.status} ${message}`);
    }
  },
};
