"use client";

/**
 * SourceDrawer — the "Load channel product" loader for the Reverse Playground.
 *
 * Mirrors the forward InputPanel's side-drawer pattern: a right-side overlay opened by a
 * "Load channel product" button, with a summary bar of what's currently loaded.
 *
 * Flow:
 *   store <select>  → ReverseSyncService.listChannelListings (lazy, per store)
 *   product picker  → items[] with a "Load more" pager (offset += pageSize)
 *   optional master-product-id input (populates the would-change column)
 *   Pull & reverse  → ReverseSyncService.pullRaw → RawPull (channelType, apiVersion, payload)
 *   Reverse config  → getJoltSpec(channelType) shown read-only via <JsonTree/>
 *
 * Read-only: only list + pullRaw + jolt-spec. Never apply/import.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ReverseSyncService,
  type ChannelListItem,
  type RawPull,
  type ReverseJoltSpec,
} from "@/modules/reverse-sync";
import { ChannelStoreService } from "@/modules/ecommerce-product-v2/step2-channel-fields/services/channelStore.service";
import type { ChannelStoreConnection } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import JsonTree from "@/app/(admin)/platform-admin/post-processing-playground/_components/JsonTree";

const PAGE_SIZE = 50;

// ─── Icons ───────────────────────────────────────────────────────────────────
const CloseIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>);
const RefreshIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></svg>);
const ChevronIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>);

/** What the parent stores after a successful pull, plus display context for the summary bar. */
export interface LoadedSource {
  raw: RawPull;
  storeName: string;
  productTitle: string;
}

export default function SourceDrawer({
  open,
  onClose,
  orgId,
  onLoaded,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  /** Called with the pulled RawPull + display context; the parent then closes the drawer. */
  onLoaded: (loaded: LoadedSource) => void;
}) {
  // ── Stores (lazy-loaded when the drawer first opens) ──────────────────────────
  const [stores, setStores] = useState<ChannelStoreConnection[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState("");

  const loadStores = useCallback(async () => {
    if (!orgId) {
      setStoresError("No organization in session — sign in to list stores.");
      return;
    }
    setStoresLoading(true);
    setStoresError(null);
    try {
      setStores(await ChannelStoreService.listStores(orgId));
    } catch (e) {
      setStoresError((e as Error).message);
    } finally {
      setStoresLoading(false);
    }
  }, [orgId]);

  // Lazy-load the store list the first time the drawer is opened.
  useEffect(() => {
    if (open && stores.length === 0 && !storesLoading && !storesError) loadStores();
  }, [open, stores.length, storesLoading, storesError, loadStores]);

  // ── Product listings (per store, paged) ───────────────────────────────────────
  const [items, setItems] = useState<ChannelListItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [filter, setFilter] = useState("");

  const fetchPage = useCallback(
    async (storeId: string, nextOffset: number, append: boolean) => {
      if (!orgId || !storeId) return;
      setListLoading(true);
      setListError(null);
      try {
        const page = await ReverseSyncService.listChannelListings({
          organizationId: orgId,
          storeId,
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        const pageItems = page.items ?? [];
        setItems((prev) => (append ? [...prev, ...pageItems] : pageItems));
        setOffset(nextOffset);
        // A full page implies there may be more; a short page means we've reached the end.
        setHasMore(pageItems.length === PAGE_SIZE);
      } catch (e) {
        setListError((e as Error).message);
      } finally {
        setListLoading(false);
      }
    },
    [orgId],
  );

  const onSelectStore = useCallback(
    (storeId: string) => {
      setSelectedStoreId(storeId);
      setSelectedProductId("");
      setItems([]);
      setOffset(0);
      setHasMore(false);
      setListError(null);
      setFilter("");
      if (storeId) fetchPage(storeId, 0, false);
    },
    [fetchPage],
  );

  // ── Master link + reverse config ──────────────────────────────────────────────
  const [masterProductId, setMasterProductId] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);

  const selectedStore = stores.find((s) => s.storeId === selectedStoreId);

  // Reverse config (reverse-JOLT spec) for the selected store's channel — informational.
  const [configOpen, setConfigOpen] = useState(false);
  const [joltSpec, setJoltSpec] = useState<ReverseJoltSpec | null>(null);
  const [joltLoading, setJoltLoading] = useState(false);
  const [joltError, setJoltError] = useState<string | null>(null);

  // Load the reverse config lazily when the section is first expanded for a channel.
  useEffect(() => {
    const channelId = selectedStore?.channelType;
    if (!configOpen || !channelId) return;
    setJoltLoading(true);
    setJoltError(null);
    setJoltSpec(null);
    ReverseSyncService.getJoltSpec(channelId)
      .then(setJoltSpec)
      .catch((e) => setJoltError((e as Error).message))
      .finally(() => setJoltLoading(false));
  }, [configOpen, selectedStore?.channelType]);

  const onPull = useCallback(async () => {
    if (!selectedStoreId || !selectedProductId) return;
    setPulling(true);
    setPullError(null);
    try {
      const raw = await ReverseSyncService.pullRaw({
        organizationId: orgId,
        storeId: selectedStoreId,
        channelProductId: selectedProductId,
        ...(masterProductId.trim() ? { masterProductId: masterProductId.trim() } : {}),
      });
      const productTitle =
        items.find((it) => it.channelProductId === selectedProductId)?.title ?? selectedProductId;
      onLoaded({
        raw,
        storeName: selectedStore?.storeName ?? selectedStoreId,
        productTitle,
      });
    } catch (e) {
      setPullError((e as Error).message);
    } finally {
      setPulling(false);
    }
  }, [selectedStoreId, selectedProductId, orgId, masterProductId, items, selectedStore, onLoaded]);

  const visibleItems = filter.trim()
    ? items.filter((it) =>
        (it.title ?? "").toLowerCase().includes(filter.trim().toLowerCase()) ||
        it.channelProductId.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : items;

  return (
    <div
      className={`fixed inset-0 z-[100000] ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`absolute inset-y-0 right-0 w-[92vw] max-w-md bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-label="Load channel product"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Load channel product</h3>
          <button onClick={onClose} className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
          {/* Store picker */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Store</label>
              <button
                onClick={loadStores}
                disabled={storesLoading}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-500 hover:text-brand-600 disabled:opacity-50"
              >
                <span className={storesLoading ? "animate-spin" : ""}><RefreshIcon /></span> refresh
              </button>
            </div>
            <select
              value={selectedStoreId}
              onChange={(e) => onSelectStore(e.target.value)}
              disabled={storesLoading}
              aria-label="Pick a store"
              className="w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="">{storesLoading ? "Loading stores…" : "Select a store…"}</option>
              {stores.map((s) => (
                <option key={s.storeId} value={s.storeId}>
                  {s.storeName} · {s.channelType}
                </option>
              ))}
            </select>
            {storesError && <p className="mt-1 text-[11px] text-red-500 dark:text-red-400">{storesError}</p>}
          </div>

          {/* Product picker */}
          {selectedStoreId && (
            <div>
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Channel product</label>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter loaded products…"
                aria-label="Filter products"
                className="mt-1 w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                disabled={listLoading && items.length === 0}
                aria-label="Pick a channel product"
                size={Math.min(Math.max(visibleItems.length, 3), 8)}
                className="mt-1.5 w-full text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 px-1 py-1 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {visibleItems.length === 0 && (
                  <option value="" disabled>
                    {listLoading ? "Loading products…" : "No products"}
                  </option>
                )}
                {visibleItems.map((it) => (
                  <option key={it.channelProductId} value={it.channelProductId}>
                    {it.title || it.channelProductId}
                    {it.status ? `  [${it.status}]` : ""}
                  </option>
                ))}
              </select>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-400 dark:text-gray-500">
                  {items.length} loaded{filter.trim() ? ` · ${visibleItems.length} shown` : ""}
                </span>
                {hasMore && (
                  <button
                    onClick={() => fetchPage(selectedStoreId, offset + PAGE_SIZE, true)}
                    disabled={listLoading}
                    className="text-[11px] font-medium text-brand-500 hover:text-brand-600 disabled:opacity-50"
                  >
                    {listLoading ? "Loading…" : "Load more"}
                  </button>
                )}
              </div>
              {listError && <p className="mt-1 text-[11px] text-red-500 dark:text-red-400">{listError}</p>}
            </div>
          )}

          {/* Optional master link */}
          {selectedStoreId && (
            <div>
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                Link master product id <span className="text-gray-400">(optional)</span>
              </label>
              <input
                value={masterProductId}
                onChange={(e) => setMasterProductId(e.target.value)}
                placeholder="master-product-id…"
                aria-label="Link master product id"
                className="mt-1 w-full text-xs font-mono rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                When set, the master-mapped bucket shows the would-change diff against this product.
              </p>
            </div>
          )}

          {/* Pull action */}
          {selectedStoreId && (
            <div>
              <button
                onClick={onPull}
                disabled={!selectedProductId || pulling}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pulling ? "Pulling…" : "Pull & reverse"}
              </button>
              {pullError && <p className="mt-1.5 text-[11px] text-red-500 dark:text-red-400">{pullError}</p>}
            </div>
          )}

          {/* Reverse config (read-only reverse-JOLT projection) */}
          {selectedStore && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-800">
              <button
                onClick={() => setConfigOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
                aria-expanded={configOpen}
              >
                <span className={`text-gray-400 transition-transform ${configOpen ? "rotate-180" : ""}`}><ChevronIcon /></span>
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Reverse config</span>
                <span className="text-[11px] text-gray-400">{selectedStore.channelType} · read-only</span>
              </button>
              {configOpen && (
                <div className="px-3 pb-3">
                  {joltLoading && <p className="text-[11px] text-gray-400 dark:text-gray-500">Loading reverse config…</p>}
                  {joltError && <p className="text-[11px] text-red-500 dark:text-red-400">{joltError}</p>}
                  {joltSpec && <JsonTree data={joltSpec} />}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
