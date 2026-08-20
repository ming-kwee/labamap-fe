"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/shared/contexts/AuthContext";
import { MasterProductService } from "../_services/master-product.service";
import type { MasterProduct, MasterProductChannelSummary, ChannelSyncStatus } from "../_types/master-product";
import { ChannelStoreService } from "@/modules/ecommerce-product-v2/step2-channel-fields/services/channelStore.service";
import type { ChannelStoreConnection } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import TagInput from "@/shared/ui/tag-input/TagInput";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_EMOJI: Record<string, string> = {
  shopify: "🛍", woocommerce: "🟣", amazon: "📦", tiktok: "🎵",
  ebay: "🔨", etsy: "🎨", lazada: "🛒", tokopedia: "🟢",
  facebook: "📘", shopee: "🧡", walmart: "🔵", wix: "⬛",
};

const PAGE_SIZE = 10;

// ─── Bulk Tag Modal ───────────────────────────────────────────────────────────

function BulkTagModal({
  selectedCount,
  orgId,
  productIds,
  onDone,
  onClose,
}: {
  selectedCount: number;
  orgId: string;
  productIds: string[];
  onDone: (msg: string) => void;
  onClose: () => void;
}) {
  const [addTags,       setAddTags]       = useState<string[]>([]);
  const [removeTags,    setRemoveTags]    = useState<string[]>([]);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [addSuggestions,    setAddSuggestions]    = useState<string[]>([]);
  const [removeSuggestions, setRemoveSuggestions] = useState<string[]>([]);

  const fetchAddSuggestions = useCallback(async (prefix: string) => {
    if (!prefix) return;
    const s = await MasterProductService.suggestTags(orgId, prefix);
    // exclude tags already in the addTags list
    setAddSuggestions(s.filter(t => !addTags.includes(t)));
  }, [orgId, addTags]);

  const fetchRemoveSuggestions = useCallback(async (prefix: string) => {
    if (!prefix) return;
    const s = await MasterProductService.suggestTags(orgId, prefix);
    // For remove field, exclude tags already in removeTags and newly added tags
    setRemoveSuggestions(s.filter(t => !removeTags.includes(t) && !addTags.includes(t)));
  }, [orgId, addTags, removeTags]);

  async function handleSave() {
    if (addTags.length === 0 && removeTags.length === 0) {
      setError("Add at least one tag to add or remove.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { updatedCount } = await MasterProductService.bulkUpdateTags(orgId, productIds, addTags, removeTags);
      onDone(`Tags updated for ${updatedCount} product${updatedCount !== 1 ? "s" : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tags");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Bulk Update Tags</p>
            <p className="text-xs text-gray-400 mt-0.5">{selectedCount} product{selectedCount !== 1 ? "s" : ""} selected</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none">✕</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Add tags</label>
            <TagInput
              value={addTags}
              onChange={setAddTags}
              suggestions={addSuggestions}
              onSuggestionSearch={fetchAddSuggestions}
              placeholder="Type tag and press Enter…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Remove tags</label>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
              Enter tags to remove from all selected products. Only existing tags will be affected.
            </p>
            <TagInput
              value={removeTags}
              onChange={setRemoveTags}
              suggestions={removeSuggestions}
              onSuggestionSearch={fetchRemoveSuggestions}
              placeholder="Tags to remove…"
            />
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-brand-500 hover:bg-brand-600 text-white transition-colors disabled:opacity-50">
            {saving ? "Saving…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);
// Import from channel — download-into arrow.
const ImportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const ChevronLeftIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
);
const ChevronRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6"/>
  </svg>
);
const PackageIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

// ─── Per-store publish status cell ────────────────────────────────────────────

// ─── Worst-status helper ──────────────────────────────────────────────────────

function worstStatus(statuses: ChannelSyncStatus[]): ChannelSyncStatus | "NONE" {
  if (statuses.includes("FAILED"))  return "FAILED";
  if (statuses.includes("WARNING")) return "WARNING";
  if (statuses.includes("SYNCING")) return "SYNCING";
  if (statuses.includes("SYNCED"))  return "SYNCED";
  if (statuses.includes("DRAFT"))   return "DRAFT";
  return "NONE";
}

// ─── Per-channel-type group badge (list view) ─────────────────────────────────
// Groups all stores of the same channel into one compact badge: 🛍 3/5
// This stays readable even with 10+ stores per channel.

function StoreStatusCell({
  channelSummary,
  orgStores,
}: {
  channelSummary: MasterProductChannelSummary[];
  orgStores: ChannelStoreConnection[];
}) {
  if (orgStores.length === 0) {
    if (channelSummary.length === 0)
      return <span className="text-xs text-gray-300 dark:text-gray-600">—</span>;
    // No org store data — fall back to raw summary icons
    const types = [...new Set(channelSummary.map(s => s.channelType))];
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {types.map(ct => (
          <span key={ct} className="text-sm leading-none">{CHANNEL_EMOJI[ct] ?? "🏪"}</span>
        ))}
      </div>
    );
  }

  // Group org stores by channel type
  const groups = new Map<string, ChannelStoreConnection[]>();
  for (const s of orgStores) {
    const arr = groups.get(s.channelType) ?? [];
    arr.push(s);
    groups.set(s.channelType, arr);
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {[...groups.entries()].map(([channelType, stores]) => {
        const published = stores.filter(s => channelSummary.some(c => c.storeId === s.storeId));
        const statuses  = published.map(s => channelSummary.find(c => c.storeId === s.storeId)!.syncStatus);
        const worst     = worstStatus(statuses);
        const emoji     = CHANNEL_EMOJI[channelType] ?? "🏪";

        const dotColor =
          worst === "FAILED"  ? "bg-red-500" :
          worst === "WARNING" ? "bg-amber-400" :
          worst === "SYNCING" ? "bg-blue-400 animate-pulse" :
          worst === "SYNCED"  ? "bg-green-500" :
          worst === "DRAFT"   ? "bg-gray-400" : "bg-gray-200 dark:bg-gray-600";

        const textColor =
          worst === "FAILED"  ? "text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10" :
          worst === "WARNING" ? "text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10" :
          worst === "SYNCED"  ? "text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10" :
          "text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800";

        // Tooltip: list each store and its status
        const tip = stores.map(s => {
          const entry = channelSummary.find(c => c.storeId === s.storeId);
          return `${s.storeName}: ${entry ? entry.syncStatus : "not published"}`;
        }).join("\n");

        return (
          <span
            key={channelType}
            title={tip}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-medium ${textColor}`}
          >
            <span className="text-xs leading-none">{emoji}</span>
            <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
            <span className="tabular-nums">{published.length}/{stores.length}</span>
          </span>
        );
      })}
    </div>
  );
}


// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800">
      <td className="px-4 py-3 w-10"><div className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" /></td>
      <td className="px-3 py-3 w-12"><div className="h-10 w-10 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" /></td>
      <td className="px-4 py-3">
        <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-1.5" />
        <div className="h-3 w-24 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </td>
      <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" /></td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <div className="h-5 w-20 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-1" />
        <div className="h-3 w-14 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MyProductsPage() {
  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";
  const router = useRouter();

  // ── Data state ──────────────────────────────────────────────────────────────
  const [products, setProducts]     = useState<MasterProduct[]>([]);
  const [orgStores, setOrgStores]   = useState<ChannelStoreConnection[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  // isLoading: true only on the very first fetch (shows skeleton rows).
  // isFetching: true on every subsequent fetch (shows subtle opacity on existing rows).
  const [isLoading, setIsLoading]   = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const hasLoadedOnce = React.useRef(false);
  const [loadError, setLoadError]   = useState<string | null>(null);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [page, setPage]             = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [channelFilter, setChannelFilter]   = useState<string>("ALL");
  const [statusFilter, setStatusFilter]     = useState<ChannelSyncStatus | "ALL">("ALL");
  const [tagFilter, setTagFilter]           = useState<string[]>([]);
  const [debouncedTagFilter, setDebouncedTagFilter] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);

  // ── Selection state ─────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Debounce search ─────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchQuery); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Debounce tag filter ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedTagFilter(tagFilter); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [tagFilter]);

  // ── Tag autocomplete ─────────────────────────────────────────────────────────
  const fetchTagSuggestions = useCallback(async (prefix: string) => {
    if (!orgId || !prefix) return;
    const s = await MasterProductService.suggestTags(orgId, prefix);
    setTagSuggestions(s);
  }, [orgId]);

  // Stores rarely change — fetch once per session and cache in a ref.
  // This prevents a double-render blink: if stores were fetched separately,
  // the table would paint with empty orgStores then repaint when stores arrived.
  const storesLoadedRef = React.useRef(false);

  // ── Load products (+ stores on first call) ──────────────────────────────────
  const load = useCallback(async () => {
    if (!orgId) return;
    if (!hasLoadedOnce.current) {
      setIsLoading(true);   // initial load → show skeletons
    } else {
      setIsFetching(true);  // subsequent loads → dim existing rows, no skeleton flash
    }
    setLoadError(null);
    try {
      const storesFetch = storesLoadedRef.current
        ? Promise.resolve(null)
        : ChannelStoreService.listStores(orgId).catch(() => [] as ChannelStoreConnection[]);

      const [res, stores] = await Promise.all([
        MasterProductService.list({
          organizationId: orgId,
          page,
          size:  PAGE_SIZE,
          q:     debouncedSearch || undefined,
          tags:  debouncedTagFilter.length > 0 ? debouncedTagFilter : undefined,
          channelType:   channelFilter !== "ALL" ? channelFilter  : undefined,
          channelStatus: statusFilter  !== "ALL" ? statusFilter   : undefined,
        }),
        storesFetch,
      ]);

      if (stores !== null) {
        setOrgStores((stores as ChannelStoreConnection[]).filter(s => s.isActive));
        storesLoadedRef.current = true;
      }
      setProducts(res.content);
      setTotalElements(res.totalElements);
      setTotalPages(res.totalPages);
      hasLoadedOnce.current = true;
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [orgId, page, debouncedSearch, debouncedTagFilter, channelFilter, statusFilter]);

  useEffect(() => { setSelectedIds(new Set()); }, [page]);
  useEffect(() => { load(); }, [load]);

  // ── Selection helpers ───────────────────────────────────────────────────────
  const allSelected = products.length > 0 && products.every(p => selectedIds.has(p.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(prev => { const n = new Set(prev); products.forEach(p => n.delete(p.id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); products.forEach(p => n.add(p.id)); return n; });
    }
  };
  const toggleOne = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectedCount = selectedIds.size;

  const channelTypes = [...new Set(orgStores.map(s => s.channelType))];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">

      {/* Header */}
      <div className="bg-white dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60 px-6 py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center flex-shrink-0 text-brand-600 dark:text-brand-400">
              <PackageIcon />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">My Products</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {isLoading
                  ? "Loading…"
                  : `${totalElements} product${totalElements !== 1 ? "s" : ""}${orgStores.length > 0 ? ` · ${orgStores.length} store${orgStores.length !== 1 ? "s" : ""} connected` : ""}`
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Import products that already live on a connected channel (reverse import). */}
            <Link
              href="/reverse-sync/import"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors"
            >
              <ImportIcon /> Import from channel
            </Link>
            <Link
              href="/products/v2/create"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-xl transition-colors shadow-sm shadow-brand-500/20"
            >
              <PlusIcon /> Create Product
            </Link>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700/40 px-6 py-3 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><SearchIcon /></span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search name or SKU…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
          />
        </div>

        {/* Channel filter — built from org stores */}
        {channelTypes.length > 0 && (
          <select
            value={channelFilter}
            onChange={e => { setChannelFilter(e.target.value); setPage(0); }}
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none"
          >
            <option value="ALL">All stores</option>
            {channelTypes.map(ct => (
              <option key={ct} value={ct}>
                {CHANNEL_EMOJI[ct] ?? "🏪"} {ct.charAt(0).toUpperCase() + ct.slice(1)}
              </option>
            ))}
          </select>
        )}

        {/* Publish status filter */}
        <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {([
            { value: "ALL",     label: "All" },
            { value: "SYNCED",  label: "Synced" },
            { value: "WARNING", label: "Warning" },
            { value: "FAILED",  label: "Failed" },
            { value: "DRAFT",   label: "Draft" },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(0); }}
              className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? opt.value === "FAILED"  ? "bg-red-500 text-white"
                  : opt.value === "WARNING" ? "bg-amber-500 text-white"
                  : opt.value === "DRAFT"   ? "bg-gray-500 text-white"
                  : "bg-brand-500 text-white"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-xs text-gray-400 tabular-nums">
          {isLoading ? "…" : `${totalElements} product${totalElements !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Tag filter row — separate line for clarity */}
      <div className="bg-white dark:bg-gray-800/30 border-b border-gray-200 dark:border-gray-700/40 px-6 py-2.5 flex items-center gap-3">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 flex-shrink-0">Filter by tags:</span>
        <div className="flex-1 max-w-lg">
          <TagInput
            value={tagFilter}
            onChange={v => { setTagFilter(v); setPage(0); }}
            suggestions={tagSuggestions}
            onSuggestionSearch={fetchTagSuggestions}
            placeholder="Type a tag and press Enter to filter…"
          />
        </div>
        {tagFilter.length > 0 && (
          <button
            onClick={() => { setTagFilter([]); setPage(0); }}
            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 transition-colors flex-shrink-0"
          >
            Clear tags ({tagFilter.length})
          </button>
        )}
      </div>

      {/* Error */}
      {loadError && (
        <div className="mx-6 mt-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400">
          <AlertIcon />
          <div>
            <p className="font-medium">Failed to load products</p>
            <p className="text-xs mt-0.5 opacity-80">{loadError}</p>
          </div>
          <button onClick={load} className="ml-auto text-xs underline flex-shrink-0">Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="px-6 py-4">
        <div className={`rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 transition-opacity duration-150 ${isFetching ? "opacity-60 pointer-events-none" : "opacity-100"}`}>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/30" />
                </th>
                <th className="px-3 py-3 w-14" />
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Product</th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">
                  Publish status
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: PAGE_SIZE }, (_, i) => <SkeletonRow key={i} />)}

              {!isLoading && !loadError && products.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-3xl">📦</div>
                      {debouncedSearch || channelFilter !== "ALL" || statusFilter !== "ALL" ? (
                        <>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No products match your filters</p>
                          <button
                            onClick={() => { setSearchQuery(""); setChannelFilter("ALL"); setStatusFilter("ALL"); setPage(0); }}
                            className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            Clear filters
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No products yet</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs">
                            Create your first master product, then publish it to your connected stores.
                          </p>
                          <Link
                            href="/products/v2/create"
                            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-xl transition-colors shadow-sm"
                          >
                            <PlusIcon /> Create your first product
                          </Link>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && products.map(product => (
                <tr
                  key={product.id}
                  onClick={() => router.push(`/products/${product.id}`)}
                  className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50/60 dark:hover:bg-gray-800/30 cursor-pointer transition-colors"
                >
                  {/* Checkbox */}
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(product.id)} onChange={() => toggleOne(product.id)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500/30" />
                  </td>

                  {/* Thumbnail */}
                  <td className="px-3 py-3">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name}
                        className="w-10 h-10 rounded-lg object-cover border border-gray-100 dark:border-gray-700" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg">📦</div>
                    )}
                  </td>

                  {/* Name / SKU / tags */}
                  <td className="px-4 py-3 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[220px]">{product.name}</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">
                      {product.sku ? `SKU: ${product.sku}` : "No SKU"}
                      {product.variantCount > 1 && (
                        <span className="ml-2 not-italic font-sans text-gray-300 dark:text-gray-600">
                          · {product.variantCount} variants
                        </span>
                      )}
                    </p>
                    {product.tags && product.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {product.tags.slice(0, 4).map(tag => (
                          <button
                            key={tag}
                            onClick={e => { e.stopPropagation(); setTagFilter(prev => prev.includes(tag) ? prev : [...prev, tag]); }}
                            title={`Filter by "${tag}"`}
                            className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                          >
                            {tag}
                          </button>
                        ))}
                        {product.tags.length > 4 && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 px-1">+{product.tags.length - 4}</span>
                        )}
                      </div>
                    )}
                  </td>


                  {/* Publish status — per-store badges */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <StoreStatusCell channelSummary={product.channelSummary} orgStores={orgStores} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom bar: bulk actions + pagination */}
        {!isLoading && (products.length > 0 || selectedCount > 0) && (
          <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              {selectedCount > 0 ? (
                <>
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{selectedCount} selected</span>
                  <button
                    onClick={() => setShowBulkTagModal(true)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Edit tags
                  </button>
                  <button
                    onClick={() => showToast("Bulk sync coming soon", "ok")}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Sync selected
                  </button>
                  <button
                    onClick={() => showToast("Export coming soon", "ok")}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Export
                  </button>
                </>
              ) : (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {totalElements} product{totalElements !== 1 ? "s" : ""} total
                </span>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeftIcon />
                </button>

                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const pageNum = totalPages <= 7 ? i : (
                    page < 4 ? i :
                    page > totalPages - 4 ? totalPages - 7 + i :
                    page - 3 + i
                  );
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`min-w-[32px] h-8 rounded-lg text-xs font-medium transition-colors ${
                        pageNum === page
                          ? "bg-brand-500 text-white"
                          : "border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}

                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRightIcon />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk Tag Modal */}
      {showBulkTagModal && (
        <BulkTagModal
          selectedCount={selectedCount}
          orgId={orgId}
          productIds={[...selectedIds]}
          onDone={(msg) => {
            setShowBulkTagModal(false);
            setSelectedIds(new Set());
            showToast(msg);
            load();
          }}
          onClose={() => setShowBulkTagModal(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "ok" ? "bg-green-500 text-white" : "bg-red-500 text-white"
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
