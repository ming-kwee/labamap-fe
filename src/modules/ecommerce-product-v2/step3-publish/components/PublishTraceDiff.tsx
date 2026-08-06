"use client";
/**
 * Publish-Trace Diff — full-page, side-by-side JOLT | DSL view.
 *
 * The Publish-Trace Inspector (modal) stacks the pipeline vertically; this page lays the
 * same trace out as the pipeline actually reads: left = JOLT (spec + output), right = the
 * "DSL" layer (post-processing → afterPostProcessing → the final channelAttributes body).
 * The hero is an aligned per-field lineage table so a technical user sees, in one glance,
 * exactly what reaches the channel and WHY each field survived, was built, or was dropped.
 *
 * Data source: the inspector stashes { request, trace } into sessionStorage under
 * `publishTrace_{masterProductId}` before navigating here. No backend change — this is a
 * pure re-rendering of the existing POST /channels/publish/trace response.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  Database,
  Info,
  RefreshCw,
  Zap,
} from "@/shared/ui/icons/Icons";
import Button from "@/shared/ui/button/Button";
import ChannelTypeBadge from "@/modules/ecommerce-product-v2/step2-channel-fields/components/stores/ChannelTypeBadge";
import type { ChannelType } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";
import { tracePublish } from "@/modules/ecommerce-product-v2/services/publish-trace.service";
import type {
  PublishTraceChannelAttribute,
  PublishTraceGate,
  PublishTraceRequest,
  PublishTraceResponse,
} from "@/modules/ecommerce-product-v2/types/publish-trace";
import SchemaStaleBadge, { deriveStaleStatus } from "./SchemaStaleBadge";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Tone = "ok" | "warn" | "bad" | "muted";

const TONE_PILL: Record<Tone, string> = {
  ok:   "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400",
  warn: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400",
  bad:  "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400",
  muted:"bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

/** Channel attr names carry no `product.` prefix; JOLT output keys sometimes do. Normalise. */
function norm(s: string): string {
  return s.replace(/^product\./, "").toLowerCase();
}

interface LineageRow {
  field: string;
  inJolt: boolean;
  joltValue?: unknown;
  inBody: boolean;
  bodyValue?: string;
  origin: string;
  tone: Tone;
}

/**
 * Align every field across the pipeline into one row: what JOLT produced (left) vs whether
 * it reaches the channel body (right) and how it got there. Union of afterJolt keys,
 * afterPostProcessing keys, channelAttributes, and post-processing keysAdded.
 */
function buildLineage(t: PublishTraceResponse): LineageRow[] {
  const jolt = t.afterJolt ?? {};
  const post = t.afterPostProcessing ?? {};
  const attrs = t.channelAttributes ?? [];
  const excluded = new Set((t.supportFieldsExcludedBySync ?? []).map((n) => n.toLowerCase()));
  const stripped = new Set((t.stagingKeysStripped ?? []).map(norm));

  const joltKeyByNorm = new Map<string, string>();
  for (const k of Object.keys(jolt)) joltKeyByNorm.set(norm(k), k);

  const bodyByName = new Map<string, PublishTraceChannelAttribute>();
  for (const a of attrs) if (a.chnlAttrName) bodyByName.set(norm(a.chnlAttrName), a);

  const builtBy = new Map<string, string[]>();
  const removedBy = new Map<string, string[]>();
  for (const r of t.postProcessing ?? []) {
    for (const k of r.keysAdded ?? []) builtBy.set(norm(k), [...(builtBy.get(norm(k)) ?? []), r.rule ?? "rule"]);
    for (const k of r.keysRemoved ?? []) removedBy.set(norm(k), [...(removedBy.get(norm(k)) ?? []), r.rule ?? "rule"]);
  }

  const display = new Map<string, string>();
  const add = (name: string) => { const n = norm(name); if (!display.has(n)) display.set(n, name.replace(/^product\./, "")); };
  Object.keys(jolt).forEach(add);
  Object.keys(post).forEach(add);
  attrs.forEach((a) => a.chnlAttrName && add(a.chnlAttrName));
  builtBy.forEach((_, k) => { if (!display.has(k)) display.set(k, k); });

  const rows: LineageRow[] = [];
  for (const [n, disp] of display) {
    const joltKey = joltKeyByNorm.get(n);
    const inJolt = joltKey !== undefined;
    const joltValue = inJolt ? (jolt as Record<string, unknown>)[joltKey] : undefined;
    const attr = bodyByName.get(n);
    const isExcluded = attr ? (!!attr.isSupportField || excluded.has((attr.chnlAttrName ?? "").toLowerCase())) : false;
    const inBody = !!attr && !isExcluded;

    let origin: string;
    let tone: Tone;
    if (attr && isExcluded)          { origin = "excluded — support field"; tone = "bad"; }
    else if (inBody && inJolt)       { origin = "passthrough (JOLT → body)"; tone = "ok"; }
    else if (inBody && builtBy.has(n)) { origin = `dibangun: ${builtBy.get(n)!.join(", ")}`; tone = "ok"; }
    else if (inBody)                 { origin = "dari post-processing"; tone = "ok"; }
    else if (removedBy.has(n))       { origin = `dihapus rule: ${removedBy.get(n)!.join(", ")}`; tone = "bad"; }
    else if (stripped.has(n))        { origin = "staging key di-strip"; tone = "muted"; }
    else if (inJolt)                 { origin = "JOLT hasilkan, tak sampai body"; tone = "warn"; }
    else                             { origin = "tak masuk body"; tone = "warn"; }

    rows.push({ field: disp, inJolt, joltValue, inBody, bodyValue: attr?.value, origin, tone });
  }

  // Problems first (excluded/dropped), so the debug-worthy fields sit at the top.
  const order: Record<Tone, number> = { bad: 0, warn: 1, ok: 2, muted: 3 };
  rows.sort((a, b) => order[a.tone] - order[b.tone] || a.field.localeCompare(b.field));
  return rows;
}

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[11px] ${TONE_PILL[tone]}`}>{children}</span>;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400"
    >
      <Copy className="h-3.5 w-3.5" />{copied ? "Copied" : "Copy JSON"}
    </button>
  );
}

function JsonBlock({ label, data, defaultOpen = false }: { label: string; data: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const json = useMemo(() => { try { return JSON.stringify(data, null, 2); } catch { return String(data); } }, [data]);
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800">
      <div className="flex w-full items-center justify-between px-3 py-2">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}{label}
        </button>
        {open && <CopyButton value={json} />}
      </div>
      {open && (
        <pre className="max-h-80 overflow-auto border-t border-gray-100 px-3 py-2 text-[11px] leading-relaxed text-gray-700 dark:border-gray-800 dark:text-gray-300">{json}</pre>
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const cls = tone === "warn" ? "text-warning-700 dark:text-warning-400" : "text-gray-800 dark:text-gray-200";
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 dark:border-gray-800 dark:bg-gray-800/30">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 truncate font-mono text-sm font-medium ${cls}`} title={value}>{value}</p>
    </div>
  );
}

function ColumnHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      {icon}
      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
}

// ─── Gate stage (preflight + semantic) ───────────────────────────────────────────

function GateSection({ gate }: { gate: PublishTraceGate }) {
  const pf = gate.preflight;
  const sem = gate.semantic;
  const blocked = gate.wouldBlockPublish === true;
  const semTokens = sem?.knowledgeTokensLoaded;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        {blocked
          ? <AlertTriangle className="h-4 w-4 text-error-500" />
          : <CheckCircle2 className="h-4 w-4 text-success-500" />}
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Gate</h3>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">preflight + semantic — di publish nyata MEMBLOKIR (di trace hanya dicatat)</span>
      </div>

      {/* Overall verdict */}
      <div className={`mb-3 rounded-lg border px-3 py-2 text-sm font-medium ${
        blocked
          ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
          : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
      }`}>
        {blocked ? "Publish nyata AKAN diblok gate — perbaiki penyebab di bawah." : "Gate lolos — tak ada blocker."}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Preflight */}
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <p className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">Preflight — field wajib merchant</p>
          {!pf?.ran ? (
            <p className="text-xs text-gray-400">Tidak dijalankan.</p>
          ) : pf.passed ? (
            <p className="flex items-center gap-1.5 text-xs text-success-700 dark:text-success-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Lolos — semua field wajib terisi.
            </p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-error-700 dark:text-error-400">{pf.missingFields?.length ?? 0} field wajib hilang/invalid:</p>
              <ul className="space-y-1">
                {pf.missingFields?.map((f, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-1.5">
                    <Pill tone="bad">{f.label || f.field || "field"}</Pill>
                    {f.reason && <span className="text-[11px] text-gray-500 dark:text-gray-400">{f.reason}</span>}
                    {f.source && <span className="font-mono text-[10px] text-gray-400">{f.source}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Semantic */}
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <p className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">Semantic validator — cegah scramble mapping</p>
          {!sem?.ran ? (
            <p className="flex items-start gap-1.5 text-xs text-warning-700 dark:text-warning-400">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Fail-open — knowledge base kosong{semTokens != null ? ` (${semTokens} token)` : ""}. Spec TIDAK divalidasi (bukan berarti aman).
            </p>
          ) : sem.passed ? (
            <p className="flex items-center gap-1.5 text-xs text-success-700 dark:text-success-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Lolos — tak ada mismatch{semTokens != null ? ` · ${semTokens} token` : ""}.
            </p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-error-700 dark:text-error-400">{sem.violations?.length ?? 0} mismatch semantik:</p>
              <ul className="space-y-1">
                {sem.violations?.map((v, i) => (
                  <li key={i} className="rounded border border-error-200 bg-error-50/60 px-2 py-1 dark:border-error-500/30 dark:bg-error-500/10">
                    <span className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                      <span className="text-gray-800 dark:text-gray-200">{v.sourceField}</span>
                      <span className="text-gray-400">→</span>
                      <span className="text-gray-800 dark:text-gray-200">{v.targetPath}</span>
                      {(v.sourceType || v.targetType) && (
                        <span className="text-error-600 dark:text-error-400">({v.sourceType ?? "?"} ≠ {v.targetType ?? "?"})</span>
                      )}
                    </span>
                    {v.message && <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{v.message}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Stashed payload ────────────────────────────────────────────────────────────

interface Stashed {
  request: PublishTraceRequest;
  trace: PublishTraceResponse | null;
  storeName?: string;
}

function readStash(masterProductId: string): Stashed | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`publishTrace_${masterProductId}`);
    return raw ? (JSON.parse(raw) as Stashed) : null;
  } catch { return null; }
}

// ─── Page component ──────────────────────────────────────────────────────────────

export default function PublishTraceDiff({ masterProductId }: { masterProductId: string }) {
  const [request, setRequest] = useState<PublishTraceRequest | null>(null);
  const [trace, setTrace] = useState<PublishTraceResponse | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publishHref = `/products/${masterProductId}/publish`;

  useEffect(() => {
    const stash = readStash(masterProductId);
    if (stash) {
      setRequest(stash.request);
      setTrace(stash.trace);
      setStoreName(stash.storeName ?? null);
    }
  }, [masterProductId]);

  const rerun = useCallback(async () => {
    if (!request) return;
    setLoading(true);
    setError(null);
    try {
      const res = await tracePublish(request);
      setTrace(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trace gagal");
    } finally {
      setLoading(false);
    }
  }, [request]);

  const jolt = trace?.joltSpec;
  const isGenerated = jolt?.generatedBy === "ai-agent-v1";
  // Staleness only applies to a stored generated spec (docs §6).
  const isGeneratedSpec = jolt?.source === "channel_jolt_specs";
  const staleStatus = deriveStaleStatus(jolt?.schemaStale);
  const lineage = useMemo(() => (trace ? buildLineage(trace) : []), [trace]);
  const sentCount = lineage.filter((r) => r.inBody).length;

  // No stashed data (e.g. opened as a deep link) — guide back to the inspector.
  if (!request && !trace) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <Info className="mx-auto mb-3 h-8 w-8 text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Tidak ada data trace</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Buka halaman ini dari tombol <strong>Side-by-side JOLT | DSL</strong> di Publish-Trace Inspector
          (Step 3 → Diagnostik), supaya datanya terisi.
        </p>
        <Link href={publishHref} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Publish
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={publishHref} className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400">
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Publish
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-white">
            <Code className="h-5 w-5 text-brand-500" /> Publish Trace — JOLT | DSL
          </h1>
          {/* Which channel store this trace is for */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <ChannelTypeBadge channelType={(request?.channelId ?? trace?.channelId ?? "") as ChannelType} size="sm" />
            {storeName && <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{storeName}</span>}
            <span className="font-mono text-xs text-gray-400">{request?.storeId ?? trace?.storeId ?? "?"}</span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Dry-run pipeline — apa yang benar-benar dikirim ke channel & kenapa.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={rerun} disabled={loading || !request}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Jalankan ulang
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 dark:border-error-500/30 dark:bg-error-500/10">
          <p className="flex items-center gap-2 font-medium text-error-700 dark:text-error-400">
            <AlertTriangle className="h-4 w-4" /> Trace gagal dipanggil
          </p>
          <p className="mt-1 text-sm text-error-600 dark:text-error-300">{error}</p>
        </div>
      )}

      {trace && (
        <>
          {/* Warnings (also where the preflight/semantic GATE surfaces today) */}
          {(trace.warnings?.length ?? 0) > 0 && (
            <div className="mb-4 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 dark:border-warning-500/30 dark:bg-warning-500/10">
              <p className="flex items-center gap-2 text-sm font-medium text-warning-700 dark:text-warning-400">
                <Info className="h-4 w-4" /> Catatan / gate warnings
              </p>
              <ul className="mt-1.5 space-y-1">
                {trace.warnings!.map((w, i) => (
                  <li key={i} className="text-xs text-warning-700 dark:text-warning-300">• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* JOLT resolution summary */}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryTile label="JOLT source" value={jolt?.source ?? "—"} />
            <SummaryTile label="Generated by" value={jolt?.generatedBy ?? "—"} tone={isGenerated ? "warn" : undefined} />
            <SummaryTile label="Version" value={jolt?.version ?? "—"} />
            <SummaryTile label="Operations" value={jolt?.operations != null ? String(jolt.operations) : "—"} />
            <SummaryTile label="Resolved category" value={trace.resolvedCategory ?? "—"} />
            <SummaryTile label="Field ke body" value={`${sentCount} / ${lineage.length}`} />
          </div>

          {/* Schema-staleness — STALE means this generated spec targets an OLD apiSchema.
              The badge chip carries the target apiVersion (docs §2). */}
          {isGeneratedSpec && (
            <div className="mb-5">
              <SchemaStaleBadge status={staleStatus} apiVersion={jolt?.apiVersion} showFresh />
            </div>
          )}

          {/* GATE — preflight + semantic (merge → jolt → GATE → DSL) */}
          {trace.gate && <GateSection gate={trace.gate} />}

          {/* HERO — aligned per-field lineage (JOLT → DSL/body) */}
          <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.3fr)] items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
              <span>Field</span>
              <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> JOLT (kiri)</span>
              <span className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" /> DSL / body channel (kanan)</span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {lineage.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-gray-400">Tidak ada field untuk ditampilkan.</p>
              ) : (
                lineage.map((r, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.3fr)] items-center gap-2 px-3 py-2">
                    <span className="truncate font-mono text-xs font-medium text-gray-800 dark:text-gray-200" title={r.field}>{r.field}</span>
                    <span className="truncate font-mono text-[11px] text-gray-600 dark:text-gray-300" title={r.inJolt ? fmt(r.joltValue) : "tidak dihasilkan JOLT"}>
                      {r.inJolt ? fmt(r.joltValue) : <span className="text-gray-400">— tak dihasilkan JOLT</span>}
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ArrowRight className="h-3 w-3 flex-shrink-0 text-gray-300 dark:text-gray-600" />
                      {r.inBody
                        ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-success-500" />
                        : <AlertTriangle className={`h-3.5 w-3.5 flex-shrink-0 ${r.tone === "bad" ? "text-error-500" : "text-warning-500"}`} />}
                      <Pill tone={r.tone}>{r.origin}</Pill>
                      {r.inBody && r.bodyValue != null && (
                        <span className="truncate font-mono text-[11px] text-gray-500 dark:text-gray-400" title={r.bodyValue}>{r.bodyValue}</span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Two-column raw detail */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* LEFT — JOLT */}
            <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <ColumnHeader icon={<Zap className="h-4 w-4 text-brand-500" />} title="JOLT" subtitle="spec yang menang + input & output transform" />
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <SummaryTile label="Source" value={jolt?.source ?? "—"} />
                  <SummaryTile label="Operations" value={jolt?.operations != null ? String(jolt.operations) : "—"} />
                </div>
                {isGenerated && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    Spec <code className="font-mono">ai-agent-v1</code> (generated) menang — field yang tak dipetakan master→apiSchema bisa terjatuh di JOLT.
                  </p>
                )}
                <JsonBlock label="afterMerge (input transform)" data={trace.afterMerge} />
                <JsonBlock label="afterJolt (output JOLT)" data={trace.afterJolt} defaultOpen />
                {(trace.stagedKeys?.length ?? 0) > 0 && <JsonBlock label={`stagedKeys (${trace.stagedKeys!.length})`} data={trace.stagedKeys} />}
              </div>
            </section>

            {/* RIGHT — DSL (post-proc → afterPostProcessing → channelAttributes) */}
            <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <ColumnHeader icon={<Database className="h-4 w-4 text-brand-500" />} title="DSL / body channel" subtitle="post-processing → afterPostProcessing → body final" />
              <div className="space-y-3">
                {/* Post-processing timeline */}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                    Post-processing ({trace.postProcessing?.length ?? 0} rule)
                  </p>
                  {(trace.postProcessing?.length ?? 0) === 0 ? (
                    <p className="text-xs text-gray-400">Tidak ada rule post-processing.</p>
                  ) : (
                    <ol className="space-y-1.5">
                      {trace.postProcessing!.map((r, i) => (
                        <li key={i} className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">#{r.priority ?? i}</span>
                            <span className="font-mono text-xs font-medium text-gray-800 dark:text-gray-200">{r.rule}</span>
                            {r.target && <Pill tone="muted">{r.target}</Pill>}
                          </div>
                          {((r.keysAdded?.length ?? 0) > 0 || (r.keysRemoved?.length ?? 0) > 0) && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {r.keysAdded?.map((k) => <Pill key={`a-${k}`} tone="ok">+ {k}</Pill>)}
                              {r.keysRemoved?.map((k) => <Pill key={`r-${k}`} tone="bad">− {k}</Pill>)}
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <JsonBlock label="afterPostProcessing (dokumen DSL)" data={trace.afterPostProcessing} />

                {/* Final channel attributes */}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                    Body final — channelAttributes ({trace.channelAttributes?.length ?? 0})
                  </p>
                  {(trace.channelAttributes?.length ?? 0) === 0 ? (
                    <p className="text-xs text-gray-400">Tidak ada channelAttributes.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
                          <tr>
                            <th className="px-3 py-2 font-medium">Attribute</th>
                            <th className="px-3 py-2 font-medium">Type</th>
                            <th className="px-3 py-2 font-medium">Value</th>
                            <th className="px-3 py-2 font-medium">Body?</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {trace.channelAttributes!.map((a, i) => {
                            const isExcluded = !!a.isSupportField || (trace.supportFieldsExcludedBySync ?? []).some((n) => n.toLowerCase() === (a.chnlAttrName ?? "").toLowerCase());
                            return (
                              <tr key={i}>
                                <td className="px-3 py-2 font-mono text-gray-800 dark:text-gray-200">{a.chnlAttrName}</td>
                                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{a.type ?? "—"}</td>
                                <td className="max-w-[200px] px-3 py-2"><span className="block truncate font-mono text-gray-600 dark:text-gray-300" title={a.value}>{a.value ?? "—"}</span></td>
                                <td className="px-3 py-2">
                                  {isExcluded
                                    ? <Pill tone="bad">excluded</Pill>
                                    : <Pill tone="ok">sent</Pill>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>

          <div className="mt-4">
            <JsonBlock label="Full trace response (raw)" data={trace} />
          </div>
        </>
      )}
    </div>
  );
}
