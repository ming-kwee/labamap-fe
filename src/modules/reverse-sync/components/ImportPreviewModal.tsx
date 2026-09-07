"use client";

import React, { useState } from "react";
import Link from "next/link";
import { getChannelMeta } from "@/modules/ecommerce-product-v2/step2-channel-fields/components/stores/ChannelTypeBadge";
import type { ChannelType } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import { ReverseSyncService, ReverseApiError } from "../services/reverse.service";
import type { ReverseImportRequest, ReverseImportResult, ReverseCategoryResolution } from "../types/reverse";
import { ReverseSummaryBar } from "./ReverseSummaryBar";
import { ReverseBucketSection } from "./ReverseBucketSection";
import { ReverseDiffField } from "./ReverseDiffField";
import { DeDerivationNotes } from "./DeDerivationNotes";
import { formatReverseValue, isEmptyValue } from "./format";

/**
 * FE-0 — Import preview modal (use case B).
 *
 * Pitched at a MERCHANT, not an engineer: leads with a product card (photo, name,
 * price, variants, product-type status) so the merchant recognises what they're
 * importing. The raw channel→platform classification (the reverse-sync engine's
 * 3-bucket model) is tucked into a collapsed "Technical details" section.
 *
 * Commits via `/import`: **Create product** (DRAFT) or **Link to existing** (when a
 * dedup match is chosen). The new/linked product is a DRAFT — `SuccessBanner` routes
 * to Step 1 (set product type) or Step 2 (channel fields) based on `categoryResolution`.
 */
export function ImportPreviewModal({
  open,
  result,
  baseRequest,
  onClose,
  onCommitted,
}: {
  open: boolean;
  result: ReverseImportResult;
  /** org/store/channel + channelProductId/channelPayload/userId (no masterProductId). */
  baseRequest: ReverseImportRequest;
  onClose: () => void;
  onCommitted?: (r: ReverseImportResult) => void;
}) {
  // Active commit key: "create" | "link:{id}" | "update:{id}". null = idle.
  const [committing, setCommitting] = useState<string | null>(null);
  const [done, setDone] = useState<ReverseImportResult | null>(null);
  const [doneKind, setDoneKind] = useState<"create" | "link" | "update">("create");
  const [error, setError] = useState<string | null>(null);
  // Set when a CREATE is rejected with 409 DUPLICATE_MASTER_SKU → offer one-click link.
  const [dupConflict, setDupConflict] = useState<{ sku: string | null; conflictingMasterId: string | null } | null>(null);

  if (!open) return null;

  const meta = getChannelMeta(result.channelType.toLowerCase() as ChannelType);
  const { matches } = result;
  const busy = committing !== null;

  /**
   * Commit the import.
   *  • masterProductId=null            → CREATE a new DRAFT product
   *  • masterProductId + update=false  → LINK the channel item to that product
   *  • masterProductId + update=true   → re-import UPDATE-DRAFT (merge into an existing DRAFT)
   */
  async function commit(masterProductId: string | null, updateExistingDraft = false) {
    const kind: "create" | "link" | "update" =
      masterProductId == null ? "create" : updateExistingDraft ? "update" : "link";
    setCommitting(masterProductId == null ? "create" : `${kind}:${masterProductId}`);
    setError(null);
    setDupConflict(null);
    try {
      const r = await ReverseSyncService.importCommit({
        ...baseRequest,
        masterProductId,
        // Only send the flag when set, so plain link/create requests stay unchanged.
        updateExistingDraft: updateExistingDraft || undefined,
      });
      setDoneKind(kind);
      setDone(r);
      onCommitted?.(r);
    } catch (err) {
      if (err instanceof ReverseApiError && err.code === "DUPLICATE_MASTER_SKU") {
        // CREATE rejected — a product with this SKU already exists. Surface a one-click
        // "link to that product" (conflictingMasterId is best-effort; may be null).
        setDupConflict({ sku: err.sku ?? null, conflictingMasterId: err.conflictingMasterId ?? null });
      } else if (err instanceof ReverseApiError && err.status === 409) {
        // Update-draft only works on DRAFT products — the backend guards non-DRAFT with 409.
        setError(
          "That product isn't a draft, so it can't be updated by re-import. Use “Pull from channel” (reconcile) on the product instead.",
        );
      } else {
        setError(err instanceof ReverseApiError ? err.message : "Failed to import");
      }
    } finally {
      setCommitting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[100000] flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${meta.bg} ${meta.text}`} title={meta.label}>
                {meta.code}
              </span>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Import from {meta.label}</h2>
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              Review this listing before adding it to your products — it comes in as a draft.
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[68vh] space-y-4 overflow-y-auto px-5 py-4">
          {done ? (
            <SuccessBanner result={done} kind={doneKind} />
          ) : (
            <>
              {error && (
                <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/25 dark:bg-error-500/10 dark:text-error-400">
                  {error}
                </div>
              )}

              {/* Duplicate-SKU conflict — CREATE rejected, offer one-click link */}
              {dupConflict && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/25 dark:bg-amber-500/[0.08]">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    SKU{" "}
                    {dupConflict.sku ? <span className="font-mono">“{dupConflict.sku}”</span> : "for this item"}{" "}
                    is already in use
                  </p>
                  <p className="mt-0.5 text-xs text-amber-600/90 dark:text-amber-400/80">
                    {dupConflict.conflictingMasterId
                      ? "You already have a product with this SKU, so a new one can’t be created. Link this listing to that product instead."
                      : "You already have a product with this SKU, so a new one can’t be created. Pick the matching product from the list below to link it instead."}
                  </p>
                  {dupConflict.conflictingMasterId && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => commit(dupConflict.conflictingMasterId!, false)}
                        disabled={busy}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                      >
                        {committing === `link:${dupConflict.conflictingMasterId}` ? "Linking…" : "Link to that product"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Dedup matches — offer link instead of create */}
              {matches.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/25 dark:bg-amber-500/[0.08]">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    You may already have this product
                  </p>
                  <p className="mt-0.5 text-xs text-amber-600/90 dark:text-amber-400/80">
                    It looks like a close match to a product you already have. Link it instead of creating a duplicate — or,
                    if that match is a draft from an earlier import that came out wrong, re-import to fix it.
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {matches.map((m) => (
                      <div key={m.productId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 dark:bg-gray-900">
                        <span className="flex items-center gap-2 text-xs">
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold uppercase text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                            {m.matchType}
                          </span>
                          <span className="font-mono text-gray-700 dark:text-gray-300">{m.productId}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => commit(m.productId, true)}
                            disabled={busy}
                            title="Re-import into this product — only works if it's still a draft"
                            className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
                          >
                            {committing === `update:${m.productId}` ? "Updating…" : "Fix draft"}
                          </button>
                          <button
                            type="button"
                            onClick={() => commit(m.productId, false)}
                            disabled={busy}
                            className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
                          >
                            {committing === `link:${m.productId}` ? "Linking…" : "Link to this"}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Product card — what the merchant recognises */}
              <ProductHero result={result} />

              {/* Variants (friendly) */}
              <VariantPreview result={result} />

              {/* Reassurance — lowers the stakes of clicking Create */}
              <div className="flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-xs text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                <InfoIcon />
                <span>
                  This creates a <strong>draft</strong> — nothing is published to any channel yet. You can review, edit,
                  or delete it before going live.
                </span>
              </div>

              {/* Technical details (collapsed) — the reverse-sync 3-bucket classification */}
              <TechnicalDetails result={result} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <button type="button" onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button
              type="button"
              onClick={() => commit(null)}
              disabled={busy}
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {committing === "create" ? "Creating…" : "Create product"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Value helpers (raw channel data → merchant-friendly) ──────────────────────

const ATTR_LABELS: Record<string, string> = {
  name: "Name", description: "Description", weight: "Weight", tags: "Tags",
  sku: "SKU", barcode: "Barcode", brand: "Brand", vendor: "Vendor",
  material: "Material", price: "Price", currency: "Currency", status: "Status",
};

/** Human label for a raw attribute key (snake_case / camelCase → Title Case). */
function humanizeKey(k: string): string {
  return (
    ATTR_LABELS[k] ??
    k.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** A trimmed non-empty string, or undefined. */
function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

/** A finite number (from number or numeric string), or undefined. */
function asNumber(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Coerce a value into image URLs (array, JSON-array string, or single URL). */
function toImageList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
      } catch { /* not JSON — fall through */ }
    }
    if (/^https?:\/\//i.test(s)) return [s];
  }
  return [];
}

/** Group-format a price; prefix with a currency code when known. */
function formatMoney(n: number, currency?: string): string {
  const num = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
  return currency ? `${currency} ${num}` : num;
}

/** Attribute keys already represented by the hero (image/name/description/price) → skip in the grid. */
const HERO_HANDLED = new Set(["name", "description", "mainImage", "imageUrl", "galleryImages", "images", "price", "basePrice"]);
/** Internal/technical keys not meaningful to a merchant. */
const TECHNICAL_KEYS = new Set(["product_id", "productId", "id", "status"]);

// ─── Sub-components ────────────────────────────────────────────────────────────

/** Product card: main photo, name, price range, variant count, product-type status. */
function ProductHero({ result }: { result: ReverseImportResult }) {
  const attrs = result.draftMaster.masterAttributes ?? {};
  const variants = result.draftMaster.variantGroups ?? [];

  const name = asString(attrs.name) ?? result.candidateName ?? "Untitled product";
  const description = asString(attrs.description);
  const currency = asString(attrs.currency);

  const mainImage =
    toImageList(attrs.mainImage)[0] ?? toImageList(attrs.imageUrl)[0] ?? toImageList(attrs.galleryImages)[0];
  const gallery = toImageList(attrs.galleryImages).filter((u) => u !== mainImage).slice(0, 5);

  // Price range from the variant rows (fall back to a base price attribute).
  const prices = variants.map((v) => asNumber(v.price)).filter((n): n is number => n !== undefined && n > 0);
  const basePrice = asNumber(attrs.price) ?? asNumber(attrs.basePrice);
  let priceLabel: string | null = null;
  if (prices.length) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    priceLabel = min === max ? formatMoney(min, currency) : `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`;
  } else if (basePrice !== undefined) {
    priceLabel = formatMoney(basePrice, currency);
  }

  // Remaining human attributes (weight, tags, brand…) — not images/name/description/ids/category.
  const extra = Object.entries(attrs).filter(([k, v]) => {
    if (HERO_HANDLED.has(k) || TECHNICAL_KEYS.has(k)) return false;
    if (/categor|taxonomy/i.test(k)) return false;
    if (toImageList(v).length > 0) return false;
    if (typeof v === "string" && v.startsWith("gid://")) return false;
    return !isEmptyValue(v);
  });

  return (
    <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex gap-4">
        <Thumb src={mainImage} className="h-20 w-20 sm:h-24 sm:w-24" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold text-gray-900 dark:text-white">{name}</h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
            {priceLabel && <span className="font-semibold text-gray-700 dark:text-gray-200">{priceLabel}</span>}
            {priceLabel && <span aria-hidden>·</span>}
            <span>{variants.length > 0 ? `${variants.length} variant${variants.length > 1 ? "s" : ""}` : "no variants"}</span>
          </div>
          <CategoryProductTypeLine cr={result.categoryResolution} />
          {description && <p className="mt-1.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{description}</p>}
        </div>
      </div>

      {gallery.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {gallery.map((u) => <Thumb key={u} src={u} className="h-10 w-10" />)}
        </div>
      )}

      {extra.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 border-t border-gray-100 pt-3 sm:grid-cols-2 dark:border-gray-800">
          {extra.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 text-xs">
              <span className="flex-shrink-0 text-gray-400 dark:text-gray-500">{humanizeKey(k)}</span>
              <span className="min-w-0 truncate font-medium text-gray-700 dark:text-gray-200">{formatReverseValue(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Product-type status derived from `categoryResolution` — the key decision merchants care about. */
function CategoryProductTypeLine({ cr }: { cr?: ReverseCategoryResolution | null }) {
  if (cr?.autoResolved) {
    return (
      <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-success-600 dark:text-success-400">
        <CheckIcon /> Product type: {cr.resolvedProductTypeName ?? "matched from category"}
      </p>
    );
  }
  const catName = cr?.channelCategoryName ?? null;
  return (
    <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
      <AlertIcon />
      {catName
        ? <span>Category “{catName}” — you’ll pick a product type after import</span>
        : <span>You’ll pick a product type after import</span>}
    </p>
  );
}

/** Variants as a friendly table: photo · option axes · SKU · Price · Stock. */
function VariantPreview({ result }: { result: ReverseImportResult }) {
  const variants = result.draftMaster.variantGroups ?? [];
  if (variants.length === 0) return null;
  const axes = (result.draftMaster.optionGroups ?? []).map((g) => g.name);
  const currency = asString(result.draftMaster.masterAttributes?.currency);

  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
        Variants to create ({variants.length})
      </h4>
      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-400 dark:bg-gray-800/50 dark:text-gray-500">
            <tr>
              <th className="px-2.5 py-1.5" />
              {axes.map((a) => <th key={a} className="px-2.5 py-1.5 font-semibold">{a}</th>)}
              <th className="px-2.5 py-1.5 font-semibold">SKU</th>
              <th className="px-2.5 py-1.5 font-semibold">Price</th>
              <th className="px-2.5 py-1.5 font-semibold">Stock</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v, i) => {
              const img = toImageList(v.variantImages)[0] ?? toImageList(v.images)[0];
              const price = asNumber(v.price);
              return (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-2.5 py-1.5"><Thumb src={img} className="h-8 w-8" /></td>
                  {axes.map((a) => (
                    <td key={a} className="whitespace-nowrap px-2.5 py-1.5 text-gray-700 dark:text-gray-300">
                      {formatReverseValue(v[a])}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-gray-600 dark:text-gray-400">{asString(v.sku) ?? "—"}</td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-gray-700 dark:text-gray-300">{price !== undefined ? formatMoney(price, currency) : "—"}</td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-gray-700 dark:text-gray-300">{formatReverseValue(v.inventory)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Collapsed "Technical details" — the reverse-sync 3-bucket classification for power users/support. */
function TechnicalDetails({ result }: { result: ReverseImportResult }) {
  const { preview } = result;
  return (
    <details className="group rounded-xl border border-gray-200 dark:border-gray-800">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 [&::-webkit-details-marker]:hidden">
        <span>Technical details</span>
        <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500">
          {preview.summary.masterMapped} mapped · {preview.channelOnly.length} channel-only · {preview.discarded.length} skipped
          <ChevronIcon className="transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-3 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
        <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
          How each {result.channelType} field was classified. “Channel-only” fields are kept as channel-specific data;
          “skipped” are operational fields (IDs, timestamps) not needed on your product.
        </p>
        <ReverseSummaryBar summary={preview.summary} notesCount={preview.deDerivationNotes.length} />
        <ReverseBucketSection title="Master-mapped" count={preview.masterMapped.length} hint="→ your product" accent="blue" defaultOpen={false}>
          {preview.masterMapped.map((f, i) => (
            <ReverseDiffField
              key={`${f.channelPath}-${i}`}
              channelPath={f.channelPath}
              label={f.masterAttrId}
              currentValue={f.currentMasterValue}
              incomingValue={f.channelValue}
              changed={f.changed}
              note={f.note}
            />
          ))}
        </ReverseBucketSection>
        <ReverseBucketSection title="Channel-only" count={preview.channelOnly.length} hint="kept as channel data" accent="gray" defaultOpen={false}>
          {preview.channelOnly.map((f, i) => (
            <ImportPlainRow key={`${f.channelPath}-${i}`} path={f.channelPath} value={f.channelValue} note={f.note} />
          ))}
        </ReverseBucketSection>
        <ReverseBucketSection title="Skipped" count={preview.discarded.length} hint="operational — not needed" accent="muted" defaultOpen={false}>
          {preview.discarded.map((f, i) => (
            <ImportPlainRow key={`${f.channelPath}-${i}`} path={f.channelPath} value={f.channelValue} note={f.note} muted />
          ))}
        </ReverseBucketSection>
        <DeDerivationNotes notes={preview.deDerivationNotes} />
      </div>
    </details>
  );
}

/** Square image thumbnail with a graceful placeholder when there's no URL. */
function Thumb({ src, className = "" }: { src?: string; className?: string }) {
  if (!src) {
    return (
      <div className={`flex flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-gray-300 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-600 ${className}`}>
        <ImageIcon />
      </div>
    );
  }
  // Channel CDN URLs are arbitrary hosts → plain <img> (matches the rest of the app).
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={`flex-shrink-0 rounded-lg border border-gray-100 object-cover dark:border-gray-800 ${className}`} />;
}

function ImportPlainRow({ path, value, note, muted }: { path: string; value: unknown; note?: string | null; muted?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-2 rounded-lg border px-3 py-1.5 text-xs ${
      muted
        ? "border-gray-100 bg-gray-50/40 text-gray-400 dark:border-gray-800 dark:bg-white/[0.01] dark:text-gray-500"
        : "border-gray-100 bg-gray-50/60 dark:border-gray-800 dark:bg-white/[0.02]"
    }`}>
      <span className="font-mono font-medium text-gray-600 dark:text-gray-300">{path}</span>
      <span className="text-gray-400">=</span>
      <span className="max-w-[55%] truncate font-medium text-gray-700 dark:text-gray-200">{formatReverseValue(value)}</span>
      {note && <span className="ml-auto truncate text-[11px] text-gray-400 dark:text-gray-500">{note}</span>}
    </div>
  );
}

function SuccessBanner({ result, kind }: { result: ReverseImportResult; kind: "create" | "link" | "update" }) {
  const id = encodeURIComponent(result.masterProductId);
  const cr = result.categoryResolution;

  const title =
    kind === "link" ? "Linked to an existing product"
    : kind === "update" ? "Draft updated from channel"
    : "Draft product created";

  // Where the merchant goes next. Step 2 (Channel Fields) is built from the product's
  // Product Type, so a fresh/updated DRAFT must have one before Step 2 works:
  //   • categoryResolution.autoResolved → productTypeId set from the channel category → Step 2 ready.
  //   • otherwise (unmapped category, or no category at all) → Step 1 to pick a Product Type first.
  // Linking attaches the item to an EXISTING product (already set up) → just open it.
  let href = `/products/${id}`;
  let cta = "Open product →";
  let subtitle = "The channel listing is now linked to your product.";
  let needsProductType = false;

  if (kind !== "link") {
    if (cr?.autoResolved) {
      href = `/products/${id}/channel-fields`;
      cta = "Continue to channel fields (Step 2) →";
      subtitle =
        kind === "update"
          ? "Fresh channel data was merged into the draft (still a draft). Continue in Step 2, then publish."
          : "Product type was set from the channel category — finish the channel fields, then publish.";
    } else {
      href = `/products/${id}/edit`;
      cta = "Set product type (Step 1) →";
      subtitle = "This draft has no product type yet — set one in Step 1 to unlock the channel fields.";
      needsProductType = true;
    }
  }

  return (
    <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-4 text-center dark:border-success-500/25 dark:bg-success-500/10">
      <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-success-100 text-2xl dark:bg-success-500/20">
        ✓
      </div>
      <p className="font-semibold text-success-700 dark:text-success-400">{title}</p>
      <p className="mt-1 text-sm text-success-700/80 dark:text-success-400/80">{subtitle}</p>
      {needsProductType && cr && (
        <p className="mx-auto mt-2 max-w-sm rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          Channel category{" "}
          {cr.channelCategoryName
            ? <span className="font-semibold">“{cr.channelCategoryName}”</span>
            : <span className="font-mono">{cr.channelCategoryId}</span>}
          {" "}isn’t mapped to a product type yet — pick the closest one.
        </p>
      )}
      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
      >
        {cta}
      </Link>
    </div>
  );
}

// ─── Icons ─────────────────────────────────────────────────────────────────────

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const ImageIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.6-3.6a2 2 0 0 0-2.8 0L6 20" />
  </svg>
);

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const AlertIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
  </svg>
);

const InfoIcon = () => (
  <svg className="mt-0.5 flex-shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

const ChevronIcon = ({ className = "" }: { className?: string }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export default ImportPreviewModal;
