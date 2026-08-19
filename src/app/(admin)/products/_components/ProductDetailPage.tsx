"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/shared/contexts/AuthContext";
import { MasterProductService } from "../_services/master-product.service";
import type { MasterProductDetail, ChannelDistributionCard, ChannelSyncStatus } from "../_types/master-product";
import { ChannelStoreService } from "@/modules/ecommerce-product-v2/step2-channel-fields/services/channelStore.service";
import { getChannelMeta } from "@/modules/ecommerce-product-v2/step2-channel-fields/components/stores/ChannelTypeBadge";
import type { ChannelStoreConnection, ChannelType } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import TagInput from "@/shared/ui/tag-input/TagInput";
import {
  useReversePull,
  ReverseSyncService,
  ReversePreviewModal,
  ReverseStatusBadge,
} from "@/modules/reverse-sync";

const BASE_API = "http://localhost:8888/labamap/api/v1";

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusConfig(status: ChannelSyncStatus) {
  switch (status) {
    case "SYNCED":  return { dot: "bg-success-500",  text: "text-success-700 dark:text-success-400",  bg: "bg-success-50 dark:bg-success-500/10",  border: "border-success-200 dark:border-success-500/20",  label: "Synced" };
    case "WARNING": return { dot: "bg-warning-500",  text: "text-warning-700 dark:text-warning-400",  bg: "bg-warning-50 dark:bg-warning-500/10",  border: "border-warning-200 dark:border-warning-500/20",  label: "Warning" };
    case "FAILED":  return { dot: "bg-error-500",    text: "text-error-700 dark:text-error-400",      bg: "bg-error-50 dark:bg-error-500/10",      border: "border-error-200 dark:border-error-500/20",      label: "Failed" };
    case "SYNCING": return { dot: "bg-brand-500 animate-pulse", text: "text-brand-700 dark:text-brand-400", bg: "bg-brand-50 dark:bg-brand-500/10", border: "border-brand-200 dark:border-brand-500/20", label: "Syncing…" };
    default:        return { dot: "bg-gray-400",     text: "text-gray-500 dark:text-gray-400",        bg: "bg-gray-50 dark:bg-gray-800/60",        border: "border-gray-200 dark:border-gray-700",           label: "Draft" };
  }
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Was this store touched in the last few minutes? Used to highlight recently-published/synced
 * rows IN PLACE (never reorder them), so the merchant can spot what they just worked on.
 */
function isRecentlyUpdated(iso: string | null | undefined, withinMinutes = 5): boolean {
  if (!iso) return false;
  const ms = Date.now() - new Date(iso).getTime();
  return ms >= 0 && ms < withinMinutes * 60_000;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const RefreshIcon = ({ spinning }: { spinning?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={spinning ? "animate-spin" : ""}>
    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);
const ChevronLeftIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
);
const WrenchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
  </svg>
);
const SendIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9 22 2z"/>
  </svg>
);
// Reverse pull — download-from-channel arrow.
const DownloadIcon = ({ spinning }: { spinning?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    className={spinning ? "animate-spin" : ""}>
    {spinning ? (
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    ) : (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </>
    )}
  </svg>
);

// ─── Store row (Step-3 backlog style) ────────────────────────────────────────

const ROW_BTN =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors";
const ROW_BTN_BRAND = `${ROW_BTN} bg-brand-500 text-white hover:bg-brand-600`;
const ROW_BTN_ERROR = `${ROW_BTN} bg-error-500 text-white hover:bg-error-600`;
const ROW_BTN_GHOST = `${ROW_BTN} border border-brand-300 text-brand-600 hover:bg-brand-50 dark:border-brand-500/40 dark:text-brand-400 dark:hover:bg-brand-500/10`;
// Framed square icon button — same tidy toolbar treatment as Step 3.
const ROW_ICON_BTN =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200";

function StoreRow({
  store, published, masterProductId, currency, onResync, onPull, pulling,
}: {
  store: ChannelStoreConnection;
  published: ChannelDistributionCard | null;
  masterProductId: string;
  currency?: string | null;
  onResync: (storeId: string) => Promise<void>;
  /** P1 — pull this listing back from the channel (reverse sync). */
  onPull: (store: ChannelStoreConnection, channelProductId: string) => void;
  /** true while this row's pull request is in flight. */
  pulling: boolean;
}) {
  const [syncing, setSyncing] = useState(false);
  const meta = getChannelMeta(store.channelType.toLowerCase() as ChannelType);
  const channelFieldsUrl = `/products/${masterProductId}/channel-fields?storeId=${encodeURIComponent(store.storeId)}`;
  const publishUrl = `/products/${masterProductId}/publish?storeId=${encodeURIComponent(store.storeId)}`;
  const storeName = published?.storeName ?? store.storeName;

  async function handleResync() {
    setSyncing(true);
    try { await onResync(store.storeId); } finally { setSyncing(false); }
  }

  const cfg = published ? statusConfig(published.syncStatus) : null;
  const dotClass = cfg?.dot ?? "bg-gray-400";
  const badgeLabel = cfg?.label ?? "Not published";
  const badgeClass = cfg ? `${cfg.bg} ${cfg.text}` : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
  const isSyncing = syncing || published?.syncStatus === "SYNCING";
  const isFailed = published?.syncStatus === "FAILED";
  const isDraft = published?.syncStatus === "DRAFT";
  // Recently published/synced → highlight in place (never reorder); clears on the next load.
  const recent = isRecentlyUpdated(published?.lastSyncedAt);

  // One-line status detail — error, draft progress, or synced summary (time · price · SKU).
  const substatus: React.ReactNode = (() => {
    if (!published) return <span className="truncate">Not set up — fill channel fields to publish</span>;
    if ((isFailed || published.syncStatus === "WARNING") && published.errorMessage) {
      return (
        <span className={`truncate ${isFailed ? "text-error-600 dark:text-error-400" : "text-warning-600 dark:text-warning-400"}`}>
          {published.errorMessage}
        </span>
      );
    }
    if (isDraft && published.completionPercentage > 0) {
      return (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-16 flex-shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${published.completionPercentage}%` }} />
          </span>
          <span className="tabular-nums">{published.completionPercentage}% fields complete</span>
        </span>
      );
    }
    const parts: string[] = [];
    if (published.lastSyncedAt) parts.push(`Synced ${formatRelativeTime(published.lastSyncedAt)}`);
    if (published.channelPrice != null) parts.push(`${currency ?? ""} ${published.channelPrice.toLocaleString()}`.trim());
    if (published.channelSku) parts.push(published.channelSku);
    return <span className="truncate">{parts.join(" · ") || "Published"}</span>;
  })();

  return (
    <div
      className={`rounded-xl border p-3 transition-colors sm:px-4 ${
        recent
          ? "border-brand-200 bg-brand-50/50 ring-1 ring-brand-100 dark:border-brand-500/30 dark:bg-brand-500/[0.06] dark:ring-brand-500/20"
          : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-white/[0.02] dark:hover:border-gray-700"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Identity + status */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${dotClass}`} />
          <span
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${meta.bg} ${meta.text}`}
            title={meta.label}
          >
            {meta.code}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{storeName}</p>
              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>{badgeLabel}</span>
              {recent && (
                <span className="flex-shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                  Just updated
                </span>
              )}
              {/* P4 — reverse-sync status (last pull / channel-side update available) */}
              <ReverseStatusBadge
                channelProductId={published?.channelProductId}
                channelUpdatedAt={published?.channelUpdatedAt}
                lastReverseSyncedAt={published?.lastReverseSyncedAt}
              />
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              {substatus}
            </div>
          </div>
        </div>

        {/* Actions — primary CTA + framed secondary toolbar */}
        <div className="flex flex-shrink-0 items-center gap-2 sm:pl-2">
          {!published ? (
            <Link href={channelFieldsUrl} className={ROW_BTN_BRAND}><PlusIcon /> Set up &amp; publish</Link>
          ) : isFailed ? (
            <Link href={channelFieldsUrl} className={ROW_BTN_ERROR}><WrenchIcon /> Fix issue</Link>
          ) : (
            <Link href={publishUrl} className={ROW_BTN_GHOST}><SendIcon /> Publish</Link>
          )}
          {/* For a synced/published store the primary CTA is "Publish" (→ Step 3), so a dedicated
              "Edit" icon is the only path back to Step 2 channel fields. (Not-set-up and failed
              stores already route to Step 2 via "Set up & publish" / "Fix issue".) */}
          {published && !isFailed && (
            <Link href={channelFieldsUrl} title="Edit channel fields" className={ROW_ICON_BTN}>
              <EditIcon />
            </Link>
          )}
          {published && (
            <button
              type="button"
              onClick={handleResync}
              disabled={isSyncing}
              title="Re-sync"
              className={`${ROW_ICON_BTN} disabled:opacity-50`}
            >
              <RefreshIcon spinning={isSyncing} />
            </button>
          )}
          {/* P1 — Pull from channel (reverse sync). Disabled until the listing is linked. */}
          {published && (
            <button
              type="button"
              onClick={() => published.channelProductId && onPull(store, published.channelProductId)}
              disabled={pulling || !published.channelProductId}
              title={
                published.channelProductId
                  ? "Pull from channel (reverse sync)"
                  : "Product not linked to this channel yet — publish first"
              }
              className={`${ROW_ICON_BTN} disabled:opacity-40`}
            >
              <DownloadIcon spinning={pulling} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Left column: master data summary ────────────────────────────────────────

// ─── Inline tag editor ────────────────────────────────────────────────────────

function TagsEditor({ initialTags, onSave }: { initialTags: string[]; onSave: (tags: string[]) => void }) {
  const [editing, setEditing]   = useState(false);
  const [tags, setTags]         = useState<string[]>(initialTags);
  const [saving, setSaving]     = useState(false);

  // Sync if parent reloads product
  useEffect(() => { setTags(initialTags); }, [initialTags.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(tags);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setTags(initialTags);
    setEditing(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Tags</span>
        {!editing && (
          <button onClick={() => setEditing(true)}
            className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline">
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <TagInput value={tags} onChange={setTags} placeholder="Add tag…" />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="text-[11px] font-medium px-3 py-1 rounded-lg bg-brand-500 hover:bg-brand-600 text-white transition-colors disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={handleCancel} disabled={saving}
              className="text-[11px] px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded-md text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              {tag}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">No tags — click Edit to add.</p>
      )}
    </div>
  );
}

function MasterDataPanel({
  product,
  onTagsSaved,
}: {
  product: MasterProductDetail;
  onTagsSaved?: (tags: string[]) => void;
}) {
  const displayImages = (product.images ?? []).slice(0, 5);
  const displayVariants = product.variants.slice(0, 5);
  const moreVariants = product.variantCount - displayVariants.length;

  return (
    <div className="space-y-5">
      {/* Main image */}
      {product.imageUrl && (
        <div className="w-full aspect-square max-h-48 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        </div>
      )}

      {/* Core fields */}
      <div className="space-y-3">
        <Field label="Name" value={product.name} />
        {product.sku && <Field label="SKU" value={product.sku} mono />}
        {product.basePrice != null && (
          <Field
            label="Base Price"
            value={`${product.currency ?? ""} ${product.basePrice.toLocaleString()}`}
          />
        )}
        {product.description && (
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Description</span>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-4">
              {product.description}
            </p>
          </div>
        )}
      </div>

      {/* Variants mini-table */}
      {displayVariants.length > 0 && (
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
            Variants ({product.variantCount})
          </span>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {displayVariants.map((v, i) => {
              const sku   = String(v.sku ?? v.SKU ?? `Variant ${i + 1}`);
              const price = v.price != null ? Number(v.price) : null;
              const label = getVariantLabel(v);
              const images = Array.isArray(v.variantImages) ? v.variantImages as string[] : [];
              const thumb  = images[0] ?? null;
              return (
                <div
                  key={sku + i}
                  className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 text-sm"
                >
                  {/* Thumbnail */}
                  {thumb ? (
                    <img src={thumb} alt={sku} className="w-8 h-8 rounded-md object-cover flex-shrink-0 border border-gray-100 dark:border-gray-700" />
                  ) : (
                    <div className="w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-800 flex-shrink-0" />
                  )}

                  {/* Label + SKU */}
                  <div className="min-w-0 flex-1">
                    {label && (
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{label}</p>
                    )}
                    <p className="font-mono text-xs text-gray-400 dark:text-gray-500 truncate">{sku}</p>
                  </div>

                  {/* Price */}
                  {price != null && price > 0 && (
                    <span className="text-sm text-gray-700 dark:text-gray-300 flex-shrink-0">
                      {product.currency ?? ""} {price.toLocaleString()}
                    </span>
                  )}
                </div>
              );
            })}
            {moreVariants > 0 && (
              <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700/50">
                + {moreVariants} more variants
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image thumbnails */}
      {displayImages.length > 1 && (
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
            Images ({displayImages.length}{(product.images?.length ?? 0) > 5 ? "+" : ""})
          </span>
          <div className="flex gap-2 flex-wrap">
            {displayImages.map((url, i) => (
              <div key={i} className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tags — editable inline */}
      {onTagsSaved && (
        <TagsEditor
          initialTags={product.tags ?? []}
          onSave={onTagsSaved}
        />
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="block text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-0.5">{label}</span>
      <p className={`text-sm text-gray-800 dark:text-gray-200 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

const VARIANT_NON_DIMENSION = new Set([
  "id", "_id", "sku", "SKU", "price", "comparePrice", "compareAtPrice",
  "inventory", "quantity", "stock", "stockQuantity", "costPrice",
  "barcode", "weight", "variantImages", "images", "galleryImages",
]);

function getVariantLabel(v: Record<string, unknown>): string {
  return Object.entries(v)
    .filter(([k, val]) => {
      if (VARIANT_NON_DIMENSION.has(k)) return false;
      if (val == null) return false;
      if (Array.isArray(val)) return false;
      const str = String(val).trim();
      if (!str || str === "0") return false;
      if (str.startsWith("http://") || str.startsWith("https://")) return false;
      if (str.length > 60) return false;
      return true;
    })
    .map(([, val]) => String(val))
    .slice(0, 3)
    .join(" / ");
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProductDetailPage({ masterProductId }: { masterProductId: string }) {
  const router = useRouter();
  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";

  const [product, setProduct]   = useState<MasterProductDetail | null>(null);
  const [stores, setStores]     = useState<ChannelStoreConnection[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Reverse sync (P1/P2) ────────────────────────────────────────────────────
  const reverse = useReversePull();
  const [pullCtx, setPullCtx] = useState<{ store: ChannelStoreConnection; channelProductId: string } | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [data, storeList] = await Promise.all([
        MasterProductService.getById(masterProductId, orgId),
        ChannelStoreService.listStores(orgId).catch(() => [] as ChannelStoreConnection[]),
      ]);
      setProduct(data);
      // Stable, deterministic order so a store never jumps rows between visits — the API can
      // return stores in a different order (e.g. by updatedAt) after one is published/edited.
      setStores(
        storeList
          .filter((s) => s.isActive)
          .sort(
            (a, b) =>
              a.channelType.localeCompare(b.channelType) ||
              (a.storeName || "").localeCompare(b.storeName || "") ||
              a.storeId.localeCompare(b.storeId)
          )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product");
    } finally {
      setLoading(false);
    }
  }, [masterProductId, orgId]);

  useEffect(() => { load(); }, [load]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Surface a pull failure / unsupported-channel as a toast and close the pull context.
  useEffect(() => {
    if (reverse.notConfigured) {
      setToast({ msg: "This channel doesn't support auto-pull yet — needs a manual preview.", ok: false });
      setPullCtx(null);
    } else if (reverse.error) {
      setToast({ msg: reverse.error, ok: false });
      setPullCtx(null);
    }
  }, [reverse.notConfigured, reverse.error]);

  // P1 → P2: pull a single listing back from the channel, then open the preview modal.
  const handlePull = useCallback(
    async (store: ChannelStoreConnection, channelProductId: string) => {
      setPullCtx({ store, channelProductId });
      await reverse.pull({
        organizationId: orgId,
        storeId: store.storeId,
        channelProductId,
        masterProductId,
      });
    },
    [reverse, orgId, masterProductId],
  );

  function closePreview() {
    reverse.reset();
    setPullCtx(null);
  }

  async function handleResync(storeId: string) {
    if (!product) return;
    try {
      const res = await fetch(`${BASE_API}/channels/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterProductId: product.id,
          storeId,
          organizationId: orgId,
        }),
      });
      if (!res.ok) throw new Error(`Sync failed (${res.status})`);
      setToast({ msg: "Re-sync triggered", ok: true });
      // Refresh after a short delay so status can update
      setTimeout(load, 2000);
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Sync failed", ok: false });
    }
  }

  async function handleSyncAll() {
    if (!product || product.channelDistribution.length === 0) return;
    setSyncingAll(true);
    try {
      await Promise.allSettled(
        product.channelDistribution.map(c => handleResync(c.storeId))
      );
      setToast({ msg: "Sync triggered for all channels", ok: true });
    } finally {
      setSyncingAll(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block h-10 w-10 rounded-full border-4 border-brand-500 border-t-transparent animate-spin mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading product…</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !product) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-error-50 dark:bg-error-500/10 flex items-center justify-center mx-auto mb-4 text-2xl">⚠</div>
        <p className="font-medium text-gray-900 dark:text-white mb-1">Failed to load product</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{error}</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={load} className="px-4 py-2 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors">
            Retry
          </button>
          <Link href="/products" className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            ← My Products
          </Link>
        </div>
      </div>
    );
  }

  const hasChannels = product.channelDistribution.length > 0;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.ok
            ? "bg-success-500 text-white"
            : "bg-error-500 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* P2 — Reverse preview / diff modal (pull path).
          Apply → /pull/apply writes Step-2 per-store (safe: never master global).
          Review is intentionally omitted here — /review needs the raw channel payload,
          which the pull path does not expose; draft-review suggestions instead arrive via
          the automatic webhook path (Flow C) into the Suggestions inbox. */}
      {reverse.preview && pullCtx && (
        <ReversePreviewModal
          open
          preview={reverse.preview}
          channelProductId={pullCtx.channelProductId}
          onApply={() =>
            ReverseSyncService.pullApply({
              organizationId: orgId,
              storeId: pullCtx.store.storeId,
              channelProductId: pullCtx.channelProductId,
              masterProductId,
            })
          }
          onApplied={() => {
            setToast({ msg: "Pulled from channel — applied to Step-2", ok: true });
            setTimeout(load, 1500);
          }}
          onClose={closePreview}
        />
      )}

      {/* Breadcrumb + header */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-gray-500">
          <button onClick={() => router.push("/products")} className="hover:text-brand-500 transition-colors flex items-center gap-1">
            <ChevronLeftIcon /> My Products
          </button>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{product.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-2">
              {product.sku && <span>SKU: {product.sku}</span>}
              {product.updatedAt && <><span className="text-gray-300 dark:text-gray-600">·</span><span>Edited {formatRelativeTime(product.updatedAt)}</span></>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/products/${masterProductId}/edit`}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <EditIcon /> Edit Master
            </Link>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: master data ──────────────────────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
            <h2 className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500 mb-4">
              Master Data
            </h2>
            <MasterDataPanel
              product={product}
              onTagsSaved={async (tags) => {
                await MasterProductService.updateTags(product.id, orgId, tags);
                setProduct(p => p ? { ...p, tags } : p);
              }}
            />
          </div>
        </div>

        {/* ── Right: publish status grouped by channel ──────────────────── */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Publish status</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                This product across your connected stores
              </p>
            </div>
            {hasChannels && (
              <button
                onClick={handleSyncAll}
                disabled={syncingAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <RefreshIcon spinning={syncingAll} /> Sync all
              </button>
            )}
          </div>

          {stores.length === 0 ? (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No stores connected</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Connect a Shopify, Wix, or other store in{" "}
                <Link href="/channels/stores" className="text-brand-500 hover:underline">Channel Stores</Link>{" "}
                first, then come back to publish this product.
              </p>
            </div>
          ) : (
            // Flat backlog list — one framed row per store (channel shown by its avatar),
            // matching the Step 3 layout.
            <div className="space-y-2.5">
              {stores.map((store) => (
                <StoreRow
                  key={store.storeId}
                  store={store}
                  published={product.channelDistribution.find((c) => c.storeId === store.storeId) ?? null}
                  masterProductId={masterProductId}
                  currency={product.currency}
                  onResync={handleResync}
                  onPull={handlePull}
                  pulling={reverse.loading && pullCtx?.store.storeId === store.storeId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
