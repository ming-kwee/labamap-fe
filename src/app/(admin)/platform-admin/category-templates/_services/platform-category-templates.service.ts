import {
  PlatformCategoryTemplate,
  PlatformCategoryTemplateTree,
  OrgProvisionStatus,
  ProvisionResult,
  ForceProvisionResult,
  PlatformCategoryTemplateDoc,
  docToTemplate,
  docToTemplateTree,
  templateToPayload,
} from "../_types/platform-category-template";

const BASE = "http://localhost:8888/labamap/api/v1/admin/platform-category-templates";
const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleResponse<T>(res: Response): Promise<T | null> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch { /* ignore */ }
    throw new Error(`[PlatformCategoryTemplatesService] ${res.status} ${message}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`[PlatformCategoryTemplatesService] Response was not valid JSON: ${text.slice(0, 200)}`);
  }
}

export const PlatformCategoryTemplatesService = {
  async getTree(): Promise<PlatformCategoryTemplateTree[]> {
    const res = await fetch(`${BASE}/tree`, { method: "GET", headers: JSON_HEADERS });
    // 404 = backend not deployed / collection not seeded yet — return empty tree so
    // the page renders instead of showing a hard error.
    if (res.status === 404) return [];
    const raw = await handleResponse<unknown>(res);
    // Handle both plain array and Spring paginated { content: [...] } responses.
    const arr = Array.isArray(raw)
      ? raw
      : ((raw as Record<string, unknown>)?.content as unknown[] ?? []);
    return (arr as PlatformCategoryTemplateDoc[]).map(docToTemplateTree);
  },

  async create(
    t: Pick<PlatformCategoryTemplate, 'name' | 'slug' | 'parentId' | 'description' | 'sortOrder'>
  ): Promise<PlatformCategoryTemplate> {
    const res = await fetch(BASE, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(templateToPayload(t)),
    });
    const doc = await handleResponse<PlatformCategoryTemplateDoc>(res);
    if (!doc) throw new Error("[PlatformCategoryTemplatesService] POST returned no content");
    return docToTemplate(doc);
  },

  async update(
    id: string,
    t: Pick<PlatformCategoryTemplate, 'name' | 'slug' | 'parentId' | 'description' | 'sortOrder'>
  ): Promise<PlatformCategoryTemplate> {
    const res = await fetch(`${BASE}/${id}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(templateToPayload(t)),
    });
    const doc = await handleResponse<PlatformCategoryTemplateDoc>(res);
    if (!doc) {
      return { ...t, id, path: "", level: 0, active: true, templateVersion: 1, parentId: t.parentId ?? null };
    }
    return docToTemplate(doc);
  },

  async setActive(id: string, active: boolean): Promise<void> {
    const res = await fetch(`${BASE}/${id}/active?active=${active}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
    });
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
      throw new Error(`[PlatformCategoryTemplatesService] DELETE ${id}: ${res.status} ${message}`);
    }
  },

  async listOrgProvisionStatus(): Promise<OrgProvisionStatus[]> {
    const res = await fetch(`${BASE}/provision-status`, { method: "GET", headers: JSON_HEADERS });
    if (res.status === 404) return [];
    const raw = await handleResponse<unknown>(res);
    const arr = Array.isArray(raw)
      ? raw
      : ((raw as Record<string, unknown>)?.content as unknown[] ?? []);
    return arr as OrgProvisionStatus[];
  },

  async provision(orgId: string): Promise<ProvisionResult> {
    const res = await fetch(`${BASE}/provision/${orgId}`, { method: "POST", headers: JSON_HEADERS });
    const result = await handleResponse<ProvisionResult>(res);
    if (!result) throw new Error("[PlatformCategoryTemplatesService] provision returned no content");
    return result;
  },

  async forceProvision(orgId: string): Promise<ForceProvisionResult> {
    const res = await fetch(`${BASE}/provision/${orgId}?force=true`, {
      method: "POST",
      headers: { ...JSON_HEADERS, "X-Confirm-Destructive": "RESET_CATEGORIES" },
    });
    const result = await handleResponse<ForceProvisionResult>(res);
    if (!result) throw new Error("[PlatformCategoryTemplatesService] force provision returned no content");
    return result;
  },
};
