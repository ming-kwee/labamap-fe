"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import type { ProductType } from "../../product-types/_types/product-type";
import { ProductTypeService } from "../../product-types/_services/product-type.service";
import { ChannelMappingService } from "../_services/channel-mapping.service";
import type { TaxonomyCategory } from "../_types/channel-mapping";
import type { ChannelStoreConnection } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";

// ─── Icons ────────────────────────────────────────────────────────────────────

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

// ─── Channel helpers ──────────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
  shopify: "Shopify", shopee: "Shopee", tokopedia: "Tokopedia",
  amazon: "Amazon", lazada: "Lazada", tiktok: "TikTok", tiktokshop: "TikTok",
  ebay: "eBay", wix: "Wix", woocommerce: "WooCommerce",
};

const CHANNEL_EMOJI: Record<string, string> = {
  shopify: "🛍", shopee: "🧡", tokopedia: "🟢", amazon: "📦",
  lazada: "🛒", tiktok: "🎵", tiktokshop: "🎵", ebay: "🔨", wix: "⬛",
};

// Channels that support browsable category trees (treeCapable or taxonomyEnabled).
// WooCommerce/Etsy/Wix use collection-import model — no defaults needed.
const TREE_CAPABLE_FALLBACK = ["shopee", "amazon", "tiktok", "tiktokshop", "ebay", "lazada"];

// ─── Category browse modal ────────────────────────────────────────────────────

function CategoryBrowseModal({
  channelType,
  store,
  orgId,
  onSelect,
  onClose,
}: {
  channelType: string;
  store: ChannelStoreConnection;
  orgId: string;
  onSelect: (node: TaxonomyCategory, path: TaxonomyCategory[]) => void;
  onClose: () => void;
}) {
  const [browsePath, setBrowsePath] = useState<TaxonomyCategory[]>([]);
  const [nodes, setNodes]           = useState<TaxonomyCategory[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const loadLevel = useCallback(async (parentId?: string, path: TaxonomyCategory[] = []) => {
    setLoading(true);
    setError(null);
    try {
      const result = await ChannelMappingService.browseTaxonomy(channelType, store.storeId, orgId, parentId);
      setNodes(result);
      setBrowsePath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, [channelType, store.storeId, orgId]);

  useEffect(() => { loadLevel(); }, [loadLevel]);

  function handleNodeClick(node: TaxonomyCategory) {
    if (node.isLeaf) {
      onSelect(node, [...browsePath, node]);
    } else {
      loadLevel(node.id, [...browsePath, node]);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Browse {CHANNEL_LABEL[channelType] ?? channelType} Categories
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{store.storeName} · select a leaf category</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
            <XIcon />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0 flex-wrap min-h-[36px]">
          <button
            onClick={() => loadLevel(undefined, [])}
            className={`text-xs transition-colors ${browsePath.length === 0 ? "text-gray-900 dark:text-white font-medium pointer-events-none" : "text-brand-600 dark:text-brand-400 hover:underline"}`}
          >
            All
          </button>
          {browsePath.map((n, i) => (
            <React.Fragment key={n.id}>
              <span className="text-xs text-gray-400">›</span>
              <button
                onClick={() => loadLevel(n.id, browsePath.slice(0, i + 1))}
                className={`text-xs transition-colors ${i === browsePath.length - 1 ? "text-gray-900 dark:text-white font-medium pointer-events-none" : "text-brand-600 dark:text-brand-400 hover:underline"}`}
              >
                {n.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Node list */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 px-4 py-5">
              <span className="h-4 w-4 rounded-full border-2 border-brand-500 border-t-transparent animate-spin flex-shrink-0" />
              <span className="text-sm text-gray-400">Loading…</span>
            </div>
          )}
          {!loading && error && (
            <div className="px-4 py-4 space-y-2">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Failed to load</p>
              <p className="text-xs text-red-500/80 leading-relaxed">{error}</p>
              <button
                onClick={() => loadLevel(
                  browsePath.length > 0 ? browsePath[browsePath.length - 1].id : undefined,
                  browsePath,
                )}
                className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
              >
                Retry
              </button>
            </div>
          )}
          {!loading && !error && nodes.length === 0 && (
            <p className="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">No sub-categories at this level.</p>
          )}
          {!loading && !error && nodes.map(node => (
            <button
              key={node.id}
              onClick={() => handleNodeClick(node)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-left transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 group"
            >
              <span className="text-gray-900 dark:text-white">{node.name}</span>
              {node.isLeaf ? (
                <span className="text-brand-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                  Select ✓
                </span>
              ) : (
                <span className="text-gray-400 text-xs group-hover:text-brand-500 transition-colors">›</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ProductTypeRulesTab ──────────────────────────────────────────────────────

interface Props {
  /** Active, non-inactive stores — already filtered by the parent page. */
  stores: ChannelStoreConnection[];
  /** True while the parent's loadAll() is still fetching stores. Guards against the
   *  "No eligible stores" empty state flashing before stores have actually loaded. */
  storesLoading: boolean;
  orgId: string;
}

export function ProductTypeRulesTab({ stores, storesLoading, orgId }: Props) {
  // Channels that support category tree browsing — one store per channelType for browse.
  const channelMap = useMemo(() => stores
    .filter(s =>
      s.treeCapable === true
      || s.taxonomyEnabled === true
      || (s.treeCapable == null && TREE_CAPABLE_FALLBACK.includes(s.channelType))
      || (s.treeCapable == null && s.taxonomyEnabled == null && s.channelType === "shopify")
    )
    .reduce<Record<string, ChannelStoreConnection>>((acc, s) => {
      if (!acc[s.channelType]) acc[s.channelType] = s;
      return acc;
    }, {}), [stores]);
  const channelTypes = useMemo(() => Object.keys(channelMap), [channelMap]);

  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [browseTarget, setBrowseTarget] = useState<{ pt: ProductType; channelType: string } | null>(null);
  const [savingKey, setSavingKey]       = useState<string | null>(null);
  const [clearingKey, setClearingKey]   = useState<string | null>(null);
  const [toast, setToast]               = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    ProductTypeService.list({ active: true })
      .then(setProductTypes)
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(msg: string, type: "ok" | "err" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSelect(node: TaxonomyCategory, path: TaxonomyCategory[]) {
    if (!browseTarget) return;
    const { pt, channelType } = browseTarget;
    const key = `${pt.id}-${channelType}`;
    setSavingKey(key);
    setBrowseTarget(null);
    try {
      const updated = await ProductTypeService.setChannelDefault(pt.id, channelType, {
        categoryId:       node.id,
        categoryName:     node.name,
        categoryFullPath: path.map(n => n.name).join(" › "),
      });
      setProductTypes(prev => prev.map(p => p.id === updated.id ? updated : p));
      showToast("Default saved");
    } catch (err) {
      showToast((err as Error).message, "err");
    } finally {
      setSavingKey(null);
    }
  }

  async function handleClear(pt: ProductType, channelType: string) {
    const key = `${pt.id}-${channelType}`;
    setClearingKey(key);
    try {
      const updated = await ProductTypeService.clearChannelDefault(pt.id, channelType);
      setProductTypes(prev => prev.map(p => p.id === updated.id ? updated : p));
      showToast("Default cleared");
    } catch (err) {
      showToast((err as Error).message, "err");
    } finally {
      setClearingKey(null);
    }
  }

  // ── No eligible channels ───────────────────────────────────────────────────
  if (!loading && !storesLoading && channelTypes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-2xl">🔌</div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No eligible stores connected</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed mb-6">
          Connect Shopee, Amazon, TikTok, eBay, Lazada, or Shopify to set channel category defaults per ProductType.
        </p>
        <Link
          href="/channels/stores"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-xl transition-colors shadow-sm"
        >
          Connect a store →
        </Link>
      </div>
    );
  }

  return (
    <div className="px-6 py-4">

      {/* Description */}
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-2xl leading-relaxed">
        Default channel categories per ProductType — these pre-fill the CategoryTreePicker in Step 2.
        Merchants can override per product. Manage ProductTypes at{" "}
        <Link href="/omni-admin/product-types" className="text-brand-600 dark:text-brand-400 hover:underline">
          Product Types
        </Link>.
      </p>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400">
          <AlertIcon /> {error}
          <button onClick={load} className="ml-auto text-xs underline">Retry</button>
        </div>
      )}

      {/* Empty — no product types */}
      {!loading && !error && productTypes.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">No product types defined yet.</p>
          <Link href="/omni-admin/product-types" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
            Create product types →
          </Link>
        </div>
      )}

      {/* Rules table */}
      {(loading || productTypes.length > 0) && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60">
                <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-b-gray-200 dark:border-b-gray-700 border-r border-r-gray-200 dark:border-r-gray-700 min-w-[200px]">
                  Product Type
                </th>
                {channelTypes.map(ct => (
                  <th key={ct} className="px-3 py-2.5 text-center border-b border-b-gray-200 dark:border-b-gray-700 min-w-[160px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-base leading-none">{CHANNEL_EMOJI[ct] ?? "🏪"}</span>
                      <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                        {CHANNEL_LABEL[ct] ?? ct}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }, (_, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-4 py-3 border-r border-r-gray-100 dark:border-r-gray-800">
                      <div className="h-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" style={{ width: `${50 + i * 10}%`, opacity: 1 - i * 0.15 }} />
                    </td>
                    {channelTypes.map(ct => (
                      <td key={ct} className="px-3 py-3 text-center">
                        <div className="h-5 w-24 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse mx-auto" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                productTypes.map(pt => (
                  <tr
                    key={pt.id}
                    className="hover:bg-gray-50/60 dark:hover:bg-gray-800/20 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                  >
                    {/* ProductType name */}
                    <td className="px-4 py-3 border-r border-r-gray-100 dark:border-r-gray-800">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{pt.name}</p>
                      {pt.description && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-[180px]">
                          {pt.description}
                        </p>
                      )}
                    </td>

                    {/* One cell per channel */}
                    {channelTypes.map(ct => {
                      const def = pt.channelCategoryDefaults.find(d => d.channelType === ct);
                      const key = `${pt.id}-${ct}`;
                      const isSaving   = savingKey   === key;
                      const isClearing = clearingKey === key;

                      return (
                        <td key={ct} className="px-3 py-3 text-center">
                          {(isSaving || isClearing) ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                              <span className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin" />
                              {isSaving ? "Saving…" : "Clearing…"}
                            </span>
                          ) : def ? (
                            <div className="group/cell inline-flex items-center gap-1 max-w-[140px]">
                              <button
                                onClick={() => setBrowseTarget({ pt, channelType: ct })}
                                title={def.categoryFullPath || def.categoryName}
                                className="text-[11px] text-gray-700 dark:text-gray-300 truncate hover:text-brand-600 dark:hover:text-brand-400 transition-colors text-left leading-snug"
                              >
                                {def.categoryFullPath || def.categoryName}
                              </button>
                              <button
                                onClick={() => handleClear(pt, ct)}
                                title="Clear default"
                                className="opacity-0 group-hover/cell:opacity-100 transition-opacity flex-shrink-0 text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5"
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setBrowseTarget({ pt, channelType: ct })}
                              className="text-[11px] font-medium text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 transition-colors px-2 py-1 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 hover:border-brand-400 dark:hover:border-brand-500/50"
                            >
                              Set
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {!loading && productTypes.length > 0 && (
        <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
          Click a cell to set or change the default · hover a filled cell and click trash to clear
        </p>
      )}

      {/* Category browse modal */}
      {browseTarget && channelMap[browseTarget.channelType] && (
        <CategoryBrowseModal
          channelType={browseTarget.channelType}
          store={channelMap[browseTarget.channelType]}
          orgId={orgId}
          onSelect={handleSelect}
          onClose={() => setBrowseTarget(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${
          toast.type === "ok"
            ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200"
            : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400"
        }`}>
          {toast.type === "ok" ? "✓" : <AlertIcon />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
