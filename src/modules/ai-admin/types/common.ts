/**
 * AI Admin Console — shared types & error model.
 *
 * These types back the operator-facing AI screens (Phase 1: P0-A … P0-D).
 * Contracts are taken verbatim from live backend responses under
 * `/api/v1/admin/ai/*` (probed 2026-07-01) and the specs under
 * `docs/ai/frontend/`.
 */

// ─── RAG source types ───────────────────────────────────────────────────────

export type SourceType = "JOLT_SPEC" | "FIELD_MAPPING" | "SEMANTIC_KNOWLEDGE";

export const SOURCE_TYPES: SourceType[] = [
  "JOLT_SPEC",
  "FIELD_MAPPING",
  "SEMANTIC_KNOWLEDGE",
];

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  JOLT_SPEC: "JOLT Spec",
  FIELD_MAPPING: "Field Mapping",
  SEMANTIC_KNOWLEDGE: "Semantic Knowledge",
};

/** Reindex / cleanup endpoints accept ALL as well as a single type. */
export type SourceTypeOrAll = SourceType | "ALL";

// ─── Pagination (all 6 admin list endpoints share this shape) ───────────────

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
}

// ─── Error model ─────────────────────────────────────────────────────────────
//
// The recommendations doc (§5) is explicit: never surface a bare "0" or a raw
// stack trace. We classify failures so each screen can render an actionable
// message ("server down" vs "session expired" vs "quota" vs "not found").

export type AiErrorKind =
  | "server_down" // connection refused / network — AI backend unreachable
  | "auth" // 401 / 403 — token invalid or missing
  | "not_found" // 404
  | "http" // other 4xx / 5xx with a message
  | "aborted" // request cancelled by the caller or client-side timeout
  | "unknown";

export class AiApiError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;

  constructor(message: string, kind: AiErrorKind, status?: number) {
    super(message);
    this.name = "AiApiError";
    this.kind = kind;
    this.status = status;
  }

  /** Human-friendly, actionable summary for banners. */
  get friendly(): string {
    switch (this.kind) {
      case "server_down":
        return "AI server tidak dapat dihubungi (connection refused). Pastikan backend berjalan di port 8888.";
      case "auth":
        return "Sesi berakhir atau tidak diizinkan. Silakan masuk kembali sebagai admin.";
      case "not_found":
        return this.message || "Data tidak ditemukan.";
      case "aborted":
        return this.message || "Permintaan dibatalkan.";
      default:
        return this.message;
    }
  }
}
