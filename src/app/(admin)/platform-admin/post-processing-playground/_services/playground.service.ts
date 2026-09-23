/**
 * Post-Processing Playground service.
 *
 * Wraps the BFF post-processing endpoints:
 *   GET  /post-processing/catalog → catalog of operations (for the palette + param forms)
 *   POST /post-processing/run     → runs an ordered pipeline against an input document
 *
 * Fetch / error style mirrors ProductTypeService (see
 * omni-admin/product-types/_services/product-type.service.ts).
 */

import {
  CatalogResponse,
  OperationSpec,
  PipelineStep,
  Rule,
  RunResponse,
} from "../_types/playground";

const API_ROOT =
  process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:8888/labamap/api/v1";
const BASE = `${API_ROOT}/post-processing`;
const JSON_HEADERS = { "Content-Type": "application/json" };

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? JSON.stringify(body);
    } catch {
      /* fall back to statusText */
    }
    throw new Error(`[PlaygroundService] ${res.status} ${message}`);
  }
  const text = await res.text();
  if (!text) throw new Error("[PlaygroundService] Empty response body");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`[PlaygroundService] Response was not valid JSON: ${text.slice(0, 200)}`);
  }
}

/**
 * Map a UI PipelineStep → a backend op object, recursively.
 *
 * The op is `{ op: <opCode>, ...params }`. For a CONTAINER step (one that carries
 * `children`, currently only FOR_EACH), the children are serialized into a `steps`
 * param — each child becoming its own op object via the same mapping. A container's
 * own `params.steps` (if any) is ignored: children are the single source of truth for
 * the loop body. sourcePath / targetPath stay RULE-level (see stepToRule) — FOR_EACH
 * reads them off the rule, and its op object carries only `steps` + any op params.
 */
export function stepToOp(step: PipelineStep): { op: string; [k: string]: unknown } {
  const op: { op: string; [k: string]: unknown } = { op: step.opCode };
  const hasChildren = Array.isArray(step.children);
  for (const [key, value] of Object.entries(step.params ?? {})) {
    if (value === undefined) continue;
    // Children own the `steps` param for container ops — never take it from params.
    if (hasChildren && key === "steps") continue;
    op[key] = value;
  }
  if (hasChildren) {
    op.steps = (step.children ?? []).map(stepToOp);
  }
  return op;
}

/**
 * Map a UI PipelineStep → backend Rule.
 * Each step carries exactly ONE operation (possibly containing nested `steps` for a
 * container op); its params become extra keys on the op object.
 * Empty / undefined optional fields are omitted so the request stays clean.
 */
export function stepToRule(step: PipelineStep, index: number): Rule {
  const rule: Rule = {
    name: step.name?.trim() || `${step.opCode} #${index + 1}`,
    enabled: step.enabled,
    operations: [stepToOp(step)],
  };
  if (step.sourcePath && step.sourcePath.trim()) rule.sourcePath = step.sourcePath.trim();
  if (step.targetPath && step.targetPath.trim()) rule.targetPath = step.targetPath.trim();
  return rule;
}

/** Build the full rules[] array from an ordered list of steps. */
export function stepsToRules(steps: PipelineStep[]): Rule[] {
  return steps.map(stepToRule);
}

export const PlaygroundService = {
  /** GET /post-processing/catalog — full operation catalog. */
  async getCatalog(): Promise<CatalogResponse> {
    const res = await fetch(`${BASE}/catalog`, { method: "GET", headers: JSON_HEADERS });
    const data = await handleResponse<CatalogResponse>(res);
    return {
      totalOperations: Number(data.totalOperations ?? data.operations?.length ?? 0),
      scopes: data.scopes ?? {},
      operations: Array.isArray(data.operations) ? (data.operations as OperationSpec[]) : [],
      timestamp: data.timestamp,
    };
  },

  /**
   * POST /post-processing/run — apply the pipeline to `input`.
   * NOTE: the backend stops at the first failing step and returns steps up to+including it
   * (that step carries `.error` + the last-good `.output`), with `success:false` at the top.
   */
  async run(input: Record<string, unknown>, steps: PipelineStep[]): Promise<RunResponse> {
    const body = { input, rules: stepsToRules(steps) };
    const res = await fetch(`${BASE}/run`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
    const data = await handleResponse<RunResponse>(res);
    return {
      success: Boolean(data.success),
      error: data.error,
      finalOutput: (data.finalOutput ?? {}) as Record<string, unknown>,
      steps: Array.isArray(data.steps) ? data.steps : [],
    };
  },
};
