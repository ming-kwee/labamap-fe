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

import { v4 as uuidv4 } from "uuid";
import {
  CatalogResponse,
  OperationSpec,
  PipelineStep,
  Rule,
  RunResponse,
} from "../_types/playground";
import { tracePublish } from "@/modules/ecommerce-product-v2/services/publish-trace.service";

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

// ─── Real-config loading: Rule[] → PipelineStep[] (inverse of stepsToRules) ───

/** A raw op object `{op, ...params, steps?}` → a PipelineStep (recursive for FOR_EACH). */
function opToStep(op: Record<string, unknown>, rule: ChannelRule, opLabel: string): PipelineStep {
  const opCode = String(op.op ?? "");
  const params: Record<string, unknown> = {};
  let children: PipelineStep[] | undefined;
  for (const [k, v] of Object.entries(op)) {
    if (k === "op") continue;
    // sourcePath/targetPath are RULE-level (captured below from `rule`); some seeds also emit them
    // at the op level (often null) — don't leak them into the op's params.
    if (k === "sourcePath" || k === "targetPath") continue;
    if (k === "steps" && Array.isArray(v)) {
      // Container op (FOR_EACH): nested per-item ops become children, not a `steps` param.
      children = (v as Record<string, unknown>[]).map((child) => opToStep(child, rule, String(child.op ?? "")));
      continue;
    }
    params[k] = v;
  }
  return {
    id: uuidv4(),
    opCode,
    params,
    sourcePath: typeof rule.sourcePath === "string" ? rule.sourcePath : undefined,
    targetPath: typeof rule.targetPath === "string" ? rule.targetPath : undefined,
    enabled: rule.enabled !== false,
    name: opLabel,
    ...(children ? { children } : {}),
  };
}

/** One real post-processing rule from a channel config (for the rule picker + loading). */
export interface ChannelRule {
  name?: string;
  sourcePath?: string;
  targetPath?: string;
  priority?: number;
  enabled?: boolean;
  operations?: Record<string, unknown>[];
}

/**
 * Map a channel's real {@code postProcessingRules} → editable PipelineSteps.
 * - Rules are sorted by priority (mirrors the engine's execution order).
 * - A multi-operation rule is FLATTENED: each op becomes its own step (a puzzle piece),
 *   carrying the rule's sourcePath/targetPath/enabled; the step name is the rule name
 *   (suffixed with the op code when a rule has more than one op). Running N single-op
 *   rules sequentially with the same paths is equivalent to one N-op rule.
 * - FOR_EACH's nested `steps` become the step's `children` (per-item leaves).
 */
export function rulesToSteps(rawRules: ChannelRule[]): PipelineStep[] {
  const sorted = [...(rawRules ?? [])].sort(
    (a, b) => (a.priority ?? 100) - (b.priority ?? 100),
  );
  const steps: PipelineStep[] = [];
  for (const rule of sorted) {
    const ops = Array.isArray(rule.operations) ? rule.operations : [];
    const base = rule.name?.trim() || "rule";
    for (const op of ops) {
      const label = ops.length > 1 ? `${base} · ${String(op.op ?? "op")}` : base;
      steps.push(opToStep(op, rule, label));
    }
  }
  return steps;
}

/** A pickable channel (for "Load real config"). */
export interface ChannelOption {
  channelId: string;
  name: string;
  ruleCount: number;
}

const CHANNEL_CONFIGS = `${API_ROOT}/admin/channel-configurations`;

/** A pickable existing product (for the "From My Products" input mode). */
export interface ProductOption {
  id: string;
  name: string;
}

const ADMIN_PRODUCTS = `${API_ROOT}/admin/master-products`;

export const PlaygroundService = {
  /**
   * GET /admin/master-products — list existing products for the picker (id + name only).
   * Mirrors what Publish Diagnostics uses so "From My Products" feels the same.
   */
  async listProducts(orgId: string): Promise<ProductOption[]> {
    if (!orgId) return [];
    const qs = new URLSearchParams({ organizationId: orgId, page: "0", size: "200" });
    const res = await fetch(`${ADMIN_PRODUCTS}?${qs}`, { method: "GET", headers: JSON_HEADERS });
    const data = await handleResponse<{ content?: unknown[] } | unknown[]>(res);
    const arr = Array.isArray(data) ? data : Array.isArray(data.content) ? data.content : [];
    return (arr as Record<string, unknown>[])
      .map((p) => ({
        id: String(p.productId ?? p.id ?? ""),
        name: String(p.name ?? p.productId ?? p.id ?? "untitled"),
      }))
      .filter((p) => p.id);
  },

  /**
   * GET /admin/master-products/{id} — load a product's real fields as a playground input document.
   * Returns the flat {@code productAttributes} merged with {@code variants} (the shape publish sees),
   * so testing is against real data. Non-object attributes are ignored defensively.
   */
  async getProductInput(productId: string, orgId: string): Promise<Record<string, unknown>> {
    const qs = new URLSearchParams({ organizationId: orgId });
    const res = await fetch(`${ADMIN_PRODUCTS}/${encodeURIComponent(productId)}?${qs}`, {
      method: "GET",
      headers: JSON_HEADERS,
    });
    const doc = await handleResponse<Record<string, unknown>>(res);
    const attrs =
      doc.productAttributes && typeof doc.productAttributes === "object"
        ? { ...(doc.productAttributes as Record<string, unknown>) }
        : {};
    if (Array.isArray(doc.variants) && doc.variants.length > 0) {
      (attrs as Record<string, unknown>).variants = doc.variants;
    }
    return attrs;
  },

  /**
   * GET /admin/channel-configurations — channels with a post-processing rule count,
   * for the "Load real config" picker. Sorted by name.
   */
  async listChannels(): Promise<ChannelOption[]> {
    const res = await fetch(CHANNEL_CONFIGS, { method: "GET", headers: JSON_HEADERS });
    const data = await handleResponse<unknown[]>(res);
    const arr = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    return arr
      .map((c) => ({
        channelId: String(c.channelId ?? c.id ?? ""),
        name: String(c.channelName ?? c.displayName ?? c.channelId ?? "channel"),
        ruleCount: Array.isArray(c.postProcessingRules) ? c.postProcessingRules.length : 0,
      }))
      .filter((c) => c.channelId)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * GET /admin/channel-configurations/{channelId} — the channel's REAL postProcessingRules,
   * priority-sorted, for the rule picker. The admin then chooses which rules to load; the
   * chosen subset is mapped to PipelineSteps via {@link rulesToSteps}.
   */
  async getChannelRules(channelId: string): Promise<ChannelRule[]> {
    const res = await fetch(`${CHANNEL_CONFIGS}/${encodeURIComponent(channelId)}`, {
      method: "GET",
      headers: JSON_HEADERS,
    });
    const cfg = await handleResponse<{ postProcessingRules?: unknown[] }>(res);
    const raw = Array.isArray(cfg.postProcessingRules) ? (cfg.postProcessingRules as ChannelRule[]) : [];
    return [...raw].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  },

  /**
   * Faithful input via the publish trace (Phase 2): dry-run the REAL pipeline (JOLT + staging) for this
   * product+channel and return the exact post-processing input (`beforePostProcessing`) plus the real
   * result (`afterPostProcessing`) to validate the playground output against. Read-only (nothing published).
   * `beforePostProcessing` requires the updated BFF (restart) — undefined if unavailable.
   */
  async traceRealScenario(
    productId: string,
    channelId: string,
    masterProductData: Record<string, unknown>,
  ): Promise<{
    input: Record<string, unknown> | null;
    expectedOutput: Record<string, unknown> | null;
    warnings: string[];
  }> {
    const res = await tracePublish({ masterProductId: productId, channelId, masterProductData });
    return {
      input: (res.beforePostProcessing ?? null) as Record<string, unknown> | null,
      expectedOutput: (res.afterPostProcessing ?? null) as Record<string, unknown> | null,
      warnings: Array.isArray(res.warnings) ? res.warnings : [],
    };
  },

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
