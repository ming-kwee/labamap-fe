"use client";

import React, { useState, useCallback } from "react";
import type { ProductType } from "../_types/product-type";
import { ProductTypeService } from "../_services/product-type.service";
import type { ChannelStoreConnection } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import { CategoryBrowseModal } from "@/app/(admin)/omni-admin/channel-category-mapping/_components/CategoryBrowseModal";
import type { TaxonomyCategory } from "@/app/(admin)/omni-admin/channel-category-mapping/_types/channel-mapping";

// ─── Icons ────────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);

// ─── Channel label helpers ────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
  shopify: "Shopify", shopee: "Shopee", tokopedia: "Tokopedia",
  amazon: "Amazon", lazada: "Lazada", tiktok: "TikTok Shop", tiktokshop: "TikTok Shop",
  ebay: "eBay", wix: "Wix", woocommerce: "WooCommerce",
};

const CHANNEL_COLORS: Record<string, string> = {
  shopify: "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  shopee:  "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
  tokopedia: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  amazon:  "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  lazada:  "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  tiktok:  "bg-pink-100 text-pink-700 dark:bg-pink-500/10 dark:text-pink-400",
  tiktokshop: "bg-pink-100 text-pink-700 dark:bg-pink-500/10 dark:text-pink-400",
  ebay:    "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
};

// ─── Set Default Modal ────────────────────────────────────────────────────────

interface SetDefaultModalProps {
  productType: ProductType;
  stores: ChannelStoreConnection[];
  orgId: string;
  onSaved: (updated: ProductType) => void;
  onClose: () => void;
}

function SetDefaultModal({ productType, stores, orgId, onSaved, onClose }: SetDefaultModalProps) {
  // Only channels with a browsable category tree make sense for defaults.
  // treeCapable deployed 2026-06-15 — backend returns flag reliably.
  // Fallback list retained as safety net for stale/cached responses.
  const TREE_CAPABLE_FALLBACK = ["shopee","amazon","tiktok","tiktokshop","ebay","lazada"];
  const eligibleStores = stores.filter(s =>
    s.treeCapable === true                                                        // backend: REST tree (primary)
    || s.taxonomyEnabled === true                                                 // backend: taxonomy (Shopify)
    || (s.treeCapable == null && TREE_CAPABLE_FALLBACK.includes(s.channelType))  // safety net
    || (s.treeCapable == null && s.taxonomyEnabled == null && s.channelType === "shopify") // Shopify safety net
  );

  // Deduplicate by channelType — one store per channel is enough for browsing
  const channelGroups = eligibleStores.reduce<Record<string, ChannelStoreConnection>>((acc, s) => {
    if (!acc[s.channelType]) acc[s.channelType] = s;
    return acc;
  }, {});
  const channels = Object.values(channelGroups);

  const [selectedChannelType, setSelectedChannelType] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const selectedStore = selectedChannelType ? channelGroups[selectedChannelType] : null;

  async function handleCategorySelect(node: TaxonomyCategory, path: TaxonomyCategory[]) {
    if (!selectedChannelType || !selectedStore) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await ProductTypeService.setChannelDefault(productType.id, selectedChannelType, {
        categoryId:       node.id,
        categoryName:     node.name,
        categoryFullPath: path.map(n => n.name).join(" › "),
        isLeaf:           node.isLeaf,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  if (selectedStore && selectedChannelType) {
    return (
      <CategoryBrowseModal
        channelType={selectedChannelType}
        store={selectedStore}
        orgId={orgId}
        onSelect={handleCategorySelect}
        onClose={() => setSelectedChannelType(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-200 dark:border-gray-700 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Set Channel Category Default</p>
            <p className="text-xs text-gray-400 mt-0.5">{productType.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"><XIcon /></button>
        </div>
        <div className="px-5 py-4 space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Choose a channel to set the default category for:
          </p>
          {channels.length === 0 && (
            <p className="text-xs text-gray-400 italic">
              No eligible stores connected. Connect Shopee, Amazon, TikTok, eBay, Lazada, or Shopify stores first.
            </p>
          )}
          {channels.map(store => {
            const existing = productType.channelCategoryDefaults.find(d => d.channelType === store.channelType);
            return (
              <button key={store.channelType} onClick={() => setSelectedChannelType(store.channelType)}
                disabled={saving}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-all text-left disabled:opacity-50">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {CHANNEL_LABEL[store.channelType] ?? store.channelType}
                  </p>
                  {existing ? (
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[200px]">
                      Current: {existing.categoryFullPath || existing.categoryName}
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-400 mt-0.5">No default set</p>
                  )}
                </div>
                <span className="text-xs text-gray-400">›</span>
              </button>
            );
          })}
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ChannelDefaultsSection (main export) ────────────────────────────────────

interface Props {
  productType: ProductType;
  stores: ChannelStoreConnection[];
  orgId: string;
  onUpdated: (updated: ProductType) => void;
}

export function ChannelDefaultsSection({ productType, stores, orgId, onUpdated }: Props) {
  const [showSetModal, setShowSetModal]   = useState(false);
  const [clearing, setClearing]           = useState<string | null>(null);
  const [toast, setToast]                 = useState<string | null>(null);

  const defaults = productType.channelCategoryDefaults;

  async function handleClear(channelType: string) {
    setClearing(channelType);
    try {
      const updated = await ProductTypeService.clearChannelDefault(productType.id, channelType);
      onUpdated(updated);
      setToast(`Default untuk ${CHANNEL_LABEL[channelType] ?? channelType} dihapus`);
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast("Gagal menghapus default");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setClearing(null);
    }
  }

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 mt-3 pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Channel Category Defaults
        </p>
        <button
          onClick={() => setShowSetModal(true)}
          className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-500/20 transition-colors"
        >
          <PlusIcon /> Set default
        </button>
      </div>

      {defaults.length === 0 ? (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">
          Belum ada default. Klik "Set default" untuk menambahkan.
        </p>
      ) : (
        <div className="space-y-1.5">
          {defaults.map(d => (
            <div key={d.channelType} className="flex items-center gap-2 group/default">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${CHANNEL_COLORS[d.channelType] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"}`}>
                {CHANNEL_LABEL[d.channelType] ?? d.channelType}
              </span>
              <span className="text-[11px] text-gray-600 dark:text-gray-400 truncate flex-1 min-w-0" title={d.categoryFullPath}>
                {d.categoryFullPath || d.categoryName}
              </span>
              <button
                onClick={() => handleClear(d.channelType)}
                disabled={clearing === d.channelType}
                title="Hapus default ini"
                className="opacity-0 group-hover/default:opacity-100 transition-opacity p-0.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-30 flex-shrink-0"
              >
                {clearing === d.channelType
                  ? <span className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin inline-block" />
                  : <TrashIcon />}
              </button>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">{toast}</div>
      )}

      {showSetModal && (
        <SetDefaultModal
          productType={productType}
          stores={stores}
          orgId={orgId}
          onSaved={(updated) => { onUpdated(updated); setShowSetModal(false); }}
          onClose={() => setShowSetModal(false)}
        />
      )}
    </div>
  );
}
