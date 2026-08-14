"use client";
import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card/Card";
import Button from "@/shared/ui/button/Button";
import Progress from "@/shared/ui/progress/Progress";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Info,
  Send,
  RefreshCw,
  Brain,
  Package,
  Code,
  ExternalLink,
  Trash2,
  Clock,
} from "@/shared/ui/icons/Icons";
import type {
  ChannelProductData,
  ChannelProductStatus,
  StorePublishResult,
  PublishSingleResponse,
  PublishFieldError,
  ListingState,
  PublishDiffResponse,
} from "../../step2-channel-fields/types/channelStore";

// ─── Effective value helpers ──────────────────────────────────────────────────

function getEffectiveValue(
  fieldName: string,
  storeData: ChannelProductData,
  master: MasterProduct | null
): { value: unknown; source: "overridden" | "master" } {
  const override = storeData.masterOverrides?.[fieldName];
  if (override !== undefined && override !== null) {
    return { value: override, source: "overridden" };
  }
  return {
    value: master ? (master as unknown as Record<string, unknown>)[fieldName] : undefined,
    source: "master",
  };
}

function EffectiveValueRow({
  label,
  fieldName,
  storeData,
  master,
}: {
  label: string;
  fieldName: string;
  storeData: ChannelProductData;
  master: MasterProduct | null;
}) {
  const { value, source } = getEffectiveValue(fieldName, storeData, master);
  if (value === undefined || value === null) return null;
  const displayVal = typeof value === "number" && fieldName === "price"
    ? `$${Number(value).toFixed(2)}`
    : String(value);
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate max-w-[160px]" title={displayVal}>
          {displayVal}
        </span>
        {source === "overridden" ? (
          <span className="inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400">
            ✏ Overridden
          </span>
        ) : (
          <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
            master
          </span>
        )}
      </div>
    </div>
  );
}
import {
  ChannelProductDataService,
  PublishService,
  ChannelApiError,
  classifyPublishOutcome,
  operationOf,
  type PublishOutcome,
} from "../../step2-channel-fields/services/channelStore.service";
import DelistConfirmModal from "./DelistConfirmModal";
import ListingHistoryDrawer from "./ListingHistoryDrawer";
import {
  deriveLifecycle,
  operationMessage,
  TONE_PILL,
  TONE_DOT,
  type Lifecycle,
} from "../utils/listing-lifecycle";
import { useAuth } from "@/shared/contexts/AuthContext";
import ChannelTypeBadge from "../../step2-channel-fields/components/stores/ChannelTypeBadge";
import type { MasterProduct } from "@/modules/ecommerce-product-v2/types/product";
import type {
  AdaptivePatternMatchingResponse,
} from "@/modules/ecommerce-product-v2/types/channel-mapping";
import {
  analyzePatternMatching,
} from "@/modules/ecommerce-product-v2/services/pattern-matching.service";
import {
  generateMappingRequest,
  mergeStoreOverridesIntoRequest,
  transformMasterProductToSourceSchema,
} from "@/modules/ecommerce-product-v2/utils/product-mapper";
import { MasterProductService } from "@/app/(admin)/products/_services/master-product.service";
import PublishTraceInspector from "./PublishTraceInspector";
import type { PublishTraceRequest } from "@/modules/ecommerce-product-v2/types/publish-trace";
import { useWizardViewMode } from "@/modules/ecommerce-product-v2/utils/viewMode";
import ViewModeToggle from "@/modules/ecommerce-product-v2/components/ViewModeToggle";
import MerchantPublishView from "./MerchantPublishView";

// ─── Publish payload builder ──────────────────────────────────────────────────
//
// The single source of truth for the `masterProductData` body: master (transformed)
// overlaid with Step-2 master overrides then channel data. Shared by BOTH publish
// and the trace inspector so the dry-run is byte-for-byte the same body as the real
// publish — the whole point of the trace ("body identik dengan publish").
function buildPublishMasterData(
  product: MasterProduct | null,
  store: ChannelProductData | undefined,
): Record<string, unknown> {
  return {
    ...(product ? transformMasterProductToSourceSchema(product) : {}),
    ...(store?.masterOverrides ?? {}),
    ...(store?.channelData ?? {}),
  };
}

// ─── Listing-state overlay ─────────────────────────────────────────────────────
//
// Overlay the authoritative listing-state (P0-1 `/listings`) onto the Step-2 completion
// data. The listing owns the live lifecycle status + identity (channelProductId/url); the
// completion data owns completionPercentage/readyToPublish. When no listing exists yet the
// store keeps its Step-2 status (DRAFT/READY).
function mergeListing(data: ChannelProductData, listing: ListingState | undefined): ChannelProductData {
  if (!listing) return data;
  return {
    ...data,
    status: listing.status ?? data.status,
    channelProductId: listing.channelProductId ?? data.channelProductId,
    channelUrl: listing.channelUrl ?? data.channelUrl,
    publishAttempts: listing.publishAttempts ?? data.publishAttempts,
    lastAttemptAt: listing.lastAttemptAt ?? data.lastAttemptAt,
    syncWorkflowId: listing.syncWorkflowId ?? data.syncWorkflowId,
    publishedAt: listing.publishedAt ?? data.publishedAt,
    publishError: listing.publishError ?? data.publishError,
  };
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

// Badge covers the persisted statuses plus the transient, non-terminal "PROCESSING"
// verdict (publish still running after the FE poll window — doc 04 §"Workflow polling").
type BadgeStatus = ChannelProductStatus | "PROCESSING";

function statusBadge(status: BadgeStatus) {
  const variants: Record<string, { cls: string; dot: string; label: string }> = {
    PUBLISHED:  { cls: "bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-400", dot: "bg-success-500",         label: "Published" },
    READY:      { cls: "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400",       dot: "bg-brand-500",            label: "Ready" },
    PROCESSING: { cls: "bg-warning-50 dark:bg-warning-500/10 text-warning-700 dark:text-warning-400", dot: "bg-warning-500 animate-pulse", label: "Publishing…" },
    FAILED:     { cls: "bg-error-50 dark:bg-error-500/10 text-error-700 dark:text-error-400",       dot: "bg-error-500",            label: "Failed" },
    DRAFT:      { cls: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",             dot: "bg-gray-400",             label: "Draft" },
  };
  const v = variants[status] ?? variants.DRAFT;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-1 ${v.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />{v.label}
    </span>
  );
}

// ─── Publish Readiness (merchant-facing) ──────────────────────────────────────
//
// Step 3 is a MERCHANT screen. It must NOT expose the transformation engine
// internals (APM/JOLT/RAG, confidence tiers, field-mapping tables, raw JOLT
// JSON, cascade badges). Those are admin/developer concepts and live in the
// /platform-admin surface. Here we translate the same analysis signals into a
// plain "is my product ready to publish, and what do I fix?" summary.

interface ConflictItem {
  type: "ERROR" | "WARNING";
  target: string;
  sources: string;
  description: string;
}

function parseConflict(line: string): ConflictItem | null {
  const m = line.match(/\[(JOLT-CONFLICT (ERROR|WARNING))\]\s+target='([^']+)'\s+sources=\[([^\]]+)\]\s+[—-]+\s*(.*)/);
  if (!m) return null;
  return { type: m[2] as "ERROR" | "WARNING", target: m[3], sources: m[4], description: m[5] };
}

/** Turn a channel target path (product.variants[0].weight) into a plain label ("weight"). */
function friendlyField(path: string): string {
  const seg = path.split(".").pop() ?? path;
  return seg
    .replace(/\[\d+\]/g, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

type ReadinessLevel = "READY" | "ALMOST" | "NOT_READY";

interface Readiness {
  level: ReadinessLevel;
  autoMapped: number;
  issues: string[];        // plain-language things to fix
  requiredIncomplete: boolean;
  completionPct: number;
  optionalGaps: number;    // channel fields not auto-filled (usually optional)
}

/**
 * Translate the raw APM/JOLT analysis + Step-2 completion into a merchant
 * readiness summary. No engine jargon leaks out of this function.
 */
function deriveReadiness(a: AdaptivePatternMatchingResponse, completionPct: number): Readiness {
  const autoMapped = a.fieldMappings?.length ?? 0;
  const warnings = a.matchingMetadata?.warnings ?? [];

  const statusLine = warnings.find((w) => w.includes("[JOLT-READINESS]"));
  const backendNotReady = !!statusLine?.includes("NOT_READY");
  const backendWarnings = !!statusLine?.includes("WARNINGS");

  const issues: string[] = [];
  for (const w of warnings) {
    if (w.includes("[JOLT-READINESS]")) continue;
    const c = parseConflict(w);
    if (c && c.type === "ERROR") {
      issues.push(`Data untuk "${friendlyField(c.target)}" bentrok — perlu diperbaiki.`);
      continue;
    }
    if (w.startsWith("⚠") || w.startsWith("✗")) {
      const text = w.replace(/^[⚠✗]\s*/, "").trim();
      if (text) issues.push(text);
    }
  }

  const requiredIncomplete = completionPct < 100;
  const optionalGaps = a.unmappedTargetFields?.length ?? 0;

  const level: ReadinessLevel =
    backendNotReady || requiredIncomplete
      ? "NOT_READY"
      : backendWarnings || issues.length > 0
        ? "ALMOST"
        : "READY";

  // De-dupe issues.
  return { level, autoMapped, issues: Array.from(new Set(issues)), requiredIncomplete, completionPct, optionalGaps };
}

const READINESS_META: Record<ReadinessLevel, { title: string; sub: string; bg: string; fg: string }> = {
  READY: {
    title: "Siap dipublish",
    sub: "Produk kamu siap dikirim ke channel ini.",
    bg: "bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-500/30",
    fg: "text-success-700 dark:text-success-400",
  },
  ALMOST: {
    title: "Hampir siap",
    sub: "Bisa dipublish, tapi ada yang sebaiknya dilengkapi dulu.",
    bg: "bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/30",
    fg: "text-warning-700 dark:text-warning-400",
  },
  NOT_READY: {
    title: "Belum siap",
    sub: "Lengkapi info wajib channel sebelum publish.",
    bg: "bg-error-50 dark:bg-error-500/10 border-error-200 dark:border-error-500/30",
    fg: "text-error-700 dark:text-error-400",
  },
};

function PublishReadinessCard({
  analysis,
  completionPct,
  channelFieldsUrl,
}: {
  analysis: AdaptivePatternMatchingResponse;
  completionPct: number;
  channelFieldsUrl: string;
}) {
  const r = deriveReadiness(analysis, completionPct);
  const meta = READINESS_META[r.level];
  const Icon = r.level === "READY" ? CheckCircle2 : AlertTriangle;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Kesiapan Publish
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status banner */}
        <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${meta.bg}`}>
          <Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${meta.fg}`} />
          <div>
            <p className={`font-semibold ${meta.fg}`}>{meta.title}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{meta.sub}</p>
          </div>
        </div>

        {/* Reassurance */}
        <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-success-500" />
          <span><strong>{r.autoMapped}</strong> info produk sudah otomatis dipetakan ke format channel.</span>
        </p>

        {/* Things to fix */}
        {(r.requiredIncomplete || r.issues.length > 0) && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Perlu dilengkapi
            </p>
            <ul className="space-y-1.5">
              {r.requiredIncomplete && (
                <li className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-warning-500 flex-shrink-0">•</span>
                  <span>Beberapa info wajib channel belum lengkap ({r.completionPct}%).</span>
                </li>
              )}
              {r.issues.map((it, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="text-warning-500 flex-shrink-0">•</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
            <Link
              href={channelFieldsUrl}
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              Lengkapi di Channel Fields →
            </Link>
          </div>
        )}

        {/* Optional gaps — soft note */}
        {r.optionalGaps > 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {r.optionalGaps} field channel opsional belum terisi otomatis — tidak wajib, tapi bisa dilengkapi untuk listing lebih lengkap.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Channel label + lifecycle badge ──────────────────────────────────────────

const CHANNEL_LABEL: Partial<Record<string, string>> = {
  shopee: "Shopee", tokopedia: "Tokopedia", lazada: "Lazada", tiktok: "TikTok Shop",
  shopify: "Shopify", woocommerce: "WooCommerce", amazon: "Amazon", ebay: "eBay",
  wix: "Wix", walmart: "Walmart", facebook: "Facebook",
};
const channelLabelOf = (channelType: string): string => CHANNEL_LABEL[channelType] ?? channelType;

/** Pill for a derived lifecycle badge (colour + optional pulsing dot). */
function LifecycleBadge({ lc }: { lc: Lifecycle }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_PILL[lc.badge.tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[lc.badge.tone]} ${lc.badge.pulse ? "animate-pulse" : ""}`} />
      {lc.badge.label}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────


interface Props {
  masterProductId: string;
}

export default function PublishDashboard({ masterProductId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";

  // Merchant (guided) vs developer (dashboard + diagnostics) layout — shared with Step 2.
  const [viewMode, setViewMode] = useWizardViewMode();

  // Store data
  const [storeData, setStoreData] = useState<ChannelProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Publish state
  const [publishResults, setPublishResults] = useState<Record<string, StorePublishResult>>({});
  const [publishingStores, setPublishingStores] = useState<Set<string>>(new Set());
  const [batchPublishing, setBatchPublishing] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Listing lifecycle (delist + history) — §6 / §4c
  const [delistTarget, setDelistTarget] = useState<{ storeId: string; storeName: string; channelLabel: string } | null>(null);
  const [delistingStores, setDelistingStores] = useState<Set<string>>(new Set());
  const [delistError, setDelistError] = useState<string | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ storeId: string; storeName: string; channelLabel: string } | null>(null);

  // Authoritative dirty-state per live store (DiffEngine `publish-diff`) — drives the
  // "Live • N perubahan" badge + update-button enablement. Best-effort: absent when the
  // endpoint isn't deployed, in which case the update action stays always-available.
  const [diffs, setDiffs] = useState<Record<string, PublishDiffResponse>>({});

  // Publish-trace inspector (developer diagnostic — opens a modal dry-run of the pipeline)
  const [traceRequest, setTraceRequest] = useState<PublishTraceRequest | null>(null);
  const [traceStoreName, setTraceStoreName] = useState<string | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);

  // Analysis state — seed selectedStoreId from ?storeId= so back-nav returns to the right tab
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(
    searchParams.get("storeId")
  );
  const [analysisByChannel, setAnalysisByChannel] = useState<Record<string, AdaptivePatternMatchingResponse>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  // JOLT persistence is always on for merchants (internal detail — no UI toggle).
  const persistJolt = true;

  // Full master product — read from sessionStorage first, fall back to API.
  // sessionStorage is only written by the Step 1 create flow; when navigating
  // from My Products the session key is absent, so we load from the backend.
  const [product, setProduct] = useState<MasterProduct | null>(null);
  const [productMissing, setProductMissing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Fast path: already in session
    const raw = sessionStorage.getItem(`product_${masterProductId}`);
    if (raw) {
      try { setProduct(JSON.parse(raw)); return; } catch { /* fall through */ }
    }

    // API fallback — requires orgId from auth (may be empty on first render)
    if (!orgId) return;

    MasterProductService.getById(masterProductId, orgId)
      .then(detail => {
        const fallback: MasterProduct = {
          id: detail.id,
          name: detail.name,
          sku: detail.sku ?? "",
          price: detail.basePrice ?? 0,
          category: undefined,
          mainImage: detail.imageUrl ?? undefined,
          description: detail.description ?? undefined,
          tags: detail.tags ?? undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          variants: (detail.variants ?? []) as any[],
          hasVariants: (detail.variantCount ?? 0) > 0,
          customAttributes: {
            _organizationId: detail.organizationId,
            _createdBy: "",
            // Expose currency so transformMasterProductToSourceSchema can include it
            ...(detail.currency ? { currency: detail.currency } : {}),
          },
          // MasterProduct uses lowercase status; MasterProductDetail uses uppercase
          status: (detail.status?.toLowerCase() ?? "draft") as "draft" | "active" | "archived",
          createdAt: detail.createdAt,
          updatedAt: detail.updatedAt,
        };
        // Write back so the next navigation uses the fast path
        try { sessionStorage.setItem(`product_${masterProductId}`, JSON.stringify(fallback)); } catch { /**/ }
        setProduct(fallback);
      })
      .catch(() => setProductMissing(true));
  }, [masterProductId, orgId]);

  // Load store completion data + overlay the listing-state (P0-1) so badges show the true
  // live status + channelProductId/channelUrl without a second call per store. The listings
  // read is best-effort: if the endpoint isn't deployed yet, the completion data still renders.
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [data, listings] = await Promise.all([
        ChannelProductDataService.getAllStoreData(masterProductId),
        ChannelProductDataService.getListings(masterProductId).catch(() => [] as ListingState[]),
      ]);
      const byStore = new Map(listings.map((l) => [l.storeId, l]));
      setStoreData(data.map((d) => mergeListing(d, byStore.get(d.storeId))));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load store data");
    } finally {
      setLoading(false);
    }
  }, [masterProductId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Dirty-state diff (DiffEngine) ─────────────────────────────────────────────
  //
  // Ask the read-only `publish-diff` endpoint whether a live listing has unpublished changes.
  // Best-effort: a 404 (endpoint not deployed) is swallowed so the update action stays available.
  const refreshDiff = useCallback(async (storeId: string) => {
    try {
      const d = await PublishService.publishDiff({ masterProductId, storeId });
      setDiffs((prev) => ({ ...prev, [storeId]: d }));
    } catch { /* endpoint may be absent / listing not live — ignore, fall back to no-diff */ }
  }, [masterProductId]);

  // Fetch diffs for the set of live listings whenever that set changes (initial load, first
  // publish, delist). Keyed on the sorted live-store ids so it doesn't re-run every render.
  const liveStoreKey = storeData
    .filter((d) => d.status === "PUBLISHED" && d.channelProductId)
    .map((d) => d.storeId).sort().join(",");
  useEffect(() => {
    if (!liveStoreKey) return;
    liveStoreKey.split(",").forEach((id) => refreshDiff(id));
  }, [liveStoreKey, refreshDiff]);

  // ─── Analyze ─────────────────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async (storeId: string) => {
    if (!product) return;
    const store = storeData.find((d) => d.storeId === storeId);
    if (!store) return;

    setSelectedStoreId(storeId);
    setIsAnalyzing(true);
    setAnalyzeError(null);

    try {
      const request = await generateMappingRequest(product, store.channelType, {
        confidenceThreshold: 70,
        organizationId: (product.customAttributes as Record<string, unknown>)?._organizationId as string ?? orgId,
        userId: (product.customAttributes as Record<string, unknown>)?._createdBy as string,
        categoryId: product.category ?? "default",
        persistJolt,
        persistConfidenceThreshold: 80,
      });

      // Merge Step-2 overrides (channel fields + master/variant overrides) into the
      // source schema so the matcher sees the complete publish picture. Shared with
      // Publish Diagnostics via the same helper — both replicate identical input.
      mergeStoreOverridesIntoRequest(request, store);

      const result = await analyzePatternMatching(request);

      if (result.status === "ERROR") {
        throw new Error(result.message ?? "Pattern matching failed");
      }

      setAnalysisByChannel((prev) => ({ ...prev, [store.channelType]: result }));
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  }, [product, storeData, persistJolt]);

  // ─── Settle a store's publish outcome (status table + polling contract) ───────
  //
  // Maps a publish/sync response to a terminal verdict (doc 04 §"Workflow polling"):
  //  • PUBLISHED / FAILED are terminal → update the store badge + result.
  //  • PROCESSING is non-terminal (server-side poll timed out, workflow still running) →
  //    poll the persisted store status to reconcile instead of forcing a manual refresh.
  //    If still unsettled after the FE window, leave the prior badge intact and surface a
  //    "still publishing" result so a later refresh shows the true outcome (backend also
  //    skips status persistence on timeout).
  async function settleStore(
    storeId: string,
    raw: PublishSingleResponse & { error?: string; fieldErrors?: PublishFieldError[] },
  ): Promise<PublishOutcome> {
    let outcome = classifyPublishOutcome(raw);
    let publishedAt = raw.publishedAt;
    const operation = operationOf(raw);
    let channelProductId = raw.channelProductId;
    let channelUrl = raw.channelUrl;

    if (outcome === "PROCESSING") {
      const settled = await ChannelProductDataService
        .pollUntilTerminal(masterProductId, storeId)
        .catch(() => null);
      if (settled?.status === "PUBLISHED") {
        outcome = "PUBLISHED";
        publishedAt = settled.publishedAt ?? publishedAt;
        channelProductId = settled.channelProductId ?? channelProductId;
        channelUrl = settled.channelUrl ?? channelUrl;
      } else if (settled?.status === "FAILED") {
        outcome = "FAILED";
      }
    }

    // Was the listing already live before this attempt? A failed UPDATE on a live listing must
    // NOT downgrade it to FAILED — the channel never removed it (G7). It stays PUBLISHED with a
    // publishError so the UI shows "still live — last update failed" and offers "try update again".
    const prior = storeData.find((d) => d.storeId === storeId);
    const wasLive = prior?.status === "PUBLISHED" && !!(prior?.channelProductId ?? channelProductId);

    const status: StorePublishResult["status"] =
      outcome === "PUBLISHED" ? "PUBLISHED"
      : outcome === "BLOCKED" ? "BLOCKED"
      : outcome === "FAILED" ? "FAILED"
      : "PROCESSING";

    setPublishResults((prev) => ({
      ...prev,
      [storeId]: {
        storeId,
        status,
        publishedAt,
        operation,
        channelProductId,
        channelUrl,
        error:
          outcome === "FAILED" ? (raw.error ?? raw.message ?? "Publish failed")
          : outcome === "BLOCKED" ? (raw.message ?? "Update untuk listing yang sudah tayang belum tersedia di channel ini.")
          : undefined,
        fieldErrors: outcome === "FAILED" ? raw.fieldErrors : undefined,
      },
    }));

    // Persisted-status table (per §3):
    //  • PUBLISHED  → live + listing identity.
    //  • FAILED on a live listing (G7) → keep PUBLISHED, record publishError (do NOT downgrade).
    //  • FAILED on a non-live listing  → FAILED.
    //  • BLOCKED (idempotent-update gate) → no channel call; listing keeps its prior status.
    //  • PROCESSING → leave prior status intact so a later refresh reflects the true outcome.
    if (outcome === "PUBLISHED") {
      setStoreData((prev) =>
        prev.map((d) =>
          d.storeId === storeId
            ? {
                ...d,
                status: "PUBLISHED",
                publishedAt,
                channelProductId: channelProductId ?? d.channelProductId,
                channelUrl: channelUrl ?? d.channelUrl,
                publishError: undefined,
              }
            : d
        )
      );
    } else if (outcome === "FAILED") {
      setStoreData((prev) =>
        prev.map((d) =>
          d.storeId === storeId
            ? wasLive
              ? { ...d, status: "PUBLISHED", publishError: raw.error ?? raw.message ?? "Update gagal" }
              : { ...d, status: "FAILED", publishError: raw.error ?? raw.message }
            : d
        )
      );
    }
    // A successful publish/update just re-synced the channel → the diff is now stale. Re-fetch so
    // the badge flips from "N perubahan" back to "Live" (NOOP) without a manual refresh.
    if (outcome === "PUBLISHED") void refreshDiff(storeId);
    return outcome;
  }

  // ─── Publish single store ─────────────────────────────────────────────────────

  async function handlePublishSingle(storeId: string) {
    const store = storeData.find((d) => d.storeId === storeId);
    setPublishingStores((prev) => new Set(prev).add(storeId));
    setBatchError(null);
    try {
      const masterProductData = buildPublishMasterData(product, store);

      const priorAnalysis = store ? analysisByChannel[store.channelType] : null;

      const result = await PublishService.publishToStore({
        masterProductId,
        storeId,
        organizationId: orgId,
        masterProductData,
        channelId: store?.channelType,
        fieldMappings: priorAnalysis?.fieldMappings ?? [],
        joltSpec: priorAnalysis?.joltSpec ?? [],
        // Phase 0B parity: do NOT send categoryId. The old `product.category ?? "default"`
        // promoted a loose/legacy value (often the productTypeId stored in the "category"
        // field) to an explicit override — winning priority level 1 and defeating the
        // backend's derivation from ProductType.categorySlug. Omitting lets the backend
        // resolve the same chain the diagnostics dry-run uses (explicit → categorySlug →
        // legacy → default), so the published payload matches the readiness verdict.
        dryRun: false,
        variantOverrides: store?.variantOverrides ?? {},
        masterOverrides: store?.masterOverrides ?? {},
      });
      // Whitelist-terminal contract: PUBLISHED/COMPLETED → published, FAILED → failed, and
      // anything non-terminal (PROCESSING/PENDING/blank) → keep polling, never a false failure.
      await settleStore(storeId, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Publish failed";
      // Pre-flight gate (HTTP 400) carries per-field errors — surface them individually
      // so the merchant sees which fields to fix, not one opaque string. Merchant-fixable codes
      // (missing required field, or a resolved variant-axis issue) are "BLOCKED", not "FAILED".
      const fieldErrors = err instanceof ChannelApiError ? err.fieldErrors : undefined;
      const blocked = !!fieldErrors?.some((e) =>
        e.errorCode === "MISSING_REQUIRED_FIELD" ||
        e.errorCode === "INCOMPLETE_MATRIX" ||
        e.errorCode === "TOO_MANY_AXES"
      );
      setPublishResults((prev) => ({
        ...prev,
        [storeId]: { storeId, status: blocked ? "BLOCKED" : "FAILED", error: msg, fieldErrors },
      }));
    } finally {
      setPublishingStores((prev) => {
        const next = new Set(prev);
        next.delete(storeId);
        return next;
      });
    }
  }

  // ─── Delist (remove listing from channel) — §6 ────────────────────────────────
  //
  // Runs the delist call, then settles the outcome per §6.3: success → DELISTED (drop the
  // channelUrl, keep channelProductId for audit); PROCESSING → poll until DELISTED; failure →
  // listing stays live (status unchanged) + surface an error. Idempotent server-side (a 404 on
  // the channel still resolves to DELISTED). Returns the outcome so the BLOCKED "delist &
  // re-publish" chain can decide whether to continue.
  async function runDelist(storeId: string): Promise<"DELISTED" | "PROCESSING" | "FAILED"> {
    setDelistingStores((prev) => new Set(prev).add(storeId));
    setDelistError(null);
    try {
      const resp = await PublishService.delist({ masterProductId, storeId, organizationId: orgId });
      // A terminal delist success comes back as success/COMPLETED (classify → "PUBLISHED"). A
      // PROCESSING verdict means the workflow is still running — poll the persisted status until
      // it flips to DELISTED. `operation:"DELIST"` alone is NOT proof of completion (it echoes the
      // intent even while PROCESSING), so we never mark delisted off it.
      let outcome = classifyPublishOutcome(resp);
      if (outcome === "PROCESSING") {
        const settled = await ChannelProductDataService
          .pollUntilTerminal(masterProductId, storeId, { terminalStatuses: ["DELISTED"] })
          .catch(() => null);
        if (settled?.status === "DELISTED") outcome = "PUBLISHED"; // terminal success (handled below)
      }

      if (outcome === "PUBLISHED") {
        setStoreData((prev) =>
          prev.map((d) => (d.storeId === storeId ? { ...d, status: "DELISTED", channelUrl: undefined, publishError: undefined } : d))
        );
        setPublishResults((prev) => ({
          ...prev,
          [storeId]: { storeId, status: "DELISTED", operation: "DELIST", channelProductId: resp.channelProductId },
        }));
        setDiffs((prev) => { const next = { ...prev }; delete next[storeId]; return next; });
        return "DELISTED";
      }
      if (outcome === "PROCESSING") return "PROCESSING";
      throw new Error(resp.message ?? "Delist gagal");
    } catch (err) {
      setDelistError(err instanceof Error ? err.message : "Delist gagal");
      return "FAILED";
    } finally {
      setDelistingStores((prev) => {
        const next = new Set(prev);
        next.delete(storeId);
        return next;
      });
    }
  }

  // Confirm-modal path: delist, and close the modal only on success (leave it open with the
  // error so the merchant can retry).
  async function handleConfirmDelist() {
    if (!delistTarget) return;
    const res = await runDelist(delistTarget.storeId);
    if (res !== "FAILED") setDelistTarget(null);
  }

  // BLOCKED "Delist & Publish ulang" chain (§5.3 / §6.5): delist first, then re-publish on success.
  async function handleDelistThenRepublish(storeId: string) {
    const res = await runDelist(storeId);
    if (res === "DELISTED") await handlePublishSingle(storeId);
  }

  const openDelist = (store: ChannelProductData) => {
    setDelistError(null);
    setDelistTarget({ storeId: store.storeId, storeName: store.storeName ?? store.storeId, channelLabel: channelLabelOf(store.channelType) });
  };
  const openHistory = (store: ChannelProductData) =>
    setHistoryTarget({ storeId: store.storeId, storeName: store.storeName ?? store.storeId, channelLabel: channelLabelOf(store.channelType) });

  // ─── Diagnose (publish-trace dry-run) ─────────────────────────────────────────
  //
  // Builds the SAME body handlePublishSingle sends (master + Step-2 overrides +
  // channelData) so the trace mirrors the real publish exactly, then opens the
  // inspector modal. Read-only: nothing is published.
  function openDiagnose(storeId: string) {
    const store = storeData.find((d) => d.storeId === storeId);
    if (!store) return;
    setTraceRequest({
      masterProductId,
      storeId,
      organizationId: orgId,
      channelId: store.channelType,
      masterProductData: buildPublishMasterData(product, store),
    });
    setTraceStoreName(store.storeName ?? store.storeId);
    setTraceOpen(true);
  }

  // ─── Batch publish ────────────────────────────────────────────────────────────

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
        organizationId: orgId,
        storeIds: readyStores,
      });
      // Seed the raw batch results first (so BLOCKED + fieldErrors render immediately),
      // then settle each per the status table + polling contract.
      const resultsMap: Record<string, StorePublishResult> = {};
      for (const r of resp.results) resultsMap[r.storeId] = r;
      setPublishResults((prev) => ({ ...prev, ...resultsMap }));

      await Promise.all(
        resp.results.map(async (r) => {
          // Pre-flight BLOCKED never reached the channel — terminal; the badge collapses to
          // FAILED while the raw result (BLOCKED + fieldErrors) is kept in publishResults.
          if (r.status === "BLOCKED") {
            setStoreData((prev) =>
              prev.map((d) => (d.storeId === r.storeId ? { ...d, status: "FAILED", publishError: r.error } : d))
            );
            return;
          }
          await settleStore(r.storeId, r);
        })
      );
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : "Batch publish failed");
    } finally {
      setBatchPublishing(false);
    }
  }

  // ─── Derived state ────────────────────────────────────────────────────────────

  const readyCount = storeData.filter((d) => d.status === "READY" || d.completionPercentage === 100).length;
  const publishedCount = storeData.filter(
    (d) => d.status === "PUBLISHED" || publishResults[d.storeId]?.status === "PUBLISHED" || publishResults[d.storeId]?.status === "COMPLETED"
  ).length;
  const failedCount = storeData.filter((d) => {
    const rs = publishResults[d.storeId]?.status;
    if (rs === "BLOCKED") return true;
    // A live listing whose last UPDATE failed (G7) is NOT counted as failed — it's still live.
    const liveG7 = d.status === "PUBLISHED" && !!d.channelProductId;
    if (rs === "FAILED") return !liveG7;
    if (d.status === "FAILED") return rs !== "PUBLISHED";
    return false;
  }).length;
  const delistedCount = storeData.filter(
    (d) => d.status === "DELISTED" || publishResults[d.storeId]?.status === "DELISTED"
  ).length;

  const currentStoreData = selectedStoreId ? storeData.find((d) => d.storeId === selectedStoreId) ?? null : null;
  const currentAnalysis = currentStoreData ? analysisByChannel[currentStoreData.channelType] ?? null : null;

  // Derived lifecycle for the selected store — drives the contextual primary action (§3).
  const currentLifecycle: Lifecycle | null = currentStoreData
    ? deriveLifecycle(currentStoreData, {
        inFlight: publishingStores.has(currentStoreData.storeId) || delistingStores.has(currentStoreData.storeId),
        result: publishResults[currentStoreData.storeId],
        diff: diffs[currentStoreData.storeId],
      })
    : null;

  // Back-to-Step-2 URL carries the active store so the wizard opens on the right tab
  const channelFieldsUrl = selectedStoreId
    ? `/products/${masterProductId}/channel-fields?storeId=${encodeURIComponent(selectedStoreId)}`
    : `/products/${masterProductId}/channel-fields`;

  const currentPublishStatus: BadgeStatus = (() => {
    if (!selectedStoreId) return "DRAFT";
    const r = publishResults[selectedStoreId];
    if (r) {
      if (r.status === "PUBLISHED" || r.status === "COMPLETED") return "PUBLISHED";
      if (r.status === "PROCESSING") return "PROCESSING";
      return "FAILED";
    }
    return currentStoreData?.status ?? "DRAFT";
  })();

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="outline"
            onClick={() => router.push(channelFieldsUrl)}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Channel Fields
          </Button>
          <h1 className="text-3xl font-bold">Publish to Sales Channel</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Cek kesiapan produk, lalu publish ke toko yang terhubung.
          </p>
        </div>
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Link href={`/products/${masterProductId}/edit`} className="hover:text-brand-500 transition-colors">Step 1: Master Product</Link>
        <span>›</span>
        <Link href={channelFieldsUrl} className="hover:text-brand-500 transition-colors">Step 2: Channel Fields</Link>
        <span>›</span>
        <span className="font-medium text-gray-900 dark:text-white">Step 3: Preview &amp; Publish</span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="inline-block h-10 w-10 rounded-full border-4 border-brand-500 border-t-transparent animate-spin mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading store data…</p>
          </div>
        </div>
      )}

      {/* Load error */}
      {!loading && loadError && (
        <div className="rounded-2xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-6 py-5">
          <p className="font-medium text-error-700 dark:text-error-400">Failed to load store data</p>
          <p className="text-sm text-error-600 dark:text-error-300 mt-1">{loadError}</p>
          <button onClick={loadData} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium bg-error-100 dark:bg-error-500/20 text-error-700 dark:text-error-400 hover:bg-error-200 transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !loadError && storeData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-2xl">📦</div>
          <p className="font-medium text-gray-900 dark:text-white">No channel data found</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Go back to Step 2 to fill channel-specific fields.</p>
          <Button onClick={() => router.push(channelFieldsUrl)} className="mt-4">
            ← Back to Channel Fields
          </Button>
        </div>
      )}

      {/* ─── Merchant view: channel-grid go-live flow ───────────────────────── */}
      {!loading && !loadError && storeData.length > 0 && viewMode === "merchant" && (
        <MerchantPublishView
          product={product}
          masterProductId={masterProductId}
          storeData={storeData}
          publishResults={publishResults}
          publishingStores={publishingStores}
          delistingStores={delistingStores}
          diffs={diffs}
          batchPublishing={batchPublishing}
          batchError={batchError}
          publishedCount={publishedCount}
          onPublishStore={handlePublishSingle}
          onDelistStore={(storeId) => {
            const s = storeData.find((d) => d.storeId === storeId);
            if (s) openDelist(s);
          }}
          onDelistThenRepublish={handleDelistThenRepublish}
          onShowHistory={(storeId) => {
            const s = storeData.find((d) => d.storeId === storeId);
            if (s) openHistory(s);
          }}
          channelFieldsUrlFor={(storeId) =>
            `/products/${masterProductId}/channel-fields?storeId=${encodeURIComponent(storeId)}`
          }
          onViewProduct={() => router.push(`/products/${masterProductId}`)}
          onCreateAnother={() => router.push("/products/v2/create")}
        />
      )}

      {/* ─── Developer view: 3-col dashboard + diagnostics ──────────────────── */}
      {!loading && !loadError && storeData.length > 0 && viewMode === "developer" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ─── Left Sidebar ───────────────────────────────────────────────── */}
          <div className="space-y-6">

            {/* Master Product Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Master Product
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {product ? (
                  <>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Product Name</div>
                      <div className="font-medium">{product.name ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">SKU</div>
                      <div className="font-medium">{product.sku ?? "—"}</div>
                    </div>
                    {product.price != null && (
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Price</div>
                        <div className="font-medium">${product.price.toFixed(2)}</div>
                      </div>
                    )}
                    {product.category && (
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Category</div>
                        <div className="font-medium">{product.category}</div>
                      </div>
                    )}
                    {product.brand && (
                      <div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Brand</div>
                        <div className="font-medium">{product.brand}</div>
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Product ID</div>
                    <div className="font-mono text-xs break-all">{masterProductId}</div>
                    {productMissing && (
                      <p className="text-xs text-warning-600 dark:text-warning-400 mt-2">
                        ⚠ Data produk lengkap tidak ada di sesi. Masuk dari halaman buat produk untuk cek kesiapan.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Channel Readiness — KPI tiles */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total",     value: storeData.length, color: "text-gray-700 dark:text-gray-300" },
                { label: "Ready",     value: readyCount,       color: "text-brand-700 dark:text-brand-400" },
                { label: "Published", value: publishedCount,   color: "text-success-700 dark:text-success-400" },
                { label: "Failed",    value: failedCount,      color: "text-error-700 dark:text-error-400" },
                ...(delistedCount > 0
                  ? [{ label: "Delisted", value: delistedCount, color: "text-gray-500 dark:text-gray-400" }]
                  : []),
              ].map((stat) => (
                <div key={stat.label} className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-gray-800 rounded-2xl px-4 py-3">
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Connected Stores — select + analyze */}
            <Card>
              <CardHeader>
                <CardTitle>Connected Stores</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {storeData.map((data) => {
                  const isSelected = selectedStoreId === data.storeId;
                  const hasAnalysis = !!analysisByChannel[data.channelType];
                  const lc = deriveLifecycle(data, {
                    inFlight: publishingStores.has(data.storeId) || delistingStores.has(data.storeId),
                    result: publishResults[data.storeId],
                    diff: diffs[data.storeId],
                  });

                  return (
                    <div
                      key={data.storeId}
                      className={`px-5 py-4 border-b border-gray-100 dark:border-gray-800 last:border-0 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-brand-50 dark:bg-brand-500/10"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      }`}
                      onClick={() => setSelectedStoreId(data.storeId)}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{data.storeName ?? data.storeId}</p>
                          <div className="flex items-center gap-1.5">
                            <ChannelTypeBadge channelType={data.channelType} size="sm" />
                            {lc.channelUrl && (
                              <a
                                href={lc.channelUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="Lihat di channel"
                                className="text-gray-400 hover:text-brand-500"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <LifecycleBadge lc={lc} />
                          <span className="text-xs text-gray-400">{data.completionPercentage}%</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={data.completionPercentage} className="flex-1 h-1.5" />
                        <button
                          className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                            !product
                              ? "border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed"
                              : isAnalyzing && selectedStoreId === data.storeId
                              ? "border-gray-200 dark:border-gray-700 text-gray-400 cursor-not-allowed"
                              : "border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (product) handleAnalyze(data.storeId);
                          }}
                          disabled={!product || (isAnalyzing && selectedStoreId === data.storeId)}
                          title={!product ? "Product data needed — navigate from create page" : undefined}
                        >
                          {isAnalyzing && selectedStoreId === data.storeId ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <span className="flex items-center gap-1">
                              <Brain className="h-3 w-3" />
                              {hasAnalysis ? "Cek ulang" : "Cek"}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Batch Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Batch Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  onClick={handlePublishAll}
                  disabled={batchPublishing || readyCount === 0}
                  className="w-full"
                >
                  {batchPublishing
                    ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Publishing…</>
                    : <><Send className="h-4 w-4 mr-2" />Publish All Ready ({readyCount})</>
                  }
                </Button>
                {batchError && (
                  <p className="text-sm text-error-600 dark:text-error-400">{batchError}</p>
                )}
                <Button
                  variant="outline"
                  onClick={() => router.push(channelFieldsUrl)}
                  className="w-full"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Edit Channel Fields
                </Button>
              </CardContent>
            </Card>

            {/* What's next — appears once at least one channel is published */}
            {publishedCount > 0 && (
              <Card className="border-success-200 dark:border-success-500/30 bg-success-50/50 dark:bg-success-500/5">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success-600 dark:text-success-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-success-800 dark:text-success-300">
                        {publishedCount === storeData.length
                          ? "All channels published!"
                          : `${publishedCount} of ${storeData.length} channels published`}
                      </p>
                      {failedCount > 0 && (
                        <p className="text-xs text-error-600 dark:text-error-400 mt-0.5">
                          {failedCount} channel{failedCount !== 1 ? "s" : ""} failed — fix above and retry
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      onClick={() => router.push(`/products/${masterProductId}`)}
                    >
                      View product
                    </Button>
                    <button
                      onClick={() => router.push("/products/v2/create")}
                      className="w-full text-sm text-center text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors py-1"
                    >
                      + Create another product
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ─── Right: Analysis + Publish Panel (2/3 width) ──────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* No store selected */}
            {!selectedStoreId && (
              <Card>
                <CardContent className="p-12 text-center">
                  <Info className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Select a Store to Begin</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Pilih toko yang terhubung di panel kiri untuk mempublish produk kamu.
                  </p>
                </CardContent>
              </Card>
            )}

            {selectedStoreId && currentStoreData && (
              <>
                {/* Store header + analyze controls */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <ChannelTypeBadge channelType={currentStoreData.channelType} />
                        <div>
                          <p className="font-semibold">{currentStoreData.storeName ?? currentStoreData.storeId}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {currentLifecycle ? <LifecycleBadge lc={currentLifecycle} /> : statusBadge(currentPublishStatus)}
                            <span className="text-xs text-gray-500">{currentStoreData.completionPercentage}% complete</span>
                            {currentLifecycle?.channelUrl && (
                              <a
                                href={currentLifecycle.channelUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                              >
                                <ExternalLink className="h-3.5 w-3.5" /> Lihat di channel
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAnalyze(selectedStoreId)}
                          disabled={isAnalyzing || !product}
                        >
                          {isAnalyzing
                            ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Memeriksa…</>
                            : <><Brain className="h-4 w-4 mr-2" />Cek kesiapan (opsional)</>
                          }
                        </Button>
                        <span title="Dry-run pipeline publish untuk debugging teknis — tidak mengirim ke channel">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDiagnose(selectedStoreId)}
                          >
                            <Code className="h-4 w-4 mr-2" />Diagnostik
                          </Button>
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* No product in session — analysis disabled */}
                {productMissing && (
                  <div className="rounded-2xl bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 px-6 py-4">
                    <p className="font-medium text-warning-700 dark:text-warning-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> Data produk tidak ada di sesi
                    </p>
                    <p className="text-sm text-warning-600 dark:text-warning-300 mt-1">
                      Cek kesiapan butuh data produk lengkap. Silakan masuk dari{" "}
                      <Link href="/products/v2/create" className="underline">halaman buat produk</Link>.
                    </p>
                  </div>
                )}

                {/* Analysis error */}
                {analyzeError && (
                  <div className="rounded-2xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-6 py-4">
                    <p className="font-medium text-error-700 dark:text-error-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> Gagal memeriksa
                    </p>
                    <p className="text-sm text-error-600 dark:text-error-300 mt-1">{analyzeError}</p>
                  </div>
                )}

                {/* Analyzing spinner */}
                {isAnalyzing && (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <RefreshCw className="h-12 w-12 mx-auto text-brand-600 animate-spin mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Memeriksa kesiapan produk…</h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        Mencocokkan info produk kamu dengan format channel. Sebentar ya.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Analysis results — merchant readiness summary (engine internals
                    stay in /platform-admin, not here). */}
                {!isAnalyzing && currentAnalysis && (
                  <PublishReadinessCard
                    analysis={currentAnalysis}
                    completionPct={currentStoreData.completionPercentage}
                    channelFieldsUrl={channelFieldsUrl}
                  />
                )}

                {/* Publish-first: no forced readiness pre-check. Publish is the primary action;
                    the backend pre-flight gate validates on Publish and any blocking issues render
                    inline below the button (see the FAILED/BLOCKED block). "Cek kesiapan" stays as an
                    optional detail in the header for merchants who want the full readiness breakdown. */}

                {/* Publish Card */}
                <Card>
                  <CardContent className="p-6">
                    {/* Effective values summary — shows master vs overridden fields */}
                    {(product || currentStoreData.masterOverrides) && (
                      <div className="mb-5 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                          Effective Values for {currentStoreData.channelType}
                        </p>
                        <EffectiveValueRow label="Title"    fieldName="name"           storeData={currentStoreData} master={product} />
                        <EffectiveValueRow label="Price"    fieldName="price"          storeData={currentStoreData} master={product} />
                        <EffectiveValueRow label="Stock"    fieldName="quantity"       storeData={currentStoreData} master={product} />
                        <EffectiveValueRow label="Compare"  fieldName="compareAtPrice" storeData={currentStoreData} master={product} />
                      </div>
                    )}
                    {(() => {
                      const lc = currentLifecycle!;
                      const storeId = currentStoreData.storeId;
                      const inFlight = publishingStores.has(storeId);
                      const delisting = delistingStores.has(storeId);
                      const r = publishResults[storeId];
                      const HEADLINE: Record<string, string> = {
                        draft: "Ready to Publish?",
                        ready: "Ready to Publish?",
                        publishing: "Publishing…",
                        processing: "Masih diproses…",
                        live: "Listing tayang",
                        live_changed: "Ada perubahan belum ter-publish",
                        blocked: "Perlu tindakan",
                        update_failed: "Masih tayang — update terakhir gagal",
                        failed: "Publish gagal",
                        delisted: "Listing sudah di-delist",
                      };
                      // The idempotent-update gate (200 BLOCKED, operation=UPDATE) is distinct from the
                      // pre-flight gate (missing required fields) — the former routes to Delist & Republish.
                      const updateGateBlocked = r?.status === "BLOCKED" && r.operation === "UPDATE";
                      const preflightBlocked = r?.status === "BLOCKED" && !updateGateBlocked;

                      const publishBtn = (label: string, primary = true) => (
                        <Button
                          variant={primary ? "primary" : "outline"}
                          onClick={() => handlePublishSingle(storeId)}
                          disabled={inFlight || delisting || batchPublishing}
                        >
                          {inFlight
                            ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Publishing…</>
                            : <><Send className="h-4 w-4 mr-2" />{label}</>}
                        </Button>
                      );

                      return (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <h3 className="font-semibold text-lg mb-1">{HEADLINE[lc.state] ?? "Publish"}</h3>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                <strong>{currentStoreData.storeName ?? storeId}</strong> ·{" "}
                                <strong className="capitalize">{currentStoreData.channelType}</strong>
                              </p>
                              {!lc.isLive && lc.state !== "delisted" && currentStoreData.completionPercentage < 100 && (
                                <p className="text-xs text-warning-600 dark:text-warning-400 mt-1">
                                  ⚠ {currentStoreData.completionPercentage}% complete — some required fields may be missing
                                </p>
                              )}
                              {lc.channelProductId && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">Listing id: {lc.channelProductId}</p>
                              )}
                            </div>

                            {/* Contextual primary action (§3) */}
                            <div className="flex items-center gap-2">
                              {lc.state === "publishing" && publishBtn("Publishing…")}
                              {lc.state === "processing" && (
                                <span className="flex items-center gap-2 text-warning-600 dark:text-warning-400">
                                  <RefreshCw className="h-5 w-5 animate-spin" /><span className="font-medium">Masih diproses…</span>
                                </span>
                              )}
                              {(lc.state === "draft" || lc.state === "ready") && publishBtn("Publish to Store")}
                              {lc.state === "failed" && publishBtn("Coba lagi")}
                              {lc.state === "update_failed" && publishBtn("Coba update lagi")}
                              {lc.state === "delisted" && publishBtn("Publish ulang")}
                              {/* Live listing — the update action reflects the authoritative dirty-state
                                  diff (DiffEngine): disabled "Up to date" when clean, "Perbarui listing (N)"
                                  when dirty, disabled hint when the channel can't push updates yet. */}
                              {lc.state === "live" && lc.diffKnown && (
                                <Button variant="outline" disabled>Up to date</Button>
                              )}
                              {lc.state === "live" && !lc.diffKnown && (
                                <span title="Kirim perubahan ke channel — backend memutuskan UPDATE atau NO-OP">
                                  {publishBtn("Perbarui listing", false)}
                                </span>
                              )}
                              {lc.state === "live_changed" && !lc.updateBlocked &&
                                publishBtn(`Perbarui listing${lc.changeCount ? ` (${lc.changeCount})` : ""}`, true)}
                              {lc.state === "live_changed" && lc.updateBlocked && (
                                <Button variant="outline" disabled>Update belum didukung</Button>
                              )}
                              {/* Pre-flight block (missing fields) keeps a retry; the update-gate block
                                  routes through the banner's Delist & re-publish instead. */}
                              {lc.state === "blocked" && preflightBlocked && publishBtn("Coba lagi")}
                            </div>
                          </div>

                          {/* Operation result note (§4a) — NO-OP vs UPDATE vs CREATE */}
                          {r?.operation && (lc.state === "live" || lc.state === "live_changed" || lc.state === "delisted") && (() => {
                            const m = operationMessage(r.operation);
                            return (
                              <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${TONE_PILL[m.tone]}`}>{m.text}</div>
                            );
                          })()}

                          {/* "What changed" summary from the diff (§4.4) */}
                          {lc.state === "live_changed" && (() => {
                            const df = diffs[storeId];
                            if (!df) return null;
                            const v = df.variants ?? {};
                            const vChanged = (v.add?.length ?? 0) + (v.update?.length ?? 0) + (v.delete?.length ?? 0);
                            const imgChanged = df.summary?.imagesChanged ?? 0;
                            const parts: string[] = [];
                            if (df.product?.changed) parts.push("info produk");
                            if (vChanged) parts.push(`${vChanged} varian`);
                            if (imgChanged) parts.push(`${imgChanged} gambar`);
                            if (parts.length === 0) return null;
                            return (
                              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Perubahan siap dikirim: {parts.join(", ")}.
                                {imgChanged > 0 && (
                                  <span className="text-gray-400 dark:text-gray-500"> (hitungan gambar masih perkiraan)</span>
                                )}
                              </p>
                            );
                          })()}

                          {/* Secondary actions: Delist + Riwayat (§4c / §6.1) */}
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            {lc.isDelistable && (
                              <button
                                onClick={() => openDelist(currentStoreData)}
                                disabled={delisting}
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-error-600 dark:text-error-400 hover:underline disabled:opacity-50"
                              >
                                <Trash2 className="h-4 w-4" /> {delisting ? "Menghapus…" : "Delist"}
                              </button>
                            )}
                            <button
                              onClick={() => openHistory(currentStoreData)}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:underline"
                            >
                              <Clock className="h-4 w-4" /> Riwayat
                            </button>
                          </div>

                          {/* PROCESSING banner */}
                          {lc.state === "processing" && (
                            <div className="mt-3 p-3 rounded-lg border bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/30">
                              <p className="text-sm font-medium flex items-center gap-2 text-warning-700 dark:text-warning-400">
                                <RefreshCw className="h-4 w-4 flex-shrink-0 animate-spin" /> Masih diproses di channel
                              </p>
                              <p className="mt-1 text-sm text-warning-600 dark:text-warning-300">
                                Publish belum selesai — listing dengan banyak gambar bisa butuh waktu lebih lama.
                                Status akan diperbarui otomatis; kalau perlu, muat ulang untuk melihat hasil akhirnya.
                              </p>
                              <button
                                onClick={loadData}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                              >
                                <RefreshCw className="h-3.5 w-3.5" /> Muat ulang status
                              </button>
                            </div>
                          )}

                          {/* G7 — update failed, listing still live */}
                          {lc.state === "update_failed" && (
                            <div className="mt-3 p-3 rounded-lg border bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-500/30">
                              <p className="text-sm font-medium flex items-center gap-2 text-success-700 dark:text-success-400">
                                <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> Masih tayang di channel
                              </p>
                              <p className="mt-1 text-sm text-success-700/80 dark:text-success-300">
                                Update terakhir gagal, tapi listing tetap aktif dan bisa dibeli. Silakan coba update lagi.
                                {currentStoreData.publishError ? ` (${currentStoreData.publishError})` : ""}
                              </p>
                            </div>
                          )}

                          {/* §5.3 — idempotent-update gate: Delist & re-publish. Triggered either by a
                              live attempt that came back BLOCKED, or pre-emptively by the dirty-state
                              diff (decision=UPDATE_BLOCKED) before the merchant even tries. */}
                          {(updateGateBlocked || (lc.state === "live_changed" && lc.updateBlocked)) && (
                            <div className="mt-3 p-3 rounded-lg border bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/30">
                              <p className="text-sm font-medium flex items-center gap-2 text-warning-700 dark:text-warning-400">
                                <AlertTriangle className="h-4 w-4 flex-shrink-0" /> Update listing live belum tersedia
                              </p>
                              <p className="mt-1 text-sm text-warning-600 dark:text-warning-300">
                                Ada perubahan, tapi mengubah listing yang sudah tayang belum aktif untuk channel ini.
                                Delist listing lalu publish ulang, atau tunggu dukungan update aktif.
                              </p>
                              <button
                                onClick={() => handleDelistThenRepublish(storeId)}
                                disabled={delisting || inFlight}
                                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-warning-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-warning-600 disabled:opacity-60"
                              >
                                <RefreshCw className={`h-4 w-4 ${delisting || inFlight ? "animate-spin" : ""}`} /> Delist &amp; Publish ulang
                              </button>
                            </div>
                          )}

                          {/* FAILED create / pre-flight BLOCKED — field errors */}
                          {(r?.status === "FAILED" || preflightBlocked) && lc.state !== "update_failed" && (() => {
                            const blocked = preflightBlocked;
                            const fe = r?.fieldErrors ?? [];
                            return (
                              <div className={`mt-3 p-3 rounded-lg border ${
                                blocked
                                  ? "bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/30"
                                  : "bg-error-50 dark:bg-error-500/10 border-error-200 dark:border-error-500/30"
                              }`}>
                                <p className={`text-sm font-medium flex items-center gap-2 ${
                                  blocked ? "text-warning-700 dark:text-warning-400" : "text-error-700 dark:text-error-400"
                                }`}>
                                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                                  {blocked ? "Lengkapi field berikut sebelum publish" : "Publish gagal — belum tayang"}
                                </p>
                                {fe.length > 0 ? (
                                  <ul className="mt-2 space-y-1.5">
                                    {fe.map((e, i) => (
                                      <li key={`${e.field}-${i}`} className="text-sm text-gray-700 dark:text-gray-300">
                                        <span className="font-medium capitalize">{friendlyField(e.field)}</span>
                                        {e.message ? <span className="text-gray-600 dark:text-gray-400"> — {e.message}</span> : null}
                                        {e.suggestion ? (
                                          <span className="block text-xs text-gray-500 dark:text-gray-400">↳ {e.suggestion}</span>
                                        ) : null}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className={`mt-1 text-sm ${blocked ? "text-warning-600 dark:text-warning-300" : "text-error-600 dark:text-error-400"}`}>
                                    {r?.error ?? "Publish failed"}
                                  </p>
                                )}
                                {blocked && (
                                  <Link
                                    href={channelFieldsUrl}
                                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
                                  >
                                    Lengkapi di Channel Fields →
                                  </Link>
                                )}
                                <button
                                  onClick={() => openDiagnose(storeId)}
                                  className="mt-2 flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:underline"
                                >
                                  <Code className="h-3.5 w-3.5" /> Kenapa gagal? Lihat diagnostik pipeline
                                </button>
                              </div>
                            );
                          })()}
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {/* Publish-Trace Inspector (developer diagnostic — dry-run, nothing published) */}
      {traceRequest && (
        <PublishTraceInspector
          isOpen={traceOpen}
          onClose={() => setTraceOpen(false)}
          request={traceRequest}
          storeName={traceStoreName ?? undefined}
        />
      )}

      {/* Delist confirmation (§6.2) */}
      {delistTarget && (
        <DelistConfirmModal
          isOpen={!!delistTarget}
          channelLabel={delistTarget.channelLabel}
          storeName={delistTarget.storeName}
          isDelisting={delistingStores.has(delistTarget.storeId)}
          error={delistError}
          onConfirm={handleConfirmDelist}
          onClose={() => { setDelistTarget(null); setDelistError(null); }}
        />
      )}

      {/* Listing history & status drawer (§4c) */}
      {historyTarget && (
        <ListingHistoryDrawer
          isOpen={!!historyTarget}
          masterProductId={masterProductId}
          storeId={historyTarget.storeId}
          storeName={historyTarget.storeName}
          channelLabel={historyTarget.channelLabel}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}
