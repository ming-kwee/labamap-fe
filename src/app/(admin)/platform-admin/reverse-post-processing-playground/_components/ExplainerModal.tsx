"use client";

/**
 * ExplainerModal — a centered "what's this?" modal that explains a pipeline op or an output section
 * slowly and clearly. z above the app header (like OpPalette). Read-only, purely educational.
 */

import React, { useEffect } from "react";
import JsonTree from "@/app/(admin)/platform-admin/post-processing-playground/_components/JsonTree";
import type { ReverseParamSpec } from "@/modules/reverse-sync";
import type { Explainer } from "./explainers";

const CloseIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>);

export interface ExplainerContent extends Explainer {
  /** Optional stage badge (for ops). */
  stage?: string;
  /** Optional param docs (for ops — from the reverse op catalog). */
  params?: ReverseParamSpec[];
  /** Optional representative example (for ops — from the catalog). */
  example?: unknown;
}

export default function ExplainerModal({
  content,
  onClose,
}: {
  content: ExplainerContent | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!content) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [content, onClose]);

  if (!content) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-start justify-center p-4 pt-24 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={content.title}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{content.title}</h3>
              {content.stage && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
                  {content.stage} stage
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{content.summary}</p>
          </div>
          <button onClick={onClose} className="shrink-0 p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto px-5 py-4 space-y-4">
          {/* Slow explanation */}
          <div className="space-y-2">
            {content.detail.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{p}</p>
            ))}
          </div>

          {/* How to read it */}
          {content.how && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-900/40 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300 mb-0.5">How to read it</p>
              <p className="text-xs leading-relaxed text-blue-800 dark:text-blue-200">{content.how}</p>
            </div>
          )}

          {/* Params (ops) */}
          {content.params && content.params.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Params</p>
              <div className="space-y-1">
                {content.params.map((p) => (
                  <div key={p.name} className="text-xs leading-snug">
                    <span className="font-mono font-medium text-gray-700 dark:text-gray-200">{p.name}</span>
                    <span className="text-gray-400"> · {p.type}{p.required ? " · required" : ""}</span>
                    {p.description && <span className="text-gray-500 dark:text-gray-400"> — {p.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Example (ops) */}
          {content.example != null && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Example config</p>
              <JsonTree data={content.example} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
