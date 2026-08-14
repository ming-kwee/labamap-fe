"use client";
import React from "react";
import { Modal } from "@/shared/ui/modal";
import Button from "@/shared/ui/button/Button";
import { AlertTriangle, Trash2, RefreshCw } from "@/shared/ui/icons/Icons";

/**
 * Confirmation for the delist action (§6.2). Delisting removes the listing from the
 * marketplace — a buyer-facing, hard-to-reverse action — so it is always gated behind
 * an explicit confirm. Copy reassures the merchant that the product data stays in the
 * system and can be re-published later (which creates a NEW listing, §6.4).
 */
export interface DelistConfirmModalProps {
  isOpen: boolean;
  channelLabel: string;
  storeName: string;
  /** true while the delist request is in flight. */
  isDelisting: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export default function DelistConfirmModal({
  isOpen,
  channelLabel,
  storeName,
  isDelisting,
  error,
  onConfirm,
  onClose,
}: DelistConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={isDelisting ? () => {} : onClose}
      showCloseButton={!isDelisting}
      className="max-w-md m-4"
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-error-50 dark:bg-error-500/15">
            <AlertTriangle className="h-5 w-5 text-error-600 dark:text-error-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Hapus listing dari {channelLabel}?
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Produk <strong className="text-gray-800 dark:text-gray-200">{storeName}</strong> tidak
              lagi tampil untuk pembeli di channel ini. Data produk di sistem tetap ada — kamu bisa{" "}
              <strong>publish ulang</strong> nanti (membuat listing baru).
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-error-200 dark:border-error-500/30 bg-error-50 dark:bg-error-500/10 px-3 py-2">
            <p className="text-sm text-error-700 dark:text-error-400">{error}</p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isDelisting}>
            Batal
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDelisting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-error-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-error-600 disabled:cursor-wait disabled:opacity-60"
          >
            {isDelisting ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Menghapus…</>
            ) : (
              <><Trash2 className="h-4 w-4" /> Ya, delist</>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
