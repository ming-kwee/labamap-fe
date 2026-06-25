"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/shared/contexts/AuthContext";
import { MasterProductService } from "../_services/master-product.service";
import type { MasterProductDetail, ChannelDistributionCard, ChannelSyncStatus } from "../_types/master-product";
import { ChannelStoreService } from "@/modules/ecommerce-product-v2/step2-channel-fields/services/channelStore.service";
import type { ChannelStoreConnection } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import TagInput from "@/shared/ui/tag-input/TagInput";

const BASE_API = "http://localhost:8888/labamap/api/v1";

const CHANNEL_EMOJI: Record<string, string> = {
  shopify: "🛍", woocommerce: "🟣", amazon: "📦", tiktok: "🎵",
  ebay: "🔨", etsy: "🎨", lazada: "🛒", tokopedia: "🟢",
  facebook: "📘", shopee: "🧡", walmart: "🔵", wix: "⬛",
};

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

// ─── Store publish card (published + unpublished states) ─────────────────────

function StorePublishCard({
  store, published, masterProductId, currency, onResync,
}: {
  store: ChannelStoreConnection;
  published: ChannelDistributionCard | null;
  masterProductId: string;
  currency?: string | null;
  onResync: (storeId: string) => Promise<void>;
}) {
  const [syncing, setSyncing] = useState(false);
  const emoji = CHANNEL_EMOJI[store.channelType.toLowerCase()] ?? "🔗";
  const channelFieldsUrl = `/products/${masterProductId}/channel-fields?storeId=${encodeURIComponent(store.storeId)}`;

  async function handleResync() {
    setSyncing(true);
    try { await onResync(store.storeId); } finally { setSyncing(false); }
  }

  if (!published) {
    // Not yet published to this store
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/[0.02] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base leading-none">{emoji}</span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{store.storeName}</span>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">
            Not published
          </span>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
          Fill in the {store.channelType} fields (category mapping, shipping class, etc.) then publish.
        </p>
        <Link
          href={channelFieldsUrl}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-500 hover:bg-brand-600 text-white transition-colors"
        >
          <PlusIcon /> Set up &amp; publish
        </Link>
      </div>
    );
  }

  const cfg = statusConfig(published.syncStatus);
  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none">{emoji}</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{published.storeName}</span>
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      {/* Error / sync time */}
      {(published.syncStatus === "FAILED" || published.syncStatus === "WARNING") && published.errorMessage ? (
        <p className={`text-xs leading-relaxed ${published.syncStatus === "FAILED" ? "text-error-600 dark:text-error-400" : "text-warning-600 dark:text-warning-400"}`}>
          {published.errorMessage}
        </p>
      ) : published.lastSyncedAt ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">Last sync: {formatRelativeTime(published.lastSyncedAt)}</p>
      ) : null}

      {/* Channel price / SKU */}
      {(published.channelPrice != null || published.channelSku) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {published.channelPrice != null && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Price</span>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{currency ?? ""} {published.channelPrice.toLocaleString()}</p>
            </div>
          )}
          {published.channelSku && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">SKU</span>
              <p className="text-sm font-mono text-gray-800 dark:text-gray-200">{published.channelSku}</p>
            </div>
          )}
        </div>
      )}

      {/* Completion bar for drafts */}
      {published.completionPercentage > 0 && published.syncStatus === "DRAFT" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Fields complete</span>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{published.completionPercentage}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${published.completionPercentage}%` }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {published.syncStatus === "FAILED" ? (
          <Link href={channelFieldsUrl} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-error-500 hover:bg-error-600 text-white transition-colors">
            <WrenchIcon /> Fix issue
          </Link>
        ) : (
          <Link href={channelFieldsUrl} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <EditIcon /> Edit fields
          </Link>
        )}
        <Link
          href={`/products/${masterProductId}/publish?storeId=${encodeURIComponent(store.storeId)}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
        >
          ⚡ Analyse &amp; Publish
        </Link>
        <button
          onClick={handleResync}
          disabled={syncing || published.syncStatus === "SYNCING"}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <RefreshIcon spinning={syncing || published.syncStatus === "SYNCING"} />
          {syncing ? "Syncing…" : "Re-sync"}
        </button>
      </div>
    </div>
  );
}

// ─── Channel-group accordion (detail view) ───────────────────────────────────
// Groups stores of the same channel type into a collapsible section so that
// 10+ stores per channel never turns the page into a wall of cards.

function ChannelGroupAccordion({
  channelType,
  stores,
  channelDistribution,
  masterProductId,
  currency,
  onResync,
}: {
  channelType: string;
  stores: ChannelStoreConnection[];
  channelDistribution: ChannelDistributionCard[];
  masterProductId: string;
  currency?: string | null;
  onResync: (storeId: string) => Promise<void>;
}) {
  const published  = stores.filter(s => channelDistribution.some(c => c.storeId === s.storeId));
  const statuses   = published.map(s => channelDistribution.find(c => c.storeId === s.storeId)!.syncStatus);
  const hasFailed  = statuses.includes("FAILED");
  const hasWarning = statuses.includes("WARNING");
  const allSynced  = published.length === stores.length && statuses.every(s => s === "SYNCED");

  // Auto-expand when there are issues; collapse healthy groups
  const [open, setOpen] = React.useState(hasFailed || hasWarning || published.length < stores.length);

  const emoji = CHANNEL_EMOJI[channelType.toLowerCase()] ?? "🔗";
  const label = channelType.charAt(0).toUpperCase() + channelType.slice(1);

  const summaryColor =
    hasFailed  ? "text-red-600 dark:text-red-400" :
    hasWarning ? "text-amber-600 dark:text-amber-400" :
    allSynced  ? "text-green-600 dark:text-green-400" :
    "text-gray-400 dark:text-gray-500";

  const summaryText =
    hasFailed  ? `${statuses.filter(s => s === "FAILED").length} failed` :
    hasWarning ? `${statuses.filter(s => s === "WARNING").length} warning` :
    allSynced  ? "All synced" :
    published.length === 0 ? "Not published" :
    `${published.length}/${stores.length} published`;

  async function handleSyncChannel() {
    await Promise.allSettled(published.map(s => onResync(s.storeId)));
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Section header — always visible */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
      >
        <span className="text-lg leading-none flex-shrink-0">{emoji}</span>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex-1">{label}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums mr-2">
          {stores.length} store{stores.length !== 1 ? "s" : ""}
        </span>
        <span className={`text-xs font-medium ${summaryColor} flex items-center gap-1 mr-2`}>
          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
            hasFailed ? "bg-red-500" : hasWarning ? "bg-amber-400" : allSynced ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
          }`} />
          {summaryText}
        </span>
        {published.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); handleSyncChannel(); }}
            onKeyDown={e => e.key === "Enter" && (e.stopPropagation(), handleSyncChannel())}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-brand-500 dark:hover:text-brand-400 mr-2 transition-colors"
            title={`Re-sync all ${label} stores`}
          >
            <RefreshIcon />
          </span>
        )}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      {/* Stores list — expandable */}
      {open && (
        <div className="divide-y divide-gray-100 dark:divide-gray-700/50 bg-white dark:bg-white/[0.02]">
          {stores.map(store => {
            const pub = channelDistribution.find(c => c.storeId === store.storeId) ?? null;
            return (
              <StorePublishCard
                key={store.storeId}
                store={store}
                published={pub}
                masterProductId={masterProductId}
                currency={currency}
                onResync={onResync}
              />
            );
          })}
        </div>
      )}
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
      setStores(storeList.filter(s => s.isActive));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load product");
    } finally {
      setLoading(false);
    }
  }, [masterProductId, orgId]);

  useEffect(() => { load(); }, [load]);

  // Sync product to sessionStorage only when the backend returns a non-empty variants array.
  // Skipping the write when variants: [] prevents overwriting good sessionStorage data
  // that was written by the create flow (which has the full VariantOption format).
  useEffect(() => {
    if (!product || typeof window === "undefined") return;
    if (!product.variants || product.variants.length === 0) return;
    try {
      sessionStorage.setItem(`product_${product.id}`, JSON.stringify({
        name:        product.name,
        description: product.description ?? undefined,
        price:       product.basePrice   ?? undefined,
        mainImage:   product.imageUrl    ?? undefined,
        variants:    product.variants,
      }));
    } catch { /**/ }
  }, [product]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

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
          ) : (() => {
            // Group stores by channel type — one accordion per channel
            const groups = new Map<string, ChannelStoreConnection[]>();
            for (const s of stores) {
              const arr = groups.get(s.channelType) ?? [];
              arr.push(s);
              groups.set(s.channelType, arr);
            }
            return (
              <div className="space-y-2">
                {[...groups.entries()].map(([channelType, channelStores]) => (
                  <ChannelGroupAccordion
                    key={channelType}
                    channelType={channelType}
                    stores={channelStores}
                    channelDistribution={product.channelDistribution}
                    masterProductId={masterProductId}
                    currency={product.currency}
                    onResync={handleResync}
                  />
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
