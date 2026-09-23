/**
 * Shared helpers for mapping catalog param `type` strings → an editor kind, and for
 * seeding a new PipelineStep from an operation's `jsonExample`.
 *
 * Data-driven only: we branch on the spec's declared `type` / `allowedValues`,
 * never on the param NAME.
 */

import { OperationParamSpec, OperationSpec, OpScope, PipelineStep } from "../_types/playground";

export type ParamKind = "boolean" | "number" | "select" | "text" | "json";

/**
 * Data-driven container detection: an op is a CONTAINER (a C-block whose "mouth"
 * holds child ops) iff it declares a param named `steps` (a `List<Map>` of nested
 * ops). Currently only FOR_EACH matches. We branch on the param NAME here on purpose
 * — `steps` is the catalog's own contract for a nested-op body, not domain vocabulary.
 */
export function isContainerOp(spec: OperationSpec | undefined | null): boolean {
  return Boolean(spec?.params?.some((p) => p.name === "steps"));
}

/**
 * Tailwind color-theme classes per scope, for the Scratch-style Blocks view.
 * Color-codes blocks so the editor reads like a kid's block language:
 *   LIST / loop = amber, DOCUMENT = indigo, PER_ITEM = emerald.
 */
export interface ScopeTheme {
  /** Block header background + text. */
  header: string;
  /** Block body / card background. */
  body: string;
  /** Border color. */
  border: string;
  /** Left accent (used for the FOR_EACH mouth / notch). */
  accent: string;
  /** Small scope pill. */
  pill: string;
}

const SCOPE_THEMES: Record<OpScope, ScopeTheme> = {
  DOCUMENT: {
    header: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
    body: "bg-indigo-50/60 dark:bg-indigo-900/10",
    border: "border-indigo-300 dark:border-indigo-700",
    accent: "border-indigo-400 dark:border-indigo-600",
    pill: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200",
  },
  LIST: {
    header: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    body: "bg-amber-50/60 dark:bg-amber-900/10",
    border: "border-amber-300 dark:border-amber-700",
    accent: "border-amber-400 dark:border-amber-600",
    pill: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  },
  PER_ITEM: {
    header: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    body: "bg-emerald-50/60 dark:bg-emerald-900/10",
    border: "border-emerald-300 dark:border-emerald-700",
    accent: "border-emerald-400 dark:border-emerald-600",
    pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
};

const NEUTRAL_THEME: ScopeTheme = {
  header: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200",
  body: "bg-white dark:bg-gray-900",
  border: "border-gray-300 dark:border-gray-700",
  accent: "border-gray-400 dark:border-gray-600",
  pill: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

/** Tailwind color theme for a scope (falls back to a neutral gray theme). */
export function scopeTheme(scope: OpScope | undefined | null): ScopeTheme {
  return (scope && SCOPE_THEMES[scope]) || NEUTRAL_THEME;
}

/**
 * Classify how a param should be edited, from its declared type + allowedValues.
 * A non-empty `allowedValues` always wins → a <select>.
 */
export function paramKind(param: OperationParamSpec): ParamKind {
  if (param.allowedValues && param.allowedValues.length > 0) return "select";
  const t = (param.type ?? "").toLowerCase();
  if (t.includes("bool")) return "boolean";
  if (t === "int" || t === "integer" || t === "long" || t === "double" || t === "float" || t === "number") {
    return "number";
  }
  // Complex / structured types get a JSON textarea.
  if (t.startsWith("list") || t.startsWith("map") || t.includes("object") || t.includes("[]")) {
    return "json";
  }
  // "String" and anything unknown/scalar → plain text.
  if (t === "string" || t === "" || t.includes("string") || t.includes("char")) return "text";
  return "text";
}

/** True when a value is "empty" for required-validation purposes. */
export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * Build the initial params for a step, honoring each param's defaultValue.
 * (Used when adding an op that has no jsonExample.)
 */
export function defaultParams(spec: OperationSpec): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const p of spec.params ?? []) {
    if (p.defaultValue !== undefined && p.defaultValue !== null) {
      params[p.name] = p.defaultValue;
    }
  }
  return params;
}

/**
 * Seed a fresh PipelineStep from an operation spec, pre-filling params from its
 * `jsonExample` when present (stripping the `op` key). Any example keys that match a
 * declared param name become params; unknown keys are dropped (they may be paths the
 * admin should set explicitly). Missing params fall back to their declared defaults.
 */
export function seedStepFromSpec(spec: OperationSpec, id: string): PipelineStep {
  const params = defaultParams(spec);
  const paramNames = new Set((spec.params ?? []).map((p) => p.name));
  const example = spec.jsonExample ?? {};
  const container = isContainerOp(spec);

  for (const [key, value] of Object.entries(example)) {
    if (key === "op") continue;
    // For a container op the `steps` param is managed by `children`, never params —
    // don't seed it from defaults or the example.
    if (container && key === "steps") continue;
    if (paramNames.has(key)) params[key] = value;
  }
  // Belt-and-braces: a container default may have set `steps` above.
  if (container) delete params.steps;

  return {
    id,
    opCode: spec.opCode,
    params,
    sourcePath: "",
    targetPath: "",
    enabled: true,
    name: "",
    // Container ops start with an empty mouth; leaves get no children key.
    ...(container ? { children: [] } : {}),
  };
}
