"use client";
import React, { useState, useCallback } from "react";
import type { ChannelFormField, CategoryTreeNode } from "../../types/channelStore";

const BASE = "http://localhost:8888/labamap/api/v1";

interface Props {
  field: ChannelFormField;
  value: unknown;
  onChange: (fieldName: string, value: unknown) => void;
  disabled?: boolean;
}

// ── Scenario C: Hierarchical Category Tree Picker ────────────────────────────

export default function CategoryTreePicker({ field, value, onChange, disabled }: Props) {
  const config = field.categoryTreeConfig!;
  const suggestion = field.masterMappedSuggestion;

  // Breadcrumb for the currently committed leaf (pre-populated by backend via selectedPath)
  const [committedPath, setCommittedPath] = useState<CategoryTreeNode[]>(
    config.selectedPath ?? []
  );

  // Picker panel open/closed
  const [isOpen, setIsOpen] = useState(false);

  // Browsing state — active only while the panel is open
  const [browsePath, setBrowsePath] = useState<CategoryTreeNode[]>([]);
  const [currentNodes, setCurrentNodes] = useState<CategoryTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [levelError, setLevelError] = useState<string | null>(null);

  // Suggestion banner dismissed flag
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // ── Level loading ─────────────────────────────────────────────────────────

  const loadLevel = useCallback(
    (parentId?: string) => {
      setLoading(true);
      setLevelError(null);
      const url = parentId
        ? `${BASE}${config.childEndpoint.replace("{parentId}", encodeURIComponent(parentId))}`
        : `${BASE}${config.rootEndpoint}`;

      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          return res.json() as Promise<unknown>;
        })
        .then((raw) => {
          // Normalise: accept plain array, CategoryNodesResponse { nodes: [...] },
          // or Spring paginated { content: [...] }
          const r = raw as Record<string, unknown>;
          const arr = Array.isArray(raw)
            ? (raw as CategoryTreeNode[])
            : Array.isArray(r?.nodes)
            ? (r.nodes as CategoryTreeNode[])
            : Array.isArray(r?.content)
            ? (r.content as CategoryTreeNode[])
            : [];
          setCurrentNodes(arr);
        })
        .catch((err: unknown) =>
          setLevelError(err instanceof Error ? err.message : "Failed to load categories")
        )
        .finally(() => setLoading(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.rootEndpoint, config.childEndpoint]
  );

  // ── Picker actions ────────────────────────────────────────────────────────

  function openPicker() {
    setBrowsePath([]);
    setCurrentNodes([]);
    setIsOpen(true);
    loadLevel();
  }

  /** Navigate to a breadcrumb level inside the open panel. index = -1 goes to root. */
  function navigateToBreadcrumb(index: number) {
    const newPath = index < 0 ? [] : browsePath.slice(0, index + 1);
    setBrowsePath(newPath);
    const parent = newPath.length > 0 ? newPath[newPath.length - 1] : undefined;
    loadLevel(parent?.id);
  }

  function selectNode(node: CategoryTreeNode) {
    if (node.hasChildren) {
      const newPath = [...browsePath, node];
      setBrowsePath(newPath);
      loadLevel(node.id);
    } else {
      // Leaf node — commit and close
      const fullPath = [...browsePath, node];
      setCommittedPath(fullPath);
      onChange(field.fieldName, node.id);
      setIsOpen(false);
    }
  }

  /** Accept the Phase-2-style EXACT suggestion without opening the picker */
  function handleAcceptSuggestion() {
    const sug = suggestion!;
    setCommittedPath([
      { id: String(sug.suggestedValue), name: sug.suggestedLabel, hasChildren: false },
    ]);
    onChange(field.fieldName, sug.suggestedValue);
    setSuggestionDismissed(true);
  }

  // ── Derived display state ─────────────────────────────────────────────────

  const hasValue = Boolean(value);
  const showSuggestionBanner =
    !suggestionDismissed &&
    suggestion?.confidence === "EXACT" &&
    !hasValue; // only prompt when no value is committed yet

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-2">
      {/* Suggested category banner (Scenario B EXACT match on a CATEGORY_TREE field) */}
      {showSuggestionBanner && suggestion && (
        <div className="flex items-start justify-between rounded-lg border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 px-3 py-2 gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-400">
              Suggested category
            </span>
            <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">
              Based on master{" "}
              <span className="font-medium">{suggestion.masterField}</span>{" "}
              <span className="italic">&ldquo;{String(suggestion.masterValue)}&rdquo;</span>
            </p>
            <p className="text-xs font-medium text-gray-900 dark:text-white mt-0.5">
              → {suggestion.suggestedLabel}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleAcceptSuggestion}
              disabled={disabled}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-brand-500 hover:bg-brand-600 text-white transition-colors disabled:opacity-50"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => setSuggestionDismissed(true)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              Browse
            </button>
          </div>
        </div>
      )}

      {/* Committed value display + open button */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5">
          {hasValue && committedPath.length > 0 ? (
            <span className="text-sm text-gray-900 dark:text-white flex flex-wrap items-center gap-0.5">
              {committedPath.map((node, i) => (
                <React.Fragment key={node.id}>
                  {i > 0 && <span className="text-gray-400 mx-1">›</span>}
                  <span className={i === committedPath.length - 1 ? "font-medium" : ""}>
                    {node.name}
                  </span>
                </React.Fragment>
              ))}
            </span>
          ) : hasValue ? (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Category ID: {String(value)}
            </span>
          ) : (
            <span className="text-sm text-gray-400 dark:text-gray-500">
              No category selected
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          className="flex-shrink-0 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-brand-600 dark:text-brand-400 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {hasValue ? "Change" : "Browse"}
        </button>
      </div>

      {/* Picker panel */}
      {isOpen && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
          {/* Breadcrumb navigation bar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-wrap min-h-[36px]">
            <button
              type="button"
              onClick={() => navigateToBreadcrumb(-1)}
              className={`text-xs transition-colors ${
                browsePath.length === 0
                  ? "text-gray-900 dark:text-white font-medium pointer-events-none"
                  : "text-brand-600 dark:text-brand-400 hover:underline"
              }`}
            >
              All categories
            </button>
            {browsePath.map((node, i) => (
              <React.Fragment key={node.id}>
                <span className="text-xs text-gray-400">›</span>
                <button
                  type="button"
                  onClick={() => navigateToBreadcrumb(i)}
                  className={`text-xs transition-colors ${
                    i === browsePath.length - 1
                      ? "text-gray-900 dark:text-white font-medium pointer-events-none"
                      : "text-brand-600 dark:text-brand-400 hover:underline"
                  }`}
                >
                  {node.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Category list */}
          <div className="max-h-56 overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-2 px-3 py-3">
                <span className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin flex-shrink-0" />
                <span className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">
                  Loading categories…
                </span>
              </div>
            )}

            {!loading && levelError && (
              <div className="px-3 py-3">
                <span className="text-sm text-red-600 dark:text-red-400">{levelError}</span>
              </div>
            )}

            {!loading && !levelError && currentNodes.length === 0 && (
              <div className="px-3 py-3">
                <span className="text-sm text-gray-400 dark:text-gray-500">
                  No categories found
                </span>
              </div>
            )}

            {!loading &&
              !levelError &&
              currentNodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => selectNode(node)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 group"
                >
                  <span className="text-gray-900 dark:text-white">{node.name}</span>
                  {node.hasChildren ? (
                    <span className="text-gray-400 dark:text-gray-500 text-xs group-hover:text-brand-500 transition-colors">
                      ›
                    </span>
                  ) : (
                    <span className="text-brand-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                      Select
                    </span>
                  )}
                </button>
              ))}
          </div>

          {/* Footer */}
          <div className="flex justify-end px-3 py-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
