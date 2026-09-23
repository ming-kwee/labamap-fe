"use client";

/**
 * Shared find-in-text for the playground's JSON <textarea>s (input + output).
 * Native selection + line-based scroll — no code-editor dependency. Case-insensitive.
 *
 * Usage:
 *   const find = useTextFind(text);
 *   <FindToggle find={find} />                     // in a header
 *   {find.open && <FindBar find={find} />}         // above the editor
 *   <textarea ref={find.ref} value={text} … />
 */

import React, { useCallback, useMemo, useRef, useState } from "react";

const SearchIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>);
const UpIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>);
const DownIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>);
const CloseIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>);

export interface TextFind {
  ref: React.RefObject<HTMLTextAreaElement | null>;
  open: boolean;
  setOpen: (v: boolean) => void;
  query: string;
  setQuery: (v: string) => void;
  active: number;
  setActive: (v: number) => void;
  matches: number[];
  jumpTo: (idx: number) => void;
  wholeWord: boolean;
  setWholeWord: (v: boolean) => void;
}

/** A "word" char for whole-word matching — includes JSON-ish identifier chars (letters, digits, _, -). */
function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_-]/.test(ch);
}

export function useTextFind(text: string): TextFind {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [wholeWord, setWholeWord] = useState(false);

  const matches = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return [] as number[];
    const hay = text.toLowerCase();
    const out: number[] = [];
    let i = hay.indexOf(q);
    while (i !== -1) {
      const before = i > 0 ? hay[i - 1] : undefined;
      const after = hay[i + q.length];
      // Whole word: the char just before and after the match must NOT be word chars.
      if (!wholeWord || (!isWordChar(before) && !isWordChar(after))) out.push(i);
      i = hay.indexOf(q, i + Math.max(1, q.length));
    }
    return out;
  }, [query, text, wholeWord]);

  const jumpTo = useCallback(
    (idx: number) => {
      const ta = ref.current;
      if (!ta || matches.length === 0) return;
      const i = ((idx % matches.length) + matches.length) % matches.length;
      setActive(i);
      const start = matches[i];
      ta.focus();
      ta.setSelectionRange(start, start + query.length);
      const line = text.slice(0, start).split("\n").length - 1;
      const lh = parseFloat(getComputedStyle(ta).lineHeight) || 16;
      ta.scrollTop = Math.max(0, line * lh - ta.clientHeight / 2);
    },
    [matches, query.length, text],
  );

  return { ref, open, setOpen, query, setQuery, active, setActive, matches, jumpTo, wholeWord, setWholeWord };
}

const toggleCls =
  "inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";

/** The 🔍 toggle button for a header. */
export function FindToggle({ find }: { find: TextFind }) {
  return (
    <button
      onClick={() => find.setOpen(!find.open)}
      className={`${toggleCls} ${find.open ? "bg-gray-100 dark:bg-gray-800" : ""}`}
      title="Find in JSON"
      aria-pressed={find.open}
    >
      <SearchIcon />
    </button>
  );
}

/** The find row (query input + count + prev/next/close). Render above the textarea when open. */
export function FindBar({ find }: { find: TextFind }) {
  const { query, setQuery, setActive, active, matches, jumpTo, setOpen, wholeWord, setWholeWord } = find;
  return (
    <div className="mb-2 shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1">
      <span className="text-gray-400"><SearchIcon /></span>
      <input
        autoFocus
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(-1); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) jumpTo(active < 0 ? matches.length - 1 : active - 1);
            else jumpTo(active < 0 ? 0 : active + 1);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Find field… (Enter to jump, Shift+Enter back)"
        aria-label="Find in JSON"
        className="flex-1 min-w-0 bg-transparent text-xs font-mono text-gray-800 dark:text-gray-200 focus:outline-none placeholder:text-gray-400"
      />
      <button
        onClick={() => { setWholeWord(!wholeWord); setActive(-1); }}
        className={`shrink-0 w-6 h-6 flex items-center justify-center rounded text-[11px] font-semibold border transition-colors ${
          wholeWord
            ? "bg-brand-500 text-white border-brand-500"
            : "border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
        title="Whole word only"
        aria-label="Whole word only"
        aria-pressed={wholeWord}
      >
        W
      </button>
      <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
        {query ? `${matches.length ? active + 1 : 0}/${matches.length}` : ""}
      </span>
      <button onClick={() => jumpTo(active < 0 ? matches.length - 1 : active - 1)} disabled={matches.length === 0} className="shrink-0 p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed" title="Previous match" aria-label="Previous match"><UpIcon /></button>
      <button onClick={() => jumpTo(active < 0 ? 0 : active + 1)} disabled={matches.length === 0} className="shrink-0 p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed" title="Next match" aria-label="Next match"><DownIcon /></button>
      <button onClick={() => { setOpen(false); setQuery(""); }} className="shrink-0 p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Close" aria-label="Close search"><CloseIcon /></button>
    </div>
  );
}
