"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { CategoryService } from "../../product-categories/_services/category.service";
import type { ProductCategoryTree } from "../../product-categories/_types/category";
import { flattenTree } from "../../product-categories/_types/category";
import { ChannelMappingService } from "../_services/channel-mapping.service";
import type { ChannelCategoryMapping, SyncStatus } from "../_types/channel-mapping";
import { isImportCapable, isTreeCapable } from "../_types/channel-mapping";
import { ChannelStoreService } from "@/modules/ecommerce-product-v2/step2-channel-fields/services/channelStore.service";
import type { ChannelStoreConnection } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import { useAuth } from "@/shared/contexts/AuthContext";
import { DriftResolutionModal } from "./DriftResolutionModal";
import { ImportWizardModal } from "./ImportWizardModal";
import { TaxonomyMapperModal } from "./TaxonomyMapperModal";
import { CollectionMapperModal } from "./CollectionMapperModal";
import { ProductTypeRulesTab } from "./ProductTypeRulesTab";
import { BulkAssignTab } from "./BulkAssignTab";

// ─── Icons ─────────────────────────────────────────────────────────────────────

const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
  </svg>
);
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const LinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);
const ChevronRightIcon = ({ className = "" }: { className?: string }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m9 18 6-6-6-6"/>
  </svg>
);
const UnlinkIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18.84 12.25l1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/>
    <path d="M5.17 11.75l-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/>
    <line x1="8" y1="2" x2="8" y2="5"/><line x1="2" y1="8" x2="5" y2="8"/>
    <line x1="16" y1="19" x2="16" y2="22"/><line x1="19" y1="16" x2="22" y2="16"/>
  </svg>
);

// ─── Unmap modal ─────────────────────────────────────────────────────────────
// importedFrom=true  → merchant accidentally imported this category; offer full undo
// importedFrom=false → category pre-existed or was created by admin; only allow unlinking

function UnmapModal({
  mapping,
  onUnlinkOnly,
  onUnlinkAndDelete,
  onCancel,
  deleting,
}: {
  mapping: ChannelCategoryMapping;
  onUnlinkOnly: () => void;
  onUnlinkAndDelete: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={deleting ? undefined : onCancel} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-5">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-1">
            Remove channel link?
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
            Unlinking{" "}
            <span className="font-medium text-gray-700 dark:text-gray-300">{mapping.categoryName}</span>
            {" "}from{" "}
            <span className="font-medium text-gray-700 dark:text-gray-300">{mapping.channelType}</span>.
          </p>

          <div className="space-y-2">
            <button
              onClick={onUnlinkOnly}
              disabled={deleting}
              className="w-full flex flex-col items-start gap-0.5 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Remove link only</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Keeps the internal category — just disconnects it from {mapping.channelType}.
              </span>
            </button>

            {mapping.importedFrom && (
              <button
                onClick={onUnlinkAndDelete}
                disabled={deleting}
                className="w-full flex flex-col items-start gap-0.5 px-4 py-3 rounded-xl border border-red-200 dark:border-red-500/30 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {deleting ? "Deleting…" : "Remove link + delete category"}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  Fully undoes the import — deletes this category from your platform too.
                </span>
              </button>
            )}
          </div>
        </div>
        <div className="flex justify-end px-6 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Channel helpers ──────────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
  shopify: "Shopify", woocommerce: "WooCommerce", amazon: "Amazon",
  tiktok: "TikTok", ebay: "eBay", etsy: "Etsy", lazada: "Lazada",
  tokopedia: "Tokopedia", facebook: "Facebook", shopee: "Shopee", walmart: "Walmart",
  wix: "Wix",
};

const CHANNEL_EMOJI: Record<string, string> = {
  shopify: "🛍", woocommerce: "🟣", amazon: "📦", tiktok: "🎵",
  ebay: "🔨", etsy: "🎨", lazada: "🛒", tokopedia: "🟢",
  facebook: "📘", shopee: "🧡", walmart: "🔵", wix: "⬛",
};

// ─── Status cell ──────────────────────────────────────────────────────────────

function StatusCell({
  mapping,
  categoryName,
  channelType,
  taxonomyEnabled,
  importCapable,
  treeCapable,
  onOpenDrift,
  onOpenMap,
  onUnmap,
}: {
  mapping: ChannelCategoryMapping | undefined;
  categoryName: string;
  channelType: string;
  taxonomyEnabled: boolean;
  importCapable: boolean;
  treeCapable: boolean;
  onOpenDrift: (mapping: ChannelCategoryMapping) => void;
  onOpenMap: () => void;
  onUnmap: (mapping: ChannelCategoryMapping) => void;
}) {
  if (!mapping) {
    if (taxonomyEnabled || importCapable || treeCapable) {
      return (
        <button
          onClick={onOpenMap}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
        >
          <LinkIcon /> Map
        </button>
      );
    }
    return <span className="text-[11px] text-gray-300 dark:text-gray-600">—</span>;
  }

  const status: SyncStatus = mapping.syncStatus;

  if (status === "MAPPED") {
    return (
      <span className="inline-flex items-center gap-1 group/mapped">
        <span
          title={`${channelType}: ${mapping.externalName}\nID: ${mapping.externalId}\nLast synced: ${mapping.lastSyncedAt ?? "—"}`}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400 cursor-default"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0" />
          MAPPED
        </span>
        <button
          onClick={() => onUnmap(mapping)}
          title={`Unmap from ${mapping.externalName}`}
          className="opacity-0 group-hover/mapped:opacity-100 transition-opacity p-0.5 rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
        >
          <UnlinkIcon />
        </button>
      </span>
    );
  }

  if (status === "DRIFTED") {
    return (
      <button
        onClick={() => onOpenDrift(mapping)}
        title={mapping.driftReason ?? "Name mismatch detected"}
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
      >
        <AlertIcon /> DRIFTED
      </button>
    );
  }

  if (status === "PENDING_IMPORT") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
        PENDING
      </span>
    );
  }

  if (status === "PUSH_FAILED") {
    return (
      <span title="Push failed — will retry" className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400">
        <AlertIcon /> FAILED
      </span>
    );
  }

  // UNMAPPED document exists but no link
  if (taxonomyEnabled || importCapable || treeCapable) {
    return (
      <button
        onClick={onOpenMap}
        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
      >
        <LinkIcon /> Map
      </button>
    );
  }
  return <span className="text-[11px] text-gray-300 dark:text-gray-600">—</span>;
}

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRow({
  node,
  stores,
  mappingIndex,
  expandedIds,
  searchQuery,
  statusFilter,
  storeFilter,
  onToggleExpand,
  onOpenDrift,
  onOpenMap,
  onUnmap,
}: {
  node: ProductCategoryTree;
  stores: ChannelStoreConnection[];
  mappingIndex: Map<string, ChannelCategoryMapping>;
  expandedIds: Set<string>;
  searchQuery: string;
  statusFilter: SyncStatus | "all";
  storeFilter: string;
  onToggleExpand: (id: string) => void;
  onOpenDrift: (mapping: ChannelCategoryMapping, categoryName: string) => void;
  onOpenMap: (categoryId: string, categoryName: string, storeId: string) => void;
  onUnmap: (mapping: ChannelCategoryMapping) => void;
}) {
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const LEVEL_INDENT = node.level * 20;

  // Summary badges from channelSyncSummary (if the backend returns it)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = (node as any).channelSyncSummary as { totalMapped: number; totalDrifted: number; totalUnmapped: number } | undefined;

  const isRoot = node.level === 0;

  // Borders must be on <td> — <tr> borders are ignored with border-separate tables
  const nameTdCls = isRoot
    ? "border-t border-t-gray-200 dark:border-t-gray-700 border-b border-b-gray-200 dark:border-b-gray-700 border-r border-r-gray-100 dark:border-r-gray-800 border-l-[3px] border-l-indigo-300 dark:border-l-indigo-600 bg-white dark:bg-gray-800"
    : "border-b border-b-gray-100 dark:border-b-gray-800 border-r border-r-gray-100 dark:border-r-gray-800 bg-white dark:bg-gray-900";

  const storeTdCls = isRoot
    ? "border-t border-t-gray-200 dark:border-t-gray-700 border-b border-b-gray-200 dark:border-b-gray-700 bg-white dark:bg-gray-800"
    : "border-b border-b-gray-100 dark:border-b-gray-800 bg-white dark:bg-gray-900";

  return (
    <>
      <tr className={[
        "transition-colors",
        isRoot ? "hover:bg-indigo-50/40 dark:hover:bg-indigo-900/10" : "hover:bg-gray-50/60 dark:hover:bg-gray-800/20",
        !node.active ? "opacity-60" : "",
      ].join(" ")}>
        {/* Category name cell */}
        <td
          className={`${nameTdCls} pr-3 ${isRoot ? "py-3" : "py-2"}`}
          style={{ paddingLeft: `${isRoot ? 13 : 16 + LEVEL_INDENT}px` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
                onClick={() => onToggleExpand(node.id)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <ChevronRightIcon className={`transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`} />
              </button>
            ) : (
              <span className="w-3 flex-shrink-0" />
            )}
            <span className={`text-sm truncate ${isRoot ? "font-semibold text-gray-900 dark:text-white" : "font-medium text-gray-600 dark:text-gray-300"}`}>
              {node.name}
            </span>
            {summary && summary.totalDrifted > 0 && (
              <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
                {summary.totalDrifted} drifted
              </span>
            )}
          </div>
          {node.level > 0 && (
            <code className="ml-5 text-[11px] text-gray-400 dark:text-gray-500">{node.path}</code>
          )}
        </td>

        {/* One cell per store */}
        {stores.map(store => {
          const key = `${node.id}-${store.storeId}`;
          const mapping = mappingIndex.get(key);
          const show = storeFilter === "all" || storeFilter === store.storeId;
          if (!show) return null;
          return (
            <td key={store.storeId} className={`${storeTdCls} px-3 text-center ${isRoot ? "py-3" : "py-2"}`}>
              <StatusCell
                mapping={mapping}
                categoryName={node.name}
                channelType={store.channelType}
                taxonomyEnabled={store.taxonomyEnabled === true}
                importCapable={store.importCapable === true || (store.importCapable == null && isImportCapable(store.channelType))}
                treeCapable={store.treeCapable === true || (store.treeCapable == null && isTreeCapable(store.channelType))}
                onOpenDrift={m => onOpenDrift(m, node.name)}
                onOpenMap={() => onOpenMap(node.id, node.name, store.storeId)}
                onUnmap={onUnmap}
              />
            </td>
          );
        })}
      </tr>

      {/* Children */}
      {isExpanded && node.children.map(child => (
        <CategoryRow
          key={child.id}
          node={child}
          stores={stores}
          mappingIndex={mappingIndex}
          expandedIds={expandedIds}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          storeFilter={storeFilter}
          onToggleExpand={onToggleExpand}
          onOpenDrift={onOpenDrift}
          onOpenMap={onOpenMap}
          onUnmap={onUnmap}
        />
      ))}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChannelCategoryMappingPage() {
  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";

  const [tree, setTree] = useState<ProductCategoryTree[]>([]);
  const [stores, setStores] = useState<ChannelStoreConnection[]>([]);
  const [mappings, setMappings] = useState<ChannelCategoryMapping[]>([]);
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingStores, setLoadingStores] = useState(true);
  const [loadingMappings, setLoadingMappings] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<"rules" | "bulk" | "legacy">("rules");

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SyncStatus | "all">("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  // Modals
  const [driftModal, setDriftModal] = useState<{ mapping: ChannelCategoryMapping; categoryName: string } | null>(null);
  const [unmapModal, setUnmapModal] = useState<ChannelCategoryMapping | null>(null);
  const [deletingImport, setDeletingImport] = useState(false);
  const [importModal, setImportModal] = useState<{ initialStoreId?: string } | null>(null);
  const [taxonomyModal, setTaxonomyModal] = useState<{
    store: ChannelStoreConnection;
    unmappedCategories: ProductCategoryTree[];
    initialCategoryId?: string;
    mode: "taxonomy" | "tree";
  } | null>(null);
  const [collectionModal, setCollectionModal] = useState<{
    store: ChannelStoreConnection;
    unmappedCategories: ProductCategoryTree[];
    initialCategoryId?: string;
  } | null>(null);

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadAll = useCallback(async () => {
    if (!orgId) {
      setLoadingTree(false);
      setLoadingStores(false);
      setLoadingMappings(false);
      return;
    }
    setLoadError(null);
    try {
      const [treeData, storeData, mappingData] = await Promise.all([
        CategoryService.getTree(orgId).finally(() => setLoadingTree(false)),
        ChannelStoreService.listAllStores(orgId)
          .then(all => all.filter(s => s.isActive && s.connectionStatus !== "INACTIVE"))
          .finally(() => setLoadingStores(false)),
        ChannelMappingService.listAll(orgId).finally(() => setLoadingMappings(false)),
      ]);
      setTree(treeData);
      setStores(storeData);
      setMappings(mappingData);
      setExpandedIds(new Set(treeData.map(n => n.id)));
    } catch (err) {
      setLoadError((err as Error).message);
      setLoadingTree(false);
      setLoadingStores(false);
      setLoadingMappings(false);
    }
  }, [orgId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Build mapping lookup: "categoryId-storeId" → mapping
  const mappingIndex = useMemo(() => {
    const map = new Map<string, ChannelCategoryMapping>();
    for (const m of mappings) {
      map.set(`${m.categoryId}-${m.storeId}`, m);
    }
    return map;
  }, [mappings]);

  // Flat list for search
  const flatNodes = useMemo(() => flattenTree(tree), [tree]);

  // Drift count for attention banner
  const driftedCount = useMemo(() => mappings.filter(m => m.syncStatus === "DRIFTED").length, [mappings]);

  // Import-capable stores — WooCommerce, Etsy, Wix (backend-driven via store.importCapable; falls back to channel type)
  const importableStores = useMemo(
    () => stores.filter(s => s.importCapable === true || (s.importCapable == null && isImportCapable(s.channelType))),
    [stores],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const result = await ChannelMappingService.syncAll(orgId);
      showToast(`Synced ${result.syncedCount} categories`);
      await ChannelMappingService.listAll(orgId).then(setMappings);
    } catch (err) {
      showToast((err as Error).message, "err");
    } finally {
      setSyncing(false);
    }
  };

  const handleDriftResolved = (updated: ChannelCategoryMapping) => {
    setMappings(prev => prev.map(m => m.id === updated.id ? updated : m));
    setDriftModal(null);
    showToast("Drift resolved");
  };

  const handleUnmap = useCallback((mapping: ChannelCategoryMapping) => {
    setUnmapModal(mapping);
  }, []);

  // Remove link only — keep the internal category
  const handleUnlinkOnly = useCallback(async () => {
    if (!unmapModal) return;
    try {
      await ChannelMappingService.deleteMapping(unmapModal.id);
      setMappings(prev => prev.filter(m => m.id !== unmapModal.id));
      setUnmapModal(null);
      showToast("Channel link removed");
    } catch (err) {
      showToast((err as Error).message, "err");
    }
  }, [unmapModal, showToast]);

  // Remove link + delete the category the merchant accidentally imported
  const handleUnlinkAndDelete = useCallback(async () => {
    if (!unmapModal) return;
    setDeletingImport(true);
    try {
      await CategoryService.delete(unmapModal.categoryId, orgId);
      await ChannelMappingService.deleteMapping(unmapModal.id).catch(() => {});
      setUnmapModal(null);
      showToast(`"${unmapModal.categoryName}" removed`);
      // Reload everything so the category row disappears immediately from the grid
      await loadAll();
    } catch (err) {
      showToast((err as Error).message, "err");
    } finally {
      setDeletingImport(false);
    }
  }, [unmapModal, orgId, showToast, loadAll]);

  const handleOpenMap = (categoryId: string, _categoryName: string, storeId: string) => {
    const store = stores.find(s => s.storeId === storeId);
    if (!store) return;
    const storeTreeCapable = store.treeCapable === true || (store.treeCapable == null && isTreeCapable(store.channelType));
    if (store.taxonomyEnabled === true) {
      // Taxonomy-enabled channels (Shopify): batch mapper links internal categories to taxonomy nodes
      const unmapped = flatNodes.filter(n => {
        const m = mappingIndex.get(`${n.id}-${storeId}`);
        return !m || m.syncStatus === "UNMAPPED";
      });
      setTaxonomyModal({ store, unmappedCategories: unmapped, initialCategoryId: categoryId, mode: "taxonomy" });
    } else if (storeTreeCapable) {
      // Category-tree channels (Shopee, Amazon, TikTok, eBay, Lazada): browse channel's REST category tree
      const unmapped = flatNodes.filter(n => {
        const m = mappingIndex.get(`${n.id}-${storeId}`);
        return !m || m.syncStatus === "UNMAPPED";
      });
      setTaxonomyModal({ store, unmappedCategories: unmapped, initialCategoryId: categoryId, mode: "tree" });
    } else if (store.importCapable === true || (store.importCapable == null && isImportCapable(store.channelType))) {
      // Import-capable channels (Wix, WooCommerce, Etsy): link existing platform categories to channel collections
      const unmapped = flatNodes.filter(n => {
        const m = mappingIndex.get(`${n.id}-${storeId}`);
        return !m || m.syncStatus === "UNMAPPED";
      });
      setCollectionModal({ store, unmappedCategories: unmapped, initialCategoryId: categoryId });
    } else {
      showToast(`No mapping flow configured for ${store.storeName}`);
    }
  };

  // Filter tree for search
  const displayTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;
    const q = searchQuery.toLowerCase();
    const matchIds = new Set(flatNodes.filter(n => n.name.toLowerCase().includes(q) || n.path.includes(q)).map(n => n.id));
    function filterTree(nodes: ProductCategoryTree[]): ProductCategoryTree[] {
      return nodes.reduce<ProductCategoryTree[]>((acc, n) => {
        const children = filterTree(n.children);
        if (matchIds.has(n.id) || children.length > 0) acc.push({ ...n, children });
        return acc;
      }, []);
    }
    return filterTree(tree);
  }, [tree, flatNodes, searchQuery]);

  const isLoading = loadingTree || loadingStores || loadingMappings;

  const stats = useMemo(() => {
    const total   = mappings.length;
    const mapped  = mappings.filter(m => m.syncStatus === "MAPPED").length;
    const drifted = mappings.filter(m => m.syncStatus === "DRIFTED").length;
    return { total, mapped, drifted };
  }, [mappings]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">

      {/* Page header */}
      <div className="bg-white dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
            <LinkIcon />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Channel Category Mapping</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {stores.length} store{stores.length !== 1 ? "s" : ""} connected
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mt-4 -mb-[1px]">
          {(["rules", "bulk", "legacy"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-brand-500 text-brand-600 dark:text-brand-400 bg-white dark:bg-gray-800/60"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab === "rules" ? "Channel Rules" : tab === "bulk" ? "Bulk Assign" : "Platform Categories"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Channel Rules tab (Phase 5 — primary view) ────────────────────────── */}
      {activeTab === "rules" && (
        <ProductTypeRulesTab stores={stores} storesLoading={loadingStores} orgId={orgId} />
      )}

      {/* ── Bulk Assign tab (Phase 6) ──────────────────────────────────────────── */}
      {activeTab === "bulk" && (
        <BulkAssignTab stores={stores} orgId={orgId} />
      )}

      {/* ── Platform Categories tab (legacy) ──────────────────────────────────── */}
      {activeTab === "legacy" && (
        <>
          {/* Legacy banner */}
          <div className="mx-6 mt-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
            <AlertIcon />
            <div className="text-sm text-amber-800 dark:text-amber-300">
              <span className="font-semibold">Legacy view.</span> These mappings link platform categories to channel taxonomies.
              For new products, set defaults directly on{" "}
              <button onClick={() => setActiveTab("rules")} className="underline font-medium hover:text-amber-900 dark:hover:text-amber-200">
                Channel Rules
              </button>{" "}
              (ProductType-based) instead.
            </div>
          </div>

          {/* Drift attention banner */}
          {driftedCount > 0 && (
            <div className="mx-6 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
              <AlertIcon />
              <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">
                {driftedCount} channel categor{driftedCount !== 1 ? "ies have" : "y has"} drifted — click the amber badge to resolve.
              </p>
            </div>
          )}

          {/* Toolbar */}
          <div className="bg-white dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700/40 px-6 py-3 mt-3 flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><SearchIcon /></span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search categories…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </div>

            {/* Store filter */}
            <select
              value={storeFilter}
              onChange={e => setStoreFilter(e.target.value)}
              className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none"
            >
              <option value="all">All stores</option>
              {stores.map(s => (
                <option key={s.storeId} value={s.storeId}>
                  {CHANNEL_EMOJI[s.channelType] ?? "🏪"} {s.storeName}
                </option>
              ))}
            </select>

            {/* Status filter */}
            <div className="flex items-center gap-0 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {(["all", "MAPPED", "DRIFTED", "UNMAPPED"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === s
                      ? s === "DRIFTED" ? "bg-amber-500 text-white"
                      : s === "UNMAPPED" ? "bg-gray-500 text-white"
                      : "bg-brand-500 text-white"
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {s === "all" ? "All" : s}
                </button>
              ))}
            </div>

            <span className="ml-auto text-xs text-gray-400 tabular-nums">
              {flatNodes.length} categor{flatNodes.length !== 1 ? "ies" : "y"} · {stats.mapped} mapped
            </span>

            <button
              onClick={handleSyncAll}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <RefreshIcon /> {syncing ? "Syncing…" : "Sync all"}
            </button>
          </div>

          {/* Error */}
          {loadError && (
            <div className="mx-6 mt-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400">
              <AlertIcon />
              <div>
                <p className="font-medium">Failed to load</p>
                <p className="text-xs mt-0.5 opacity-80">{loadError}</p>
              </div>
              <button onClick={loadAll} className="ml-auto text-xs underline">Retry</button>
            </div>
          )}

          {/* Empty: no stores */}
          {!isLoading && !loadError && stores.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-3xl">🔌</div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No connected stores</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed mb-6">
                Connect a store to start mapping your platform categories to channel taxonomies.
              </p>
              <Link
                href="/channels/stores"
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-xl transition-colors shadow-sm"
              >
                Connect a store →
              </Link>
            </div>
          )}

          {/* Mapping table */}
          {!loadError && (stores.length > 0 || isLoading) && (
            <div className="px-6 py-4 overflow-x-auto">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-left border-separate border-spacing-0">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/60">
                    <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800/60 px-4 py-2.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-b-gray-200 dark:border-b-gray-700 border-r border-r-gray-200 dark:border-r-gray-700 min-w-[220px]">
                      Platform Category
                    </th>
                    {stores.map(store => {
                      const show = storeFilter === "all" || storeFilter === store.storeId;
                      if (!show) return null;
                      return (
                        <th key={store.storeId} className="px-3 py-2.5 text-center border-b border-b-gray-200 dark:border-b-gray-700 min-w-[120px]">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-base leading-none">{CHANNEL_EMOJI[store.channelType] ?? "🏪"}</span>
                            <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                              {CHANNEL_LABEL[store.channelType] ?? store.channelType}
                            </span>
                            <span className="text-[10px] text-gray-400 truncate max-w-[100px]">{store.storeName}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 5 }, (_, i) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="px-4 py-3">
                          <div className="h-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" style={{ width: `${60 + i * 8}%`, opacity: 1 - i * 0.12 }} />
                        </td>
                        {stores.map(s => (
                          <td key={s.storeId} className="px-3 py-3 text-center">
                            <div className="h-6 w-16 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse mx-auto" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : displayTree.length === 0 ? (
                    <tr>
                      <td colSpan={stores.length + 1} className="py-16 text-center">
                        {tree.length === 0 ? (
                          <div>
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">No categories yet</p>
                            <Link href="/omni-admin/product-categories" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
                              Create categories →
                            </Link>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400">No categories match your search</p>
                        )}
                      </td>
                    </tr>
                  ) : (
                    displayTree.map(root => (
                      <CategoryRow
                        key={root.id}
                        node={root}
                        stores={stores}
                        mappingIndex={mappingIndex}
                        expandedIds={expandedIds}
                        searchQuery={searchQuery}
                        statusFilter={statusFilter}
                        storeFilter={storeFilter}
                        onToggleExpand={toggleExpand}
                        onOpenDrift={(mapping, categoryName) => setDriftModal({ mapping, categoryName })}
                        onOpenMap={handleOpenMap}
                        onUnmap={handleUnmap}
                      />
                    ))
                  )}
                </tbody>
              </table>
              </div>

              {/* Legend */}
              {!isLoading && (
                <div className="mt-4 flex items-center gap-4 text-[11px] text-gray-400 dark:text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" /> MAPPED — syncing normally</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> DRIFTED — name mismatch, click to resolve</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-3 border border-dashed border-gray-400 rounded" /> Map — not yet linked, click to map</span>
                </div>
              )}
            </div>
          )}
        </>
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

      {/* Unmap modal */}
      {unmapModal && (
        <UnmapModal
          mapping={unmapModal}
          onUnlinkOnly={handleUnlinkOnly}
          onUnlinkAndDelete={handleUnlinkAndDelete}
          onCancel={() => !deletingImport && setUnmapModal(null)}
          deleting={deletingImport}
        />
      )}

      {/* Drift resolution modal */}
      {driftModal && (
        <DriftResolutionModal
          mapping={driftModal.mapping}
          categoryName={driftModal.categoryName}
          onResolved={handleDriftResolved}
          onClose={() => setDriftModal(null)}
        />
      )}

      {/* Import wizard modal — WooCommerce / Etsy / Wix */}
      {importModal && (
        <ImportWizardModal
          organizationId={orgId}
          importableStores={importableStores}
          initialStoreId={importModal.initialStoreId}
          onDone={() => { loadAll(); }}
          onClose={() => setImportModal(null)}
        />
      )}

      {/* Collection mapper modal — Wix / WooCommerce / Etsy: link existing platform categories to channel collections */}
      {collectionModal && (
        <CollectionMapperModal
          organizationId={orgId}
          store={collectionModal.store}
          unmappedCategories={collectionModal.unmappedCategories}
          initialCategoryId={collectionModal.initialCategoryId}
          onMapped={() => {
            ChannelMappingService.listAll(orgId).then(setMappings);
          }}
          onClose={() => setCollectionModal(null)}
        />
      )}

      {/* Taxonomy / category-tree mapper modal */}
      {taxonomyModal && (
        <TaxonomyMapperModal
          organizationId={orgId}
          store={taxonomyModal.store}
          unmappedCategories={taxonomyModal.unmappedCategories}
          initialCategoryId={taxonomyModal.initialCategoryId}
          mode={taxonomyModal.mode}
          onMapped={() => {
            ChannelMappingService.listAll(orgId).then(setMappings);
          }}
          onClose={() => setTaxonomyModal(null)}
        />
      )}
    </div>
  );
}
