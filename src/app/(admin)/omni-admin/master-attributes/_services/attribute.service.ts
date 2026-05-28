/**
 * Master Attribute Service
 *
 * Connects to: POST|GET|PUT|PATCH|DELETE /labamap/api/v1/admin/master-attributes
 * Backend controller: MasterAttributeAdminController (Spring Boot / reactive)
 *
 * Category sidebar: driven by CategoryService.getSlugs() (product-categories endpoint).
 * Each attribute's applicableCategories stores MongoDB ObjectIds of product_categories
 * documents — Phase 1 of the Category Ownership architecture.
 *
 * ─── Backend Enhancement Recommendations ───────────────────────────────────────
 *
 * RECOMMENDED — request these from backend:
 *
 *  1. PATCH  /reorder
 *     Body: { orderedIds: string[] }
 *     Purpose: persist drag-drop reorder in one call instead of N PUT calls.
 *     Currently workaround: client re-sequences sortOrder and sends individual PUTs.
 *
 *  2. DELETE /bulk
 *     Body: { ids: string[] }
 *     Purpose: bulk delete selected attributes in one round-trip.
 *     Currently workaround: sequential individual DELETEs (slow, non-atomic).
 *
 *  3. GET    /{id}/usage
 *     Response: { productCount: number, variantCount: number, channelCount: number }
 *     Purpose: show live usage stats in the attribute list + prevent accidental deletes.
 *
 *  4. POST   /{id}/duplicate
 *     Purpose: clone an attribute (increment sortOrder, append " (copy)" to name).
 *     Currently workaround: client reads, strips id, POSTs — loses server-side autonaming.
 *
 *  5. GET    /validate-code?code=brand&excludeId=abc123
 *     Response: { available: boolean }
 *     Purpose: real-time code uniqueness check in the Add form before submit.
 *
 *  6. POST   /import  (multipart/form-data, file: CSV|JSON)
 *     GET    /export?format=csv|json
 *     Purpose: bulk import/export for catalog setup migrations.
 *
 *  7. GET    /?q=text&page=0&size=20&sort=sortOrder,asc
 *     Purpose: server-side pagination + full-text search for large attribute sets.
 *     Currently all filtering is client-side (fine up to ~500 attrs, then degrades).
 *     Response wrapper: { content: MasterAttributeDoc[], totalElements: number, ... }
 *
 *  8. GET    /{id}/history
 *     Response: AuditEntry[]  (who changed what and when)
 *     Purpose: attribute change log visible in the expand panel.
 *
 *  9. PATCH  /bulk-activate  Body: { ids: string[], active: boolean }
 *     Purpose: toggle active/inactive for multiple attributes at once.
 *
 * ───────────────────────────────────────────────────────────────────────────────
 */

import {
  MasterAttribute,
  MasterAttributeDoc,
  AttributeListParams,
  docToAttribute,
  attributeToDocPayload,
} from "../_types/attribute";

const BASE = "http://localhost:8888/labamap/api/v1/admin/master-attributes";

const JSON_HEADERS = { "Content-Type": "application/json" };

// ─── HTTP helper ───────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T | null> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch {
      // body is not JSON — fall back to statusText
    }
    throw new Error(`[AttributeService] ${res.status} ${message}`);
  }
  // 204 No Content — successful update but no body (common for PUT in REST APIs)
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null;
  }
  // Guard against empty body before attempting JSON parse
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`[AttributeService] ${res.status} — response was not valid JSON: ${text.slice(0, 200)}`);
  }
}

function buildQuery(params: Record<string, string | boolean | number | undefined>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `?${qs}` : "";
}

// ─── Service ────────────────────────────────────────────────────────────────────

export const AttributeService = {
  /**
   * GET /labamap/api/v1/admin/master-attributes
   *
   * Returns all attributes matching the optional filter params.
   * NOTE: All client-side filtering (search, status, type) is done in the page
   *       component. Server-side search+pagination is a backend recommendation (#7).
   */
  async listAttributes(params?: AttributeListParams): Promise<MasterAttribute[]> {
    const qs = buildQuery({
      section:        params?.section,
      group:          params?.group,
      channelType:    params?.channelType,
      isChannelField: params?.isChannelField,
      productTypeId:  params?.productTypeId,
    });
    const res = await fetch(`${BASE}${qs}`, {
      method: "GET",
      headers: JSON_HEADERS,
    });

    // Use `unknown` so we can safely inspect the actual shape before mapping
    const raw = await handleResponse<unknown>(res);

    // Normalise any Spring Boot response shape to a plain array:
    //   • plain array:          [...docs]
    //   • Spring Page:          { content: [...], totalElements: N, ... }
    //   • custom wrapper:       { data: [...] } | { attributes: [...] } | { items: [...] }
    let docs: MasterAttributeDoc[];
    if (Array.isArray(raw)) {
      docs = raw as MasterAttributeDoc[];
    } else if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      const arr = obj.content ?? obj.data ?? obj.attributes ?? obj.items ?? [];
      docs = Array.isArray(arr) ? (arr as MasterAttributeDoc[]) : [];
    } else {
      docs = [];
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[AttributeService] listAttributes raw response:", raw);
      if (docs.length > 0) {
        console.log("[AttributeService] first doc keys:", Object.keys(docs[0] as object));
        console.log("[AttributeService] first doc:", docs[0]);
      }
    }

    return docs.map(docToAttribute);
  },

  /**
   * GET /labamap/api/v1/admin/master-attributes/{id}
   */
  async getAttribute(id: string): Promise<MasterAttribute> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "GET",
      headers: JSON_HEADERS,
    });
    const doc = await handleResponse<MasterAttributeDoc>(res);
    if (!doc) throw new Error(`[AttributeService] GET ${id} returned no content`);
    return docToAttribute(doc);
  },

  /**
   * POST /labamap/api/v1/admin/master-attributes
   *
   * Creates a new attribute. Server auto-sets _id, createdAt, updatedAt.
   */
  async createAttribute(
    attr: Omit<MasterAttribute, "id" | "usageCount" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
  ): Promise<MasterAttribute> {
    const payload = attributeToDocPayload(attr);
    const res = await fetch(BASE, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    });
    const doc = await handleResponse<MasterAttributeDoc>(res);
    if (!doc) throw new Error("[AttributeService] POST returned no content — cannot determine created id");
    return docToAttribute(doc);
  },

  /**
   * PUT /labamap/api/v1/admin/master-attributes/{id}
   *
   * Full replace. Server preserves createdAt and createdBy from the original doc.
   */
  async updateAttribute(
    id: string,
    attr: Omit<MasterAttribute, "id" | "usageCount" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">
  ): Promise<MasterAttribute> {
    const payload = attributeToDocPayload(attr);

    // Explicitly strip any stray id/_id from the body — some Spring Boot mappers
    // pick up an 'id' field from the body and either ignore the path variable or
    // try to update the wrong document.
    const { id: _stripId, _id: _stripMongoId, ...cleanPayload } =
      payload as typeof payload & { id?: string; _id?: string };

    if (process.env.NODE_ENV === "development") {
      console.log("[AttributeService] PUT payload for", id, cleanPayload);
    }

    const res = await fetch(`${BASE}/${id}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(cleanPayload),
    });

    const doc = await handleResponse<MasterAttributeDoc>(res);

    if (process.env.NODE_ENV === "development") {
      console.log("[AttributeService] PUT response (null = 204 No Content):", doc);
    }

    // If the backend returned 204 No Content, reconstruct from what we sent
    // so the caller can sync server-managed timestamps (updatedAt etc.) correctly.
    if (doc === null) {
      return docToAttribute({
        ...cleanPayload,
        _id: id,
        createdAt: "",  // will be overridden by handleModalSave with attr.createdAt
        updatedAt: new Date().toISOString(),
      } as MasterAttributeDoc);
    }

    return docToAttribute(doc);
  },

  /**
   * PATCH /labamap/api/v1/admin/master-attributes/{id}/active?active=false
   *
   * Toggles the active flag without a full document round-trip.
   * Prefer this over PUT when only changing status.
   */
  async setActive(id: string, active: boolean): Promise<MasterAttribute> {
    const res = await fetch(`${BASE}/${id}/active?active=${active}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
    });
    const doc = await handleResponse<MasterAttributeDoc>(res);
    if (!doc) throw new Error(`[AttributeService] PATCH ${id}/active returned no content`);
    return docToAttribute(doc);
  },

  /**
   * DELETE /labamap/api/v1/admin/master-attributes/{id}
   *
   * Hard delete. Use setActive(id, false) for soft-delete instead.
   */
  async deleteAttribute(id: string): Promise<void> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "DELETE",
      headers: JSON_HEADERS,
    });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body.message ?? body.error ?? message;
      } catch { /* ignore */ }
      throw new Error(`[AttributeService] DELETE ${id}: ${res.status} ${message}`);
    }
  },

  // ─── Workarounds for missing backend endpoints ──────────────────────────────
  // Replace each with a real endpoint once the backend implements them
  // (see recommendations above).

  /**
   * Reorder: no backend endpoint yet (recommendation #1).
   * Workaround: sequentially PUT each attribute with updated sortOrder.
   * CAUTION: not atomic — a mid-sequence failure leaves partial state.
   */
  async reorderAttributes(orderedAttributes: MasterAttribute[]): Promise<void> {
    await Promise.all(
      orderedAttributes.map((attr, index) =>
        AttributeService.updateAttribute(attr.id, { ...attr, sortOrder: index + 1, status: attr.status })
      )
    );
  },

  /**
   * Bulk delete: no backend endpoint yet (recommendation #2).
   * Workaround: sequential individual DELETEs.
   */
  async bulkDeleteAttributes(ids: string[]): Promise<void> {
    await Promise.all(ids.map(id => AttributeService.deleteAttribute(id)));
  },
};
