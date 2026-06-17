"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { MasterProductService } from "@/app/(admin)/products/_services/master-product.service";
import type { MasterProduct } from "@/app/(admin)/products/_types/master-product";
import type { TaxonomyCategory } from "../_types/channel-mapping";
import type { ChannelStoreConnection } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import { CategoryBrowseModal } from "./CategoryBrowseModal";

// ─── Icons ────────────────────────────────────────────────────────────────────

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
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

// ─── Channel helpers ──────────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
  shopify: "Shopify", shopee: "Shopee", tokopedia: "Tokopedia",
  amazon: "Amazon", lazada: "Lazada", tiktok: "TikTok", tiktokshop: "TikTok",
  ebay: "eBay",
};

const CHANNEL_EMOJI: Record<string, string> = {
  shopify: "🛍", shopee: "🧡", tokopedia: "🟢", amazon: "📦",
  lazada: "🛒", tiktok: "🎵", tiktokshop: "🎵", ebay: "🔨",
};

const TREE_CAPABLE_FALLBACK = ["shopee", "amazon", "tiktok", "tiktokshop", "ebay", "lazada"];

// ─── BulkAssignTab ────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

interface Props {
  stores: ChannelStoreConnection[];
  orgId: string;
}

export function BulkAssignTab({ stores, orgId }: Props) {
  // Eligible stores for bulk category assignment (treeCapable or taxonomyEnabled)
  const eligibleStores = useMemo(() => stores.filter(s =>
    s.treeCapable === true
    || s.taxonomyEnabled === true
    || (s.treeCapable == null && TREE_CAPABLE_FALLBACK.includes(s.channelType))
    || (s.treeCapable == null && s.taxonomyEnabled == null && s.channelType === "shopify")
  ), [stores]);

  // ── Product list state ────────────────────────────────────────────────────
  const [products, setProducts]         = useState<MasterProduct[]>([]);
  const [loading, setLoading]           = useState(true);  // true on mount so skeleton shows before first effect fires
  const [error, setError]               = useState<string | null>(null);
  const [page, setPage]                 = useState(0);
  const [totalPages, setTotalPages]     = useState(0);
  const [totalElements, setTotalElements] = useState(0);

  // Search + filter
  const [searchQuery, setSearchQuery]   = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [tagFilter, setTagFilter]       = useState<string[]>([]);
  const [tagInput, setTagInput]         = useState("");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());

  // ── Target: store + category ──────────────────────────────────────────────
  const [targetStore, setTargetStore]   = useState<ChannelStoreConnection | null>(null);
  const [targetCategory, setTargetCategory] = useState<{ id: string; name: string; fullPath: string } | null>(null);
  const [browseOpen, setBrowseOpen]     = useState(false);

  // ── Apply state ───────────────────────────────────────────────────────────
  const [applying, setApplying]         = useState(false);
  const [toast, setToast]               = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // Load products — stamped with a monotonic id so stale responses from earlier
  // in-flight requests are discarded if a newer load has already started.
  const load = useCallback(async (p: number) => {
    if (!orgId) return;
    const id = ++loadIdRef.current;
    lastAttemptedPageRef.current = p;
    setLoading(true);
    setError(null);
    try {
      const res = await MasterProductService.list({
        organizationId: orgId,
        page: p,
        size: PAGE_SIZE,
        q:    debouncedQuery || undefined,
        tags: tagFilter.length > 0 ? tagFilter : undefined,
        status: "ACTIVE",
      });
      if (id !== loadIdRef.current) return;  // superseded by a newer load — discard
      setProducts(res.content);
      setTotalPages(res.totalPages);
      setTotalElements(res.totalElements);
      setPage(p);
    } catch (err) {
      if (id !== loadIdRef.current) return;
      setError((err as Error).message);
    } finally {
      if (id === loadIdRef.current) setLoading(false);
    }
  }, [orgId, debouncedQuery, tagFilter]);

  // Reload when filters change — reset to page 0 and clear selection
  useEffect(() => {
    setSelectedIds(new Set());
    load(0);
  }, [load]);

  function showToast(msg: string, type: "ok" | "err" = "ok") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Tag filter helpers ────────────────────────────────────────────────────

  function addTag(tag: string) {
    const t = tag.trim().toLowerCase();
    if (t && !tagFilter.includes(t)) setTagFilter(prev => [...prev, t]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTagFilter(prev => prev.filter(t => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && tagInput === "" && tagFilter.length > 0) {
      setTagFilter(prev => prev.slice(0, -1));
    }
  }

  // ── Selection helpers ─────────────────────────────────────────────────────

  function toggleProduct(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function togglePageAll() {
    const pageIds = products.map(p => p.id);
    const allSelected = pageIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach(id => next.delete(id));
      } else {
        pageIds.forEach(id => next.add(id));
      }
      return next;
    });
  }

  const pageAllSelected = products.length > 0 && products.every(p => selectedIds.has(p.id));
  const pagePartialSelected = !pageAllSelected && products.some(p => selectedIds.has(p.id));

  // Monotonic counter — each load() increments it; stale responses check against current value
  const loadIdRef = useRef(0);
  // Tracks the page number of the last attempted load so the retry button uses the right page
  const lastAttemptedPageRef = useRef(0);

  // Select all checkbox ref for indeterminate state
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = pagePartialSelected;
    }
  }, [pagePartialSelected]);

  // ── Store change → clear category ─────────────────────────────────────────

  function handleStoreChange(storeId: string) {
    const s = eligibleStores.find(s => s.storeId === storeId) ?? null;
    setTargetStore(s);
    setTargetCategory(null);
  }

  // ── Category browse callback ──────────────────────────────────────────────

  function handleCategorySelect(node: TaxonomyCategory, path: TaxonomyCategory[]) {
    setTargetCategory({
      id:       node.id,
      name:     node.name,
      fullPath: path.map(n => n.name).join(" › "),
    });
    setBrowseOpen(false);
  }

  // ── Bulk apply ────────────────────────────────────────────────────────────

  async function handleApply() {
    if (!targetStore || !targetCategory || selectedIds.size === 0) return;
    setApplying(true);
    try {
      const result = await MasterProductService.bulkAssignChannelCategory(orgId, {
        productIds:       Array.from(selectedIds),
        storeId:          targetStore.storeId,
        channelType:      targetStore.channelType,
        categoryId:       targetCategory.id,
        categoryName:     targetCategory.name,
        categoryFullPath: targetCategory.fullPath,
      });
      const msg = result.failedIds.length > 0
        ? `${result.updatedCount} updated · ${result.failedIds.length} failed`
        : `${result.updatedCount} product${result.updatedCount !== 1 ? "s" : ""} updated`;
      // Red only when nothing succeeded; partial success (some updated, some failed) stays green
      showToast(msg, result.updatedCount === 0 ? "err" : "ok");
      setSelectedIds(new Set());
    } catch (err) {
      showToast((err as Error).message, "err");
    } finally {
      setApplying(false);
    }
  }

  const canApply = selectedIds.size > 0 && targetStore !== null && targetCategory !== null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-4">

      {/* Description */}
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-2xl leading-relaxed">
        Select products and set their channel category in one step. The category is saved directly
        on each channel listing — the same field set by CategoryTreePicker in{" "}
        <Link href="/products" className="text-brand-600 dark:text-brand-400 hover:underline">Step 2</Link>.
      </p>

      {/* ── Target: store + category ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex-shrink-0">
          Assign to
        </span>

        {/* Store picker */}
        {eligibleStores.length === 0 ? (
          <p className="text-xs text-gray-400 italic">
            No eligible stores — connect Shopee, Amazon, TikTok, eBay, Lazada, or Shopify first.
          </p>
        ) : (
          <select
            value={targetStore?.storeId ?? ""}
            onChange={e => handleStoreChange(e.target.value)}
            className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <option value="">Pick a channel store…</option>
            {eligibleStores.map(s => (
              <option key={s.storeId} value={s.storeId}>
                {CHANNEL_EMOJI[s.channelType] ?? "🏪"} {s.storeName} ({CHANNEL_LABEL[s.channelType] ?? s.channelType})
              </option>
            ))}
          </select>
        )}

        {/* Category picker */}
        {targetStore && (
          <>
            <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">›</span>
            {targetCategory ? (
              <div className="flex items-center gap-2">
                <span
                  className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[260px]"
                  title={targetCategory.fullPath}
                >
                  {targetCategory.fullPath || targetCategory.name}
                </span>
                <button
                  onClick={() => setBrowseOpen(true)}
                  className="text-xs text-brand-600 dark:text-brand-400 hover:underline flex-shrink-0"
                >
                  change
                </button>
              </div>
            ) : (
              <button
                onClick={() => setBrowseOpen(true)}
                className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
              >
                Browse category →
              </button>
            )}
          </>
        )}

        {/* Apply button */}
        <div className="ml-auto flex items-center gap-2 flex-shrink-0">
          {selectedIds.size > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {selectedIds.size} product{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
          )}
          <button
            onClick={handleApply}
            disabled={!canApply || applying}
            className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {applying && <span className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin" />}
            {applying ? "Applying…" : `Apply to ${selectedIds.size || "…"}`}
          </button>
        </div>
      </div>

      {/* ── Search + tag filter ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {/* Search */}
        <div className="relative min-w-[200px] max-w-xs flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><SearchIcon /></span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search products…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>

        {/* Tag filter chips */}
        <div className="flex items-center gap-1 flex-wrap">
          {tagFilter.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 text-xs font-medium">
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-brand-900 dark:hover:text-brand-200">
                <XIcon />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={() => tagInput && addTag(tagInput)}
            placeholder={tagFilter.length === 0 ? "Filter by tag…" : "+ tag"}
            className="w-28 px-2 py-0.5 text-xs border border-dashed border-gray-300 dark:border-gray-600 rounded-full bg-transparent text-gray-600 dark:text-gray-400 placeholder-gray-400 focus:outline-none focus:border-brand-400"
          />
        </div>

        <span className="ml-auto text-xs text-gray-400 tabular-nums">
          {totalElements} product{totalElements !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400">
          <AlertIcon /> {error}
          <button onClick={() => load(lastAttemptedPageRef.current)} className="ml-auto text-xs underline">Retry</button>
        </div>
      )}

      {/* ── Product table ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-left border-separate border-spacing-0">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/60">
              <th className="px-3 py-2.5 border-b border-b-gray-200 dark:border-b-gray-700 w-10">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={pageAllSelected}
                  onChange={togglePageAll}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-brand-500"
                />
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-b-gray-200 dark:border-b-gray-700">
                Product
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-b-gray-200 dark:border-b-gray-700 hidden sm:table-cell">
                Tags
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-b-gray-200 dark:border-b-gray-700 hidden md:table-cell">
                Tags
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-3">
                    <div className="h-3.5 w-3.5 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="h-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" style={{ width: `${50 + i * 7}%`, opacity: 1 - i * 0.12 }} />
                    <div className="h-3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse mt-1.5 w-20" />
                  </td>
                  <td className="px-3 py-3 hidden sm:table-cell">
                    <div className="h-4 w-16 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    <div className="h-4 w-24 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
                  </td>
                </tr>
              ))
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-16 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {debouncedQuery || tagFilter.length > 0
                      ? "No products match your search"
                      : "No products found"}
                  </p>
                  {!debouncedQuery && tagFilter.length === 0 && (
                    <Link href="/products/v2/create" className="text-sm text-brand-600 dark:text-brand-400 hover:underline mt-2 inline-block">
                      Create a product →
                    </Link>
                  )}
                </td>
              </tr>
            ) : (
              products.map(product => {
                const isSelected = selectedIds.has(product.id);
                return (
                  <tr
                    key={product.id}
                    onClick={() => toggleProduct(product.id)}
                    className={`cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${
                      isSelected
                        ? "bg-brand-50/60 dark:bg-brand-500/5 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                        : "hover:bg-gray-50/60 dark:hover:bg-gray-800/20"
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleProduct(product.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-brand-500"
                      />
                    </td>

                    {/* Product */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt=""
                            className="w-8 h-8 rounded-lg object-cover flex-shrink-0 bg-gray-100 dark:bg-gray-800"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{product.name}</p>
                          {product.sku && (
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">{product.sku}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Tags */}
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      <div className="flex items-center gap-1 flex-wrap max-w-[160px]">
                        {(product.tags ?? []).slice(0, 3).map(tag => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            {tag}
                          </span>
                        ))}
                        {(product.tags?.length ?? 0) > 3 && (
                          <span className="text-[10px] text-gray-400">+{(product.tags?.length ?? 0) - 3}</span>
                        )}
                      </div>
                    </td>

                    {/* ProductType / tags */}
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1 max-w-[150px]">
                        {(product.tags ?? []).slice(0, 2).map(tag => (
                          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            {tag}
                          </span>
                        ))}
                        {(product.tags?.length ?? 0) > 2 && (
                          <span className="text-[10px] text-gray-400">+{(product.tags?.length ?? 0) - 2}</span>
                        )}
                        {(product.tags?.length ?? 0) === 0 && (
                          <span className="text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <button
            onClick={() => load(page - 1)}
            disabled={page === 0 || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeftIcon /> Prev
          </button>
          <span className="text-xs text-gray-400 tabular-nums">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => load(page + 1)}
            disabled={page >= totalPages - 1 || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRightIcon />
          </button>
        </div>
      )}

      {/* ── Category browse modal ──────────────────────────────────────────── */}
      {browseOpen && targetStore && (
        <CategoryBrowseModal
          channelType={targetStore.channelType}
          store={targetStore}
          orgId={orgId}
          onSelect={handleCategorySelect}
          onClose={() => setBrowseOpen(false)}
        />
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
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
