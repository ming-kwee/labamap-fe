"use client";

import React from "react";

const InfoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

/**
 * Amber info panel for reverse "de-derivation notes" — structures that could not be
 * safely un-built (Shopee `model` tier_index, etc.). These are informative, NOT errors:
 * reverse never guesses, so the structure is simply left un-imported.
 */
export function DeDerivationNotes({ notes }: { notes: string[] }) {
  if (!notes || notes.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/25 dark:bg-amber-500/[0.08]">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
        <InfoIcon />
        <span className="text-sm font-semibold">
          De-derivation notes ({notes.length})
        </span>
      </div>
      <p className="mt-1 text-xs text-amber-600/90 dark:text-amber-400/80">
        Structures reverse could not safely un-build — left un-imported (not an error).
      </p>
      <ul className="mt-2 space-y-1">
        {notes.map((note, i) => (
          <li key={i} className="flex gap-2 text-xs text-amber-800 dark:text-amber-200">
            <span className="text-amber-400">•</span>
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default DeDerivationNotes;
