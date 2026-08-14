"use client";
import React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  Send,
  RefreshCw,
  ExternalLink,
  Trash2,
  Clock,
} from "@/shared/ui/icons/Icons";
import { getChannelMeta } from "../../step2-channel-fields/components/stores/ChannelTypeBadge";
import type {
  ChannelProductData,
  StorePublishResult,
  PublishDiffResponse,
} from "../../step2-channel-fields/types/channelStore";
import type { MasterProduct } from "@/modules/ecommerce-product-v2/types/product";
import {
  deriveLifecycle,
  operationMessage,
  TONE_PILL,
  TONE_DOT,
  type Lifecycle,
} from "../utils/listing-lifecycle";

/**
 * Merchant (end-user) layout for Step 3 — a go-live flow modelled on Ginee / BigSeller / ChannelAdvisor:
 * a product preview + a backlog-style list with one compact row per connected channel (clear listing
 * status + a contextual primary action: Publish / Update / Retry / Publish ulang), plus per-listing
 * Delist + Riwayat and a one-click "Publish all ready". Uniform rows keep live listings just as visible
 * as the ones still needing work (unlike the old cards, which shrank once published). No engine internals
 * (APM / JOLT / diagnostics) — those live in the developer view. All lifecycle logic comes from the
 * shared `deriveLifecycle` state machine (§3).
 *
 * Owns no publish/delist logic: it calls the same handlers the developer view uses.
 */

const CHANNEL_LABEL: Partial<Record<string, string>> = {
  shopee: "Shopee", tokopedia: "Tokopedia", lazada: "Lazada", tiktok: "TikTok Shop",
  shopify: "Shopify", woocommerce: "WooCommerce", amazon: "Amazon", ebay: "eBay",
  wix: "Wix", walmart: "Walmart",
};

const PLACEHOLDER =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="96" height="96"%3E%3Crect width="96" height="96" fill="%23e5e7eb"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="10"%3Eno image%3C/text%3E%3C/svg%3E';

/** Channel target path (product.variants[0].weight) → plain label ("weight"). */
function friendlyField(path: string): string {
  const seg = path.split(".").pop() ?? path;
  return seg.replace(/\[\d+\]/g, "").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
}

export interface MerchantPublishViewProps {
  product: MasterProduct | null;
  masterProductId: string;
  storeData: ChannelProductData[];
  publishResults: Record<string, StorePublishResult>;
  publishingStores: Set<string>;
  delistingStores: Set<string>;
  diffs: Record<string, PublishDiffResponse>;
  batchPublishing: boolean;
  batchError: string | null;
  publishedCount: number;
  onPublishStore: (storeId: string) => void;
  onDelistStore: (storeId: string) => void;
  onDelistThenRepublish: (storeId: string) => void;
  onShowHistory: (storeId: string) => void;
  channelFieldsUrlFor: (storeId: string) => string;
  onViewProduct: () => void;
  onCreateAnother: () => void;
}

export default function MerchantPublishView({
  product,
  storeData,
  publishResults,
  publishingStores,
  delistingStores,
  diffs,
  batchPublishing,
  batchError,
  publishedCount,
  onPublishStore,
  onDelistStore,
  onDelistThenRepublish,
  onShowHistory,
  channelFieldsUrlFor,
  onViewProduct,
  onCreateAnother,
}: MerchantPublishViewProps) {
  const lifecycleOf = (d: ChannelProductData): Lifecycle =>
    deriveLifecycle(d, {
      inFlight: publishingStores.has(d.storeId) || delistingStores.has(d.storeId),
      result: publishResults[d.storeId],
      diff: diffs[d.storeId],
    });

  const readyStores = storeData.filter((d) => lifecycleOf(d).state === "ready");
  const attention = storeData.filter((d) =>
    ["failed", "blocked", "draft"].includes(lifecycleOf(d).state)
  ).length;
  const allLive = storeData.length > 0 && storeData.every((d) => lifecycleOf(d).isLive);

  const publishAllReady = () => readyStores.forEach((d) => onPublishStore(d.storeId));

  const price = product?.price != null ? `$${Number(product.price).toFixed(2)}` : null;

  return (
    <div className="space-y-6">
      {/* ── Hero: product preview + go-live summary ─────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-brand-50/70 to-white dark:from-brand-500/10 dark:to-transparent p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          {/* Product preview */}
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product?.mainImage || PLACEHOLDER}
              alt=""
              className="h-16 w-16 rounded-xl object-cover border border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-100 dark:bg-gray-800"
              onError={(e) => ((e.target as HTMLImageElement).src = PLACEHOLDER)}
            />
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{product?.name ?? "Your product"}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {[product?.sku && `SKU ${product.sku}`, price].filter(Boolean).join(" · ") || "Ready to go live"}
              </p>
            </div>
          </div>

          {/* Summary + primary CTA */}
          <div className="flex flex-col items-stretch md:items-end gap-2.5 flex-shrink-0">
            <div className="flex items-center gap-1.5 flex-wrap md:justify-end">
              <Pill tone="success">{publishedCount} live</Pill>
              <Pill tone="brand">{readyStores.length} ready</Pill>
              {attention > 0 && <Pill tone="warning">{attention} need attention</Pill>}
            </div>
            {allLive ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success-600 dark:text-success-400">
                <CheckCircle2 className="h-5 w-5" /> All channels are live 🎉
              </span>
            ) : (
              <button
                type="button"
                onClick={publishAllReady}
                disabled={batchPublishing || readyStores.length === 0}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <Send className="h-4 w-4" />
                {readyStores.length > 0 ? `Publish all ready (${readyStores.length})` : "Nothing ready yet"}
              </button>
            )}
          </div>
        </div>
        {batchError && <p className="mt-3 text-sm text-error-600 dark:text-error-400">{batchError}</p>}
      </div>

      {/* ── Channel backlog: one framed row per connected channel ───────────── */}
      <div className="space-y-2.5">
        {storeData.map((d) => (
          <ChannelRow
            key={d.storeId}
            data={d}
            lc={lifecycleOf(d)}
            result={publishResults[d.storeId]}
            onPublish={() => onPublishStore(d.storeId)}
            onDelist={() => onDelistStore(d.storeId)}
            onDelistThenRepublish={() => onDelistThenRepublish(d.storeId)}
            onHistory={() => onShowHistory(d.storeId)}
            fixUrl={channelFieldsUrlFor(d.storeId)}
          />
        ))}
      </div>

      {/* ── Success footer ──────────────────────────────────────────────────── */}
      {publishedCount > 0 && (
        <div className="rounded-2xl border border-success-200 dark:border-success-500/30 bg-success-50/60 dark:bg-success-500/5 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-success-600 dark:text-success-400 flex-shrink-0" />
            <p className="text-sm font-medium text-success-800 dark:text-success-300">
              {allLive
                ? "Every channel is live — nice work!"
                : `${publishedCount} of ${storeData.length} channels live.`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onViewProduct}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              View product
            </button>
            <button
              type="button"
              onClick={onCreateAnother}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              + Create another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Channel row (backlog item) ─────────────────────────────────────────────────
// Shared classes for a square icon button in a row — framed so the trailing controls read as
// one tidy, consistent toolbar rather than floating glyphs of differing weight.
const ICON_BTN =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200";
const ICON_BTN_DANGER =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:border-error-200 hover:bg-error-50 hover:text-error-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-error-500/30 dark:hover:bg-error-500/10 dark:hover:text-error-400";

function ChannelRow({
  data,
  lc,
  result,
  onPublish,
  onDelist,
  onDelistThenRepublish,
  onHistory,
  fixUrl,
}: {
  data: ChannelProductData;
  lc: Lifecycle;
  result?: StorePublishResult;
  onPublish: () => void;
  onDelist: () => void;
  onDelistThenRepublish: () => void;
  onHistory: () => void;
  fixUrl: string;
}) {
  const label = CHANNEL_LABEL[data.channelType] ?? data.channelType;
  const meta = getChannelMeta(data.channelType);
  const state = lc.state;
  const inFlight = state === "publishing" || state === "processing";

  // Idempotent-update gate (Delist & re-publish) — either from a live attempt that came back
  // BLOCKED, or pre-emptively from the dirty-state diff (decision=UPDATE_BLOCKED).
  const updateGate =
    (result?.status === "BLOCKED" && result.operation === "UPDATE") ||
    (state === "live_changed" && lc.updateBlocked);
  const publishedTime = result?.publishedAt || data.publishedAt;
  const showFix = state === "failed" || (state === "blocked" && !updateGate);
  const canHistory = lc.isLive || state === "delisted" || (data.publishAttempts ?? 0) > 0;

  // One-line status detail under the channel name — keeps every row the same height so a
  // published listing stays just as visible as one that still needs work.
  const substatus: React.ReactNode = (() => {
    if (state === "draft") {
      return (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-16 flex-shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <span className="block h-full rounded-full bg-warning-500" style={{ width: `${data.completionPercentage}%` }} />
          </span>
          <span className="tabular-nums">{data.completionPercentage}% · lengkapi info wajib</span>
        </span>
      );
    }
    if (state === "ready") return <span>Siap tayang</span>;
    if (inFlight) {
      return (
        <span className="flex items-center gap-1.5 text-warning-600 dark:text-warning-400">
          <RefreshCw className="h-3 w-3 animate-spin flex-shrink-0" />
          {state === "processing" ? "Masih diproses — cek lagi sebentar" : "Publishing…"}
        </span>
      );
    }
    if (state === "live" || state === "live_changed") {
      return (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-success-600 dark:text-success-400">
            Live{publishedTime ? ` · ${new Date(publishedTime).toLocaleDateString()}` : ""}
          </span>
          {result?.operation && (
            <span className="text-gray-400 dark:text-gray-500">· {operationMessage(result.operation).text}</span>
          )}
        </span>
      );
    }
    if (state === "update_failed") return <span className="text-success-600 dark:text-success-400">Masih tayang — update terakhir gagal</span>;
    if (state === "delisted") return <span>Dihapus dari channel · publish ulang untuk listing baru</span>;
    if (updateGate) return <span className="text-warning-600 dark:text-warning-400">Update belum tersedia — delist lalu publish ulang</span>;
    if (showFix) {
      return (
        <span className={state === "blocked" ? "text-warning-600 dark:text-warning-400" : "text-error-600 dark:text-error-400"}>
          {state === "blocked" ? "Ada info wajib yang belum lengkap" : "Publishing gagal — belum tayang"}
        </span>
      );
    }
    return null;
  })();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-white/[0.02] dark:hover:border-gray-700 sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Identity + status */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* status dot */}
          <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
            {lc.badge.pulse && (
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${TONE_DOT[lc.badge.tone]}`} />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${TONE_DOT[lc.badge.tone]}`} />
          </span>
          {/* channel avatar */}
          <span
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${meta.bg} ${meta.text}`}
            title={label}
          >
            {meta.code}
          </span>
          {/* name + substatus */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
              <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TONE_PILL[lc.badge.tone]}`}>
                {lc.badge.label}
              </span>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate">{data.storeName ?? data.storeId}</span>
              {substatus && <span aria-hidden className="text-gray-300 dark:text-gray-600">·</span>}
              {substatus && <span className="min-w-0 truncate">{substatus}</span>}
            </div>
          </div>
        </div>

        {/* Actions — primary CTA + one framed secondary toolbar */}
        <div className="flex flex-shrink-0 items-center gap-2 sm:pl-2">
          <RowAction
            state={state}
            lc={lc}
            updateGate={updateGate}
            showFix={showFix}
            fixUrl={fixUrl}
            onPublish={onPublish}
            onDelistThenRepublish={onDelistThenRepublish}
          />
          {(lc.channelUrl || canHistory || lc.isDelistable) && (
            <div className="flex items-center gap-1.5">
              {lc.channelUrl && (
                <a href={lc.channelUrl} target="_blank" rel="noopener noreferrer" title="Lihat di channel" className={ICON_BTN}>
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              {canHistory && (
                <button type="button" onClick={onHistory} title="Riwayat" className={ICON_BTN}>
                  <Clock className="h-4 w-4" />
                </button>
              )}
              {lc.isDelistable && (
                <button type="button" onClick={onDelist} title="Delist" className={ICON_BTN_DANGER}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail strip — only when there's something to fix (keeps clean rows uniform) */}
      {(showFix || updateGate) && (
        <div className="mt-2.5 sm:pl-[3.25rem]">
          {showFix && <FixList result={result} blocked={state === "blocked"} />}
          {updateGate && (
            <div className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 dark:border-warning-500/30 dark:bg-warning-500/10">
              <p className="flex items-center gap-1.5 text-xs font-medium text-warning-700 dark:text-warning-400">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /> Update belum tersedia
              </p>
              <p className="mt-1 text-xs text-warning-600 dark:text-warning-300">
                Mengubah listing yang sudah tayang belum aktif untuk channel ini. Delist lalu publish ulang.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Contextual primary action for a channel row (compact, auto-width). */
function RowAction({
  state,
  lc,
  updateGate,
  showFix,
  fixUrl,
  onPublish,
  onDelistThenRepublish,
}: {
  state: Lifecycle["state"];
  lc: Lifecycle;
  updateGate: boolean;
  showFix: boolean;
  fixUrl: string;
  onPublish: () => void;
  onDelistThenRepublish: () => void;
}) {
  if (state === "publishing")
    return <RowButton disabled icon={<RefreshCw className="h-4 w-4 animate-spin" />}>Publishing…</RowButton>;
  if (state === "processing")
    return <RowButton disabled tone="warning" icon={<RefreshCw className="h-4 w-4 animate-spin" />}>Memproses…</RowButton>;
  if (state === "ready")
    return <RowButton onClick={onPublish} icon={<Send className="h-4 w-4" />}>Publish</RowButton>;
  if (state === "draft")
    return <RowLink href={fixUrl} tone="warning">Lengkapi setup →</RowLink>;
  if (updateGate)
    return (
      <RowButton onClick={onDelistThenRepublish} tone="warning" icon={<RefreshCw className="h-4 w-4" />}>
        Delist &amp; publish ulang
      </RowButton>
    );
  if (state === "live_changed")
    return (
      <RowButton onClick={onPublish} icon={<RefreshCw className="h-4 w-4" />}>
        {`Perbarui${lc.changeCount ? ` (${lc.changeCount})` : ""}`}
      </RowButton>
    );
  if (state === "live")
    return lc.diffKnown ? (
      <span className="inline-flex items-center gap-1 px-2 text-xs font-medium text-gray-400 dark:text-gray-500">
        <CheckCircle2 className="h-4 w-4" /> Tersinkron
      </span>
    ) : (
      <RowGhost onClick={onPublish} icon={<RefreshCw className="h-4 w-4" />}>Perbarui</RowGhost>
    );
  if (state === "delisted")
    return <RowButton onClick={onPublish} icon={<Send className="h-4 w-4" />}>Publish ulang</RowButton>;
  if (state === "update_failed")
    return <RowButton onClick={onPublish} icon={<RefreshCw className="h-4 w-4" />}>Coba update lagi</RowButton>;
  if (showFix)
    return (
      <>
        <RowButton onClick={onPublish} icon={<RefreshCw className="h-4 w-4" />}>Coba lagi</RowButton>
        <RowLink href={fixUrl}>Perbaiki</RowLink>
      </>
    );
  return null;
}

function RowButton({
  onClick,
  icon,
  tone = "brand",
  disabled,
  children,
}: {
  onClick?: () => void;
  icon: React.ReactNode;
  tone?: "brand" | "warning";
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const cls = disabled
    ? "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-wait"
    : tone === "warning"
    ? "bg-warning-500 hover:bg-warning-600 text-white"
    : "bg-brand-500 hover:bg-brand-600 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${cls}`}
    >
      {icon} {children}
    </button>
  );
}

function RowGhost({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-brand-300 px-3 py-1.5 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 dark:border-brand-500/40 dark:text-brand-400 dark:hover:bg-brand-500/10"
    >
      {icon} {children}
    </button>
  );
}

function RowLink({ href, tone = "neutral", children }: { href: string; tone?: "neutral" | "warning"; children: React.ReactNode }) {
  const cls = tone === "warning"
    ? "border-warning-300 text-warning-700 hover:bg-warning-50 dark:border-warning-500/40 dark:text-warning-400 dark:hover:bg-warning-500/10"
    : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800";
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${cls}`}
    >
      {children}
    </Link>
  );
}

function FixList({ result, blocked }: { result?: StorePublishResult; blocked: boolean }) {
  const fe = result?.fieldErrors ?? [];
  return (
    <div className={`rounded-lg border px-3 py-2 ${blocked ? "bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/30" : "bg-error-50 dark:bg-error-500/10 border-error-200 dark:border-error-500/30"}`}>
      <p className={`text-xs font-medium flex items-center gap-1.5 ${blocked ? "text-warning-700 dark:text-warning-400" : "text-error-700 dark:text-error-400"}`}>
        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
        {blocked ? "Finish these before publishing" : "Publishing failed — belum tayang"}
      </p>
      {fe.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {fe.map((e, i) => (
            <li key={`${e.field}-${i}`} className="text-xs text-gray-700 dark:text-gray-300">
              <span className="font-medium capitalize">{friendlyField(e.field)}</span>
              {e.message ? <span className="text-gray-600 dark:text-gray-400"> — {e.message}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={`mt-1 text-xs ${blocked ? "text-warning-600 dark:text-warning-300" : "text-error-600 dark:text-error-400"}`}>
          {result?.error ?? "Something went wrong. Try again."}
        </p>
      )}
    </div>
  );
}

// ── Little pills ────────────────────────────────────────────────────────────
function Pill({ tone, children }: { tone: "success" | "brand" | "warning"; children: React.ReactNode }) {
  const cls = {
    success: "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-400",
    brand: "bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-400",
    warning: "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-400",
  }[tone];
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full tabular-nums ${cls}`}>{children}</span>;
}
