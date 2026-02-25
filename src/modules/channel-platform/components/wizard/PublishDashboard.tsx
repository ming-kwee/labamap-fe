"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type {
  ChannelProductData,
  ChannelProductStatus,
  StorePublishResult,
} from "../../types/channelStore";
import { ChannelProductDataService, PublishService } from "../../services/channelStoreService";
import ChannelTypeBadge from "../stores/ChannelTypeBadge";

const ORGANIZATION_ID = "org_123";

function statusBadge(status: ChannelProductStatus) {
  switch (status) {
    case "PUBLISHED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-1 bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-400">
          <span className="h-1.5 w-1.5 rounded-full bg-success-500" />Published
        </span>
      );
    case "READY":
      return (
        <span className="inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-1 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />Ready
        </span>
      );
    case "FAILED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-1 bg-error-50 dark:bg-error-500/10 text-error-700 dark:text-error-400">
          <span className="h-1.5 w-1.5 rounded-full bg-error-500" />Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />Draft
        </span>
      );
  }
}

interface StoreCardProps {
  data: ChannelProductData;
  publishResult?: StorePublishResult;
  onPublish: (storeId: string) => void;
  isPublishing: boolean;
}

function StorePreviewCard({ data, publishResult, onPublish, isPublishing }: StoreCardProps) {
  const [channelDataExpanded, setChannelDataExpanded] = useState(true);
  const [variantsExpanded, setVariantsExpanded] = useState(false);

  const channelFields = Object.entries(data.channelData);
  const variantSkus = Object.keys(data.variantOverrides);

  const currentStatus = publishResult
    ? (publishResult.status === "PUBLISHED" ? "PUBLISHED" : "FAILED") as ChannelProductStatus
    : data.status;

  return (
    <div className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white truncate">{data.storeId}</p>
          <div className="flex items-center gap-2 mt-1">
            <ChannelTypeBadge channelType={data.channelType} size="sm" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {statusBadge(currentStatus)}
          <span className="text-xs text-gray-400 dark:text-gray-500">{data.completionPercentage}% complete</span>
        </div>
      </div>

      {/* Publish error */}
      {(publishResult?.status === "FAILED" || data.status === "FAILED") && (
        <div className="px-5 py-3 bg-error-50 dark:bg-error-500/10 border-b border-error-100 dark:border-error-500/20">
          <p className="text-xs font-medium text-error-700 dark:text-error-400">Publish error:</p>
          <p className="text-xs text-error-600 dark:text-error-300 mt-0.5">
            {publishResult?.error ?? data.publishError ?? "Unknown error"}
          </p>
        </div>
      )}

      {/* Channel data preview */}
      {channelFields.length > 0 && (
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setChannelDataExpanded((v) => !v)}
            className="flex items-center justify-between w-full text-xs font-medium text-gray-600 dark:text-gray-400 mb-2"
          >
            <span>Channel Fields ({channelFields.length})</span>
            <span>{channelDataExpanded ? "▲" : "▼"}</span>
          </button>
          {channelDataExpanded && (
            <div className="space-y-1.5">
              {channelFields.map(([key, val]) => (
                <div key={key} className="flex items-start gap-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500 min-w-[120px] capitalize">
                    {key.replace(/_/g, " ")}:
                  </span>
                  <span className="text-xs text-gray-700 dark:text-gray-300 break-all">
                    {Array.isArray(val) ? val.join(", ") : String(val ?? "")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Variant overrides preview */}
      {variantSkus.length > 0 && (
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setVariantsExpanded((v) => !v)}
            className="flex items-center justify-between w-full text-xs font-medium text-gray-600 dark:text-gray-400 mb-2"
          >
            <span>Variant Overrides ({variantSkus.length} SKUs)</span>
            <span>{variantsExpanded ? "▲" : "▼"}</span>
          </button>
          {variantsExpanded && (
            <div className="space-y-2">
              {variantSkus.map((sku) => (
                <div key={sku}>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{sku}</p>
                  <div className="ml-3 mt-0.5 space-y-0.5">
                    {Object.entries(data.variantOverrides[sku] ?? {}).map(([k, v]) => (
                      <div key={k} className="flex items-start gap-2">
                        <span className="text-xs text-gray-400 capitalize">{k.replace(/_/g, " ")}:</span>
                        <span className="text-xs text-gray-600 dark:text-gray-400">{String(v ?? "")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Publish button */}
      <div className="px-5 py-4">
        {currentStatus === "PUBLISHED" ? (
          <div className="flex items-center gap-2 text-success-600 dark:text-success-400">
            <span className="text-lg">✓</span>
            <span className="text-sm font-medium">Published successfully</span>
          </div>
        ) : (
          <button
            onClick={() => onPublish(data.storeId)}
            disabled={isPublishing || (data.completionPercentage < 100 && currentStatus !== "FAILED")}
            className="w-full px-4 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPublishing
              ? "Publishing…"
              : currentStatus === "FAILED"
              ? "Retry Publish"
              : "Publish to Store"}
          </button>
        )}
        {currentStatus !== "PUBLISHED" && data.completionPercentage < 100 && (
          <p className="text-xs text-warning-600 dark:text-warning-400 mt-2 text-center">
            Not all required fields filled ({data.completionPercentage}%). Go back to Step 2 to complete.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  masterProductId: string;
}

export default function PublishDashboard({ masterProductId }: Props) {
  const router = useRouter();

  const [storeData, setStoreData] = useState<ChannelProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishResults, setPublishResults] = useState<Record<string, StorePublishResult>>({});
  const [publishingStores, setPublishingStores] = useState<Set<string>>(new Set());
  const [batchPublishing, setBatchPublishing] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await ChannelProductDataService.getAllStoreData(masterProductId);
      setStoreData(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load store data");
    } finally {
      setLoading(false);
    }
  }, [masterProductId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handlePublishSingle(storeId: string) {
    setPublishingStores((prev) => new Set(prev).add(storeId));
    setBatchError(null);
    try {
      const result = await PublishService.publishToStore({
        masterProductId,
        storeId,
        organizationId: ORGANIZATION_ID,
      });
      setPublishResults((prev) => ({
        ...prev,
        [storeId]: { storeId, status: result.status === "PUBLISHED" ? "PUBLISHED" : "FAILED", publishedAt: result.publishedAt },
      }));
      // Refresh local data
      setStoreData((prev) =>
        prev.map((d) =>
          d.storeId === storeId
            ? { ...d, status: result.status === "PUBLISHED" ? "PUBLISHED" : "FAILED" as ChannelProductStatus, publishedAt: result.publishedAt }
            : d
        )
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Publish failed";
      setPublishResults((prev) => ({
        ...prev,
        [storeId]: { storeId, status: "FAILED", error: errorMsg },
      }));
    } finally {
      setPublishingStores((prev) => {
        const next = new Set(prev);
        next.delete(storeId);
        return next;
      });
    }
  }

  async function handlePublishAll() {
    const readyStores = storeData
      .filter((d) => d.status === "READY" || d.completionPercentage === 100)
      .map((d) => d.storeId);
    if (readyStores.length === 0) return;
    setBatchPublishing(true);
    setBatchError(null);
    try {
      const resp = await PublishService.publishBatch({
        masterProductId,
        organizationId: ORGANIZATION_ID,
        storeIds: readyStores,
      });
      const resultsMap: Record<string, StorePublishResult> = {};
      for (const r of resp.results) {
        resultsMap[r.storeId] = r;
      }
      setPublishResults((prev) => ({ ...prev, ...resultsMap }));
      setStoreData((prev) =>
        prev.map((d) => {
          const r = resultsMap[d.storeId];
          if (!r) return d;
          return { ...d, status: r.status, publishedAt: r.publishedAt, publishError: r.error };
        })
      );
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Batch publish failed");
    } finally {
      setBatchPublishing(false);
    }
  }

  const readyCount = storeData.filter((d) => d.status === "READY" || d.completionPercentage === 100).length;
  const publishedCount = storeData.filter(
    (d) => d.status === "PUBLISHED" || publishResults[d.storeId]?.status === "PUBLISHED"
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-1">
          <a href="/products/create" className="hover:text-brand-500 transition-colors">Step 1: Master Product</a>
          <span>›</span>
          <a
            href={`/products/${masterProductId}/channel-fields`}
            className="hover:text-brand-500 transition-colors"
          >
            Step 2: Channel Fields
          </a>
          <span>›</span>
          <span className="font-medium text-gray-900 dark:text-white">Step 3: Preview & Publish</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Preview & Publish</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Review channel data and publish to your connected stores.
        </p>
      </div>

      {/* KPI */}
      {!loading && !loadError && storeData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Stores", value: storeData.length, color: "text-gray-700 dark:text-gray-300" },
            { label: "Ready",        value: readyCount,       color: "text-brand-700 dark:text-brand-400" },
            { label: "Published",    value: publishedCount,   color: "text-success-700 dark:text-success-400" },
            { label: "Failed",       value: storeData.filter((d) => d.status === "FAILED" || publishResults[d.storeId]?.status === "FAILED").length, color: "text-error-700 dark:text-error-400" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl px-5 py-4"
            >
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {!loading && !loadError && storeData.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <button
            onClick={() => router.push(`/products/${masterProductId}/channel-fields`)}
            className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            ← Edit Channel Fields
          </button>
          <div className="flex items-center gap-3">
            {batchError && (
              <p className="text-sm text-error-600 dark:text-error-400">{batchError}</p>
            )}
            <button
              onClick={handlePublishAll}
              disabled={batchPublishing || readyCount === 0}
              className="px-6 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {batchPublishing
                ? "Publishing…"
                : `Publish All Ready (${readyCount})`}
            </button>
          </div>
        </div>
      )}

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="inline-block h-10 w-10 rounded-full border-4 border-brand-500 border-t-transparent animate-spin mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading store data…</p>
          </div>
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-2xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-6 py-5">
          <p className="font-medium text-error-700 dark:text-error-400">Failed to load store data</p>
          <p className="text-sm text-error-600 dark:text-error-300 mt-1">{loadError}</p>
          <button onClick={loadData} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-error-100 dark:bg-error-500/20 text-error-700 dark:text-error-400 hover:bg-error-200 transition-colors">
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && storeData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-2xl">📦</div>
          <p className="font-medium text-gray-900 dark:text-white">No channel data found</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Go back to Step 2 to fill channel-specific fields.</p>
          <button
            onClick={() => router.push(`/products/${masterProductId}/channel-fields`)}
            className="mt-4 px-5 py-2.5 rounded-xl bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
          >
            ← Back to Channel Fields
          </button>
        </div>
      )}

      {/* Store cards grid */}
      {!loading && !loadError && storeData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {storeData.map((data) => (
            <StorePreviewCard
              key={data.storeId}
              data={data}
              publishResult={publishResults[data.storeId]}
              onPublish={handlePublishSingle}
              isPublishing={publishingStores.has(data.storeId) || batchPublishing}
            />
          ))}
        </div>
      )}
    </div>
  );
}
