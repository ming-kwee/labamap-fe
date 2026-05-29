"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import type { ImportableCollection, FuzzyMatchSuggestion } from "../_types/channel-mapping";
import type { ProductCategoryTree } from "../../product-categories/_types/category";
import type { ChannelStoreConnection } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import { ChannelMappingService } from "../_services/channel-mapping.service";

const CHANNEL_LABEL: Record<string, string> = {
  woocommerce: "WooCommerce", etsy: "Etsy", wix: "Wix",
};

// ─── Icons ─────────────────────────────────────────────────────────────────────

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
const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const ArrowLeftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RowState {
  selection: ImportableCollection | null;
  accepted: boolean;
  confidence: number;
}

type Phase = "loading" | "review" | "pick" | "confirming" | "done";

interface Props {
  organizationId: string;
  store: ChannelStoreConnection;
  /** Platform categories that have no MAPPED entry for this store */
  unmappedCategories: ProductCategoryTree[];
  /** Which category was clicked — scrolled to on open */
  initialCategoryId?: string;
  onMapped: () => void;
  onClose: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CollectionMapperModal({
  organizationId,
  store,
  unmappedCategories,
  initialCategoryId,
  onMapped,
  onClose,
}: Props) {
  const { storeId, channelType, storeName } = store;
  const channelLabel = CHANNEL_LABEL[channelType] ?? channelType;

  const [phase, setPhase] = useState<Phase>("loading");
  const [collections, setCollections] = useState<ImportableCollection[]>([]);
  const [rowStates, setRowStates] = useState<Map<string, RowState>>(new Map());
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Pick panel
  const [pickForCategoryId, setPickForCategoryId] = useState<string | null>(null);
  const [pickSearch, setPickSearch] = useState("");

  const initialRowRef = useRef<HTMLDivElement | null>(null);

  // ── Load: fetch channel collections + fuzzy suggestions in parallel ──────────

  useEffect(() => {
    if (unmappedCategories.length === 0) { setPhase("review"); return; }
    let cancelled = false;

    Promise.all([
      ChannelMappingService.previewImport(storeId, organizationId),
      ChannelMappingService.previewSecondChannel(storeId, organizationId).catch(() => [] as FuzzyMatchSuggestion[]),
    ]).then(([cols, suggestions]) => {
      if (cancelled) return;
      setCollections(cols);

      // Build best-suggestion lookup: internal categoryId → best FuzzyMatchSuggestion
      const bestSuggestion = new Map<string, FuzzyMatchSuggestion>();
      for (const s of suggestions) {
        if (!s.suggestedCategoryId || s.matchConfidence <= 0) continue;
        const existing = bestSuggestion.get(s.suggestedCategoryId);
        if (!existing || s.matchConfidence > existing.matchConfidence) {
          bestSuggestion.set(s.suggestedCategoryId, s);
        }
      }

      // Build a lookup of collections by externalId for resolving suggestions
      const colById = new Map(cols.map(c => [c.externalId, c]));

      const states = new Map<string, RowState>();
      for (const cat of unmappedCategories) {
        const sug = bestSuggestion.get(cat.id);
        const matchedCol = sug ? colById.get(sug.externalId) ?? null : null;
        states.set(cat.id, {
          selection: matchedCol,
          accepted: matchedCol != null && sug != null && sug.matchConfidence >= 80,
          confidence: sug?.matchConfidence ?? 0,
        });
      }
      setRowStates(states);
    }).catch(() => {
      if (!cancelled) {
        const states = new Map<string, RowState>();
        for (const cat of unmappedCategories) {
          states.set(cat.id, { selection: null, accepted: false, confidence: 0 });
        }
        setRowStates(states);
      }
    }).finally(() => { if (!cancelled) setPhase("review"); });

    return () => { cancelled = true; };
  }, [storeId, organizationId, unmappedCategories]);

  // Scroll to initial row after review phase
  useEffect(() => {
    if (phase === "review" && initialRowRef.current) {
      initialRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [phase]);

  // ── Row state helpers ────────────────────────────────────────────────────────

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

  function applyPickSelection(categoryId: string, col: ImportableCollection) {
    setRowStates(prev => {
      const next = new Map(prev);
      next.set(categoryId, { selection: col, accepted: true, confidence: 0 });
      return next;
    });
    setPickForCategoryId(null);
    setPickSearch("");
    setPhase("review");
  }

  // ── Pick panel (flat collection list) ──────────────────────────────────────

  const filteredCollections = useMemo(() => {
    const q = pickSearch.toLowerCase().trim();
    if (!q) return collections.filter(c => c.collectionType !== "smart");
    return collections.filter(c => c.collectionType !== "smart" && c.externalName.toLowerCase().includes(q));
  }, [collections, pickSearch]);

  // ── Confirm ────────────────────────────────────────────────────────────────

  const acceptedMappings = useMemo(() => {
    const result: Array<{ categoryId: string; col: ImportableCollection }> = [];
    for (const [categoryId, row] of rowStates) {
      if (row.accepted && row.selection) result.push({ categoryId, col: row.selection });
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
        mappings: acceptedMappings.map(({ categoryId, col }) => ({
          externalId:   col.externalId,
          externalName: col.externalName,
          externalSlug: col.externalSlug || null,
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
              {phase === "pick"
                ? `Choose ${channelLabel} Collection`
                : `Map to ${channelLabel} Collections`}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {phase === "pick"
                ? <>Selecting for: <span className="font-medium text-gray-700 dark:text-gray-300">{unmappedCategories.find(c => c.id === pickForCategoryId)?.name}</span></>
                : <>{storeName} · {unmappedCategories.length} unmapped categor{unmappedCategories.length !== 1 ? "ies" : "y"}</>
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
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading {channelLabel} collections…</p>
          </div>
        )}

        {/* ── Review: per-category mapping list ── */}
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
                        {/* Platform category name */}
                        <div className="flex items-center gap-2 mb-1.5">
                          {cat.level > 0 && (
                            <span className="text-[10px] text-gray-300 dark:text-gray-600" style={{ marginLeft: `${(cat.level - 1) * 12}px` }}>└</span>
                          )}
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{cat.name}</span>
                          <code className="text-[10px] text-gray-400 dark:text-gray-500">{cat.path}</code>
                        </div>

                        {/* Mapping row */}
                        <div className="flex items-center gap-2 flex-wrap" style={{ paddingLeft: `${cat.level > 0 ? (cat.level - 1) * 12 + 14 : 0}px` }}>

                          {/* Accepted */}
                          {row.accepted && row.selection && (
                            <>
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400">
                                <span className="w-3 h-3 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 text-white" style={{fontSize:"7px"}}>✓</span>
                                {row.selection.externalName}
                                {row.confidence > 0 && <span className="ml-1 opacity-60">{row.confidence}%</span>}
                              </span>
                              <button onClick={() => clearRow(cat.id)} className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                Change
                              </button>
                            </>
                          )}

                          {/* Suggestion pending acceptance */}
                          {!row.accepted && row.selection && (
                            <>
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                                <span className="opacity-60">{row.confidence}% match</span>
                                {" · "}
                                {row.selection.externalName}
                              </span>
                              <button
                                onClick={() => acceptRow(cat.id)}
                                className="text-[11px] font-medium px-2 py-1 rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => { setPickForCategoryId(cat.id); setPickSearch(""); setPhase("pick"); }}
                                className="text-[11px] text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                              >
                                Choose instead
                              </button>
                            </>
                          )}

                          {/* No suggestion */}
                          {!row.selection && (
                            <>
                              <span className="text-[11px] text-gray-400 dark:text-gray-500">— no suggestion</span>
                              <button
                                onClick={() => { setPickForCategoryId(cat.id); setPickSearch(""); setPhase("pick"); }}
                                className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline transition-colors"
                              >
                                Choose collection
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

        {/* ── Pick: flat collection list with search ── */}
        {phase === "pick" && pickForCategoryId && (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
              {/* Back */}
              <button
                onClick={() => { setPickForCategoryId(null); setPickSearch(""); setPhase("review"); }}
                className="flex items-center gap-2 px-5 py-3 text-sm text-brand-600 dark:text-brand-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-100 dark:border-gray-800 flex-shrink-0"
              >
                <ArrowLeftIcon /> Back to all categories
              </button>

              {/* Search */}
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><SearchIcon /></span>
                  <input
                    type="text"
                    value={pickSearch}
                    onChange={e => setPickSearch(e.target.value)}
                    placeholder={`Search ${channelLabel} collections…`}
                    autoFocus
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
              </div>

              {/* Collection list */}
              <div className="flex-1 overflow-y-auto">
                {filteredCollections.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-gray-400 dark:text-gray-500">
                    {collections.filter(c => c.collectionType !== "smart").length === 0
                      ? "No collections found on this store."
                      : "No collections match your search."}
                  </p>
                ) : (
                  filteredCollections.map(col => (
                    <button
                      key={col.externalId}
                      onClick={() => applyPickSelection(pickForCategoryId, col)}
                      className="w-full flex items-center justify-between px-5 py-3 text-sm text-left border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
                    >
                      <div className="min-w-0">
                        <p className="text-gray-900 dark:text-white font-medium truncate">{col.externalName}</p>
                        {col.externalSlug && (
                          <code className="text-[11px] text-gray-400 dark:text-gray-500">/{col.externalSlug}</code>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                        {col.productCount != null && (
                          <span className="text-[11px] text-gray-400 tabular-nums">{col.productCount} products</span>
                        )}
                        <span className="text-brand-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium">Select</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex-shrink-0 px-6 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 text-xs text-gray-400 dark:text-gray-500">
              Select a collection to map <span className="font-medium text-gray-600 dark:text-gray-300">{unmappedCategories.find(c => c.id === pickForCategoryId)?.name}</span>
            </div>
          </>
        )}

        {/* ── Confirming ── */}
        {phase === "confirming" && (
          <div className="flex-1 flex flex-col items-center justify-center py-16">
            <div className="w-12 h-12 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mb-4" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Saving {acceptedMappings.length} mapping{acceptedMappings.length !== 1 ? "s" : ""}…</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Linking to {channelLabel} collections</p>
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
              {acceptedMappings.length} categor{acceptedMappings.length !== 1 ? "ies" : "y"} linked to {channelLabel} collections
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs leading-relaxed">
              Products in these categories will be published under the correct {channelLabel} collection.
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
