import type { CategoryOriginInfo, CategorySourceOrigin } from "../_types/category-origin";

const API = "http://localhost:8888/labamap/api/v1";

// ─── localStorage fallback key ────────────────────────────────────────────────
// Used when backend has not yet deployed the category-origin endpoint.
// Key: "cat_origin_{orgId}" → JSON CategoryOriginInfo

function localKey(orgId: string) { return `cat_origin_${orgId}`; }

function readLocal(orgId: string): CategoryOriginInfo | null {
  try {
    const raw = localStorage.getItem(localKey(orgId));
    if (!raw) return null;
    return JSON.parse(raw) as CategoryOriginInfo;
  } catch { return null; }
}

function writeLocal(orgId: string, info: CategoryOriginInfo): void {
  try { localStorage.setItem(localKey(orgId), JSON.stringify(info)); } catch { /* ignore */ }
}

function clearLocal(orgId: string): void {
  try { localStorage.removeItem(localKey(orgId)); } catch { /* ignore */ }
}

function buildLocalInfo(origin: CategorySourceOrigin): CategoryOriginInfo {
  const onboardedAt  = new Date().toISOString();
  const endsAt       = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  return {
    categorySourceOrigin:     origin,
    categoryOnboardedAt:      onboardedAt,
    categoryGracePeriodActive: true,
    categoryGracePeriodEndsAt: endsAt,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try { const b = await res.json(); msg = b.message ?? b.error ?? msg; } catch { /* ignore */ }
    throw new Error(`[CategoryOriginService] ${res.status} ${msg}`);
  }
  return res.json() as Promise<T>;
}

function mapOriginInfo(raw: Record<string, unknown>): CategoryOriginInfo {
  return {
    categorySourceOrigin:      (raw.categorySourceOrigin as CategorySourceOrigin | null) ?? null,
    categoryOnboardedAt:       (raw.categoryOnboardedAt as string | null) ?? null,
    categoryGracePeriodActive: Boolean(raw.categoryGracePeriodActive ?? false),
    categoryGracePeriodEndsAt: (raw.categoryGracePeriodEndsAt as string | null) ?? null,
  };
}

const NULL_INFO: CategoryOriginInfo = {
  categorySourceOrigin: null,
  categoryOnboardedAt: null,
  categoryGracePeriodActive: false,
  categoryGracePeriodEndsAt: null,
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const CategoryOriginService = {
  /**
   * GET /organizations/{orgId}
   * Extract categorySourceOrigin fields from org response.
   *
   * Priority: backend response → localStorage fallback → null (not yet chosen).
   *
   * Backend not deployed (404 on org endpoint, or origin fields absent):
   *   → check localStorage for a previously saved local choice
   *   → if none, return null origin (onboarding panel will show)
   *
   * Network / server error:
   *   → check localStorage (prefer showing previous choice over blank onboarding)
   *   → if none, throw so caller can show an error state instead of onboarding panel
   */
  async getOriginInfo(orgId: string): Promise<CategoryOriginInfo> {
    try {
      const res = await fetch(`${API}/organizations/${encodeURIComponent(orgId)}`, {
        headers: { "Content-Type": "application/json" },
      });

      // Backend not deployed → fall back to localStorage
      if (res.status === 404) {
        return readLocal(orgId) ?? NULL_INFO;
      }

      const raw = await handleResponse<Record<string, unknown>>(res);
      const info = mapOriginInfo(raw);

      // Backend deployed and origin is set → clear any local fallback (backend is now source of truth)
      if (info.categorySourceOrigin != null) {
        clearLocal(orgId);
        return info;
      }

      // Backend deployed but origin not yet set → check localStorage
      // (covers the window between user setting origin locally and backend being deployed)
      return readLocal(orgId) ?? info;

    } catch {
      // Network / server error: prefer localStorage over showing blank onboarding panel
      const local = readLocal(orgId);
      if (local) return local;
      // No local fallback → re-throw so caller can show error, not onboarding panel
      throw new Error("Tidak dapat memuat informasi kategori. Periksa koneksi Anda dan coba lagi.");
    }
  },

  /**
   * POST /organizations/{orgId}/category-origin
   * Set the one-time onboarding choice.
   *
   * If backend endpoint not yet deployed (404): saves to localStorage as fallback.
   * Returns 409 after grace period (backend enforced).
   */
  async setOrigin(orgId: string, origin: CategorySourceOrigin): Promise<CategoryOriginInfo> {
    try {
      const res = await fetch(`${API}/organizations/${encodeURIComponent(orgId)}/category-origin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin }),
      });

      if (res.status === 409) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.message ?? "Sumber kategori sudah dikunci. Grace period telah berakhir.");
      }

      // Backend endpoint not deployed yet → save locally and return synthetic info
      if (res.status === 404 || res.status === 405) {
        const local = buildLocalInfo(origin);
        writeLocal(orgId, local);
        return local;
      }

      const raw = await handleResponse<Record<string, unknown>>(res);
      const info = mapOriginInfo(raw);
      clearLocal(orgId); // backend is now source of truth
      return info;

    } catch (err) {
      // Re-throw 409 errors as-is (intentional rejection)
      if (err instanceof Error && err.message.includes("dikunci")) throw err;
      // Network error → save locally so merchant can proceed
      const local = buildLocalInfo(origin);
      writeLocal(orgId, local);
      return local;
    }
  },

  /**
   * Reset origin locally to null — allows merchant to re-open onboarding panel
   * during grace period without a backend call.
   * The backend choice is NOT cleared; this is UI-only until merchant picks again.
   */
  resetLocalForChange(orgId: string): void {
    clearLocal(orgId);
  },
};
