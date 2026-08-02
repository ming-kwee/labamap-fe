/**
 * Post-processing op catalog — the engine's source of truth for what each op does.
 * GET /post-processing/catalog returns every op the ChannelPublishService engine can run,
 * with its params and a real jsonExample. We use it to show a developer what a gap's
 * `suggestedOp` actually produces, instead of guessing.
 *
 * Note: a gap suggestion's `suggestedOp` is best-effort (derived from a precedent rule) and
 * may NOT exist in this catalog (e.g. an op configured on another channel but not yet
 * implemented in the engine switch). Callers must handle the "not in catalog" case honestly.
 */
export interface PostProcessingOpParam {
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: unknown;
  allowedValues?: unknown[];
  description?: string;
}

export interface PostProcessingOp {
  opCode: string;
  scope?: string; // DOCUMENT | PER_ITEM | LIST | LEGACY
  description?: string;
  params?: PostProcessingOpParam[];
  jsonExample?: unknown; // e.g. { "op": "BUILD_ATTRIBUTE_LIST" }
}

export interface PostProcessingCatalog {
  totalOperations?: number;
  scopes?: Record<string, number>;
  operations: PostProcessingOp[];
  timestamp?: string;
}
