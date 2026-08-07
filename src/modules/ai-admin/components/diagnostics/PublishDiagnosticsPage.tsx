"use client";

/**
 * Publish Diagnostics (platform-admin).
 *
 * The engineering-facing counterpart of the merchant Step-3 publish page. Two modes:
 *
 *  • "Dari My Products" (product-aware) → POST /channels/publish/analyze. Loads the REAL
 *    product + Step-2 channel data from the DB and answers "is THIS product ready to
 *    publish?" — a 7-stage readiness report that can flag real data issues (dup SKU/price,
 *    empty required values) the schema-only endpoint cannot see. Nothing is published.
 *    (docs/FRONTEND-PHASE0-CATEGORY-ANCHORING-AND-PUBLISH-DIAGNOSTICS.md §2–3.)
 *
 *  • "Paste JSON" (schema-level) → POST /adaptive-pattern-matching/analyze (persistJolt:false).
 *    Answers "is my JOLT spec correct?" for a hypothetical product: cascade / 5-tier breakdown,
 *    field mappings + confidence, unmapped fields, JOLT readiness, raw spec.
 *
 * Both are live & sync — cascade can escalate to the agent and take up to ~90s / hit 429 →
 * elapsed timer + Cancel.
 */

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiApiError } from "../../types/common";
import {
  AdaptivePatternMatchingResponse,
  FieldMapping,
  SourceFieldScope,
  SourceFieldTag,
} from "@/modules/ecommerce-product-v2/types/channel-mapping";
import { MasterProduct } from "@/modules/ecommerce-product-v2/types/product";
import { ChannelProductData } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import { ChannelProductDataService } from "@/modules/ecommerce-product-v2/step2-channel-fields/services/channelStore.service";
import { analyzePatternMatching, fetchCategoryAttributeSchema } from "@/modules/ecommerce-product-v2/services/pattern-matching.service";
import { ChannelStoreService } from "@/modules/ecommerce-product-v2/step2-channel-fields/services/channelStore.service";
import { AiAdminService } from "../../services/aiAdmin.service";
import { analyzePublish } from "@/modules/ecommerce-product-v2/services/publish-analyze.service";
import type {
  PublishAnalysisRequest,
  PublishAnalysisResponse,
  PublishIssue,
  PublishStageAdaptiveMapping,
} from "@/modules/ecommerce-product-v2/types/publish-analysis";
import {
  generateMappingRequest,
  mergeStoreOverridesIntoRequest,
  mergeLiveChannelFieldsIntoTarget,
} from "@/modules/ecommerce-product-v2/utils/product-mapper";
import { MasterProductService } from "@/app/(admin)/products/_services/master-product.service";
import { useAuth } from "@/shared/contexts/AuthContext";
import { CascadeOutcomeBadge } from "../shared/CascadeOutcomeBadge";
import { ProductTypeSampleLoader } from "../shared/ProductTypeSampleLoader";
import { ActivityIcon, GitBranchIcon, PlayIcon, RefreshIcon, SearchIcon, SparklesIcon, TerminalIcon } from "../shared/icons";
import {
  Badge,
  Card,
  CHANNEL_OPTIONS,
  CHANNEL_LABELS,
  ErrorNotice,
  InfoBanner,
  JsonViewer,
  PageHeader,
  SectionCard,
  Spinner,
  StatTile,
  Tone,
} from "../shared/ui";

const RUN_TIMEOUT_MS = 120_000;

const SAMPLE_PRODUCT: MasterProduct = {
  id: "diag-sample",
  sku: "ACME-TSHIRT-001",
  name: "Classic Cotton T-Shirt",
  description: "Soft 100% cotton crew-neck tee.",
  price: 19.99,
  compareAtPrice: 24.99,
  brand: "Acme",
  category: "clothing",
  tags: ["cotton", "unisex"],
  quantity: 37,
  weight: 0.25,
  mainImage: "https://example.com/tshirt.jpg",
  hasVariants: true,
  variants: [
    { id: "v1", sku: "ACME-TSHIRT-001-BM", color: "black", size: "M", price: 19.99, quantity: 25 },
    { id: "v2", sku: "ACME-TSHIRT-001-WL", color: "white", size: "L", price: 19.99, quantity: 12 },
  ],
  status: "active",
} as unknown as MasterProduct;

// ─── Matching strategy breakdown (dynamic, keyed by actual strategy names) ────
// Backend sends a Map<strategyName, count> keyed EXACTLY like each mapping's `matchStrategy`.
// Render whatever keys exist (the set can grow) — the old fixed 4-tier panel read wrong keys
// and had no ALIAS_MAPPING bucket, so it showed 0. Contract: docs/FRONTEND-APM-STRATEGY-BREAKDOWN.md.
const STRATEGY_LABELS: Record<string, string> = {
  CHANNEL_SPECIFIC: "Knowledge-Based (channel-specific/learned)",
  SEMANTIC_KNOWLEDGE: "Semantic (tipe semantik sama)",
  ALIAS_MAPPING: "Alias (tipe semantik sama + alias)",
  PATTERN_MAPPING: "Pattern (regex)",
  KEYWORD_SIMILARITY: "Similarity (keyword/Jaccard)",
};
const STRATEGY_TONE: Record<string, Tone> = {
  CHANNEL_SPECIFIC: "green",
  SEMANTIC_KNOWLEDGE: "blue",
  ALIAS_MAPPING: "violet",
  PATTERN_MAPPING: "amber",
  KEYWORD_SIMILARITY: "amber",
};

function StrategyBreakdown({ breakdown }: { breakdown?: Record<string, number> }) {
  const entries = Object.entries(breakdown ?? {}).filter(([, n]) => typeof n === "number");
  if (entries.length === 0) {
    return <p className="text-xs text-gray-400">Belum ada mapping untuk dihitung.</p>;
  }
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sorted.map(([strategy, count]) => (
          <div key={strategy} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200 leading-tight">
                {STRATEGY_LABELS[strategy] ?? strategy}
              </span>
              <Badge tone={STRATEGY_TONE[strategy] ?? "gray"}>{count}</Badge>
            </div>
            <p className="text-[11px] text-gray-400 mt-1 font-mono truncate" title={strategy}>{strategy}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">
        Total {total} mapping · dihitung dari key strategi aktual (bukan tier tetap).
      </p>
    </div>
  );
}

// ─── JOLT readiness parsing → table ───────────────────────────────────────────
// Backend emits readiness as flat warning strings; parse the known shapes into
// tidy rows so the diagnostics table is readable instead of a raw log dump.
type ReadinessLevel = "ok" | "warn" | "error" | "info";
interface ReadinessRow { level: ReadinessLevel; primary: string; secondary?: string }

const READINESS_TONE: Record<ReadinessLevel, Tone> = { ok: "green", warn: "amber", error: "red", info: "gray" };
const READINESS_LABEL: Record<ReadinessLevel, string> = { ok: "OK", warn: "Peringatan", error: "Error", info: "Info" };
const READINESS_MARK: Record<ReadinessLevel, string> = { ok: "✓", warn: "⚠", error: "✗", info: "ℹ" };

const CONFLICT_RE = /\[JOLT-CONFLICT (ERROR|WARNING)\]\s+target='([^']+)'\s+sources=\[([^\]]+)\]\s*[—-]*\s*(.*)/;

function parseReadiness(warnings: string[]): {
  overall: "READY" | "WARNINGS" | "NOT_READY" | null;
  rows: ReadinessRow[];
} {
  let overall: "READY" | "WARNINGS" | "NOT_READY" | null = null;
  const rows: ReadinessRow[] = [];
  for (const raw of warnings) {
    const w = (raw ?? "").trim();
    if (!w) continue;
    if (w.includes("[JOLT-READINESS]")) {
      overall = w.includes("NOT_READY") ? "NOT_READY" : w.includes("WARNINGS") ? "WARNINGS" : w.includes("READY") ? "READY" : overall;
      continue;
    }
    const c = CONFLICT_RE.exec(w);
    if (c) {
      const [, sev, target, sources, desc] = c;
      rows.push({
        level: sev === "ERROR" ? "error" : "warn",
        primary: `Konflik target: ${target}`,
        secondary: `${desc ? desc + " · " : ""}sources: ${sources}`,
      });
      continue;
    }
    if (w.startsWith("✓")) { rows.push({ level: "ok", primary: w.replace(/^✓\s*/, "") }); continue; }
    if (w.startsWith("⚠")) { rows.push({ level: "warn", primary: w.replace(/^⚠\s*/, "") }); continue; }
    if (w.startsWith("✗")) { rows.push({ level: "error", primary: w.replace(/^✗\s*/, "") }); continue; }
    // Unrecognised info line (unmapped %, injected fields, persistence, etc.).
    const lower = w.toLowerCase();
    const level: ReadinessLevel = lower.includes("not persisted") || lower.includes("error") ? "error" : lower.includes("warn") ? "warn" : "info";
    rows.push({ level, primary: w });
  }
  return { overall, rows };
}

function ReadinessTable({ warnings }: { warnings: string[] }) {
  const { overall, rows } = parseReadiness(warnings);
  const overallMeta =
    overall === "READY" ? { tone: "green" as Tone, label: "READY" }
    : overall === "WARNINGS" ? { tone: "amber" as Tone, label: "WARNINGS" }
    : overall === "NOT_READY" ? { tone: "red" as Tone, label: "NOT READY" }
    : null;

  return (
    <div className="space-y-3">
      {overallMeta && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Status keseluruhan:</span>
          <Badge tone={overallMeta.tone} dot>{overallMeta.label}</Badge>
        </div>
      )}
      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr className="text-left">
                <th className="px-3 py-2 text-[11px] font-medium text-gray-500 dark:text-gray-400 w-32">Status</th>
                <th className="px-3 py-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">Pemeriksaan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-800 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Badge tone={READINESS_TONE[r.level]}>{READINESS_MARK[r.level]} {READINESS_LABEL[r.level]}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-xs text-gray-700 dark:text-gray-300">{r.primary}</p>
                    {r.secondary && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono break-all">{r.secondary}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !overallMeta && <p className="text-xs text-gray-400">Tidak ada catatan kesiapan.</p>
      )}
    </div>
  );
}

type Mode = "product" | "json";

export default function PublishDiagnosticsPage() {
  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";

  const [mode, setMode] = useState<Mode>("product");

  // ── Product mode state ──────────────────────────────────────────────────
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [stores, setStores] = useState<ChannelProductData[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState("");

  // ── JSON mode state ─────────────────────────────────────────────────────
  const [channelId, setChannelId] = useState("shopify");
  const [categoryId, setCategoryId] = useState("clothing");
  // Start EMPTY — no dirty dummy on load. The static example is available on demand via
  // 'reset ke contoh statis'; the usual path is 'Load from Product Type'.
  const [productText, setProductText] = useState("");
  // A3: optional Step-2 channel fields (schema-level paste). Merged into the analyze SOURCE the same
  // way publish merges channelData before JOLT, so channel-unique fields get classified + mapped.
  const [channelFieldsText, setChannelFieldsText] = useState("");
  // A2: optional live channel fields from the attribute API (attributeConfig). Merged into the analyze
  // TARGET, so category-live channel-unique fields become mapping targets (mirror of A3 on the target side).
  const [liveChannelFieldsText, setLiveChannelFieldsText] = useState("");
  // Suggest for the channel-fields box: fill with this channel's Step-2 field names (offline, data-driven).
  const [suggestingChannel, setSuggestingChannel] = useState(false);
  const [channelFieldsNote, setChannelFieldsNote] = useState<string | null>(null);
  // A2+ auto-fetch: pull live/cached category attributes (needs a store for creds + a channel categoryId)
  // and fill the box above, instead of pasting by hand.
  const [liveStores, setLiveStores] = useState<Array<{ storeId: string; storeName: string }>>([]);
  const [liveStoreId, setLiveStoreId] = useState("");
  const [liveCategoryId, setLiveCategoryId] = useState("");
  const [fetchingLive, setFetchingLive] = useState(false);
  const [fetchLiveError, setFetchLiveError] = useState<string | null>(null);
  const [fetchLiveInfo, setFetchLiveInfo] = useState<string | null>(null);

  // ── Shared run state ────────────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<AdaptivePatternMatchingResponse | null>(null);
  const [publishResult, setPublishResult] = useState<PublishAnalysisResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timedOutRef = useRef(false);

  const jsonError = useMemo(() => {
    if (!productText.trim()) return null; // empty is not an error — just not runnable yet
    try {
      JSON.parse(productText);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [productText]);

  // Parse the optional Step-2 channel fields box. Empty → no fields, no error. Must be a JSON object.
  const { channelFields, channelFieldsError } = useMemo(() => {
    const t = channelFieldsText.trim();
    if (!t) return { channelFields: null as Record<string, unknown> | null, channelFieldsError: null as string | null };
    try {
      const parsed = JSON.parse(t);
      if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { channelFields: null, channelFieldsError: "harus berupa objek JSON { field: nilai }" };
      }
      return { channelFields: parsed as Record<string, unknown>, channelFieldsError: null };
    } catch (e) {
      return { channelFields: null, channelFieldsError: (e as Error).message };
    }
  }, [channelFieldsText]);

  // Parse the optional live attributeConfig (target) box. Same rules as the channel-fields box.
  const { liveChannelFields, liveChannelFieldsError } = useMemo(() => {
    const t = liveChannelFieldsText.trim();
    if (!t) return { liveChannelFields: null as Record<string, unknown> | null, liveChannelFieldsError: null as string | null };
    try {
      const parsed = JSON.parse(t);
      if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { liveChannelFields: null, liveChannelFieldsError: "harus berupa objek JSON { path: … }" };
      }
      return { liveChannelFields: parsed as Record<string, unknown>, liveChannelFieldsError: null };
    } catch (e) {
      return { liveChannelFields: null, liveChannelFieldsError: (e as Error).message };
    }
  }, [liveChannelFieldsText]);

  // A2+ : load this org's stores for the chosen channel, to pick creds for the live attribute fetch.
  useEffect(() => {
    if (mode !== "json" || !orgId) { setLiveStores([]); setLiveStoreId(""); return; }
    let alive = true;
    ChannelStoreService.listStores(orgId)
      .then((all) => {
        if (!alive) return;
        const forChannel = all.filter((s) => s.channelType === channelId)
          .map((s) => ({ storeId: s.storeId, storeName: s.storeName }));
        setLiveStores(forChannel);
        setLiveStoreId((prev) => (forChannel.some((s) => s.storeId === prev) ? prev : ""));
      })
      .catch(() => { if (alive) setLiveStores([]); });
    return () => { alive = false; };
  }, [mode, channelId, orgId]);

  // A2+ : fetch live/cached category attributes as a target schema fragment → fill the box above.
  async function fetchLive() {
    if (!liveStoreId || !liveCategoryId.trim() || !orgId || fetchingLive) return;
    setFetchingLive(true); setFetchLiveError(null); setFetchLiveInfo(null);
    try {
      const resp = await fetchCategoryAttributeSchema(channelId, liveStoreId, liveCategoryId.trim(), orgId);
      if (!resp.schema || Object.keys(resp.schema).length === 0) {
        setFetchLiveError("Tak ada atribut untuk kategori ini (cek channel categoryId / kredensial store).");
      } else {
        setLiveChannelFieldsText(JSON.stringify(resp.schema, null, 2));
        // matched = fields whose name resolved to a real apiSchema path (via attributeMappings);
        // the rest keep their bare name (live-only category attrs typically have no stored mapping).
        setFetchLiveInfo(`${resp.fieldCount} field · ${resp.matchedCount} ter-map ke apiSchema path`);
      }
    } catch (e) {
      setFetchLiveError(e instanceof Error ? e.message : "Gagal fetch");
    } finally {
      setFetchingLive(false);
    }
  }

  // Fill the channel-fields box with this channel's known Step-2 field names (offline; no channel creds).
  async function suggestChannelFields() {
    if (suggestingChannel) return;
    setSuggestingChannel(true); setChannelFieldsNote(null);
    try {
      const fields = await AiAdminService.getChannelFieldNames(channelId);
      const keys = Object.keys(fields ?? {});
      if (keys.length === 0) {
        setChannelFieldsNote(`Channel ${channelId} tak punya field Step-2 khusus di katalog.`);
      } else {
        setChannelFieldsText(JSON.stringify(fields, null, 2));
        setChannelFieldsNote(`${keys.length} field disarankan — isi nilainya lalu jalankan.`);
      }
    } catch (e) {
      setChannelFieldsNote(e instanceof Error ? e.message : "Gagal memuat saran");
    } finally {
      setSuggestingChannel(false);
    }
  }

  // Load My Products (org-scoped) for the picker.
  const loadProducts = useCallback(async () => {
    if (!orgId) return;
    setProductsLoading(true);
    setProductsError(null);
    try {
      const res = await MasterProductService.list({ organizationId: orgId, page: 0, size: 200 });
      setProducts(res.content.map((p) => ({ id: p.id, name: p.name })));
    } catch (e) {
      setProductsError((e as Error).message);
    } finally {
      setProductsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (mode === "product") loadProducts();
  }, [mode, loadProducts]);

  // When a product is chosen, load its connected stores (with Step-2 overrides).
  useEffect(() => {
    setSelectedStoreId("");
    setStores([]);
    if (!selectedProductId) return;
    let alive = true;
    setStoresLoading(true);
    ChannelProductDataService.getAllStoreData(selectedProductId)
      .then((data) => { if (alive) setStores(data); })
      .catch(() => { if (alive) setStores([]); })
      .finally(() => { if (alive) setStoresLoading(false); });
    return () => { alive = false; };
  }, [selectedProductId]);

  const selectedStore = stores.find((s) => s.storeId === selectedStoreId) ?? null;

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    timeoutRef.current = null;
    tickRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearTimers();
    };
  }, [clearTimers]);

  const cancel = useCallback(() => {
    timedOutRef.current = false;
    abortRef.current?.abort();
  }, []);

  const canRun =
    !running &&
    (mode === "json"
      ? !!productText.trim() && !jsonError && !channelFieldsError && !liveChannelFieldsError && !!categoryId.trim()
      : // Product-aware endpoint only needs masterProductId; a store adds Step-2 context.
        !!selectedProductId);

  async function run() {
    if (!canRun) return;
    const controller = new AbortController();
    abortRef.current = controller;
    timedOutRef.current = false;
    setRunning(true);
    setError(null);
    setResult(null);
    setPublishResult(null);
    setElapsed(0);
    tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    timeoutRef.current = setTimeout(() => {
      timedOutRef.current = true;
      controller.abort();
    }, RUN_TIMEOUT_MS);

    try {
      if (mode === "json") {
        // Schema-level (hypothetical product) → APM analyze. Diagnostic only:
        // never persist to production JOLT; force a fresh run.
        const product = JSON.parse(productText) as MasterProduct;
        const request = await generateMappingRequest(product, channelId, {
          confidenceThreshold: 70,
          categoryId: categoryId.trim(),
          organizationId: orgId,
          persistJolt: false,
          forceReanalyze: true,
        });
        // A3: fold the optional Step-2 channel fields into the source (as channelData), reusing the
        // same helper the merchant publish flow uses — so the paste path sees the real publish picture.
        mergeStoreOverridesIntoRequest(request, channelFields ? { channelData: channelFields } : null);
        // A2: fold the optional live attributeConfig fields into the TARGET, so category-live
        // channel-unique fields become mapping targets (mirror of A3 on the target side).
        mergeLiveChannelFieldsIntoTarget(request, liveChannelFields);
        setResult(await analyzePatternMatching(request, controller.signal));
      } else {
        // Product-aware readiness → the backend loads the real product + Step-2 data
        // and resolves the category itself (from ProductType.categorySlug). A store,
        // when chosen, adds the channel + Step-2 context.
        const req: PublishAnalysisRequest = {
          masterProductId: selectedProductId,
          organizationId: orgId || undefined,
        };
        if (selectedStore) {
          req.storeId = selectedStore.storeId;
          req.channelId = selectedStore.channelType;
        }
        setPublishResult(await analyzePublish(req, controller.signal));
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError" || (e instanceof AiApiError && e.kind === "aborted")) {
        setError(
          new AiApiError(
            timedOutRef.current
              ? `Timeout ${Math.round(RUN_TIMEOUT_MS / 1000)}s — cascade kemungkinan menunggu agent (LLM 429). Coba lagi nanti.`
              : "Dibatalkan.",
            "aborted",
          ),
        );
      } else {
        setError(e);
      }
    } finally {
      clearTimers();
      abortRef.current = null;
      setRunning(false);
    }
  }

  const elapsedLabel = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const runChannel = mode === "json" ? channelId : selectedStore?.channelType ?? channelId;

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        icon={<TerminalIcon size={20} />}
        title="Publish Diagnostics"
        subtitle="Bagaimana engine memutuskan transformasi publish — APM/AI, tier, mappings, JOLT. (Bukan halaman merchant.)"
      />

      <InfoBanner tone="violet">
        <p>
          Menjalankan pipeline <strong>analyze</strong> yang sama seperti publish merchant, tapi menampilkan
          <strong> detail teknis penuh</strong> untuk debug. <strong>persistJolt=false</strong> — tidak menulis ke
          JOLT produksi. Cascade aktif (sync) → bisa eskalasi ke agent (sampai ~2 menit / 429).
        </p>
      </InfoBanner>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Input */}
        <Card className="p-4 space-y-4">
          {/* Mode toggle */}
          <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden w-fit">
            {(["product", "json"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === m ? "bg-violet-600 text-white" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}>
                {m === "product" ? "Dari My Products" : "Paste JSON"}
              </button>
            ))}
          </div>

          {mode === "product" ? (
            <div className="space-y-3">
              {/* Product picker */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">Produk</label>
                  <button onClick={loadProducts} disabled={productsLoading}
                    className="inline-flex items-center gap-1 text-[11px] text-blue-500 hover:underline disabled:opacity-50">
                    {productsLoading ? <Spinner size={10} /> : <RefreshIcon size={10} />} refresh
                  </button>
                </div>
                <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}
                  disabled={productsLoading}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                  <option value="">{productsLoading ? "Memuat produk…" : "Pilih produk…"}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                {productsError && <p className="text-[11px] text-red-500 mt-1">{productsError}</p>}
                {!productsLoading && !productsError && products.length === 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">Tidak ada produk di organisasi ini.</p>
                )}
              </div>

              {/* Store picker (optional — adds channel + Step-2 context) */}
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Channel store <span className="text-gray-400">(opsional)</span></label>
                <select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)}
                  disabled={!selectedProductId || storesLoading}
                  className="mt-1 w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50">
                  <option value="">
                    {!selectedProductId ? "Pilih produk dulu…" : storesLoading ? "Memuat store…" : "Pilih store…"}
                  </option>
                  {stores.map((s) => (
                    <option key={s.storeId} value={s.storeId}>
                      {s.storeId} · {CHANNEL_LABELS[s.channelType] ?? s.channelType} · {s.completionPercentage}%
                    </option>
                  ))}
                </select>
                {selectedProductId && !storesLoading && stores.length === 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">Produk ini belum terhubung ke store mana pun (Step 2) — analisa tetap bisa jalan (master product + kategori turunan, tanpa konteks channel).</p>
                )}
                {selectedProductId && !selectedStoreId && stores.length > 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">Tanpa store: analisa master product + kategori turunan saja. Pilih store untuk sertakan channel + Step-2.</p>
                )}
              </div>

              {selectedStore && (
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400">
                  Mendiagnosa input publish <strong className="text-gray-700 dark:text-gray-300">persis</strong> untuk store ini —
                  channel <strong>{CHANNEL_LABELS[selectedStore.channelType] ?? selectedStore.channelType}</strong>, kategori{" "}
                  <strong>dari produk</strong>, plus override Step-2 (channel fields, master/variant overrides). persistJolt=false.
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Channel</label>
                  <select value={channelId} onChange={(e) => setChannelId(e.target.value)}
                    className="mt-1 w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                    {CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c] ?? c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Category ID</label>
                  <input value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder="mis. clothing"
                    className="mt-1 w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300" />
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Ikut ter-set saat memuat sample dari Product Type.</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">Master product (JSON)</label>
                  <button onClick={() => setProductText(JSON.stringify(SAMPLE_PRODUCT, null, 2))} className="text-[11px] text-blue-500 hover:underline">reset ke contoh statis</button>
                </div>
                {/* Seed from a real Product Type's fields (not a blind hardcoded example).
                    Sync the Category ID to the type's derived categorySlug so the sample data
                    and the schema it's matched against stay consistent (schema-level mode has
                    no backend derivation — the category here is a direct input). */}
                <ProductTypeSampleLoader
                  onLoaded={setProductText}
                  onProductTypeChange={(pt) => { if (pt) setCategoryId(pt.categorySlug ?? "default"); }}
                  channelId={channelId}
                  className="mb-2"
                />
                <textarea
                  value={productText}
                  onChange={(e) => setProductText(e.target.value)}
                  spellCheck={false}
                  rows={16}
                  className={`w-full font-mono text-[11px] border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 ${
                    jsonError ? "border-red-400 focus:ring-red-400" : "border-gray-200 dark:border-gray-700 focus:ring-violet-400"
                  }`}
                />
                {jsonError ? (
                  <p className="text-[11px] text-red-500 mt-1">JSON tidak valid: {jsonError}</p>
                ) : productText.trim() ? (
                  <p className="text-[11px] text-gray-400 mt-1">JSON valid ✓ — produk hipotetis, tanpa override store.</p>
                ) : (
                  <p className="text-[11px] text-gray-400 mt-1">Kosong — <strong>Load from Product Type</strong>, paste JSON, atau <strong>reset ke contoh statis</strong>.</p>
                )}
              </div>

              {/* A3: optional Step-2 channel fields — merged into the analyze SOURCE (as channelData),
                  mirroring how publish merges channelData before JOLT. Lets channel-unique fields be
                  classified (Channel-unique/-shared) and mapped, so the paste path matches real publish. */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-500 dark:text-gray-400">Channel fields — Step-2 (JSON, opsional)</label>
                  <button
                    type="button"
                    onClick={suggestChannelFields}
                    disabled={suggestingChannel}
                    className="inline-flex items-center gap-1 text-[11px] text-blue-500 hover:underline disabled:opacity-50"
                  >
                    {suggestingChannel ? <Spinner size={11} /> : <SparklesIcon size={12} />}
                    Suggest untuk {channelId}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 mb-1">
                  Field channel-spesifik yang diisi merchant di Step 2 (mis. <code>days_to_ship</code>, <code>size_chart_id</code>).
                  Digabung ke source seperti saat publish → field channel-unique ikut diklasifikasi &amp; dipetakan.
                </p>
                <textarea
                  value={channelFieldsText}
                  onChange={(e) => setChannelFieldsText(e.target.value)}
                  spellCheck={false}
                  rows={5}
                  placeholder={'{ "days_to_ship": 3, "size_chart_id": "SC-123" }'}
                  className={`w-full font-mono text-[11px] border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 ${
                    channelFieldsError ? "border-red-400 focus:ring-red-400" : "border-gray-200 dark:border-gray-700 focus:ring-violet-400"
                  }`}
                />
                {channelFieldsError ? (
                  <p className="text-[11px] text-red-500 mt-1">JSON tidak valid: {channelFieldsError}</p>
                ) : channelFieldsNote ? (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">✓ {channelFieldsNote}</p>
                ) : channelFieldsText.trim() ? (
                  <p className="text-[11px] text-gray-400 mt-1">Akan digabung ke source sebagai channel fields (Step-2).</p>
                ) : (
                  <p className="text-[11px] text-gray-400 mt-1">Kosongkan bila hanya menguji field master, atau klik <strong>Suggest</strong>.</p>
                )}
              </div>

              {/* A2: optional LIVE channel fields from the attribute API (attributeConfig) — merged into the
                  analyze TARGET, so category-live channel-unique fields become mapping targets. Mirror of the
                  channel-fields box, on the target side. Paste what the channel's attribute API returns for
                  this category (auto-fetch is a future step; needs store credentials + a channel category ID). */}
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Live channel fields — attributeConfig (JSON, opsional)</label>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 mb-1">
                  Field channel-unik yang hanya ada <em>live per-kategori</em> dari attribute API channel
                  (belum tentu tersimpan). Digabung ke <strong>target</strong> → jadi tujuan mapping.
                </p>
                {/* A2+ auto-fetch: pick a store (creds) + channel leaf categoryId → fill the box below. */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <select
                    value={liveStoreId}
                    onChange={(e) => setLiveStoreId(e.target.value)}
                    disabled={liveStores.length === 0}
                    className="min-w-0 flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-[11px] bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                  >
                    <option value="">{liveStores.length === 0 ? `Tak ada store ${channelId}` : "Pilih store…"}</option>
                    {liveStores.map((s) => <option key={s.storeId} value={s.storeId}>{s.storeName || s.storeId}</option>)}
                  </select>
                  <input
                    value={liveCategoryId}
                    onChange={(e) => setLiveCategoryId(e.target.value)}
                    placeholder="channel categoryId (leaf)"
                    className="min-w-0 flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-[11px] bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  />
                  <button
                    type="button"
                    onClick={fetchLive}
                    disabled={!liveStoreId || !liveCategoryId.trim() || fetchingLive}
                    className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-lg text-[11px] font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50"
                  >
                    {fetchingLive ? <Spinner size={11} /> : <SparklesIcon size={12} />}
                    Fetch live
                  </button>
                </div>
                {fetchLiveError && <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-1">⚠ {fetchLiveError}</p>}
                {fetchLiveInfo && !fetchLiveError && <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mb-1">✓ {fetchLiveInfo}</p>}
                <textarea
                  value={liveChannelFieldsText}
                  onChange={(e) => setLiveChannelFieldsText(e.target.value)}
                  spellCheck={false}
                  rows={5}
                  placeholder={'{ "attributes": { "size_chart": "", "warranty_type": "" } }'}
                  className={`w-full font-mono text-[11px] border rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 ${
                    liveChannelFieldsError ? "border-red-400 focus:ring-red-400" : "border-gray-200 dark:border-gray-700 focus:ring-violet-400"
                  }`}
                />
                {liveChannelFieldsError ? (
                  <p className="text-[11px] text-red-500 mt-1">JSON tidak valid: {liveChannelFieldsError}</p>
                ) : liveChannelFieldsText.trim() ? (
                  <p className="text-[11px] text-gray-400 mt-1">Akan di-deep-merge ke target schema.</p>
                ) : (
                  <p className="text-[11px] text-gray-400 mt-1">Kosongkan bila kategori tak punya field live tambahan.</p>
                )}
              </div>
            </>
          )}

          {running ? (
            <div className="flex items-stretch gap-2">
              <div className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600/90 text-white text-sm font-medium rounded-lg">
                <Spinner size={15} /> Menganalisis… <span className="font-mono tabular-nums">{elapsedLabel}</span>
              </div>
              <button onClick={cancel}
                className="px-4 py-2.5 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium rounded-lg transition-colors">
                Batalkan
              </button>
            </div>
          ) : (
            <button onClick={run} disabled={!canRun}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
              <PlayIcon size={14} /> Jalankan Diagnostics
            </button>
          )}
        </Card>

        {/* Output */}
        <div className="space-y-4">
          {error ? (
            <ErrorNotice error={error} onRetry={run} />
          ) : running ? (
            <Card className="p-8 flex flex-col items-center justify-center text-center">
              <Spinner size={28} />
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-3">Menjalankan APM… <span className="font-mono">{elapsedLabel}</span></p>
              <p className="text-xs text-gray-400 mt-1">Fetch target schema → matching → cascade. Bisa lama bila eskalasi ke agent.</p>
            </Card>
          ) : publishResult ? (
            <PublishAnalysisResult result={publishResult} />
          ) : result ? (
            <DiagnosticsResult result={result} channelId={runChannel} />
          ) : (
            <Card className="p-8 flex flex-col items-center justify-center text-center">
              <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3 text-gray-400"><SearchIcon size={22} /></div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Belum ada hasil</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                {mode === "product"
                  ? <>Pilih produk (store opsional), lalu <strong>Jalankan Diagnostics</strong> untuk laporan kesiapan publish per-produk.</>
                  : <>Isi produk contoh + channel/category, lalu <strong>Jalankan Diagnostics</strong> untuk melihat keputusan engine.</>}
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Result ──────────────────────────────────────────────────────────────────

// ─── Source field classification (universal vs channel-specific) ─────────────
// Colour source fields so a developer sees at a glance which belong to the selected channel.
// Relative to the selected channel; data-driven; best-effort (absent → neutral). See
// docs/FRONTEND-APM-SOURCE-FIELD-CLASSIFICATION.md.

const SCOPE_META: Record<SourceFieldScope, { label: string; text: string; chip: string; dot: string; hint: string }> = {
  UNIVERSAL: {
    label: "Universal",
    text: "text-gray-500 dark:text-gray-400",
    chip: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300",
    dot: "bg-gray-400",
    hint: "master field umum — bukan channel field",
  },
  CHANNEL_SHARED: {
    label: "Channel-shared",
    text: "text-blue-600 dark:text-blue-400",
    chip: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
    hint: "channel field yang dibagi channel ini + channel lain",
  },
  CHANNEL_UNIQUE: {
    label: "Channel-unique",
    text: "text-orange-600 dark:text-orange-400 font-semibold",
    chip: "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 font-semibold",
    dot: "bg-orange-500",
    hint: "channel field yang HANYA channel ini deklarasikan",
  },
};

function leafName(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i + 1) : path;
}

/** Look up a source path's tag — exact key first, then the leaf name (classification is name-based). */
function classifySourceField(
  cls: Record<string, SourceFieldTag> | undefined,
  path: string,
): SourceFieldTag | undefined {
  if (!cls) return undefined;
  return cls[path] ?? cls[leafName(path)];
}

function scopeTooltip(tag: SourceFieldTag): string {
  const meta = SCOPE_META[tag.scope];
  const base = meta ? `${meta.label} — ${meta.hint}` : tag.scope;
  const ch = tag.supportedChannels?.length ? ` · channel: ${tag.supportedChannels.join(", ")}` : "";
  return base + ch;
}

function SourceScopeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      {(["UNIVERSAL", "CHANNEL_SHARED", "CHANNEL_UNIQUE"] as SourceFieldScope[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1" title={SCOPE_META[s].hint}>
          <span className={`w-2 h-2 rounded-full ${SCOPE_META[s].dot}`} />
          <span className={SCOPE_META[s].text}>{SCOPE_META[s].label}</span>
        </span>
      ))}
    </div>
  );
}

/** A single source field name coloured by its scope, with a tooltip carrying supportedChannels. */
function SourceFieldName({ path, cls, className = "" }: { path: string; cls?: Record<string, SourceFieldTag>; className?: string }) {
  const tag = classifySourceField(cls, path);
  const meta = tag ? SCOPE_META[tag.scope] : undefined;
  return (
    <code
      className={`text-[11px] font-mono ${meta ? meta.text : "text-gray-700 dark:text-gray-300"} ${className}`}
      title={tag ? scopeTooltip(tag) : undefined}
    >
      {path}
    </code>
  );
}

/** Full classification map as coloured chips + legend. Works for either analyze mode; hides when absent. */
function SourceFieldClassificationCard({ classification }: { classification?: Record<string, SourceFieldTag> }) {
  const entries = Object.entries(classification ?? {});
  if (entries.length === 0) return null;
  const order: Record<SourceFieldScope, number> = { CHANNEL_UNIQUE: 0, CHANNEL_SHARED: 1, UNIVERSAL: 2 };
  const sorted = [...entries].sort(
    (a, b) => (order[a[1].scope] ?? 9) - (order[b[1].scope] ?? 9) || a[0].localeCompare(b[0]),
  );
  const channelCount = entries.filter(([, t]) => t.isChannelField).length;
  return (
    <SectionCard
      title="Klasifikasi source field"
      subtitle="universal vs channel-specific (relatif ke channel terpilih)"
      icon={<SearchIcon size={16} />}
    >
      <div className="space-y-2.5">
        <SourceScopeLegend />
        <div className="flex flex-wrap gap-1.5">
          {sorted.map(([field, tag]) => {
            const meta = SCOPE_META[tag.scope] ?? SCOPE_META.UNIVERSAL;
            return (
              <span
                key={field}
                title={scopeTooltip(tag)}
                className={`inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded ${meta.chip}`}
              >
                {field}
                {tag.supportedChannels?.length ? (
                  <span className="opacity-60">· {tag.supportedChannels.join(",")}</span>
                ) : null}
              </span>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-400">
          {channelCount} channel field dari {entries.length} source field. Klasifikasi relatif ke channel terpilih —
          field yang unik di channel lain tampil sebagai universal di sini.
        </p>
      </div>
    </SectionCard>
  );
}

// ─── "Why" per mapping — surfaces the semanticType that drove the heuristic match ───────────
// Turns a wrong match into an actionable KB fix: the developer sees which semanticType in
// field_semantic_knowledge caused it. Contract: docs/FRONTEND-APM-INSPECTOR-REFRAME.md.
function drivingSemanticType(m: FieldMapping): string | null {
  if (m.sourceSemanticType) return m.sourceSemanticType;
  if (m.targetSemanticType) return m.targetSemanticType;
  const r = m.reasoning ?? "";
  return (
    r.match(/semanticType=([A-Za-z_]+)/)?.[1] ??
    r.match(/Semantic type match:\s*([A-Za-z_]+)/)?.[1] ??
    null
  );
}

function WhyCell({ m }: { m: FieldMapping }) {
  if (!m.reasoning) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  const sem = drivingSemanticType(m);
  return (
    <div className="flex items-start gap-1.5 max-w-[300px]" title={m.reasoning}>
      {sem && <span className="shrink-0"><Badge tone="violet">{sem}</Badge></span>}
      <span className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-2 break-words">{m.reasoning}</span>
    </div>
  );
}

function DiagnosticsResult({ result, channelId }: { result: AdaptivePatternMatchingResponse; channelId: string }) {
  const md = result.matchingMetadata;
  const conf = result.overallConfidence ?? 0;
  const confTone: Tone = conf >= 92 ? "green" : conf >= 70 ? "amber" : "red";
  const mappings = result.fieldMappings ?? [];
  const cls = result.sourceFieldClassification;
  const hasReasoning = mappings.some((m) => !!m.reasoning);

  return (
    <div className="space-y-4">
      {/* Honest label — this mode is the pure-heuristic APM inspector, NOT a production answer. */}
      <InfoBanner tone="amber">
        <p className="font-semibold">Heuristic Matcher Inspector — APM murni (tanpa AI)</p>
        <p>
          Deterministik, tanpa kuota LLM, <strong>tidak menulis ke JOLT produksi</strong>. Alat untuk
          mendiagnosis perilaku matcher + kesehatan KB (<code className="font-mono">field_semantic_knowledge</code>) —
          <strong> bukan</strong> mapping siap-pakai. <strong>Confidence = kemiripan nama, bukan kebenaran.</strong>{" "}
          Untuk mapping akurat pakai <strong>&quot;Dari My Products&quot;</strong> atau Generate Console → Recommendations.
        </p>
      </InfoBanner>

      {/* Engine outcome + confidence */}
      <SectionCard title="Keputusan engine" subtitle="engine mana yang menyelesaikan" icon={<GitBranchIcon size={16} />}
        right={<CascadeOutcomeBadge outcome={result} showDetail />}>
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Confidence" value={`${conf.toFixed(0)}%`} tone={confTone} />
          <StatTile label="Fields mapped" value={mappings.length} tone="green" />
          <StatTile label="Unmapped" value={result.unmappedSourceFields?.length ?? 0} tone={(result.unmappedSourceFields?.length ?? 0) > 0 ? "amber" : "gray"} />
        </div>
        {result.status && <p className="text-xs text-gray-400 mt-3">status: <span className="font-mono">{result.status}</span> · {md?.processingTimeMs ?? "?"}ms · {md?.matchedFields ?? mappings.length} matches</p>}
      </SectionCard>

      {/* Strategy breakdown — dynamic, keyed by the actual strategy names (matches the table) */}
      <SectionCard title="Matching strategy breakdown" subtitle="jumlah mapping per strategi (matchStrategyCount)" icon={<ActivityIcon size={16} />}>
        <StrategyBreakdown breakdown={md?.matchStrategyCount} />
      </SectionCard>

      {/* JOLT readiness — parsed into a readable table (status + check) */}
      {(md?.warnings?.length ?? 0) > 0 && (
        <SectionCard title="JOLT readiness" subtitle="hasil cek kesiapan + konflik">
          <ReadinessTable warnings={md!.warnings!} />
        </SectionCard>
      )}

      {/* Field mappings */}
      {mappings.length > 0 && (
        <SectionCard title={`Field mappings (${mappings.length})`} subtitle="source → target + confidence">
          {cls && <div className="mb-2"><SourceScopeLegend /></div>}
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-white dark:bg-gray-900">
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                  <th className="px-2 py-1.5 text-[11px] font-medium text-gray-500">Source</th>
                  <th className="px-2 py-1.5 text-[11px] font-medium text-gray-500">Target</th>
                  <th className="px-2 py-1.5 text-[11px] font-medium text-gray-500">Strategy</th>
                  {hasReasoning && <th className="px-2 py-1.5 text-[11px] font-medium text-gray-500">Why (semanticType penggerak)</th>}
                  <th className="px-2 py-1.5 text-[11px] font-medium text-gray-500 text-right">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m: FieldMapping, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-2 py-1.5"><SourceFieldName path={m.sourcePath} cls={cls} /></td>
                    <td className="px-2 py-1.5"><code className="text-[11px] font-mono text-blue-600 dark:text-blue-400">{m.targetPath}</code></td>
                    <td className="px-2 py-1.5"><span className="text-[10px] text-gray-400">{m.matchStrategy}</span></td>
                    {hasReasoning && <td className="px-2 py-1.5"><WhyCell m={m} /></td>}
                    <td className="px-2 py-1.5 text-right">
                      <span className={`text-[11px] font-medium ${m.confidence >= 90 ? "text-green-600 dark:text-green-400" : m.confidence >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-500"}`}>
                        {m.confidence}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Source field classification (universal vs channel-specific) */}
      <SourceFieldClassificationCard classification={cls} />

      {/* Unmapped */}
      {((result.unmappedSourceFields?.length ?? 0) > 0 || (result.unmappedTargetFields?.length ?? 0) > 0) && (
        <SectionCard title="Unmapped fields" subtitle="tak terpetakan (source & target)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-medium text-gray-500 mb-1">Source ({result.unmappedSourceFields?.length ?? 0})</p>
              <div className="flex flex-wrap gap-1">
                {(result.unmappedSourceFields ?? []).map((f) => {
                  const tag = classifySourceField(cls, f);
                  const meta = tag ? SCOPE_META[tag.scope] : undefined;
                  return (
                    <span
                      key={f}
                      title={tag ? scopeTooltip(tag) : undefined}
                      className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${meta ? meta.chip : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}
                    >
                      {f}
                    </span>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-500 mb-1">Target ({result.unmappedTargetFields?.length ?? 0})</p>
              <div className="flex flex-wrap gap-1">
                {(result.unmappedTargetFields ?? []).map((f) => <Badge key={f} tone="amber">{f}</Badge>)}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* JOLT spec + raw */}
      <SectionCard title="JOLT spec" subtitle={`transformasi ${CHANNEL_LABELS[channelId] ?? channelId} (tidak dipersist)`}>
        <JsonViewer label={`joltSpec (${(result.joltSpec ?? []).length} ops)`} value={result.joltSpec ?? []} />
        <div className="mt-2">
          <JsonViewer label="raw response" value={result} />
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Product-aware readiness result (POST /channels/publish/analyze) ───────────

const ISSUE_TONE: Record<PublishIssue["severity"], Tone> = { ERROR: "red", WARNING: "amber", INFO: "gray" };

/** One pipeline-stage summary row: a status dot, a label, and key:value stats. */
function StageRow({
  label,
  tone,
  stats,
  chips,
}: {
  label: string;
  tone: Tone;
  stats: Array<[string, React.ReactNode]>;
  chips?: string[];
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-200">
          <Badge tone={tone} dot>{""}</Badge>{label}
        </span>
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap justify-end">
          {stats.map(([k, v]) => (
            <span key={k} className="text-[11px] text-gray-500 dark:text-gray-400">
              {k}: <span className="font-mono text-gray-700 dark:text-gray-300">{v ?? "—"}</span>
            </span>
          ))}
        </div>
      </div>
      {chips && chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((c, i) => <Badge key={i} tone="amber">{c}</Badge>)}
        </div>
      )}
    </div>
  );
}

// ─── Adaptive-mapping warnings (stage 4) → readable structure ──────────────────
// Backend emits stage-4 findings as flat strings mixing three shapes; dumping them
// raw is unreadable. Parse into conflicts / readiness checks / notes.
//  • [MAPPING-CONFLICT] target 'X' menerima N sumber. USED: <p> (95%, nama cocok). IGNORED: <p> (95%); …
//  • ✓/⚠/✗ Check N (Title): detail … [field, …]   and   [JOLT-READINESS] Overall: WARNINGS
//  • plain notes (injected / coverage / persisted)

interface MappingConflict { target: string; count: number; used?: string; matched: boolean; ignored: string[] }
interface MappingCheck { level: ReadinessLevel; title: string; detail?: string; items: string[] }
interface ParsedMapping {
  overall: "READY" | "WARNINGS" | "NOT_READY" | null;
  conflicts: MappingConflict[];
  checks: MappingCheck[];
  notes: string[];
}

/** Drop the repetitive "(95%)" / "(95%, nama cocok)" confidence annotation + trailing punctuation. */
const stripConf = (s: string) => s.replace(/\s*\(\d+%[^)]*\)/g, "").replace(/[;.\s]+$/, "").trim();
/** Pull a trailing "[a, b, c]" list from a check message. */
const bracketItems = (s: string): string[] => {
  const m = s.match(/\[([^\]]*)\]\s*$/);
  return m ? m[1].split(",").map((x) => x.trim()).filter(Boolean) : [];
};

function parseMappingWarnings(warnings: string[]): ParsedMapping {
  const out: ParsedMapping = { overall: null, conflicts: [], checks: [], notes: [] };
  for (const raw of warnings) {
    const w = (raw ?? "").trim();
    if (!w) continue;

    const ro = /\[JOLT-READINESS\]\s*Overall:\s*(READY|WARNINGS|NOT_READY)/i.exec(w);
    if (ro) { out.overall = ro[1].toUpperCase() as ParsedMapping["overall"]; continue; }

    if (w.startsWith("[MAPPING-CONFLICT]")) {
      const head = /target\s+'([^']+)'\s+(?:menerima|receives)\s+(\d+)/i.exec(w);
      const usedIdx = w.indexOf("USED:");
      const ignIdx = w.indexOf("IGNORED:");
      let used: string | undefined;
      let matched = false;
      let ignored: string[] = [];
      if (usedIdx >= 0) {
        const usedRaw = w.slice(usedIdx + 5, ignIdx >= 0 ? ignIdx : undefined);
        matched = /nama cocok|name match/i.test(usedRaw);
        used = stripConf(usedRaw);
      }
      if (ignIdx >= 0) {
        ignored = w.slice(ignIdx + 8).split(";").map(stripConf).filter(Boolean);
      }
      out.conflicts.push({ target: head?.[1] ?? "?", count: head ? Number(head[2]) : ignored.length + (used ? 1 : 0), used, matched, ignored });
      continue;
    }

    const chk = /^([✓⚠✗])\s*(.+)$/.exec(w);
    if (chk) {
      const level: ReadinessLevel = chk[1] === "✓" ? "ok" : chk[1] === "✗" ? "error" : "warn";
      const body = chk[2];
      const items = bracketItems(body);
      const titleM = /^(Check\s+\d+\s*\([^)]*\)|[^:]+):\s*(.*)$/.exec(body);
      let title = body;
      let detail: string | undefined;
      if (titleM) {
        title = titleM[1].trim();
        detail = titleM[2].replace(/\[[^\]]*\]\s*$/, "").replace(/[:\s]+$/, "").trim() || undefined;
      }
      out.checks.push({ level, title, detail, items });
      continue;
    }

    out.notes.push(w);
  }
  return out;
}

/** Collapsible summary → content (for long path lists). */
function Expandable({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        {summary}
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

function PathChips({ paths, tone = "gray" }: { paths: string[]; tone?: Tone }) {
  return (
    <div className="flex flex-wrap gap-1">
      {paths.map((p, i) => (
        <code key={i} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${tone === "amber" ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>
          {p}
        </code>
      ))}
    </div>
  );
}

function AdaptiveMappingDetails({
  am,
  channelType,
  categoryId,
}: {
  am: PublishStageAdaptiveMapping;
  channelType?: string;
  categoryId?: string;
}) {
  const parsed = useMemo(() => parseMappingWarnings(am.warnings ?? []), [am.warnings]);
  const overallMeta =
    parsed.overall === "READY" ? { tone: "green" as Tone, label: "READY" }
    : parsed.overall === "WARNINGS" ? { tone: "amber" as Tone, label: "WARNINGS" }
    : parsed.overall === "NOT_READY" ? { tone: "red" as Tone, label: "NOT READY" }
    : null;
  const matchGood = am.status === "OK" || am.status === "EXCELLENT";
  const statusTone: Tone = matchGood ? "green" : am.status === "WARNING" ? "amber" : am.status === "ERROR" ? "red" : "gray";
  // The two axes look contradictory (green "EXCELLENT" next to a red readiness badge) but
  // measure different things — flag it explicitly when they diverge.
  const axesDiverge = matchGood && (parsed.overall === "NOT_READY" || parsed.overall === "WARNINGS");

  return (
    <SectionCard
      title="Adaptive mapping — detail"
      subtitle="konflik pemetaan & pemeriksaan kesiapan JOLT"
      icon={<GitBranchIcon size={16} />}
      // No single header verdict: this section reports TWO axes (match quality + JOLT
      // readiness) shown as labeled cards below, so one badge here would be misread.
    >
      {/* Two distinct axes — label them so EXCELLENT vs NOT READY isn't confusing. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Kualitas pemetaan</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {am.status && <Badge tone={statusTone}>{am.status}</Badge>}
            {am.overallConfidence != null && <span className="text-[11px] text-gray-500 dark:text-gray-400">confidence <span className="font-mono text-gray-700 dark:text-gray-300">{am.overallConfidence.toFixed(0)}%</span></span>}
            {am.totalMappings != null && <span className="text-[11px] text-gray-500 dark:text-gray-400">· <span className="font-mono text-gray-700 dark:text-gray-300">{am.totalMappings}</span> mapping</span>}
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Seberapa yakin field yang <em>berhasil</em> dipetakan.</p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Kesiapan JOLT</p>
          <div className="flex items-center gap-2 mt-1">
            {overallMeta ? <Badge tone={overallMeta.tone} dot>{overallMeta.label}</Badge> : <span className="text-[11px] text-gray-400">—</span>}
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Apakah spec <em>lengkap</em> untuk dipublish (semua required tercakup).</p>
        </div>
      </div>

      {axesDiverge && (
        <div className="mb-3 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-900/10 px-3 py-2">
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            <strong>Bukan kontradiksi.</strong> Match yang dibuat <strong>{am.status}</strong> (berkeyakinan tinggi),
            tapi spec <strong>belum lengkap</strong> — masih ada required target yang belum terpetakan. Jadi kualitas match bagus,
            namun belum siap publish. Lihat daftar pemeriksaan di bawah untuk yang kurang.
          </p>
        </div>
      )}

      {/* Strategy breakdown — per-strategy mapping counts (dynamic, matches the strategy column) */}
      {Object.keys(am.strategyBreakdown ?? {}).length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
            Strategy breakdown
          </p>
          <StrategyBreakdown breakdown={am.strategyBreakdown} />
        </div>
      )}

      {/* Jump to the exact JOLT spec (channel × category) to inspect/fix it — e.g. from a
          Check 1 (Compile) ✗ straight to the editor. Opens in a NEW TAB so this diagnostics
          run (product/store/result live only in component state) isn't lost on navigation. */}
      {channelType && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <Link
            href={`/platform-admin/channel-jolt-specs?channelId=${encodeURIComponent(channelType)}&categoryId=${encodeURIComponent(categoryId ?? "default")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <GitBranchIcon size={13} /> Lihat spec ini ↗
          </Link>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            Buka JOLT spec <code className="font-mono">{channelType}/{categoryId ?? "default"}</code> di tab baru — hasil diagnostics ini tetap tersimpan di sini.
          </span>
        </div>
      )}

      {/* Conflicts — many sources collapsing to one target */}
      {parsed.conflicts.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
            Konflik pemetaan ({parsed.conflicts.length})
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
            Beberapa source memetakan ke satu target — engine memakai satu, sisanya diabaikan. Confidence semua sama (mis. 95%), jadi pilihan bisa sewenang-wenang; pertimbangkan mempersempit source.
          </p>
          <div className="space-y-2">
            {parsed.conflicts.map((c, i) => (
              <div key={i} className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-900/10 px-3 py-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <code className="text-xs font-mono font-medium text-gray-800 dark:text-gray-100">{c.target}</code>
                  <Badge tone="amber">{c.count} sumber</Badge>
                </div>
                {c.used && (
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-1">
                    <span className="text-green-600 dark:text-green-400">✓ dipakai</span>{" "}
                    <code className="font-mono">{c.used}</code>
                    {c.matched && <span className="text-gray-400"> · nama cocok</span>}
                  </p>
                )}
                {c.ignored.length > 0 && (
                  <div className="mt-1.5">
                    <Expandable summary={`${c.ignored.length} sumber lain diabaikan`}>
                      <PathChips paths={c.ignored} />
                    </Expandable>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Readiness checks */}
      {parsed.checks.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
            Pemeriksaan kesiapan JOLT
          </p>
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full">
              <tbody>
                {parsed.checks.map((c, i) => (
                  <tr key={i} className="border-t first:border-t-0 border-gray-100 dark:border-gray-800 align-top">
                    <td className="px-3 py-2 whitespace-nowrap w-24">
                      <Badge tone={READINESS_TONE[c.level]}>{READINESS_MARK[c.level]} {READINESS_LABEL[c.level]}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-xs text-gray-700 dark:text-gray-300">
                        <span className="font-medium">{c.title}</span>
                        {c.detail && <span className="text-gray-500 dark:text-gray-400"> — {c.detail}</span>}
                      </p>
                      {c.items.length > 0 && (
                        <div className="mt-1.5">
                          {c.items.length > 8 ? (
                            <Expandable summary={`${c.items.length} field`}>
                              <PathChips paths={c.items} tone="amber" />
                            </Expandable>
                          ) : (
                            <PathChips paths={c.items} tone="amber" />
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notes */}
      {parsed.notes.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Catatan</p>
          <ul className="space-y-1">
            {parsed.notes.map((n, i) => (
              <li key={i} className="text-[11px] text-gray-500 dark:text-gray-400 flex gap-1.5">
                <span className="text-gray-300 dark:text-gray-600 flex-shrink-0">•</span><span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

function PublishAnalysisResult({ result }: { result: PublishAnalysisResponse }) {
  const score = result.readinessScore ?? 0;
  const ready = result.readyToPublish === true;
  const scoreTone: Tone = score >= 90 ? "green" : score >= 70 ? "amber" : "red";
  const issues = result.issues ?? [];
  const errorCount = issues.filter((i) => i.severity === "ERROR").length;
  const warnCount = issues.filter((i) => i.severity === "WARNING").length;

  const ms = result.masterProduct;
  const cd = result.channelData;
  const merged = result.mergedData;
  const am = result.adaptiveMapping;
  const js = result.joltSpec;
  const tf = result.transformation;
  const pp = result.postProcessing;

  return (
    <div className="space-y-4">
      {/* Verdict + readiness score */}
      <SectionCard
        title="Kesiapan publish"
        subtitle={`${CHANNEL_LABELS[result.channelType ?? ""] ?? result.channelType ?? "—"} · kategori ${result.categoryId ?? "—"}`}
        icon={<GitBranchIcon size={16} />}
        right={<Badge tone={ready ? "green" : errorCount > 0 ? "red" : "amber"} dot>{ready ? "READY" : "NOT READY"}</Badge>}
      >
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Readiness" value={`${score}`} tone={scoreTone} hint="0–100" />
          <StatTile label="Errors" value={errorCount} tone={errorCount > 0 ? "red" : "gray"} />
          <StatTile label="Warnings" value={warnCount} tone={warnCount > 0 ? "amber" : "gray"} />
        </div>
        <div className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
          <div
            className={score >= 90 ? "h-full bg-green-500" : score >= 70 ? "h-full bg-amber-500" : "h-full bg-red-500"}
            style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Dry-run — <strong>tidak</strong> ada yang dipublish. Kategori diresolusi backend (explicit → ProductType.categorySlug → legacy → default).
        </p>
      </SectionCard>

      {/* Issues */}
      {issues.length > 0 && (
        <SectionCard title={`Issues (${issues.length})`} subtitle="severity · kategori · field">
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr className="text-left">
                  <th className="px-3 py-2 text-[11px] font-medium text-gray-500 dark:text-gray-400 w-24">Severity</th>
                  <th className="px-3 py-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">Pesan</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((it, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-800 align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge tone={ISSUE_TONE[it.severity] ?? "gray"}>{it.severity}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-xs text-gray-700 dark:text-gray-300">{it.message}</p>
                      {(it.category || it.field) && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono">
                          {[it.category, it.field].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Suggestions */}
      {(result.suggestions?.length ?? 0) > 0 && (
        <SectionCard title="Saran perbaikan" subtitle="langkah agar siap publish">
          <ul className="space-y-1.5">
            {result.suggestions!.map((s, i) => (
              <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex gap-1.5">
                <span className="text-violet-500 flex-shrink-0">→</span><span>{s}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* 7-stage pipeline summary */}
      <SectionCard title="Pipeline (7 stage)" subtitle="ringkasan tiap tahap dry-run" icon={<ActivityIcon size={16} />}>
        <div className="space-y-2.5">
          <StageRow label="1 · Master Product" tone={ms?.found ? "green" : "red"} stats={[
            ["source", ms?.source],
            ["found", ms ? String(ms.found ?? false) : undefined],
            ["fields", ms?.fieldCount],
            ["variants", ms?.hasVariants ? (ms?.variantCount ?? 0) : 0],
          ]} />
          <StageRow
            label="2 · Channel Data (Step 2)"
            tone={cd == null ? "gray" : cd.step2DataFound ? ((cd.completionPercentage ?? 0) >= 100 ? "green" : "amber") : "gray"}
            stats={[
              ["step2", cd ? String(cd.step2DataFound ?? false) : undefined],
              ["completion", cd?.completionPercentage != null ? `${cd.completionPercentage}%` : undefined],
              ["missing req", cd?.missingRequiredFields?.length ?? undefined],
            ]}
            chips={cd?.missingRequiredFields?.length ? cd.missingRequiredFields : undefined}
          />
          <StageRow label="3 · Merged Data" tone="gray" stats={[["fields", merged?.fieldCount]]} />
          <StageRow
            label="4 · Adaptive Mapping"
            tone={am?.status === "OK" || am?.status === "EXCELLENT" ? "green" : am?.status === "WARNING" ? "amber" : am?.status === "ERROR" ? "red" : "gray"}
            stats={[
              ["status", am?.status],
              ["confidence", am?.overallConfidence != null ? `${am.overallConfidence.toFixed(0)}%` : undefined],
              ["mappings", am?.totalMappings],
              ["warnings", am?.warnings?.length || undefined],
            ]}
          />
          <StageRow label="5 · JOLT Spec" tone={js == null ? "gray" : js.found ? "green" : "red"} stats={[
            ["found", js ? String(js.found ?? false) : undefined],
            ["source", js?.source],
            ["ops", js?.operationCount],
          ]} />
          <StageRow label="6 · Transformation" tone={tf == null ? "gray" : tf.success ? "green" : "red"} stats={[
            ["success", tf ? String(tf.success ?? false) : undefined],
            ["output keys", tf?.outputTopLevelKeys?.length ? tf.outputTopLevelKeys.join(", ") : undefined],
          ]} />
          <StageRow label="7 · Post-Processing" tone="gray" stats={[["rules", pp?.ruleCount ?? pp?.rules?.length]]} />
        </div>
      </SectionCard>

      {/* Source field classification (universal vs channel-specific) */}
      <SourceFieldClassificationCard classification={result.sourceFieldClassification} />

      {/* Stage-4 detail: mapping conflicts + JOLT readiness checks (parsed, not a chip dump) */}
      {(am?.warnings?.length ?? 0) > 0 && (
        <AdaptiveMappingDetails am={am!} channelType={result.channelType} categoryId={result.categoryId ?? "default"} />
      )}

      {/* Transformed output + raw */}
      {tf?.transformedData != null && (
        <SectionCard title="Transformed output" subtitle="hasil transformasi (dry-run, tidak dipublish)">
          <JsonViewer label="transformedData" value={tf.transformedData} />
        </SectionCard>
      )}
      <SectionCard title="Raw response" subtitle="PublishAnalysisResponse penuh">
        <JsonViewer label="raw" value={result} />
      </SectionCard>
    </div>
  );
}
