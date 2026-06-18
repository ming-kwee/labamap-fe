"use client";

import React, { useState, useCallback, useEffect } from "react";
import { ChannelMappingService } from "../_services/channel-mapping.service";
import type { TaxonomyCategory } from "../_types/channel-mapping";
import type { ChannelStoreConnection } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";

const CHANNEL_LABEL: Record<string, string> = {
  shopify: "Shopify", shopee: "Shopee", tokopedia: "Tokopedia",
  amazon: "Amazon", lazada: "Lazada", tiktok: "TikTok", tiktokshop: "TikTok",
  ebay: "eBay", wix: "Wix", woocommerce: "WooCommerce",
};

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);

export interface CategoryBrowseModalProps {
  channelType: string;
  store: ChannelStoreConnection;
  orgId: string;
  onSelect: (node: TaxonomyCategory, path: TaxonomyCategory[]) => void;
  onClose: () => void;
  /**
   * true  (default) — only leaf nodes can be selected. Correct for product listings
   *        where channels require a leaf category.
   * false — mid-tree nodes can also be selected as a "starting point" default.
   *        Used by ProductTypeRulesTab where broad ProductTypes (e.g. "Toys") cannot
   *        meaningfully map to a single leaf.
   */
  requireLeafOnly?: boolean;
}

export function CategoryBrowseModal({ channelType, store, orgId, onSelect, onClose, requireLeafOnly = true }: CategoryBrowseModalProps) {
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

  function handleBreadcrumb(idx: number) {
    if (idx < 0) {
      loadLevel(undefined, []);
    } else {
      const newPath = browsePath.slice(0, idx + 1);
      loadLevel(newPath[newPath.length - 1]?.id, newPath);
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
            <p className="text-xs text-gray-400 mt-0.5">
              {store.storeName} · {requireLeafOnly ? "select a leaf category" : "select a level or leaf"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
            <XIcon />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0 flex-wrap min-h-[36px]">
          <button
            onClick={() => handleBreadcrumb(-1)}
            className={`text-xs transition-colors ${browsePath.length === 0 ? "text-gray-900 dark:text-white font-medium pointer-events-none" : "text-brand-600 dark:text-brand-400 hover:underline"}`}
          >
            All
          </button>
          {browsePath.map((n, i) => (
            <React.Fragment key={n.id}>
              <span className="text-xs text-gray-400">›</span>
              <button
                onClick={() => handleBreadcrumb(i)}
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
            <div className="px-4 py-5 space-y-1">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {browsePath.length === 0
                  ? "No categories available — the category cache for this channel may not be seeded yet. Check Platform Admin → Channel Category API Configs and ensure the CategorySyncJob has run."
                  : "No sub-categories at this level."}
              </p>
            </div>
          )}
          {!loading && !error && nodes.map(node => (
            <div
              key={node.id}
              className="group flex items-center border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              {/* Main click target: navigate deeper (non-leaf) or select (leaf) */}
              <button
                onClick={() => handleNodeClick(node)}
                className="flex-1 px-4 py-3 text-sm text-left text-gray-900 dark:text-white"
              >
                {node.name}
              </button>

              {/* Right-side affordances — clicking this area mirrors the name button's action */}
              <div
                className="flex items-center gap-1.5 pr-4 py-3 cursor-pointer"
                onClick={() => handleNodeClick(node)}
              >
                {/* "Use this level" — only for non-leaf when requireLeafOnly=false.
                    stopPropagation so the outer div's navigate-deeper click doesn't also fire. */}
                {!node.isLeaf && !requireLeafOnly && (
                  <button
                    onClick={e => { e.stopPropagation(); onSelect(node, [...browsePath, node]); }}
                    title="Use this category level as a starting point for this ProductType"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    Use ↙
                  </button>
                )}
                {/* Leaf indicator / navigation arrow */}
                {node.isLeaf ? (
                  <span className="text-brand-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium whitespace-nowrap">
                    Select ✓
                  </span>
                ) : (
                  <span className="text-gray-400 text-xs group-hover:text-brand-500 transition-colors">›</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
