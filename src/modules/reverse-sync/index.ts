/**
 * Reverse Sync (Channel → Platform) — public module surface.
 *
 * Reverse pulls product data FROM a channel back INTO the platform (the inverse of
 * publish), classifying every incoming field into master-mapped / channel-only /
 * discarded before writing. BFF-only; master global is only changed via an explicit
 * Accept in the Suggestions inbox. See docs/FRONTEND-REVERSE-SYNC-IMPLEMENTATION-PLAN.md.
 */

// Types
export * from "./types/reverse";

// Service
export { ReverseSyncService, ReverseApiError, isNotConfigured } from "./services/reverse.service";

// Hooks
export { useReversePull } from "./hooks/useReversePull";
export { useReverseSuggestions } from "./hooks/useReverseSuggestions";
export type { UseReverseSuggestionsResult } from "./hooks/useReverseSuggestions";
export { useReverseImport } from "./hooks/useReverseImport";

// Components
export { ReverseDiffField } from "./components/ReverseDiffField";
export { ReverseBucketSection } from "./components/ReverseBucketSection";
export { ReverseSummaryBar } from "./components/ReverseSummaryBar";
export { DeDerivationNotes } from "./components/DeDerivationNotes";
export { ReversePreviewModal } from "./components/ReversePreviewModal";
export { ImportPreviewModal } from "./components/ImportPreviewModal";
export { SuggestionCard } from "./components/SuggestionCard";
export { ReverseStatusBadge, hasChannelUpdate } from "./components/ReverseStatusBadge";
export { formatReverseValue, isEmptyValue } from "./components/format";
