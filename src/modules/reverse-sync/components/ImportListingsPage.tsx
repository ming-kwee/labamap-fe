"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/shared/contexts/AuthContext";
import { ChannelStoreService } from "@/modules/ecommerce-product-v2/step2-channel-fields/services/channelStore.service";
import { getChannelMeta } from "@/modules/ecommerce-product-v2/step2-channel-fields/components/stores/ChannelTypeBadge";
import type { ChannelStoreConnection, ChannelType } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import { useReverseImport } from "../hooks/useReverseImport";
import type { ReverseImportRequest } from "../types/reverse";
import { ImportPreviewModal } from "./ImportPreviewModal";

const LIMIT = 50;

/**
 * FE-0 / P0-B — "Import Listings" (use case B). Browse a store's channel catalogue and
 * import a channel-native item as a NEW DRAFT master (or link to an existing one). For
 * channels without catalogue browse (e.g. Shopee needs signing), paste the raw item
 * payload instead.
 */
export default function ImportListingsPage() {
  const { organization, user } = useAuth();
  const orgId = organization?.organizationId ?? "";
  const userId = user?.userId;
  const searchParams = useSearchParams();

  const [stores, setStores] = useState<ChannelStoreConnection[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storeId, setStoreId] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [manualPayload, setManualPayload] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [baseRequest, setBaseRequest] = useState<ReverseImportRequest | null>(null);

  const imp = useReverseImport(orgId);
  const selectedStore = useMemo(() => stores.find((s) => s.storeId === storeId) ?? null, [stores, storeId]);

  // Load active stores → drive the selector; preselect from ?storeId=.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setStoresLoading(true);
    ChannelStoreService.listStores(orgId)
      .then((list) => {
        if (cancelled) return;
        const active = list.filter((s) => s.isActive);
        setStores(active);
        const q = searchParams.get("storeId");
        const initial = (q && active.some((s) => s.storeId === q)) ? q : active[0]?.storeId ?? "";
        setStoreId(initial);
      })
      .catch(() => { /* selector just shows empty */ })
      .finally(() => { if (!cancelled) setStoresLoading(false); });
    return () => { cancelled = true; };
  }, [orgId, searchParams]);

  // Browse whenever the selected store or page changes.
  const { browse } = imp;
  useEffect(() => {
    if (storeId) browse(storeId, LIMIT, offset);
  }, [storeId, offset, browse]);

  const previewFromRow = useCallback(
    (channelProductId: string) => {
      if (!selectedStore) return;
      const req: ReverseImportRequest = {
        organizationId: orgId,
        storeId: selectedStore.storeId,
        channelType: selectedStore.channelType,
        channelProductId,
        userId,
      };
      setBaseRequest(req);
      imp.runPreview(req);
    },
    [selectedStore, orgId, userId, imp],
  );

  function previewFromPayload() {
    if (!selectedStore) return;
    setManualError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(manualPayload) as Record<string, unknown>;
    } catch {
      setManualError("Not valid JSON — paste the raw channel item body.");
      return;
    }
    const req: ReverseImportRequest = {
      organizationId: orgId,
      storeId: selectedStore.storeId,
      channelType: selectedStore.channelType,
      channelPayload: parsed,
      userId,
    };
    setBaseRequest(req);
    imp.runPreview(req);
  }

  function closePreview() {
    imp.resetPreview();
    setBaseRequest(null);
  }

  const meta = selectedStore ? getChannelMeta(selectedStore.channelType.toLowerCase() as ChannelType) : null;
  const items = imp.listing?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Preview modal */}
      {imp.preview && baseRequest && (
        <ImportPreviewModal
          open
          result={imp.preview}
          baseRequest={baseRequest}
          onClose={closePreview}
        />
      )}

      {/* Header + store selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Import Listings</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Pull products that exist only on a channel into a new master (DRAFT). For updating products already
            in My Products, use “Pull from channel” on the product page instead.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Store
          </label>
          <select
            value={storeId}
            onChange={(e) => { setStoreId(e.target.value); setOffset(0); setShowManual(false); }}
            disabled={storesLoading || stores.length === 0}
            className="min-w-[220px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 focus:border-brand-400 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            {storesLoading && <option>Loading…</option>}
            {!storesLoading && stores.length === 0 && <option value="">No active stores</option>}
            {stores.map((s) => (
              <option key={s.storeId} value={s.storeId}>
                {getChannelMeta(s.channelType.toLowerCase() as ChannelType).label} — {s.storeName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!storesLoading && stores.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-400">
          Connect an active store first in Channel Stores, then come back to import its listings.
        </div>
      )}

      {selectedStore && (
        <>
          {/* Browse catalogue */}
          <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {meta?.label} catalogue
              </h2>
              {imp.listing && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <button
                    type="button"
                    onClick={() => setOffset((o) => Math.max(0, o - LIMIT))}
                    disabled={offset === 0 || imp.listLoading}
                    className="rounded-lg border border-gray-200 px-2 py-1 font-medium hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    Prev
                  </button>
                  <span className="tabular-nums">{offset + 1}–{offset + items.length}</span>
                  <button
                    type="button"
                    onClick={() => setOffset((o) => o + LIMIT)}
                    disabled={items.length < LIMIT || imp.listLoading}
                    className="rounded-lg border border-gray-200 px-2 py-1 font-medium hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>

            {imp.listLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
              </div>
            ) : imp.listNotConfigured ? (
              <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
                This channel doesn’t support catalogue browse (needs signing). Paste a raw item payload below to import.
              </div>
            ) : imp.listError ? (
              <div className="p-4 text-sm text-error-600 dark:text-error-400">{imp.listError}</div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">No listings found on this store.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400 dark:bg-gray-800/50 dark:text-gray-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Title</th>
                    <th className="px-4 py-2 font-semibold">Channel ID</th>
                    <th className="px-4 py-2 font-semibold">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.channelProductId} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-200">{it.title}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">{it.channelProductId}</td>
                      <td className="px-4 py-2">
                        {it.status && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium capitalize text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            {it.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => previewFromRow(it.channelProductId)}
                          disabled={imp.previewLoading}
                          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                        >
                          Import
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Manual payload (Shopee / channels without browse) */}
          <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.02]">
            <button
              type="button"
              onClick={() => setShowManual((s) => !s)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                Import from a pasted payload
              </span>
              <span className="text-xs text-gray-400">{showManual ? "Hide" : "Show"}</span>
            </button>
            {showManual && (
              <div className="space-y-2 px-4 pb-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Paste the raw channel item body (e.g. a Shopee <code className="font-mono">get_item</code> response)
                  to import it directly.
                </p>
                <textarea
                  value={manualPayload}
                  onChange={(e) => setManualPayload(e.target.value)}
                  rows={8}
                  placeholder='{ "item": { … } }'
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-700 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                />
                {manualError && <p className="text-xs text-error-600 dark:text-error-400">{manualError}</p>}
                {imp.previewError && <p className="text-xs text-error-600 dark:text-error-400">{imp.previewError}</p>}
                <button
                  type="button"
                  onClick={previewFromPayload}
                  disabled={!manualPayload.trim() || imp.previewLoading}
                  className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {imp.previewLoading ? "Previewing…" : "Preview import"}
                </button>
              </div>
            )}
          </section>

          {/* Row-preview error (browse path) */}
          {imp.previewError && !showManual && (
            <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/25 dark:bg-error-500/10 dark:text-error-400">
              {imp.previewError}
            </div>
          )}
        </>
      )}
    </div>
  );
}
