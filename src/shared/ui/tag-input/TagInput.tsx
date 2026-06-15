"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// ─── Validation (mirrors backend rule) ───────────────────────────────────────

const TAG_RE = /^[a-z0-9][a-z0-9-]{1,49}$/;  // min 2 chars, max 50

export function normalizeTag(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
}

export function isValidTag(t: string): boolean {
  return TAG_RE.test(t);
}

// ─── Icons ───────────────────────────────────────────────────────────────────

const XIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);
const TagIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/>
    <path d="M7 7h.01"/>
  </svg>
);

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  onSuggestionSearch?: (prefix: string) => void;
  placeholder?: string;
  maxTags?: number;
  disabled?: boolean;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TagInput({
  value,
  onChange,
  suggestions = [],
  onSuggestionSearch,
  placeholder = "Add tag…",
  maxTags = 20,
  disabled = false,
  className = "",
}: Props) {
  const [input, setInput]               = useState("");
  const [focused, setFocused]           = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = suggestions.filter(
    s => !value.includes(s) && s.startsWith(input.toLowerCase())
  );

  const addTag = useCallback((raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag || !isValidTag(tag) || value.includes(tag) || value.length >= maxTags) return;
    onChange([...value, tag]);
    setInput("");
    setHighlightIdx(-1);
  }, [value, onChange, maxTags]);

  const removeTag = useCallback((tag: string) => {
    onChange(value.filter(t => t !== tag));
  }, [value, onChange]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      if (highlightIdx >= 0 && filteredSuggestions[highlightIdx]) {
        addTag(filteredSuggestions[highlightIdx]);
      } else {
        addTag(input.trim());
      }
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      removeTag(value[value.length - 1]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, filteredSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setHighlightIdx(-1);
      setInput("");
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/,/g, "");
    setInput(v);
    setHighlightIdx(-1);
    onSuggestionSearch?.(normalizeTag(v));
  }

  const showDropdown = focused && input.length > 0 && filteredSuggestions.length > 0;

  // close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    function handler(e: MouseEvent) {
      if (inputRef.current && !inputRef.current.closest("[data-taginput]")?.contains(e.target as Node)) {
        setHighlightIdx(-1);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  const atMax = value.length >= maxTags;

  return (
    <div data-taginput className={`relative ${className}`}>
      <div
        onClick={() => !disabled && inputRef.current?.focus()}
        className={`flex flex-wrap gap-1.5 min-h-[40px] px-3 py-2 rounded-xl border bg-white dark:bg-gray-900 transition-colors cursor-text ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        } ${
          focused
            ? "border-brand-500 ring-2 ring-brand-500/20"
            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
        }`}
      >
        {/* Tag chips */}
        {value.map(tag => (
          <span key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 border border-brand-200 dark:border-brand-500/30 text-[11px] font-medium"
          >
            <span className="text-brand-400 dark:text-brand-500"><TagIcon /></span>
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); removeTag(tag); }}
                className="text-brand-400 hover:text-brand-700 dark:hover:text-brand-200 transition-colors ml-0.5"
              >
                <XIcon />
              </button>
            )}
          </span>
        ))}

        {/* Text input */}
        {!atMax && !disabled && (
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => { setTimeout(() => setFocused(false), 150); }}
            placeholder={value.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[120px] bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
          />
        )}

        {/* Max hint */}
        {atMax && (
          <span className="text-[11px] text-gray-400 dark:text-gray-500 self-center ml-1">
            Max {maxTags} tags
          </span>
        )}
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden max-h-44 overflow-y-auto">
          {filteredSuggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={e => { e.preventDefault(); addTag(s); }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                i === highlightIdx
                  ? "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              <span className="text-gray-400 dark:text-gray-500"><TagIcon /></span>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Hint */}
      {focused && !atMax && (
        <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
          Press Enter or comma to add · Backspace to remove · lowercase, numbers, hyphens only
        </p>
      )}
    </div>
  );
}
