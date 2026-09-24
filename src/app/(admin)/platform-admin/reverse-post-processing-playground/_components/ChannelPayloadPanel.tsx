"use client";

/**
 * ChannelPayloadPanel — the middle panel: the fetched channel payload, EDITABLE.
 *
 * Mirrors the forward InputPanel editor: the Raw textarea is the source of truth (so the
 * payload can be tweaked and the reverse pipeline re-run), with a Tree ⇄ Raw toggle for
 * read-only inspection and find-in-JSON on the raw view. Validity indicator + Format/Clear.
 *
 * The parse (value/error) lives in the parent, which drives the debounced preview.
 */

import React from "react";
import { useTextFind, FindBar, FindToggle } from "@/app/(admin)/platform-admin/post-processing-playground/_components/useTextFind";
import JsonTree from "@/app/(admin)/platform-admin/post-processing-playground/_components/JsonTree";

const CheckIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>);
const AlertIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>);

const btnCls =
  "inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";

export default function ChannelPayloadPanel({
  text,
  onTextChange,
  parseError,
  parsedValue,
  loaded,
}: {
  text: string;
  onTextChange: (t: string) => void;
  parseError: string | null;
  parsedValue: Record<string, unknown> | null;
  /** false before the first pull → shows the empty-state hint. */
  loaded: boolean;
}) {
  const find = useTextFind(text);
  const [view, setView] = React.useState<"raw" | "tree">("raw");

  const valid = parseError === null && text.trim() !== "";

  const handleFormat = () => {
    try {
      onTextChange(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      /* leave as-is; the validity indicator already flags it */
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Panel header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Channel payload</h2>
          {text.trim() === "" ? (
            <span className="text-[11px] text-gray-400">empty</span>
          ) : valid ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
              <CheckIcon /> valid
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 dark:text-red-400">
              <AlertIcon /> invalid
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5">
            {(["raw", "tree"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-md capitalize transition-colors ${
                  view === v ? "bg-blue-600 text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          {view === "raw" && <FindToggle find={find} />}
          <button onClick={handleFormat} className={btnCls} title="Pretty-print (2-space)">Format</button>
          <button onClick={() => onTextChange("")} className={btnCls} title="Clear payload">Clear</button>
        </div>
      </div>

      {/* Body */}
      {!loaded && text.trim() === "" ? (
        <div className="flex-1 min-h-0 flex items-center justify-center text-[11px] text-gray-400 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
          Load a channel product to see its payload.
        </div>
      ) : view === "tree" && parsedValue ? (
        <div className="flex-1 min-h-0 overflow-auto">
          <JsonTree data={parsedValue} />
        </div>
      ) : (
        <>
          {view === "raw" && find.open && <FindBar find={find} />}
          <textarea
            ref={find.ref}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            spellCheck={false}
            placeholder='{ "title": "…", … }'
            aria-label="Channel payload JSON"
            aria-invalid={!valid && text.trim() !== ""}
            className={`flex-1 min-h-0 w-full resize-none font-mono text-xs leading-relaxed p-3 rounded-lg border bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 ${
              !valid && text.trim() !== ""
                ? "border-red-400 dark:border-red-500"
                : "border-gray-200 dark:border-gray-700"
            }`}
          />
        </>
      )}

      {/* Parse error */}
      {parseError && text.trim() !== "" && (
        <div className="mt-2 shrink-0 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[11px] text-red-700 dark:text-red-400 font-mono">
          {parseError}
        </div>
      )}
    </div>
  );
}
