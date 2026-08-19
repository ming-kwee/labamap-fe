"use client";

import React, { useState } from "react";
import Link from "next/link";
import { MasterProductService, MasterProductLiveListingError, type BlockingStore } from "../_services/master-product.service";

const KebabIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
  </svg>
);
const ArchiveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" />
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

type Mode = "archive" | "delete";

/**
 * P8 — product lifecycle actions (My Products): Archive (default, reversible) + Delete
 * permanently (secondary). Both are guarded by the backend: a product with a live
 * (PUBLISHED) listing returns 409, and we surface the blocking stores with a delist link
 * instead of forcing the destructive action.
 */
export default function ProductLifecycleActions({
  productId,
  organizationId,
  productName,
  onDone,
}: {
  productId: string;
  organizationId: string;
  productName: string;
  /** Called after a successful archive/delete so the parent can navigate away. */
  onDone: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<BlockingStore[] | null>(null);

  function openModal(m: Mode) {
    setMenuOpen(false);
    setMode(m);
    setError(null);
    setBlocking(null);
  }

  function close() {
    setMode(null);
    setError(null);
    setBlocking(null);
  }

  async function confirm() {
    if (!mode) return;
    setSubmitting(true);
    setError(null);
    setBlocking(null);
    try {
      if (mode === "archive") await MasterProductService.archive(productId, organizationId);
      else await MasterProductService.deleteProduct(productId, organizationId);
      onDone();
    } catch (err) {
      if (err instanceof MasterProductLiveListingError) {
        setBlocking(err.blockingStores.length > 0 ? err.blockingStores : [{ storeId: "—", status: "PUBLISHED" }]);
      } else {
        setError(err instanceof Error ? err.message : `Failed to ${mode}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        title="More actions"
        className="flex items-center justify-center h-10 w-10 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <KebabIcon />
      </button>

      {/* Dropdown */}
      {menuOpen && (
        <>
          <button type="button" className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => openModal("archive")}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <ArchiveIcon /> Archive product
            </button>
            <button
              type="button"
              onClick={() => openModal("delete")}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-500/10"
            >
              <TrashIcon /> Delete permanently
            </button>
          </div>
        </>
      )}

      {/* Confirm / blocking modal */}
      {mode && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900">
            {blocking ? (
              // 409 — live listings block the action.
              <>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Can’t {mode} — listings are live</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  This product is still published on the stores below. Delist it there first, then {mode} it.
                </p>
                <div className="mt-3 space-y-1.5">
                  {blocking.map((b) => (
                    <div key={b.storeId} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5 dark:border-gray-800 dark:bg-gray-800/40">
                      <span className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-gray-700 dark:text-gray-300">{b.storeId}</span>
                        <span className="rounded-full bg-success-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-success-700 dark:bg-success-500/15 dark:text-success-300">
                          {b.status}
                        </span>
                      </span>
                      {b.storeId !== "—" && (
                        <Link
                          href={`/products/${encodeURIComponent(productId)}/publish?storeId=${encodeURIComponent(b.storeId)}`}
                          className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-white dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          Delist →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex justify-end">
                  <button type="button" onClick={close} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                    Close
                  </button>
                </div>
              </>
            ) : (
              // Confirm.
              <>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  {mode === "archive" ? "Archive product?" : "Delete permanently?"}
                </h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  {mode === "archive" ? (
                    <>
                      <span className="font-semibold">{productName}</span> will be hidden from My Products. You can
                      restore it later — history and channel links are kept.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold">{productName}</span> and its channel links will be permanently
                      removed. This cannot be undone. To fix a bad import instead, re-import to update the draft.
                    </>
                  )}
                </p>
                {error && <p className="mt-3 text-sm text-error-600 dark:text-error-400">{error}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={close} disabled={submitting} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirm}
                    disabled={submitting}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                      mode === "archive" ? "bg-brand-500 hover:bg-brand-600" : "bg-error-500 hover:bg-error-600"
                    }`}
                  >
                    {submitting
                      ? (mode === "archive" ? "Archiving…" : "Deleting…")
                      : (mode === "archive" ? "Archive" : "Delete permanently")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
