"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { TaxonomyCategory, FuzzyMatchSuggestion } from "../_types/channel-mapping";
import type { ProductCategoryTree } from "../../product-categories/_types/category";
import type { ChannelStoreConnection } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import { ChannelMappingService } from "../_services/channel-mapping.service";

const CHANNEL_LABEL: Record<string, string> = {
  shopify: "Shopify", amazon: "Amazon", tiktok: "TikTok Shop", tiktokshop: "TikTok Shop",
  ebay: "eBay", lazada: "Lazada", shopee: "Shopee", tokopedia: "Tokopedia",
  walmart: "Walmart", wix: "Wix",
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const ArrowLeftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);

// ─── Per-row state ────────────────────────────────────────────────────────────

interface RowState {
  /** The selected taxonomy node (may be from suggestion or tree browse) */
  selection: TaxonomyCategory | null;
  /** true = will be included in the final mapSecondChannel call */
  accepted: boolean;
  /** matchConfidence from the suggestion (0 if manually browsed) */
  confidence: number;
}

// ─── Browse panel state (one at a time, shared across all rows) ───────────────

interface BrowseContext {
  categoryId: string;
  categoryName: string;
  browsePath: TaxonomyCategory[];
  currentNodes: TaxonomyCategory[];
  loadingLevel: boolean;
  levelError: string | null;
}

type Phase = "loading" | "review" | "browse" | "confirming" | "done";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  organizationId: string;
  store: ChannelStoreConnection;
  /** All platform categories that have no MAPPED entry for this store */
  unmappedCategories: ProductCategoryTree[];
  /** Optional: which category was clicked — used to scroll to on open */
  initialCategoryId?: string;
  /**
   * "taxonomy" — Shopify-style platform taxonomy (GraphQL); labels say "Taxonomy"
   * "tree"     — REST/HMAC category tree (Shopee, Amazon, etc.); labels say "Category Tree"
   */
  mode?: "taxonomy" | "tree";
  onMapped: () => void;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TaxonomyMapperModal({
  organizationId,
  store,
  unmappedCategories,
  initialCategoryId,
  mode = "taxonomy",
  onMapped,
  onClose,
}: Props) {
  const { storeId, channelType, storeName } = store;
  const channelLabel = CHANNEL_LABEL[channelType] ?? channelType;
  // "Taxonomy" for Shopify-style; "Category Tree" for REST/HMAC channels like Shopee
  const treeLabel = mode === "taxonomy" ? "Taxonomy" : "Category Tree";

  const [phase, setPhase] = useState<Phase>("loading");
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Per-category row state: categoryId → RowState
  const [rowStates, setRowStates] = useState<Map<string, RowState>>(new Map());

  // Browse panel (replaces the review list when open)
  const [browseCtx, setBrowseCtx] = useState<BrowseContext | null>(null);

  // Scroll-to ref for the initially clicked category
  const initialRowRef = useRef<HTMLDivElement | null>(null);

  // ── Initial load: suggestions + (optionally) root nodes ──────────────────

  useEffect(() => {
    if (unmappedCategories.length === 0) {
      setPhase("review");
      return;
    }
    let cancelled = false;

    ChannelMappingService.previewSecondChannel(storeId, organizationId)
      .then(suggestions => {
        if (cancelled) return;

        // Build a lookup: categoryId → best suggestion
        const bestSuggestion = new Map<string, FuzzyMatchSuggestion>();
        for (const s of suggestions) {
          if (!s.suggestedCategoryId || s.matchConfidence <= 0) continue;
          const existing = bestSuggestion.get(s.suggestedCategoryId);
          if (!existing || s.matchConfidence > existing.matchConfidence) {
            bestSuggestion.set(s.suggestedCategoryId, s);
          }
        }

        // Initialise row states
        const states = new Map<string, RowState>();
        for (const cat of unmappedCategories) {
          const sug = bestSuggestion.get(cat.id);
          if (sug) {
            const node: TaxonomyCategory = {
              id: sug.externalId, name: sug.externalName,
              fullName: sug.externalName, level: 0,
              isLeaf: true, isRoot: false, childrenIds: [], ancestorIds: [],
            };
            states.set(cat.id, {
              selection: node,
              accepted: sug.matchConfidence >= 80,
              confidence: sug.matchConfidence,
            });
          } else {
            states.set(cat.id, { selection: null, accepted: false, confidence: 0 });
          }
        }
        setRowStates(states);
      })
      .catch(() => {
        // Suggestion failure is non-fatal — proceed to review with no pre-fills
        if (!cancelled) {
          const states = new Map<string, RowState>();
          for (const cat of unmappedCategories) {
            states.set(cat.id, { selection: null, accepted: false, confidence: 0 });
          }
          setRowStates(states);
        }
      })
      .finally(() => { if (!cancelled) setPhase("review"); });

    return () => { cancelled = true; };
  }, [storeId, organizationId, unmappedCategories]);

  // Scroll to initial row after review phase loads
  useEffect(() => {
    if (phase === "review" && initialRowRef.current) {
      initialRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [phase]);

  // ── Row state helpers ─────────────────────────────────────────────────────

  function acceptRow(categoryId: string) {
    setRowStates(prev => {
      const next = new Map(prev);
      const row = next.get(categoryId);
      if (row) next.set(categoryId, { ...row, accepted: true });
      return next;
    });
  }

  function clearRow(categoryId: string) {
    setRowStates(prev => {
      const next = new Map(prev);
      const row = next.get(categoryId);
      if (row) next.set(categoryId, { ...row, selection: null, accepted: false, confidence: 0 });
      return next;
    });
  }

  function applyBrowseSelection(categoryId: string, node: TaxonomyCategory, path: TaxonomyCategory[]) {
    setRowStates(prev => {
      const next = new Map(prev);
      next.set(categoryId, {
        selection: { ...node, fullName: path.map(n => n.name).join(" › ") },
        accepted: true,
        confidence: 0,
      });
      return next;
    });
    setBrowseCtx(null);
    setPhase("review");
  }

  // ── Browse panel ──────────────────────────────────────────────────────────

  const loadBrowseLevel = useCallback(async (categoryId: string, categoryName: string, parentId?: string, currentPath: TaxonomyCategory[] = []) => {
    setBrowseCtx(prev => prev ? { ...prev, loadingLevel: true, levelError: null } : {
      categoryId, categoryName, browsePath: currentPath,
      currentNodes: [], loadingLevel: true, levelError: null,
    });
    try {
      const nodes = await ChannelMappingService.browseTaxonomy(channelType, storeId, organizationId, parentId);
      setBrowseCtx(prev => prev ? { ...prev, currentNodes: nodes, loadingLevel: false } : null);
    } catch (err) {
      setBrowseCtx(prev => prev ? { ...prev, loadingLevel: false, levelError: (err as Error).message } : null);
    }
  }, [channelType, storeId, organizationId]);

  function openBrowse(categoryId: string, categoryName: string) {
    setPhase("browse");
    setBrowseCtx({ categoryId, categoryName, browsePath: [], currentNodes: [], loadingLevel: true, levelError: null });
    loadBrowseLevel(categoryId, categoryName);
  }

  function browseNavigate(index: number) {
    if (!browseCtx) return;
    const newPath = index < 0 ? [] : browseCtx.browsePath.slice(0, index + 1);
    setBrowseCtx({ ...browseCtx, browsePath: newPath, currentNodes: [], loadingLevel: true, levelError: null });
    loadBrowseLevel(browseCtx.categoryId, browseCtx.categoryName, newPath[newPath.length - 1]?.id, newPath);
  }

  function browseSelectNode(node: TaxonomyCategory) {
    if (!browseCtx) return;
    if (!node.isLeaf) {
      const newPath = [...browseCtx.browsePath, node];
      setBrowseCtx({ ...browseCtx, browsePath: newPath, currentNodes: [], loadingLevel: true, levelError: null });
      loadBrowseLevel(browseCtx.categoryId, browseCtx.categoryName, node.id, newPath);
    } else {
      applyBrowseSelection(browseCtx.categoryId, node, [...browseCtx.browsePath, node]);
    }
  }

  // ── Confirm ───────────────────────────────────────────────────────────────

  const acceptedMappings = useMemo(() => {
    const result: Array<{ categoryId: string; node: TaxonomyCategory }> = [];
    for (const [categoryId, row] of rowStates) {
      if (row.accepted && row.selection) {
        result.push({ categoryId, node: row.selection });
      }
    }
    return result;
  }, [rowStates]);

  async function handleConfirm() {
    if (acceptedMappings.length === 0) return;
    setPhase("confirming");
    setConfirmError(null);
    try {
      await ChannelMappingService.mapSecondChannel({
        storeId,
        organizationId,
        mappings: acceptedMappings.map(({ categoryId, node }) => ({
          externalId:   node.id,
          externalName: node.name,
          externalSlug: null,
          categoryId,
        })),
      });
      setPhase("done");
    } catch (err) {
      setConfirmError((err as Error).message);
      setPhase("review");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
        onClick={phase === "done" ? onClose : undefined}
      />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              {phase === "browse" && browseCtx
                ? `Browse ${channelLabel} ${treeLabel}`
                : `Map to ${channelLabel} ${treeLabel}`}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {phase === "browse" && browseCtx
                ? <>Mapping: <span className="font-medium text-gray-700 dark:text-gray-300">{browseCtx.categoryName}</span></>
                : <>
                    {storeName} · {unmappedCategories.length} unmapped categor{unmappedCategories.length !== 1 ? "ies" : "y"}
                    {initialCategoryId && unmappedCategories.length > 1 && (
                      <span className="ml-1 text-brand-500 dark:text-brand-400">· scrolled to your selection</span>
                    )}
                  </>
              }
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors">
            <XIcon />
          </button>
        </div>

        {/* ── Loading ── */}
        {phase === "loading" && (
          <div className="flex-1 flex flex-col items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading {treeLabel.toLowerCase()} suggestions…</p>
          </div>
        )}

        {/* ── Review: category list ── */}
        {phase === "review" && (
          <>
            <div className="flex-1 overflow-y-auto min-h-0">
              {confirmError && (
                <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400">
                  <AlertIcon /> {confirmError}
                </div>
              )}

              {unmappedCategories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-500/20 flex items-center justify-center mb-3 text-green-600 dark:text-green-400">
                    <CheckIcon />
                  </div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">All categories are already mapped</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {unmappedCategories.map(cat => {
                    const row = rowStates.get(cat.id) ?? { selection: null, accepted: false, confidence: 0 };
                    const isInitial = cat.id === initialCategoryId;
                    return (
                      <div
                        key={cat.id}
                        ref={isInitial ? initialRowRef : undefined}
                        className={`px-5 py-3 ${isInitial ? "bg-brand-50/50 dark:bg-brand-500/5" : ""}`}
                      >
                        {/* Category name */}
                        <div className="flex items-center gap-2 mb-1.5">
                          {cat.level > 0 && (
                            <span className="text-[10px] text-gray-300 dark:text-gray-600" style={{ marginLeft: `${(cat.level - 1) * 12}px` }}>└</span>
                          )}
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{cat.name}</span>
                          <code className="text-[10px] text-gray-400 dark:text-gray-500">{cat.path}</code>
                        </div>

                        {/* Selection row */}
                        <div className="flex items-center gap-2 flex-wrap" style={{ paddingLeft: `${cat.level > 0 ? (cat.level - 1) * 12 + 14 : 0}px` }}>

                          {/* Accepted with selection */}
                          {row.accepted && row.selection && (
                            <>
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400">
                                <span className="w-3 h-3 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 text-white" style={{fontSize:"7px"}}>✓</span>
                                {row.selection.fullName || row.selection.name}
                                {row.confidence > 0 && (
                                  <span className="ml-1 opacity-60">{row.confidence}%</span>
                                )}
                              </span>
                              <button
                                onClick={() => clearRow(cat.id)}
                                className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                              >
                                Change
                              </button>
                              <button
                                onClick={() => openBrowse(cat.id, cat.name)}
                                className="text-[11px] text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                              >
                                Browse instead
                              </button>
                            </>
                          )}

                          {/* Suggestion not yet accepted */}
                          {!row.accepted && row.selection && (
                            <>
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                                <span className="opacity-60">{row.confidence}% match</span>
                                {" · "}
                                {row.selection.name}
                              </span>
                              <button
                                onClick={() => acceptRow(cat.id)}
                                className="text-[11px] font-medium px-2 py-1 rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => openBrowse(cat.id, cat.name)}
                                className="text-[11px] text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                              >
                                Browse instead
                              </button>
                            </>
                          )}

                          {/* No suggestion */}
                          {!row.selection && (
                            <>
                              <span className="text-[11px] text-gray-400 dark:text-gray-500">— no suggestion</span>
                              <button
                                onClick={() => openBrowse(cat.id, cat.name)}
                                className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline transition-colors"
                              >
                                Browse to select
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Review footer */}
            <div className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {acceptedMappings.length} of {unmappedCategories.length} mapping{unmappedCategories.length !== 1 ? "s" : ""} confirmed
              </p>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={acceptedMappings.length === 0}
                  className="px-5 py-2 text-sm font-semibold rounded-xl bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Confirm {acceptedMappings.length > 0 ? acceptedMappings.length : ""} mapping{acceptedMappings.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Browse: tree picker ── */}
        {phase === "browse" && browseCtx && (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
              {/* Back bar */}
              <button
                onClick={() => { setBrowseCtx(null); setPhase("review"); }}
                className="flex items-center gap-2 px-5 py-3 text-sm text-brand-600 dark:text-brand-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-100 dark:border-gray-800 flex-shrink-0"
              >
                <ArrowLeftIcon /> Back to all categories
              </button>

              {/* Breadcrumb */}
              <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 flex-wrap min-h-[36px] flex-shrink-0">
                <button
                  onClick={() => browseNavigate(-1)}
                  className={`text-xs transition-colors ${browseCtx.browsePath.length === 0 ? "text-gray-900 dark:text-white font-medium pointer-events-none" : "text-brand-600 dark:text-brand-400 hover:underline"}`}
                >
                  All categories
                </button>
                {browseCtx.browsePath.map((node, i) => (
                  <React.Fragment key={node.id}>
                    <span className="text-xs text-gray-400">›</span>
                    <button
                      onClick={() => browseNavigate(i)}
                      className={`text-xs transition-colors ${i === browseCtx.browsePath.length - 1 ? "text-gray-900 dark:text-white font-medium pointer-events-none" : "text-brand-600 dark:text-brand-400 hover:underline"}`}
                    >
                      {node.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* Nodes */}
              <div className="flex-1 overflow-y-auto">
                {browseCtx.loadingLevel && (
                  <div className="flex items-center gap-2 px-5 py-4">
                    <span className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin flex-shrink-0" />
                    <span className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">Loading…</span>
                  </div>
                )}
                {!browseCtx.loadingLevel && browseCtx.levelError && (
                  <div className="px-5 py-4 space-y-1">
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">Failed to load taxonomy</p>
                    <p className="text-xs text-red-500/80 dark:text-red-400/70 leading-relaxed">{browseCtx.levelError}</p>
                  </div>
                )}
                {!browseCtx.loadingLevel && !browseCtx.levelError && browseCtx.currentNodes.length === 0 && (
                  <div className="px-5 py-4 space-y-1">
                    <p className="text-sm text-gray-500 dark:text-gray-400">No sub-categories at this level</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {browseCtx.browsePath.length === 0
                        ? `The ${treeLabel.toLowerCase()} root returned empty — the backend may need to seed the channel_category_cache for ${channelLabel}.`
                        : `This may be a leaf node or the backend ${treeLabel.toLowerCase()} children endpoint may not support this depth yet.`}
                    </p>
                  </div>
                )}
                {!browseCtx.loadingLevel && !browseCtx.levelError && browseCtx.currentNodes.map(node => (
                  <button
                    key={node.id}
                    onClick={() => browseSelectNode(node)}
                    className="w-full flex items-center justify-between px-5 py-3 text-sm text-left transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 group"
                  >
                    <span className="text-gray-900 dark:text-white">{node.name}</span>
                    {node.isLeaf ? (
                      <span className="text-brand-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium">Select</span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 text-xs group-hover:text-brand-500 transition-colors">›</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Browse footer */}
            <div className="flex-shrink-0 px-6 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 text-xs text-gray-400 dark:text-gray-500">
              Select a {treeLabel.toLowerCase()} node to map <span className="font-medium text-gray-600 dark:text-gray-300">{browseCtx.categoryName}</span>
            </div>
          </>
        )}

        {/* ── Confirming ── */}
        {phase === "confirming" && (
          <div className="flex-1 flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mb-4" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Saving {acceptedMappings.length} mapping{acceptedMappings.length !== 1 ? "s" : ""}…</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Linking to {channelLabel} {treeLabel.toLowerCase()}</p>
          </div>
        )}

        {/* ── Done ── */}
        {phase === "done" && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-green-100 dark:bg-green-500/20 flex items-center justify-center mb-4 text-green-600 dark:text-green-400 text-xl">
              ✓
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Mappings saved</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              {acceptedMappings.length} categor{acceptedMappings.length !== 1 ? "ies" : "y"} linked to {channelLabel} {treeLabel.toLowerCase()}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs leading-relaxed">
              Products in these categories will be classified under the correct {channelLabel} {treeLabel.toLowerCase()} nodes when published.
            </p>
            <button
              onClick={() => { onMapped(); onClose(); }}
              className="mt-6 px-5 py-2 text-sm font-semibold rounded-xl bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-sm"
            >
              Done
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
