/**
 * P2-K · Value Mappings Manager types.
 * Maps a master value → channel value (e.g. material "cotton" → channel code).
 * Shape verified against live GET /admin/channel-mappings (2026-07-01):
 *   { id, channelType, masterFieldName, channelFieldName, mappings[],
 *     fallbackStrategy, createdAt, updatedAt }
 * Seed source: ChannelValueMappingDataLoader (backend).
 */

export type FallbackStrategy = "PROMPT_USER" | "USE_CLOSEST" | "FREE_TEXT";

export const FALLBACK_STRATEGIES: FallbackStrategy[] = ["PROMPT_USER", "USE_CLOSEST", "FREE_TEXT"];

export const FALLBACK_LABELS: Record<FallbackStrategy, string> = {
  PROMPT_USER: "Prompt user",
  USE_CLOSEST: "Use closest",
  FREE_TEXT: "Free text",
};

/** Human-readable explanation of what each fallback does when no value matches. */
export const FALLBACK_DESCRIPTIONS: Record<FallbackStrategy, string> = {
  PROMPT_USER: "Nilai master tak dikenal → minta merchant memilih manual.",
  USE_CLOSEST: "Nilai master tak dikenal → pakai kandidat channel paling mirip.",
  FREE_TEXT: "Nilai master tak dikenal → kirim apa adanya sebagai teks bebas.",
};

export interface ValueMappingEntry {
  masterValue: string;
  channelValue: string;
  channelLabel?: string;
}

export interface ChannelValueMapping {
  id: string;
  channelType: string;
  masterFieldName: string;
  channelFieldName: string;
  mappings: ValueMappingEntry[];
  fallbackStrategy: FallbackStrategy;
  createdAt?: string;
  updatedAt?: string;
}

/** Create/update body (id/timestamps managed by backend). */
export interface ChannelValueMappingRequest {
  channelType: string;
  masterFieldName: string;
  channelFieldName: string;
  mappings: ValueMappingEntry[];
  fallbackStrategy: FallbackStrategy;
}

export interface ValueMappingListParams {
  channelType?: string;
  masterFieldName?: string;
  page?: number;
  size?: number;
}

// ─── mapper (defensive against missing fields) ──────────────────────────────

export function mapRawValueMapping(raw: unknown): ChannelValueMapping {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawMappings = Array.isArray(r.mappings) ? (r.mappings as Record<string, unknown>[]) : [];
  return {
    id: String(r.id ?? ""),
    channelType: String(r.channelType ?? ""),
    masterFieldName: String(r.masterFieldName ?? ""),
    channelFieldName: String(r.channelFieldName ?? ""),
    mappings: rawMappings.map((m) => ({
      masterValue: String(m.masterValue ?? ""),
      channelValue: String(m.channelValue ?? ""),
      channelLabel: m.channelLabel != null ? String(m.channelLabel) : undefined,
    })),
    fallbackStrategy: (FALLBACK_STRATEGIES.includes(r.fallbackStrategy as FallbackStrategy)
      ? (r.fallbackStrategy as FallbackStrategy)
      : "PROMPT_USER"),
    createdAt: r.createdAt ? String(r.createdAt) : undefined,
    updatedAt: r.updatedAt ? String(r.updatedAt) : undefined,
  };
}
