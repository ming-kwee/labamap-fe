/**
 * Pure resolver for the P1-M Cascade Outcome badge (no React/next imports →
 * unit-testable). Maps the cascade block of the APM /analyze response to a
 * badge descriptor. Spec: FRONTEND-ADDENDUM-2026-07-02.md §4.
 */

export interface CascadeOutcome {
  escalatedToAgent?: boolean;
  agentStatus?: string; // AUTO_APPLIED | RECOMMENDATION_CREATED | MANUAL_REVIEW_REQUIRED | AGENT_FAILED | FALLBACK_APM
  agentJoltSpecId?: string;
  aiAgentSessionId?: string;
  aiEnriched?: boolean;
  aiConfidenceDelta?: number;
  aiCorrectedFields?: string[];
  aiGapsFilled?: string[];
  aiChannelRequiredUnmapped?: string[];
  aiWarnings?: string[];
}

export type CascadeKind =
  | "apm"
  | "ai_auto"
  | "ai_review"
  | "ai_manual"
  | "fallback_apm"
  | "ai_failed"
  | "ai_other";

export interface CascadeVariant {
  kind: CascadeKind;
  label: string;
  title: string;
}

/** Returns null when the response has no cascade data (cascade off / old response). */
export function resolveCascadeVariant(o: CascadeOutcome): CascadeVariant | null {
  if (o.escalatedToAgent === undefined && !o.agentStatus) return null;

  if (o.escalatedToAgent === false) {
    return {
      kind: "apm",
      label: "APM",
      title: "Diselesaikan oleh Adaptive Pattern Matching (murah, instan) — tanpa memanggil agent AI.",
    };
  }

  switch (o.agentStatus) {
    case "AUTO_APPLIED":
      return { kind: "ai_auto", label: "AI (auto)", title: "Agent AI menghasilkan JOLT dengan confidence tinggi dan langsung diterapkan." };
    case "RECOMMENDATION_CREATED":
      return { kind: "ai_review", label: "AI → perlu review", title: "Agent AI membuat rekomendasi — menunggu keputusan manusia di Review Queue." };
    case "MANUAL_REVIEW_REQUIRED":
      return { kind: "ai_manual", label: "AI → review manual", title: "Confidence agent rendah — perlu review/keputusan manual." };
    case "FALLBACK_APM":
      return { kind: "fallback_apm", label: "AI timeout → fallback APM", title: "Agent tak sempat menyelesaikan (timeout) — APM yang dipakai. Naikkan AI_CASCADE_TIMEOUT_SECONDS atau pakai LLM berbayar." };
    case "AGENT_FAILED":
      return { kind: "ai_failed", label: "AI gagal → APM", title: "Agent gagal (lihat sesi untuk penyebab) — hasil APM yang dipakai." };
    default:
      return { kind: "ai_other", label: "AI", title: `Dieskalasi ke agent AI (status: ${o.agentStatus ?? "?"}).` };
  }
}
