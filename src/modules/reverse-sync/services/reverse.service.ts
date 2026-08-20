/**
 * Reverse Sync Service
 *
 * All calls to `{host}/labamap/api/v1/channels/reverse` (BFF-only — never touches
 * Temporal/worker). Backend is fully implemented (R0–R5). No mock/fallback data.
 *
 * Error body is consistent: `{ "error": "<message>" }` for `/pull*`, or empty on
 * 5xx for `/preview`/`/apply`. `ReverseApiError` carries the HTTP status so callers
 * can special-case 400 "not configured" (channel needs signing → manual preview).
 */

import type {
  ReversePreview,
  ReverseApplyResult,
  ReverseReviewResult,
  ReverseSuggestion,
  ReverseSuggestionStatus,
  ReverseJoltSpec,
  ReversePullRequest,
  ReversePreviewRequest,
  ReverseApplyRequest,
  ChannelListPage,
  ReverseImportRequest,
  ReverseImportResult,
  ReverseImportErrorCode,
} from "../types/reverse";

const BASE = "http://localhost:8888/labamap/api/v1/channels/reverse";
const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Typed error carrying the HTTP status + backend message.
 *
 * `/import*` errors additionally carry a structured `ReverseImportError` envelope —
 * `code` plus (for `DUPLICATE_MASTER_SKU`) `sku` and best-effort `conflictingMasterId`,
 * so callers can offer a one-click "link to the conflicting master instead".
 */
export class ReverseApiError extends Error {
  readonly status: number;
  /** `ReverseImportError.code` when the body was the `/import` error envelope. */
  readonly code?: ReverseImportErrorCode;
  /** Clashing SKU (present on `DUPLICATE_MASTER_SKU`). */
  readonly sku?: string | null;
  /** Existing master to link to instead (best-effort on `DUPLICATE_MASTER_SKU`; may be null). */
  readonly conflictingMasterId?: string | null;

  constructor(
    message: string,
    status: number,
    extra?: { code?: ReverseImportErrorCode; sku?: string | null; conflictingMasterId?: string | null },
  ) {
    super(message);
    this.name = "ReverseApiError";
    this.status = status;
    this.code = extra?.code;
    this.sku = extra?.sku;
    this.conflictingMasterId = extra?.conflictingMasterId;
  }
}

/** True when the failure means "this channel does not support auto-pull" (needs signing). */
export function isNotConfigured(err: unknown): boolean {
  return (
    err instanceof ReverseApiError &&
    err.status === 400 &&
    /not configured|reverse pull not configured/i.test(err.message)
  );
}

async function buildError(res: Response): Promise<ReverseApiError> {
  const rawText = await res.text().catch(() => "");
  let message = rawText || res.statusText;
  let extra: { code?: ReverseImportErrorCode; sku?: string | null; conflictingMasterId?: string | null } | undefined;
  try {
    const body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : undefined;
    if (body && typeof body === "object") {
      // `/pull*` → { error }; `/import*` → ReverseImportError { code, message, sku?, conflictingMasterId? }.
      message = (body.error as string) ?? (body.message as string) ?? message;
      if (typeof body.code === "string") {
        extra = {
          code: body.code as ReverseImportErrorCode,
          sku: (body.sku as string) ?? null,
          conflictingMasterId: (body.conflictingMasterId as string) ?? null,
        };
      }
    }
  } catch {
    // Non-JSON body — keep rawText.
  }
  return new ReverseApiError(message, res.status, extra);
}

async function handleJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw await buildError(res);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  return handleJson<T>(res);
}

export const ReverseSyncService = {
  // ─── Pull (fetch from channel + preview) — main FE path ──────────────────────

  /** POST /pull — fetch item live from the channel and classify (preview only). */
  pull(req: ReversePullRequest): Promise<ReversePreview> {
    return post<ReversePreview>("/pull", req);
  },

  /** POST /pull/apply — fetch + write Step-2 per-store in one call. */
  pullApply(req: ReversePullRequest): Promise<ReverseApplyResult> {
    return post<ReverseApplyResult>("/pull/apply", req);
  },

  // ─── Preview / apply from a supplied payload (manual / dry-run) ──────────────

  /** POST /preview — classify a payload the FE already has (Shopee manual GET, testing). */
  preview(req: ReversePreviewRequest): Promise<ReversePreview> {
    return post<ReversePreview>("/preview", req);
  },

  /** POST /apply — write Step-2 per-store from a supplied payload (non-destructive merge). */
  apply(req: ReverseApplyRequest): Promise<ReverseApplyResult> {
    return post<ReverseApplyResult>("/apply", req);
  },

  /** POST /review — classify + route by reverseWritePolicy (creates suggestions / per-store). */
  review(req: ReverseApplyRequest): Promise<ReverseReviewResult> {
    return post<ReverseReviewResult>("/review", req);
  },

  // ─── Import (use case B) — channel-native item → NEW master ─────────────────

  /** GET /import/list — browse a page of the channel catalogue (Shopify seeded). */
  async listChannelListings(params: {
    organizationId: string;
    storeId: string;
    limit?: number;
    offset?: number;
  }): Promise<ChannelListPage> {
    const qs = new URLSearchParams({
      organizationId: params.organizationId,
      storeId: params.storeId,
      limit: String(params.limit ?? 50),
      offset: String(params.offset ?? 0),
    });
    const res = await fetch(`${BASE}/import/list?${qs}`, { headers: JSON_HEADERS });
    return handleJson<ChannelListPage>(res);
  },

  /** POST /import/preview — dry-run: draftMaster + dedup matches, writes nothing. */
  importPreview(req: ReverseImportRequest): Promise<ReverseImportResult> {
    return post<ReverseImportResult>("/import/preview", req);
  },

  /** POST /import — commit: CREATE new DRAFT master (201) or LINK to existing (200). */
  importCommit(req: ReverseImportRequest): Promise<ReverseImportResult> {
    return post<ReverseImportResult>("/import", req);
  },

  // ─── Suggestions (draft-review inbox) ────────────────────────────────────────

  /** GET /suggestions?organizationId=&status= — org-wide inbox (default status PENDING). */
  async listSuggestions(
    organizationId: string,
    status: ReverseSuggestionStatus = "PENDING",
  ): Promise<ReverseSuggestion[]> {
    const qs = new URLSearchParams({ organizationId, status });
    const res = await fetch(`${BASE}/suggestions?${qs}`, { headers: JSON_HEADERS });
    return handleJson<ReverseSuggestion[]>(res);
  },

  /** GET /suggestions/count?organizationId=&status= — nav badge. */
  async countSuggestions(
    organizationId: string,
    status: ReverseSuggestionStatus = "PENDING",
  ): Promise<number> {
    const qs = new URLSearchParams({ organizationId, status });
    const res = await fetch(`${BASE}/suggestions/count?${qs}`, { headers: JSON_HEADERS });
    const body = await handleJson<{ count?: number }>(res);
    return Number(body.count ?? 0);
  },

  /** GET /suggestions/{masterProductId} — per-product PENDING suggestions. */
  async listProductSuggestions(masterProductId: string): Promise<ReverseSuggestion[]> {
    const res = await fetch(`${BASE}/suggestions/${encodeURIComponent(masterProductId)}`, {
      headers: JSON_HEADERS,
    });
    return handleJson<ReverseSuggestion[]>(res);
  },

  /** POST /suggestions/{id}/accept — ⚠️ WRITES MASTER GLOBAL. */
  acceptSuggestion(id: string): Promise<ReverseSuggestion> {
    return post<ReverseSuggestion>(`/suggestions/${encodeURIComponent(id)}/accept`, {});
  },

  /** POST /suggestions/{id}/reject — master unchanged. */
  rejectSuggestion(id: string): Promise<ReverseSuggestion> {
    return post<ReverseSuggestion>(`/suggestions/${encodeURIComponent(id)}/reject`, {});
  },

  // ─── Reverse-JOLT projection (admin/debug) ──────────────────────────────────

  /** GET /jolt-spec/{channelId} — read-only reverse-JOLT projection. */
  async getJoltSpec(channelId: string): Promise<ReverseJoltSpec> {
    const res = await fetch(`${BASE}/jolt-spec/${encodeURIComponent(channelId)}`, {
      headers: JSON_HEADERS,
    });
    return handleJson<ReverseJoltSpec>(res);
  },
};
