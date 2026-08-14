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
import ChannelTypeBadge from "../../step2-channel-fields/components/stores/ChannelTypeBadge";
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
  type Lifecycle,
} from "../utils/listing-lifecycle";

/**
 * Merchant (end-user) layout for Step 3 — a go-live flow modelled on Ginee / BigSeller / ChannelAdvisor:
 * a product preview + one card per connected channel with a clear listing status and a contextual
 * primary action (Publish / Update / Retry / Publish ulang), plus per-listing Delist + Riwayat and a
 * one-click "Publish all ready". No engine internals (APM / JOLT / diagnostics) — those live in the
 * developer view. All lifecycle logic comes from the shared `deriveLifecycle` state machine (§3).
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

      {/* ── Channel cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {storeData.map((d) => (
          <ChannelCard
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

// ── Channel card ──────────────────────────────────────────────────────────────
function ChannelCard({
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
  const state = lc.state;
  const accent =
    lc.isLive ? "border-l-success-400 dark:border-l-success-500"
    : state === "failed" ? "border-l-error-400 dark:border-l-error-500"
    : state === "blocked" || state === "draft" || state === "processing" ? "border-l-warning-400 dark:border-l-warning-500"
    : state === "delisted" ? "border-l-gray-300 dark:border-l-gray-600"
    : "border-l-brand-400 dark:border-l-brand-500";

  // Idempotent-update gate (Delist & re-publish) — either from a live attempt that came back
  // BLOCKED, or pre-emptively from the dirty-state diff (decision=UPDATE_BLOCKED).
  const updateGate =
    (result?.status === "BLOCKED" && result.operation === "UPDATE") ||
    (state === "live_changed" && lc.updateBlocked);
  const publishedTime = result?.publishedAt || data.publishedAt;

  return (
    <div className={`rounded-2xl border border-l-4 ${accent} border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.02] p-4 flex flex-col gap-3`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <ChannelTypeBadge channelType={data.channelType} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{label}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{data.storeName ?? data.storeId}</p>
          </div>
        </div>
        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TONE_PILL[lc.badge.tone]}`}>
          {lc.badge.label}
        </span>
      </div>

      {/* Body by state */}
      {state === "draft" && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div className="h-full rounded-full bg-warning-500" style={{ width: `${data.completionPercentage}%` }} />
            </div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums">{data.completionPercentage}%</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Some required info is still missing.</p>
        </div>
      )}

      {state === "ready" && (
        <p className="text-xs text-gray-500 dark:text-gray-400">All required info is filled — ready to go live.</p>
      )}

      {state === "processing" && (
        <p className="text-xs text-warning-600 dark:text-warning-400 flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
          Still publishing — image-heavy listings can take a bit. Refresh to see the final result.
        </p>
      )}

      {(state === "live" || state === "live_changed") && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-xs text-success-600 dark:text-success-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Live{publishedTime ? ` · ${new Date(publishedTime).toLocaleDateString()}` : ""}
            </p>
            {lc.channelUrl && (
              <a
                href={lc.channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Lihat di channel
              </a>
            )}
          </div>
          {/* Result of the last update push (§4a) — UPDATE / NO-OP feedback */}
          {result?.operation && (
            <p className={`inline-block rounded px-2 py-0.5 text-xs ${TONE_PILL[operationMessage(result.operation).tone]}`}>
              {operationMessage(result.operation).text}
            </p>
          )}
        </div>
      )}

      {state === "update_failed" && (
        <div className="rounded-lg border border-success-200 dark:border-success-500/30 bg-success-50 dark:bg-success-500/10 px-3 py-2">
          <p className="text-xs font-medium flex items-center gap-1.5 text-success-700 dark:text-success-400">
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" /> Masih tayang — update terakhir gagal
          </p>
          <p className="mt-1 text-xs text-success-700/80 dark:text-success-300">
            Listing tetap aktif dan bisa dibeli. Coba update lagi.
          </p>
        </div>
      )}

      {state === "delisted" && (
        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
          <Trash2 className="h-3.5 w-3.5 flex-shrink-0" />
          Dihapus dari channel. Publish ulang untuk membuat listing baru.
        </p>
      )}

      {updateGate && (
        <div className="rounded-lg border border-warning-200 dark:border-warning-500/30 bg-warning-50 dark:bg-warning-500/10 px-3 py-2">
          <p className="text-xs font-medium flex items-center gap-1.5 text-warning-700 dark:text-warning-400">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /> Update belum tersedia
          </p>
          <p className="mt-1 text-xs text-warning-600 dark:text-warning-300">
            Mengubah listing yang sudah tayang belum aktif untuk channel ini. Delist lalu publish ulang.
          </p>
        </div>
      )}

      {(state === "failed" || (state === "blocked" && !updateGate)) && (
        <FixList result={result} blocked={state === "blocked"} />
      )}

      {/* Action */}
      <div className="mt-auto pt-1 space-y-2">
        {state === "publishing" && (
          <button disabled className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-brand-500/70 text-white cursor-wait">
            <RefreshCw className="h-4 w-4 animate-spin" /> Publishing…
          </button>
        )}
        {state === "processing" && (
          <button disabled className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-warning-500/70 text-white cursor-wait">
            <RefreshCw className="h-4 w-4 animate-spin" /> Still publishing…
          </button>
        )}
        {state === "ready" && (
          <PrimaryButton onClick={onPublish} icon={<Send className="h-4 w-4" />}>Publish</PrimaryButton>
        )}
        {state === "draft" && (
          <Link
            href={fixUrl}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-warning-300 dark:border-warning-500/40 text-warning-700 dark:text-warning-400 hover:bg-warning-50 dark:hover:bg-warning-500/10 transition-colors"
          >
            Finish setup →
          </Link>
        )}
        {/* Live listing — diff-aware update action (DiffEngine). "Up to date" (disabled) when the
            authoritative diff says nothing changed; "Perbarui listing (N)" when it does. The
            update-gate (can't push yet) is handled by the Delist & re-publish button below. */}
        {state === "live" && lc.diffKnown && (
          <button disabled className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-default">
            <CheckCircle2 className="h-4 w-4" /> Up to date
          </button>
        )}
        {state === "live" && !lc.diffKnown && (
          <button
            type="button"
            onClick={onPublish}
            title="Kirim perubahan ke channel — kalau tak ada perubahan, sistem melewatinya (NO-OP)"
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-brand-300 dark:border-brand-500/40 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Perbarui listing
          </button>
        )}
        {state === "live_changed" && !updateGate && (
          <PrimaryButton onClick={onPublish} icon={<RefreshCw className="h-4 w-4" />}>
            {`Perbarui listing${lc.changeCount ? ` (${lc.changeCount})` : ""}`}
          </PrimaryButton>
        )}
        {state === "delisted" && (
          <PrimaryButton onClick={onPublish} icon={<Send className="h-4 w-4" />}>Publish ulang</PrimaryButton>
        )}
        {state === "update_failed" && (
          <PrimaryButton onClick={onPublish} icon={<RefreshCw className="h-4 w-4" />}>Coba update lagi</PrimaryButton>
        )}
        {updateGate && (
          <PrimaryButton onClick={onDelistThenRepublish} icon={<RefreshCw className="h-4 w-4" />} tone="warning">
            Delist &amp; Publish ulang
          </PrimaryButton>
        )}
        {(state === "failed" || (state === "blocked" && !updateGate)) && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPublish}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
            >
              <RefreshCw className="h-4 w-4" /> Coba lagi
            </button>
            <Link
              href={fixUrl}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Fix in setup →
            </Link>
          </div>
        )}

        {/* Secondary actions — Delist (live listings) + Riwayat */}
        {(lc.isDelistable || lc.isLive || state === "delisted" || (data.publishAttempts ?? 0) > 0) && (
          <div className="flex items-center justify-between gap-2 pt-1">
            {lc.isDelistable ? (
              <button
                type="button"
                onClick={onDelist}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-error-600 dark:text-error-400 hover:underline"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delist
              </button>
            ) : <span />}
            <button
              type="button"
              onClick={onHistory}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:underline"
            >
              <Clock className="h-3.5 w-3.5" /> Riwayat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PrimaryButton({
  onClick,
  icon,
  tone = "brand",
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  tone?: "brand" | "warning";
  children: React.ReactNode;
}) {
  const cls = tone === "warning"
    ? "bg-warning-500 hover:bg-warning-600"
    : "bg-brand-500 hover:bg-brand-600";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${cls}`}
    >
      {icon} {children}
    </button>
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
