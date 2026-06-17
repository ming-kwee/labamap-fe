"use client";
import React, { useState, useCallback, useEffect, useRef } from "react";
import type { ChannelFormField, CategoryTreeNode } from "../../types/channelStore";

const BASE = "http://localhost:8888/labamap/api/v1";

interface Props {
  field: ChannelFormField;
  value: unknown;
  onChange: (fieldName: string, value: unknown) => void;
  disabled?: boolean;
}

// Full-path result returned by server-side search or built from BFS
interface SearchResult {
  id: string;
  name: string;
  hasChildren: boolean;
  pathNodes: CategoryTreeNode[];  // root → leaf, including this node
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeNodes(raw: unknown): CategoryTreeNode[] {
  const r = raw as Record<string, unknown>;
  return Array.isArray(raw)
    ? (raw as CategoryTreeNode[])
    : Array.isArray(r?.nodes)   ? (r.nodes as CategoryTreeNode[])
    : Array.isArray(r?.content) ? (r.content as CategoryTreeNode[])
    : [];
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase().trim());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-100 dark:bg-amber-500/30 text-inherit rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CategoryTreePicker({ field, value, onChange, disabled }: Props) {
  const config = field.categoryTreeConfig!;
  const suggestion = field.masterMappedSuggestion;

  // ── Committed display ──────────────────────────────────────────────────────
  const [committedPath, setCommittedPath] = useState<CategoryTreeNode[]>(
    config.selectedPath ?? []
  );

  // ── Picker panel ───────────────────────────────────────────────────────────
  const [isOpen, setIsOpen]               = useState(false);
  const [browsePath, setBrowsePath]       = useState<CategoryTreeNode[]>([]);
  const [currentNodes, setCurrentNodes]   = useState<CategoryTreeNode[]>([]);
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [browseError, setBrowseError]     = useState<string | null>(null);

  // ── Search ─────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery]       = useState("");
  const [searchResults, setSearchResults]   = useState<SearchResult[] | null>(null);
  const [loadingSearch, setLoadingSearch]   = useState(false);
  const [searchError, setSearchError]       = useState<string | null>(null);
  const searchTimerRef                      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef                      = useRef<HTMLInputElement>(null);

  // ── Suggestion banner ──────────────────────────────────────────────────────
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // ── Derived ────────────────────────────────────────────────────────────────
  const hasValue         = Boolean(value);
  const isSearching      = searchQuery.trim().length >= 2;
  const hasSearchEndpoint = Boolean(config.searchEndpoint);

  // Client-side filter of the current browse level (when no searchEndpoint)
  const filteredNodes = (!hasSearchEndpoint && isSearching)
    ? currentNodes.filter(n => n.name.toLowerCase().includes(searchQuery.toLowerCase().trim()))
    : currentNodes;

  const showSuggestionBanner =
    !suggestionDismissed && suggestion?.confidence === "EXACT" && !hasValue;

  // ── Level loading ──────────────────────────────────────────────────────────
  const loadLevel = useCallback((parentId?: string) => {
    setLoadingBrowse(true);
    setBrowseError(null);
    const url = parentId
      ? `${BASE}${config.childEndpoint.replace("{parentId}", encodeURIComponent(parentId))}`
      : `${BASE}${config.rootEndpoint}`;

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then(raw => setCurrentNodes(normalizeNodes(raw)))
      .catch(err => setBrowseError(err instanceof Error ? err.message : "Failed to load categories"))
      .finally(() => setLoadingBrowse(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.rootEndpoint, config.childEndpoint]);

  // ── Server-side search ─────────────────────────────────────────────────────
  const runServerSearch = useCallback((query: string) => {
    if (!config.searchEndpoint || query.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    setLoadingSearch(true);
    setSearchError(null);

    fetch(`${BASE}${config.searchEndpoint}&q=${encodeURIComponent(query.trim())}`)
      .then(res => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then(raw => {
        const nodes = normalizeNodes(raw) as unknown as Array<Record<string, unknown>>;
        const results: SearchResult[] = nodes.map(n => {
          const fullName  = typeof n.fullName  === "string" ? n.fullName  : String(n.name ?? "");
          const ancestorIds = Array.isArray(n.ancestorIds) ? (n.ancestorIds as string[]) : [];
          const names  = fullName.split(" > ");
          const allIds = [...ancestorIds, String(n.id ?? "")];
          const pathNodes: CategoryTreeNode[] =
            names.length === allIds.length
              ? allIds.map((id, i) => ({
                  id,
                  name: names[i],
                  hasChildren: i < allIds.length - 1,
                }))
              : [{ id: String(n.id ?? ""), name: String(n.name ?? ""), hasChildren: false }];
          return {
            id: String(n.id ?? ""),
            name: String(n.name ?? ""),
            hasChildren: Boolean(n.hasChildren),
            pathNodes,
          };
        });
        setSearchResults(results);
      })
      .catch(err => setSearchError(err instanceof Error ? err.message : "Search failed"))
      .finally(() => setLoadingSearch(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.searchEndpoint]);

  // Debounce server search
  useEffect(() => {
    if (!hasSearchEndpoint) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!isSearching) { setSearchResults(null); return; }
    searchTimerRef.current = setTimeout(() => runServerSearch(searchQuery), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery, isSearching, hasSearchEndpoint, runServerSearch]);

  // Focus search input when picker opens
  useEffect(() => {
    if (isOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [isOpen]);

  // Auto-open at the preFillPath level when there is no committed value.
  // preFillPath comes from ProductType.channelCategoryDefaults (isLeaf=false) — it is a
  // pre-navigation hint that saves the merchant from browsing from root.
  useEffect(() => {
    const preFill = config.preFillPath;
    if (!preFill || preFill.length === 0 || hasValue || isOpen) return;
    const lastNode = preFill[preFill.length - 1];
    setBrowsePath(preFill);
    setSearchQuery("");
    setSearchResults(null);
    setIsOpen(true);
    loadLevel(lastNode.id);
  // Only run on mount — config.preFillPath is stable after schema load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  function openPicker() {
    setBrowsePath([]);
    setCurrentNodes([]);
    setSearchQuery("");
    setSearchResults(null);
    setIsOpen(true);
    loadLevel();
  }

  function navigateToBreadcrumb(index: number) {
    setSearchQuery("");
    setSearchResults(null);
    const newPath = index < 0 ? [] : browsePath.slice(0, index + 1);
    setBrowsePath(newPath);
    loadLevel(newPath.at(-1)?.id);
  }

  function selectNode(node: CategoryTreeNode, fullPath?: CategoryTreeNode[]) {
    if (node.hasChildren && !fullPath) {
      // Drill into this node in browse mode
      setSearchQuery("");
      setSearchResults(null);
      const newPath = [...browsePath, node];
      setBrowsePath(newPath);
      loadLevel(node.id);
    } else {
      // Leaf node (or explicit full-path commit from search result)
      const path = fullPath ?? [...browsePath, node];
      setCommittedPath(path);
      onChange(field.fieldName, node.id);
      setIsOpen(false);
    }
  }

  function handleAcceptSuggestion() {
    const sug = suggestion!;
    setCommittedPath([{ id: String(sug.suggestedValue), name: sug.suggestedLabel, hasChildren: false }]);
    onChange(field.fieldName, sug.suggestedValue);
    setSuggestionDismissed(true);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-2">

      {/* Suggestion banner */}
      {showSuggestionBanner && suggestion && (
        <div className="flex items-start justify-between rounded-lg border border-brand-200 dark:border-brand-500/30 bg-brand-50 dark:bg-brand-500/10 px-3 py-2 gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-400">
              Suggested category
            </span>
            <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">
              Based on master <span className="font-medium">{suggestion.masterField}</span>{" "}
              <span className="italic">&ldquo;{String(suggestion.masterValue)}&rdquo;</span>
            </p>
            <p className="text-xs font-medium text-gray-900 dark:text-white mt-0.5">
              → {suggestion.suggestedLabel}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button type="button" onClick={handleAcceptSuggestion} disabled={disabled}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-brand-500 hover:bg-brand-600 text-white transition-colors disabled:opacity-50">
              Accept
            </button>
            <button type="button" onClick={() => setSuggestionDismissed(true)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
              Browse
            </button>
          </div>
        </div>
      )}

      {/* No value — Layer 1 banner */}
      {!hasValue && !isOpen ? (
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3.5 space-y-3">
          <div className="flex items-start gap-2.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              <path d="M12 9v4"/><path d="M12 17h.01"/>
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">No category selected</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
                Select the <span className="font-medium">{field.label}</span> for this product.
                Set a default per Product Type in{" "}
                <a href="/omni-admin/channel-category-mapping" target="_blank" rel="noopener noreferrer"
                  className="underline hover:text-amber-900 dark:hover:text-amber-200">
                  Channel Rules
                </a>
                {" "}to pre-fill this automatically.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={openPicker} disabled={disabled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50">
              Browse category
            </button>
          </div>
        </div>
      ) : !isOpen ? (
        /* Has value — committed path + change */
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5">
            {committedPath.length > 0 ? (
              <span className="text-sm text-gray-900 dark:text-white flex flex-wrap items-center gap-0.5">
                {committedPath.map((node, i) => (
                  <React.Fragment key={node.id}>
                    {i > 0 && <span className="text-gray-400 mx-1">›</span>}
                    <span className={i === committedPath.length - 1 ? "font-medium" : ""}>{node.name}</span>
                  </React.Fragment>
                ))}
              </span>
            ) : (
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{String(value)}</span>
            )}
          </div>
          <button type="button" onClick={openPicker} disabled={disabled}
            className="flex-shrink-0 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-brand-600 dark:text-brand-400 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Change
          </button>
        </div>
      ) : null}

      {/* Picker panel */}
      {isOpen && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">

          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 flex-shrink-0">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={hasSearchEndpoint ? "Search all categories…" : "Filter this level…"}
              className="flex-1 text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none"
            />
            {searchQuery && (
              <button type="button" onClick={() => { setSearchQuery(""); setSearchResults(null); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            )}
          </div>

          {/* Browse breadcrumb — hidden while searching with searchEndpoint */}
          {!(hasSearchEndpoint && isSearching) && (
            <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-wrap min-h-[36px]">
              <button type="button" onClick={() => navigateToBreadcrumb(-1)}
                className={`text-xs transition-colors ${browsePath.length === 0
                  ? "text-gray-900 dark:text-white font-medium pointer-events-none"
                  : "text-brand-600 dark:text-brand-400 hover:underline"}`}>
                All categories
              </button>
              {browsePath.map((node, i) => (
                <React.Fragment key={node.id}>
                  <span className="text-xs text-gray-400">›</span>
                  <button type="button" onClick={() => navigateToBreadcrumb(i)}
                    className={`text-xs transition-colors ${i === browsePath.length - 1
                      ? "text-gray-900 dark:text-white font-medium pointer-events-none"
                      : "text-brand-600 dark:text-brand-400 hover:underline"}`}>
                    {node.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Content area */}
          <div className="max-h-64 overflow-y-auto">

            {/* ── Server search results ── */}
            {hasSearchEndpoint && isSearching && (
              <>
                {loadingSearch && (
                  <div className="flex items-center gap-2 px-3 py-3">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin flex-shrink-0" />
                    <span className="text-sm text-gray-400 dark:text-gray-500">Searching…</span>
                  </div>
                )}
                {!loadingSearch && searchError && (
                  <div className="px-3 py-3 text-sm text-red-600 dark:text-red-400">{searchError}</div>
                )}
                {!loadingSearch && !searchError && searchResults !== null && searchResults.length === 0 && (
                  <div className="px-3 py-4 text-center space-y-1">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      No results for &ldquo;{searchQuery}&rdquo;
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      This category may not exist in {field.label}.
                    </p>
                  </div>
                )}
                {!loadingSearch && !searchError && searchResults && searchResults.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700/50">
                      {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
                    </div>
                    {searchResults.map(result => (
                      <button key={result.id} type="button"
                        onClick={() => selectNode(
                          { id: result.id, name: result.name, hasChildren: result.hasChildren },
                          result.hasChildren ? undefined : result.pathNodes
                        )}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 group"
                      >
                        <div className="min-w-0 flex-1">
                          {/* Full path breadcrumb */}
                          <div className="flex flex-wrap items-center gap-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {result.pathNodes.slice(0, -1).map((p, i) => (
                              <React.Fragment key={p.id}>
                                {i > 0 && <span className="text-gray-300 dark:text-gray-600">›</span>}
                                <span>{p.name}</span>
                              </React.Fragment>
                            ))}
                            {result.pathNodes.length > 1 && <span className="text-gray-300 dark:text-gray-600">›</span>}
                          </div>
                          {/* Leaf name with highlight */}
                          <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                            {highlight(result.name, searchQuery)}
                          </p>
                        </div>
                        {result.hasChildren ? (
                          <span className="text-gray-400 dark:text-gray-500 text-xs ml-2 group-hover:text-brand-500 transition-colors flex-shrink-0">›</span>
                        ) : (
                          <span className="text-brand-500 text-xs ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">Select</span>
                        )}
                      </button>
                    ))}
                  </>
                )}
              </>
            )}

            {/* ── Browse / client-filter mode ── */}
            {!(hasSearchEndpoint && isSearching) && (
              <>
                {loadingBrowse && (
                  <div className="flex items-center gap-2 px-3 py-3">
                    <span className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin flex-shrink-0" />
                    <span className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Loading…</span>
                  </div>
                )}
                {!loadingBrowse && browseError && (
                  <div className="px-3 py-3 text-sm text-red-600 dark:text-red-400">{browseError}</div>
                )}
                {!loadingBrowse && !browseError && isSearching && filteredNodes.length === 0 && (
                  <div className="px-3 py-4 text-center space-y-1.5">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      No match for &ldquo;{searchQuery}&rdquo; at this level
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Navigate into a sub-category and search again,<br />
                      or <button type="button" className="underline text-brand-500" onClick={() => setSearchQuery("")}>clear the filter</button> to browse.
                    </p>
                  </div>
                )}
                {!loadingBrowse && !browseError && !isSearching && currentNodes.length === 0 && (
                  <div className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500">No categories found</div>
                )}
                {!loadingBrowse && !browseError && filteredNodes.map(node => (
                  <button key={node.id} type="button" onClick={() => selectNode(node)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 group"
                  >
                    <span className="text-gray-900 dark:text-white">
                      {isSearching ? highlight(node.name, searchQuery) : node.name}
                    </span>
                    {node.hasChildren ? (
                      <span className="text-gray-400 dark:text-gray-500 text-xs group-hover:text-brand-500 transition-colors">›</span>
                    ) : (
                      <span className="text-brand-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity">Select</span>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {hasSearchEndpoint
                ? (isSearching ? "Full-tree search" : "Browse or type to search")
                : (isSearching ? `${filteredNodes.length} match${filteredNodes.length !== 1 ? "es" : ""} at this level` : `${currentNodes.length} categories`)}
            </span>
            <button type="button" onClick={() => setIsOpen(false)}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
