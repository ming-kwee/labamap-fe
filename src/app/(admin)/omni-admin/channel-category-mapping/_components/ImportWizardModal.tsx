"use client";

import React, { useState, useEffect } from "react";
import type { ImportableCollection } from "../_types/channel-mapping";
import { ChannelMappingService } from "../_services/channel-mapping.service";
import type { ChannelStoreConnection } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const CHANNEL_LABEL: Record<string, string> = {
  shopify: "Shopify", woocommerce: "WooCommerce", etsy: "Etsy",
};

type Step = "pick-store" | "review" | "confirming" | "done";

interface Props {
  organizationId: string;
  /** Only stores whose channelType supports import (Shopify, WooCommerce, Etsy) */
  importableStores: ChannelStoreConnection[];
  onDone: () => void;
  onClose: () => void;
}

export function ImportWizardModal({ organizationId, importableStores, onDone, onClose }: Props) {
  const [step, setStep] = useState<Step>(importableStores.length === 1 ? "review" : "pick-store");
  const [selectedStore, setSelectedStore] = useState<ChannelStoreConnection | null>(
    importableStores.length === 1 ? importableStores[0] : null
  );
  const [collections, setCollections] = useState<ImportableCollection[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  // Auto-load collections when store is selected and step is review
  useEffect(() => {
    if (step === "review" && selectedStore) {
      setLoading(true);
      setError(null);
      ChannelMappingService.previewImport(selectedStore.storeId, organizationId)
        .then(cols => {
          setCollections(cols);
          // Default: select all manual, deselect smart
          setSelectedIds(new Set(cols.filter(c => c.collectionType !== "smart").map(c => c.externalId)));
        })
        .catch(err => setError((err as Error).message))
        .finally(() => setLoading(false));
    }
  }, [step, selectedStore, organizationId]);

  const toggleId = (externalId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(externalId) ? next.delete(externalId) : next.add(externalId);
      return next;
    });
  };

  const toggleAll = () => {
    const manualIds = collections.filter(c => c.collectionType !== "smart").map(c => c.externalId);
    const allSelected = manualIds.every(id => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(manualIds));
  };

  const handleImport = async () => {
    if (!selectedStore || selectedIds.size === 0) return;
    setStep("confirming");
    setError(null);
    try {
      const result = await ChannelMappingService.startImport({
        storeId: selectedStore.storeId,
        organizationId,
        selectedExternalIds: Array.from(selectedIds),
      });
      await ChannelMappingService.confirmImport({
        storeId: selectedStore.storeId,
        organizationId,
        categoryIds: result.categoryIds,
      });
      setImportedCount(result.importedCount);
      setStep("done");
    } catch (err) {
      setError((err as Error).message);
      setStep("review");
    }
  };

  const manualCount = collections.filter(c => c.collectionType !== "smart").length;
  const smartCount  = collections.filter(c => c.collectionType === "smart").length;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={step === "done" ? onClose : undefined} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Import Channel Categories</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {step === "pick-store" && "Choose which connected store to import from"}
              {step === "review"     && `Reviewing ${CHANNEL_LABEL[selectedStore?.channelType ?? ""] ?? selectedStore?.channelType} categories`}
              {step === "confirming" && "Importing…"}
              {step === "done"       && `${importedCount} categories imported`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors">
            <XIcon />
          </button>
        </div>

        {/* Step: pick store */}
        {step === "pick-store" && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-2">
            {importableStores.map(store => (
              <button
                key={store.storeId}
                onClick={() => { setSelectedStore(store); setStep("review"); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-500/40 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg flex-shrink-0">
                  {(store.channelType as string) === "shopify" ? "🛍" : (store.channelType as string) === "woocommerce" ? "🟣" : "🏪"}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{store.storeName}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{CHANNEL_LABEL[store.channelType] ?? store.channelType} · {store.storeUrl}</p>
                </div>
                <svg className="ml-auto flex-shrink-0 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            ))}
          </div>
        )}

        {/* Step: review collections */}
        {step === "review" && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 min-h-0">
              {/* Loading */}
              {loading && (
                <div className="space-y-2 py-4">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="h-12 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
                  ))}
                </div>
              )}

              {/* Error */}
              {error && !loading && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400">
                  <AlertIcon /> {error}
                </div>
              )}

              {/* Collections list */}
              {!loading && collections.length > 0 && (
                <>
                  {/* Select all row */}
                  <div className="flex items-center justify-between px-1 pb-1 border-b border-gray-100 dark:border-gray-800">
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={manualCount > 0 && collections.filter(c => c.collectionType !== "smart").every(c => selectedIds.has(c.externalId))}
                        onChange={toggleAll}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-brand-500"
                      />
                      Select all manual ({manualCount})
                    </label>
                    <span className="text-[11px] text-gray-400">{selectedIds.size} selected</span>
                  </div>

                  {collections.map(col => {
                    const isSmart = col.collectionType === "smart";
                    const isSelected = selectedIds.has(col.externalId);
                    return (
                      <label
                        key={col.externalId}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                          isSmart
                            ? "border-dashed border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800/30"
                            : isSelected
                              ? "border-brand-300 dark:border-brand-500/40 bg-brand-50 dark:bg-brand-500/10"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isSmart}
                          onChange={() => !isSmart && toggleId(col.externalId)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-brand-500 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{col.externalName}</span>
                            {isSmart && (
                              <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                                smart — skip
                              </span>
                            )}
                          </div>
                          {col.externalSlug && (
                            <code className="text-[11px] text-gray-400">/{col.externalSlug}</code>
                          )}
                        </div>
                        <span className="flex-shrink-0 text-[11px] text-gray-400 tabular-nums">{col.productCount} products</span>
                      </label>
                    );
                  })}

                  {smartCount > 0 && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 italic px-1 pt-1">
                      Smart collections are auto-generated by channel rules. Importing them as master categories is not recommended.
                    </p>
                  )}
                </>
              )}

              {!loading && !error && collections.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">No collections found on this store.</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              {importableStores.length > 1 && (
                <button onClick={() => setStep("pick-store")} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                  ← Back
                </button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={selectedIds.size === 0 || loading}
                  className="px-5 py-2 text-sm font-semibold rounded-xl bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Import {selectedIds.size} collection{selectedIds.size !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step: confirming */}
        {step === "confirming" && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 px-6">
            <div className="w-12 h-12 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mb-4" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Importing categories…</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Creating platform categories and channel links</p>
          </div>
        )}

        {/* Step: done */}
        {step === "done" && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-green-100 dark:bg-green-500/20 flex items-center justify-center mb-4 text-green-600 dark:text-green-400">
              <CheckIcon />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Import complete</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {importedCount} categor{importedCount !== 1 ? "ies" : "y"} created in platform
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs">
              Each is linked to its channel category (MAPPED). You can now assign Product Types to drive attribute forms.
            </p>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => { onDone(); onClose(); }}
                className="px-5 py-2 text-sm font-semibold rounded-xl bg-brand-500 hover:bg-brand-600 text-white transition-colors shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
