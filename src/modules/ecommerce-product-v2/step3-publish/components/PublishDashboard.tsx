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
  Eye,
  RefreshCw,
  TrendingUp,
  Database,
  Brain,
  Zap,
  Target,
  Award,
  Code,
  ChevronDown,
  ChevronUp,
  Package,
} from "@/shared/ui/icons/Icons";
import type {
  ChannelProductData,
  ChannelProductStatus,
  StorePublishResult,
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
} from "../../step2-channel-fields/services/channelStore.service";
import { useAuth } from "@/shared/contexts/AuthContext";
import ChannelTypeBadge from "../../step2-channel-fields/components/stores/ChannelTypeBadge";
import type { MasterProduct } from "@/modules/ecommerce-product-v2/types/product";
import type {
  AdaptivePatternMatchingResponse,
  FieldMapping,
} from "@/modules/ecommerce-product-v2/types/channel-mapping";
import {
  analyzePatternMatching,
  previewJoltTransformation,
} from "@/modules/ecommerce-product-v2/services/pattern-matching.service";
import {
  generateMappingRequest,
  transformMasterProductToSourceSchema,
} from "@/modules/ecommerce-product-v2/utils/product-mapper";
import { MasterProductService } from "@/app/(admin)/products/_services/master-product.service";

// ─── Status Badge ─────────────────────────────────────────────────────────────

function statusBadge(status: ChannelProductStatus) {
  const variants: Record<string, { cls: string; dot: string; label: string }> = {
    PUBLISHED: { cls: "bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-400", dot: "bg-success-500", label: "Published" },
    READY:     { cls: "bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400",       dot: "bg-brand-500",   label: "Ready" },
    FAILED:    { cls: "bg-error-50 dark:bg-error-500/10 text-error-700 dark:text-error-400",       dot: "bg-error-500",   label: "Failed" },
    DRAFT:     { cls: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",             dot: "bg-gray-400",    label: "Draft" },
  };
  const v = variants[status] ?? variants.DRAFT;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-1 ${v.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />{v.label}
    </span>
  );
}

// ─── 5-Tier Matching Strategy Breakdown ───────────────────────────────────────

interface MatchingStrategyBreakdownProps {
  metadata: AdaptivePatternMatchingResponse["matchingMetadata"];
  fieldMappings: FieldMapping[];
}

function MatchingStrategyBreakdown({ metadata, fieldMappings: _fm }: MatchingStrategyBreakdownProps) {
  const strategies = [
    {
      name: "Knowledge-Based",
      count: metadata.knowledgeBasedMatches,
      confidence: "95%+",
      icon: Database,
      color: "text-purple-600",
      bg: "bg-purple-50 dark:bg-purple-500/10",
      description: "Learned from production usage",
    },
    {
      name: "Semantic Match",
      count: metadata.semanticMatches,
      confidence: "85%+",
      icon: Brain,
      color: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-500/10",
      description: "Semantic type equivalence",
    },
    {
      name: "Similarity Match",
      count: metadata.similarityMatches,
      confidence: "60–90%",
      icon: Target,
      color: "text-green-600",
      bg: "bg-green-50 dark:bg-green-500/10",
      description: "Levenshtein distance",
    },
    {
      name: "Pattern Match",
      count: metadata.patternMatches,
      confidence: "75%",
      icon: Zap,
      color: "text-orange-600",
      bg: "bg-orange-50 dark:bg-orange-500/10",
      description: "Regex-based detection",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          5-Tier Matching Strategy Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {strategies.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.name} className={`${s.bg} p-4 rounded-lg`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-5 w-5 ${s.color}`} />
                  <div className="font-medium text-sm">{s.name}</div>
                </div>
                <div className={`text-2xl font-bold ${s.color} mb-1`}>{s.count}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">{s.confidence} confidence</div>
                <div className="text-xs text-gray-500 dark:text-gray-500">{s.description}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
          Total matches: {metadata.totalMatches} • Processing time: {metadata.processingTimeMs}ms
        </div>
      </CardContent>
    </Card>
  );
}

// ─── JOLT Readiness Panel ─────────────────────────────────────────────────────

interface ConflictItem {
  type: "ERROR" | "WARNING";
  target: string;
  sources: string;
  description: string;
}

function parseConflict(line: string): ConflictItem | null {
  const m = line.match(/\[(JOLT-CONFLICT (ERROR|WARNING))\]\s+target='([^']+)'\s+sources=\[([^\]]+)\]\s+[—-]+\s*(.*)/);
  if (!m) return null;
  return {
    type:        m[2] as "ERROR" | "WARNING",
    target:      m[3],
    sources:     m[4],
    description: m[5],
  };
}

function JoltReadinessPanel({ warnings }: { warnings?: string[] }) {
  if (!warnings?.length) return null;

  const statusLine = warnings.find(w => w.includes("[JOLT-READINESS]"));
  const isNotReady = !!statusLine?.includes("NOT_READY");
  const hasWarnings = !isNotReady && !!statusLine?.includes("WARNINGS");
  const isReady = !isNotReady && !hasWarnings;

  // Categorise lines
  const conflicts:  ConflictItem[] = [];
  const checks:     string[] = [];
  const infoLines:  string[] = [];

  for (const w of warnings) {
    if (w.includes("[JOLT-READINESS]")) continue;
    const conflict = parseConflict(w);
    if (conflict) { conflicts.push(conflict); continue; }
    if (w.startsWith("✓") || w.startsWith("⚠")) { checks.push(w); continue; }
    infoLines.push(w);
  }

  const statusBg    = isNotReady ? "bg-error-50 dark:bg-error-500/10 border-error-200 dark:border-error-500/30"
                    : hasWarnings ? "bg-warning-50 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/30"
                    : "bg-success-50 dark:bg-success-500/10 border-success-200 dark:border-success-500/30";
  const statusIcon  = isNotReady ? "✗" : hasWarnings ? "⚠" : "✓";
  const statusText  = isNotReady ? "Not Ready — publishing blocked" : hasWarnings ? "Warnings — review before publishing" : "Ready to publish";
  const statusCls   = isNotReady ? "text-error-700 dark:text-error-400"
                    : hasWarnings ? "text-warning-700 dark:text-warning-400"
                    : "text-success-700 dark:text-success-400";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          JOLT Readiness Check
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Status banner */}
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${statusBg}`}>
          <span className={`text-lg font-bold flex-shrink-0 ${statusCls}`}>{statusIcon}</span>
          <span className={`text-sm font-semibold ${statusCls}`}>{statusText}</span>
        </div>

        {/* Info messages (unmapped %, injected fields, persistence result) */}
        {infoLines.length > 0 && (
          <div className="space-y-1.5">
            {infoLines.map((line, i) => {
              const isFinal = line.toLowerCase().includes("not persisted") || line.toLowerCase().includes("persist");
              return (
                <p key={i} className={`text-xs ${isFinal ? "font-medium text-error-600 dark:text-error-400" : "text-gray-600 dark:text-gray-400"}`}>
                  {line}
                </p>
              );
            })}
          </div>
        )}

        {/* Conflict cards */}
        {conflicts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Target Conflicts ({conflicts.length})
            </p>
            {conflicts.map((c, i) => (
              <div key={i} className={`rounded-lg border px-3 py-2.5 space-y-1.5 ${
                c.type === "ERROR"
                  ? "bg-error-50/60 dark:bg-error-500/10 border-error-200 dark:border-error-500/30"
                  : "bg-warning-50/60 dark:bg-warning-500/10 border-warning-200 dark:border-warning-500/30"
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    c.type === "ERROR"
                      ? "bg-error-100 dark:bg-error-500/20 text-error-700 dark:text-error-300"
                      : "bg-warning-100 dark:bg-warning-500/20 text-warning-700 dark:text-warning-300"
                  }`}>{c.type}</span>
                  <code className="text-xs font-mono font-semibold text-gray-800 dark:text-gray-200">{c.target}</code>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Sources: <code className="font-mono text-gray-700 dark:text-gray-300">[{c.sources}]</code>
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{c.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* 4-layer check results */}
        {checks.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Readiness Checks
            </p>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
              {checks.map((line, i) => {
                const isOk   = line.startsWith("✓");
                const isWarn = line.startsWith("⚠");
                const icon   = isOk ? "✓" : isWarn ? "⚠" : "✗";
                const text   = line.slice(line.indexOf(" ") + 1);
                const rowCls = isOk   ? "bg-success-50/40 dark:bg-success-500/5"
                             : isWarn ? "bg-warning-50/40 dark:bg-warning-500/5"
                             :          "bg-error-50/40 dark:bg-error-500/5";
                const iconCls = isOk   ? "text-success-600 dark:text-success-400"
                              : isWarn ? "text-warning-600 dark:text-warning-400"
                              :          "text-error-600 dark:text-error-400";
                return (
                  <div key={i} className={`flex items-start gap-3 px-3 py-2 ${rowCls}`}>
                    <span className={`text-sm font-bold flex-shrink-0 mt-0.5 ${iconCls}`}>{icon}</span>
                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  );
}

// ─── Field Mappings Table ─────────────────────────────────────────────────────

function FieldMappingsTable({ fieldMappings, channelLabel }: { fieldMappings: FieldMapping[]; channelLabel: string }) {
  const strategyColor = (s: string) => {
    switch (s) {
      case "KNOWLEDGE_BASED":   return "text-purple-600 bg-purple-50 dark:bg-purple-500/10";
      case "SEMANTIC_MATCH":
      case "SEMANTIC_WITH_BOOST": return "text-blue-600 bg-blue-50 dark:bg-blue-500/10";
      case "SIMILARITY_MATCH":  return "text-green-600 bg-green-50 dark:bg-green-500/10";
      case "PATTERN_MATCH":     return "text-orange-600 bg-orange-50 dark:bg-orange-500/10";
      case "EXACT_MATCH":       return "text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10";
      default:                  return "text-gray-600 bg-gray-50 dark:bg-gray-800";
    }
  };
  const strategyLabel = (s: string) =>
    s.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Field Mappings ({fieldMappings.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="p-3 text-left font-medium">Source Field</th>
                <th className="p-3 text-left font-medium">Target Field ({channelLabel})</th>
                <th className="p-3 text-center font-medium">Confidence</th>
                <th className="p-3 text-left font-medium">Strategy</th>
                <th className="p-3 text-center font-medium">Usage</th>
              </tr>
            </thead>
            <tbody>
              {fieldMappings.map((m, idx) => (
                <tr key={idx} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="p-3 font-mono text-xs">{m.sourcePath}</td>
                  <td className="p-3 font-mono text-xs text-blue-600 dark:text-blue-400">{m.targetPath}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Progress value={m.confidence} className="w-16 h-2" />
                      <span className="font-medium text-xs">{m.confidence}%</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${strategyColor(m.matchStrategy)}`}>
                      {strategyLabel(m.matchStrategy)}
                    </span>
                  </td>
                  <td className="p-3 text-center text-gray-600 dark:text-gray-400 text-xs">
                    {m.usageCount ? `${m.usageCount}×` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Unmapped Fields Panel ────────────────────────────────────────────────────

function UnmappedFieldsPanel({
  unmappedSource,
  missingTarget,
}: {
  unmappedSource: string[];
  missingTarget: string[];
}) {
  if (unmappedSource.length === 0 && missingTarget.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning-500" />
          Unmapped Fields
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {unmappedSource.length > 0 && (
            <div>
              <div className="font-medium mb-2">Source Fields Not Mapped:</div>
              <div className="space-y-1">
                {unmappedSource.map((f, i) => (
                  <div key={i} className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}
          {missingTarget.length > 0 && (
            <div>
              <div className="font-medium mb-2">Target Fields Missing:</div>
              <div className="space-y-1">
                {missingTarget.map((f, i) => (
                  <div key={i} className="text-sm text-error-600 dark:text-error-400 bg-error-50 dark:bg-error-500/10 p-2 rounded">
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── JOLT Spec Card ───────────────────────────────────────────────────────────

function JoltSpecCard({
  joltSpec,
  onPreviewTransformed,
}: {
  joltSpec: unknown[];
  onPreviewTransformed: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!joltSpec?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            JOLT Transformation
          </div>
          <Button size="sm" variant="outline" onClick={() => setExpanded(!expanded)}>
            {expanded
              ? <><ChevronUp className="h-4 w-4 mr-2" />Hide Spec</>
              : <><ChevronDown className="h-4 w-4 mr-2" />Show Spec</>
            }
          </Button>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent>
          <pre className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg overflow-auto max-h-80 text-xs">
            {JSON.stringify(joltSpec, null, 2)}
          </pre>
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={onPreviewTransformed}>
              <Eye className="h-4 w-4 mr-2" />
              Preview Transformed Data
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
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

  // Store data
  const [storeData, setStoreData] = useState<ChannelProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Publish state
  const [publishResults, setPublishResults] = useState<Record<string, StorePublishResult>>({});
  const [publishingStores, setPublishingStores] = useState<Set<string>>(new Set());
  const [batchPublishing, setBatchPublishing] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Analysis state — seed selectedStoreId from ?storeId= so back-nav returns to the right tab
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(
    searchParams.get("storeId")
  );
  const [analysisByChannel, setAnalysisByChannel] = useState<Record<string, AdaptivePatternMatchingResponse>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [persistJolt, setPersistJolt] = useState(true);

  // JOLT preview modal
  const [showJoltPreview, setShowJoltPreview] = useState(false);
  const [joltPreviewData, setJoltPreviewData] = useState<Record<string, unknown> | null>(null);

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

  // Load store completion data
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

      // Merge Step-2 channel-specific fields into sourceSchema so the pattern matcher
      // sees the complete data picture: master product fields + channel fields the user
      // already filled in. Without this, Step-2 fields appear as unmapped source fields.
      const channelFields = store.channelData ?? {};
      if (Object.keys(channelFields).length > 0) {
        request.sourceSchema = { ...request.sourceSchema, ...channelFields };
      }

      // Merge master-level overrides so the pattern matcher sees overridden values
      // (e.g. a Shopify-specific title) rather than the original master value.
      const masterOverrides = store.masterOverrides ?? {};
      if (Object.keys(masterOverrides).length > 0) {
        request.sourceSchema = { ...request.sourceSchema, ...masterOverrides };
      }

      // Flatten variant overrides into sourceSchema with a variant_ prefix so the
      // pattern matcher can discover mappings for barcode, inventory_policy, etc.
      // First non-null value wins per field across all SKUs.
      const variantOverrides = store.variantOverrides ?? {};
      const flatVariantFields: Record<string, unknown> = {};
      for (const skuOverrides of Object.values(variantOverrides)) {
        for (const [fieldName, value] of Object.entries(skuOverrides)) {
          if (value != null && !(fieldName in flatVariantFields)) {
            flatVariantFields[`variant_${fieldName}`] = value;
          }
        }
      }
      if (Object.keys(flatVariantFields).length > 0) {
        request.sourceSchema = { ...request.sourceSchema, ...flatVariantFields };
      }

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

  // ─── Preview JOLT transformation ─────────────────────────────────────────────

  const handlePreviewTransformation = useCallback(async (channelType: string) => {
    if (!product) return;
    const analysis = analysisByChannel[channelType];
    if (!analysis) return;
    try {
      const store = storeData.find((d) => d.channelType === channelType);
      // Build the same merged source picture used for publish so the JOLT preview
      // reflects the actual payload: master + masterOverrides + channelData.
      const sourceData: Record<string, unknown> = {
        ...transformMasterProductToSourceSchema(product),
        ...(store?.masterOverrides ?? {}),
        ...(store?.channelData ?? {}),
      };
      // Flatten variant overrides so variant-level fields appear in the preview.
      const variantOverrides = store?.variantOverrides ?? {};
      for (const skuOverrides of Object.values(variantOverrides)) {
        for (const [fieldName, value] of Object.entries(skuOverrides)) {
          if (value != null && !(`variant_${fieldName}` in sourceData)) {
            sourceData[`variant_${fieldName}`] = value;
          }
        }
      }
      const transformed = await previewJoltTransformation(
        sourceData,
        analysis.joltSpec ?? []
      );
      setJoltPreviewData(transformed);
      setShowJoltPreview(true);
    } catch { /* ignore preview errors */ }
  }, [product, analysisByChannel, storeData]);

  // ─── Publish single store ─────────────────────────────────────────────────────

  async function handlePublishSingle(storeId: string) {
    const store = storeData.find((d) => d.storeId === storeId);
    setPublishingStores((prev) => new Set(prev).add(storeId));
    setBatchError(null);
    try {
      const masterProductData: Record<string, unknown> = {
        ...(product ? transformMasterProductToSourceSchema(product) : {}),
        ...(store?.masterOverrides ?? {}),
        ...(store?.channelData ?? {}),
      };

      const priorAnalysis = store ? analysisByChannel[store.channelType] : null;

      const result = await PublishService.publishToStore({
        masterProductId,
        storeId,
        organizationId: orgId,
        masterProductData,
        channelId: store?.channelType,
        fieldMappings: priorAnalysis?.fieldMappings ?? [],
        joltSpec: priorAnalysis?.joltSpec ?? [],
        categoryId: product?.category ?? "default",
        dryRun: false,
        variantOverrides: store?.variantOverrides ?? {},
        masterOverrides: store?.masterOverrides ?? {},
      });
      setPublishResults((prev) => ({
        ...prev,
        [storeId]: {
          storeId,
          status: result.status === "PUBLISHED" ? "PUBLISHED" : "FAILED",
          publishedAt: result.publishedAt,
        },
      }));
      setStoreData((prev) =>
        prev.map((d) =>
          d.storeId === storeId
            ? { ...d, status: (result.status === "PUBLISHED" ? "PUBLISHED" : "FAILED") as ChannelProductStatus, publishedAt: result.publishedAt }
            : d
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Publish failed";
      setPublishResults((prev) => ({
        ...prev,
        [storeId]: { storeId, status: "FAILED", error: msg },
      }));
    } finally {
      setPublishingStores((prev) => {
        const next = new Set(prev);
        next.delete(storeId);
        return next;
      });
    }
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
      const resultsMap: Record<string, StorePublishResult> = {};
      for (const r of resp.results) resultsMap[r.storeId] = r;
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

  // ─── Derived state ────────────────────────────────────────────────────────────

  const readyCount = storeData.filter((d) => d.status === "READY" || d.completionPercentage === 100).length;
  const publishedCount = storeData.filter(
    (d) => d.status === "PUBLISHED" || publishResults[d.storeId]?.status === "PUBLISHED"
  ).length;
  const failedCount = storeData.filter(
    (d) => d.status === "FAILED" || publishResults[d.storeId]?.status === "FAILED"
  ).length;

  const currentStoreData = selectedStoreId ? storeData.find((d) => d.storeId === selectedStoreId) ?? null : null;
  const currentAnalysis = currentStoreData ? analysisByChannel[currentStoreData.channelType] ?? null : null;

  // Back-to-Step-2 URL carries the active store so the wizard opens on the right tab
  const channelFieldsUrl = selectedStoreId
    ? `/products/${masterProductId}/channel-fields?storeId=${encodeURIComponent(selectedStoreId)}`
    : `/products/${masterProductId}/channel-fields`;

  const currentPublishStatus: ChannelProductStatus = (() => {
    if (!selectedStoreId) return "DRAFT";
    const r = publishResults[selectedStoreId];
    if (r) return r.status === "PUBLISHED" ? "PUBLISHED" : "FAILED";
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
            Adaptive Pattern Matching • 5-Tier Matching Strategy • ML-Enhanced
          </p>
        </div>
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

      {/* ─── Main 3-col Layout ──────────────────────────────────────────────── */}
      {!loading && !loadError && storeData.length > 0 && (
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
                        ⚠ Full product data not found in session. Analysis requires navigating from the create page.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Channel Readiness — 4 KPI tiles */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total",     value: storeData.length, color: "text-gray-700 dark:text-gray-300" },
                { label: "Ready",     value: readyCount,       color: "text-brand-700 dark:text-brand-400" },
                { label: "Published", value: publishedCount,   color: "text-success-700 dark:text-success-400" },
                { label: "Failed",    value: failedCount,      color: "text-error-700 dark:text-error-400" },
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
                  const storeStatus: ChannelProductStatus =
                    publishResults[data.storeId]?.status === "PUBLISHED" ? "PUBLISHED"
                    : publishResults[data.storeId]?.status === "FAILED" ? "FAILED"
                    : data.status;

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
                          <p className="font-medium text-sm truncate">{data.storeId}</p>
                          <ChannelTypeBadge channelType={data.channelType} size="sm" />
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {statusBadge(storeStatus)}
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
                              {hasAnalysis ? "Re-analyze" : "Analyze"}
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
                    Choose a connected store from the left panel, then click "Analyze" to run adaptive pattern matching
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
                          <p className="font-semibold">{currentStoreData.storeId}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {statusBadge(currentPublishStatus)}
                            <span className="text-xs text-gray-500">{currentStoreData.completionPercentage}% complete</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Persist JOLT toggle */}
                        <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <label className="text-xs font-medium cursor-pointer select-none">Persist JOLT</label>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={persistJolt}
                            onClick={() => setPersistJolt(!persistJolt)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              persistJolt ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"
                            }`}
                          >
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${persistJolt ? "translate-x-5" : "translate-x-1"}`} />
                          </button>
                        </div>
                        <Button
                          onClick={() => handleAnalyze(selectedStoreId)}
                          disabled={isAnalyzing || !product}
                        >
                          {isAnalyzing
                            ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Analyzing…</>
                            : <><Brain className="h-4 w-4 mr-2" />Analyze Pattern Matching</>
                          }
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* No product in session — analysis disabled */}
                {productMissing && (
                  <div className="rounded-2xl bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 px-6 py-4">
                    <p className="font-medium text-warning-700 dark:text-warning-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> Product data not in session
                    </p>
                    <p className="text-sm text-warning-600 dark:text-warning-300 mt-1">
                      Pattern matching analysis requires the full product data. Please navigate from the{" "}
                      <a href="/products/v2/create" className="underline">product creation page</a> to use this feature.
                    </p>
                  </div>
                )}

                {/* Analysis error */}
                {analyzeError && (
                  <div className="rounded-2xl bg-error-50 dark:bg-error-500/10 border border-error-200 dark:border-error-500/30 px-6 py-4">
                    <p className="font-medium text-error-700 dark:text-error-400 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" /> Analysis Failed
                    </p>
                    <p className="text-sm text-error-600 dark:text-error-300 mt-1">{analyzeError}</p>
                  </div>
                )}

                {/* Analyzing spinner */}
                {isAnalyzing && (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <RefreshCw className="h-12 w-12 mx-auto text-brand-600 animate-spin mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Analyzing Pattern Matching…</h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        Running 5-tier matching strategy: Knowledge-Based → Semantic → Similarity → Pattern → Boost
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Analysis results */}
                {!isAnalyzing && currentAnalysis && (
                  <>
                    {/* Overall Confidence — 3-col KPI */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5" />
                          Pattern Matching Analysis
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center">
                            <div className="text-4xl font-bold text-blue-600">
                              {currentAnalysis.overallConfidence ?? 0}%
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Overall Confidence</div>
                          </div>
                          <div className="text-center">
                            <div className="text-4xl font-bold text-green-600">
                              {currentAnalysis.fieldMappings?.length ?? 0}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Fields Mapped</div>
                          </div>
                          <div className="text-center">
                            <div className="text-4xl font-bold text-orange-600">
                              {currentAnalysis.unmappedSourceFields?.length ?? 0}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">Unmapped Fields</div>
                          </div>
                        </div>
                        <Progress value={currentAnalysis.overallConfidence ?? 0} className="w-full" />
                      </CardContent>
                    </Card>

                    {/* 5-Tier Breakdown */}
                    <MatchingStrategyBreakdown
                      metadata={currentAnalysis.matchingMetadata}
                      fieldMappings={currentAnalysis.fieldMappings ?? []}
                    />

                    {/* JOLT Readiness */}
                    <JoltReadinessPanel warnings={currentAnalysis.matchingMetadata?.warnings} />

                    {/* Field Mappings Table */}
                    <FieldMappingsTable
                      fieldMappings={currentAnalysis.fieldMappings ?? []}
                      channelLabel={currentStoreData.channelType}
                    />

                    {/* Unmapped Fields */}
                    <UnmappedFieldsPanel
                      unmappedSource={currentAnalysis.unmappedSourceFields ?? []}
                      missingTarget={currentAnalysis.unmappedTargetFields ?? []}
                    />

                    {/* JOLT Spec */}
                    <JoltSpecCard
                      joltSpec={currentAnalysis.joltSpec ?? []}
                      onPreviewTransformed={() => handlePreviewTransformation(currentStoreData.channelType)}
                    />
                  </>
                )}

                {/* Before analyze — prompt */}
                {!isAnalyzing && !currentAnalysis && !analyzeError && !productMissing && product && (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <Brain className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Click "Analyze Pattern Matching" to Inspect</h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        Runs 5-tier adaptive matching to show field coverage, confidence scores, and JOLT spec
                      </p>
                    </CardContent>
                  </Card>
                )}

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
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-lg mb-1">Ready to Publish?</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Publish <strong>{currentStoreData.storeId}</strong> via{" "}
                          <strong className="capitalize">{currentStoreData.channelType}</strong>
                        </p>
                        {currentStoreData.completionPercentage < 100 && (
                          <p className="text-xs text-warning-600 dark:text-warning-400 mt-1">
                            ⚠ {currentStoreData.completionPercentage}% complete — some required fields may be missing
                          </p>
                        )}
                      </div>
                      {currentPublishStatus === "PUBLISHED" ? (
                        <div className="flex items-center gap-2 text-success-600 dark:text-success-400">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="font-medium">Published successfully!</span>
                        </div>
                      ) : (
                        <Button
                          onClick={() => handlePublishSingle(currentStoreData.storeId)}
                          disabled={publishingStores.has(currentStoreData.storeId) || batchPublishing}
                        >
                          {publishingStores.has(currentStoreData.storeId)
                            ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Publishing…</>
                            : <><Send className="h-4 w-4 mr-2" />{currentPublishStatus === "FAILED" ? "Retry Publish" : "Publish to Store"}</>
                          }
                        </Button>
                      )}
                    </div>
                    {selectedStoreId && publishResults[selectedStoreId]?.status === "FAILED" && (
                      <div className="mt-3 p-3 bg-error-50 dark:bg-error-500/10 rounded-lg">
                        <p className="text-sm text-error-600 dark:text-error-400">
                          {publishResults[selectedStoreId].error ?? "Publish failed"}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {/* JOLT Preview Modal */}
      {showJoltPreview && joltPreviewData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-4xl w-full max-h-[80vh] overflow-auto">
            <CardHeader>
              <CardTitle>Transformed Data Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg overflow-auto text-xs">
                {JSON.stringify(joltPreviewData, null, 2)}
              </pre>
              <div className="mt-4 flex justify-end">
                <Button onClick={() => { setShowJoltPreview(false); setJoltPreviewData(null); }}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
