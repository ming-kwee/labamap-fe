"use client";

/**
 * Shared param-field rendering for the pipeline editors.
 *
 * Both the List view (OpCard) and the Blocks view (BlockCanvas / BlockItem) build
 * their dynamic param forms from these primitives, so the editor kinds, JSON-buffer
 * handling, and validation all stay in one place.
 *
 * `paramKind` (in paramKind.ts) classifies each param from its declared `type` /
 * `allowedValues`; here we only render the matching control.
 */

import React, { useState } from "react";
import { OperationParamSpec, OperationSpec } from "../_types/playground";
import { ParamKind, isEmptyValue, paramKind } from "./paramKind";

/** Shared input styling for compact param controls. */
export const inputCls =
  "w-full px-2 py-1.5 border border-gray-200 dark:border-gray-700 rounded-md text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400";

/** Pretty-print a stored complex value for the JSON textarea. */
export function toJsonText(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v; // may already be raw JSON text mid-edit
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

// ─── Per-param field editor ──────────────────────────────────────────────────

export function ParamField({
  param,
  value,
  onChange,
}: {
  param: OperationParamSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const kind: ParamKind = paramKind(param);
  const [jsonError, setJsonError] = useState<string | null>(null);
  // Local buffer for JSON so the admin can type invalid intermediate states.
  const [jsonBuf, setJsonBuf] = useState<string>(() => toJsonText(value));

  const required = param.required;
  const missing = required && isEmptyValue(value) && kind !== "json";

  const label = (
    <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
      <code className="font-mono">{param.name}</code>
      {required && <span className="text-red-500 ml-0.5">*</span>}
      <span className="ml-1.5 font-normal text-gray-400">{param.type}</span>
    </label>
  );

  let control: React.ReactNode;
  switch (kind) {
    case "boolean":
      control = (
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">{Boolean(value) ? "true" : "false"}</span>
        </label>
      );
      break;
    case "number":
      control = (
        <input
          type="number"
          value={value === undefined || value === null || value === "" ? "" : Number(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className={inputCls}
          aria-label={param.name}
        />
      );
      break;
    case "select":
      control = (
        <select
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
          className={inputCls}
          aria-label={param.name}
        >
          <option value="">— select —</option>
          {(param.allowedValues ?? []).map((av) => (
            <option key={av} value={av}>{av}</option>
          ))}
        </select>
      );
      break;
    case "json":
      control = (
        <>
          <textarea
            value={jsonBuf}
            spellCheck={false}
            rows={Math.min(8, Math.max(2, jsonBuf.split("\n").length))}
            onChange={(e) => {
              const raw = e.target.value;
              setJsonBuf(raw);
              if (raw.trim() === "") {
                setJsonError(null);
                onChange(undefined);
                return;
              }
              try {
                const parsed = JSON.parse(raw);
                setJsonError(null);
                onChange(parsed);
              } catch (err) {
                setJsonError((err as Error).message);
              }
            }}
            placeholder={param.type.toLowerCase().startsWith("list") ? "[ … ]" : "{ … }"}
            className={`${inputCls} font-mono resize-y ${jsonError ? "border-red-400 dark:border-red-500 focus:ring-red-400" : ""}`}
            aria-label={param.name}
          />
          {jsonError && <p className="text-[10px] text-red-500 mt-0.5">Invalid JSON: {jsonError}</p>}
        </>
      );
      break;
    case "text":
    default:
      control = (
        <input
          type="text"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
          className={`${inputCls} ${missing ? "border-red-400 dark:border-red-500" : ""}`}
          aria-label={param.name}
        />
      );
      break;
  }

  return (
    <div>
      {label}
      {control}
      {param.description && <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{param.description}</p>}
      {missing && <p className="text-[10px] text-red-500 mt-0.5">Required.</p>}
    </div>
  );
}

/**
 * Render the full param form for a spec, honoring container ops (whose `steps` param
 * is managed elsewhere as children and must NOT get a form field here).
 */
export function ParamFields({
  spec,
  params,
  onParamChange,
  hideSteps = false,
}: {
  spec: OperationSpec;
  params: Record<string, unknown>;
  onParamChange: (name: string, v: unknown) => void;
  /** When true (container op), skip the `steps` param — children own it. */
  hideSteps?: boolean;
}) {
  const visible = (spec.params ?? []).filter((p) => !(hideSteps && p.name === "steps"));
  if (visible.length === 0) {
    return <p className="text-[11px] text-gray-400 italic">This operation takes no parameters.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-3">
      {visible.map((p) => (
        <ParamField key={p.name} param={p} value={params[p.name]} onChange={(v) => onParamChange(p.name, v)} />
      ))}
    </div>
  );
}

/** Fallback raw-JSON params editor for operations missing from the catalog. */
export function RawParamsEditor({
  params,
  onChange,
}: {
  params: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const [buf, setBuf] = useState(() => JSON.stringify(params ?? {}, null, 2));
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <textarea
        value={buf}
        spellCheck={false}
        rows={4}
        onChange={(e) => {
          const raw = e.target.value;
          setBuf(raw);
          try {
            const parsed = raw.trim() === "" ? {} : JSON.parse(raw);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              setErr(null);
              onChange(parsed as Record<string, unknown>);
            } else {
              setErr("Params must be a JSON object.");
            }
          } catch (e2) {
            setErr((e2 as Error).message);
          }
        }}
        className={`${inputCls} font-mono resize-y ${err ? "border-red-400 dark:border-red-500 focus:ring-red-400" : ""}`}
        aria-label="Raw params JSON"
      />
      {err && <p className="text-[10px] text-red-500 mt-0.5">Invalid JSON: {err}</p>}
    </>
  );
}
