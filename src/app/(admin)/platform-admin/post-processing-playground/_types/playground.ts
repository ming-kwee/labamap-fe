/**
 * Post-Processing Playground types.
 *
 * Mirrors the BFF contract:
 *   GET  /post-processing/catalog → CatalogResponse
 *   POST /post-processing/run     → RunResponse   (body: { input, rules })
 *
 * A "puzzle piece" in the UI is a {@link PipelineStep}: exactly ONE operation plus
 * optional rule-level sourcePath / targetPath. When we call /run, each PipelineStep
 * is mapped to a backend {@link Rule} carrying a single-element `operations` array.
 */

// ─── Catalog (GET /post-processing/catalog) ─────────────────────────────────

export type OpScope = "DOCUMENT" | "LIST" | "PER_ITEM";

export const OP_SCOPES: OpScope[] = ["DOCUMENT", "LIST", "PER_ITEM"];

/** One parameter accepted by an operation, as described by the catalog. */
export interface OperationParamSpec {
  name: string;
  /** e.g. "String" | "Integer" | "Object" | "Boolean" | "List<Map>" | "List<String>" | "Map" | … */
  type: string;
  required: boolean;
  defaultValue?: unknown;
  allowedValues?: string[];
  description?: string;
}

/** One post-processing operation, as described by the catalog. */
export interface OperationSpec {
  opCode: string;
  scope: OpScope;
  description: string;
  params: OperationParamSpec[];
  /** A representative rule fragment, e.g. { op:"SET_FIELD", path:"…", value:"…" }. */
  jsonExample?: Record<string, unknown>;
  inputExample?: unknown;
  outputExample?: unknown;
  exampleCaption?: string;
}

export interface CatalogResponse {
  totalOperations: number;
  scopes: Partial<Record<OpScope, number>>;
  operations: OperationSpec[];
  timestamp?: string;
}

// ─── Run (POST /post-processing/run) ────────────────────────────────────────

/** A backend rule — an ordered bundle of operations sharing a source/target path. */
export interface Rule {
  name?: string;
  sourcePath?: string;
  targetPath?: string;
  enabled?: boolean;
  operations: Array<{ op: string; [param: string]: unknown }>;
}

export interface RunRequest {
  input: Record<string, unknown>;
  rules: Rule[];
}

/** Result of applying a single rule/step, as returned by /run. */
export interface RunStep {
  index: number;
  name: string;
  ops: string[];
  sourcePath?: string;
  targetPath?: string;
  output: Record<string, unknown>;
  keysAdded?: string[];
  keysRemoved?: string[];
  skipped?: boolean;
  error?: string;
}

export interface RunResponse {
  success: boolean;
  error?: string;
  finalOutput: Record<string, unknown>;
  steps: RunStep[];
}

// ─── FE model ───────────────────────────────────────────────────────────────

/**
 * A single "puzzle piece" in the pipeline builder: exactly ONE operation, plus
 * the rule-level paths and enable flag. `params` holds already-parsed values
 * (complex params are stored as parsed objects/arrays, not JSON strings).
 */
export interface PipelineStep {
  /** Stable client-side id (uuid) — used as React key + for reorder/remove. */
  id: string;
  opCode: string;
  params: Record<string, unknown>;
  sourcePath?: string;
  targetPath?: string;
  enabled: boolean;
  name?: string;
  /**
   * Child steps of a container op (currently only FOR_EACH). Populated ONLY for
   * container ops — each child is a PER_ITEM leaf applied to every array item.
   * Serialized into the op's `steps` param (see stepToOp in playground.service).
   * Non-container steps leave this undefined.
   */
  children?: PipelineStep[];
}
