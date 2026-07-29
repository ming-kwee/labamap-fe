"use client";
/**
 * Publish-Trace Inspector — a DEVELOPER/technical diagnostic panel.
 *
 * Runs the publish pipeline as a dry-run (POST /channels/publish/trace) and shows,
 * stage by stage, what happened to the payload: which JOLT spec won, what JOLT
 * dropped, which post-processing rule built a field, and which attributes the
 * sync-service excludes from the channel body. Answers "why is field X missing?".
 *
 * NOTE ON ALTITUDE: Step 3 is a merchant screen and deliberately hides engine
 * internals (see PublishReadinessCard). This inspector is the ONE exception — it is
 * an opt-in technical tool (per docs/FRONTEND-PUBLISH-TRACE-INSPECTOR.md), so it
 * lives behind a modal and is framed as a developer diagnostic, not merchant UI.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/shared/ui/modal";
import Button from "@/shared/ui/button/Button";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code,
  Copy,
  Database,
  ExternalLink,
  Info,
  RefreshCw,
  Search,
  Zap,
} from "@/shared/ui/icons/Icons";
import { tracePublish } from "@/modules/ecommerce-product-v2/services/publish-trace.service";
import type {
  PublishTraceRequest,
  PublishTraceResponse,
} from "@/modules/ecommerce-product-v2/types/publish-trace";

// ─── Small presentational helpers ─────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
  hint,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</h4>
      </div>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>}
      {children}
    </section>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400"
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? "Copied" : "Copy JSON"}
    </button>
  );
}

/** Collapsible pretty-printed JSON block. */
function JsonBlock({ label, data, defaultOpen = false }: { label: string; data: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const json = useMemo(() => {
    try { return JSON.stringify(data, null, 2); } catch { return String(data); }
  }, [data]);
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800">
      {/* Toggle and CopyButton are siblings — a <button> may not nest inside a <button>. */}
      <div className="flex w-full items-center justify-between px-3 py-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-left text-xs font-medium text-gray-700 dark:text-gray-300"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {label}
        </button>
        {open && <CopyButton value={json} />}
      </div>
      {open && (
        <pre className="max-h-72 overflow-auto border-t border-gray-100 px-3 py-2 text-[11px] leading-relaxed text-gray-700 dark:border-gray-800 dark:text-gray-300">
          {json}
        </pre>
      )}
    </div>
  );
}

function KeyPill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "ok" | "warn" | "bad" | "muted" }) {
  const cls = {
    ok:   "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400",
    warn: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400",
    bad:  "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400",
    muted:"bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  }[tone];
  return <span className={`inline-block rounded px-1.5 py-0.5 font-mono text-[11px] ${cls}`}>{children}</span>;
}

// ─── Field finder ─────────────────────────────────────────────────────────────

type Tone = "ok" | "warn" | "bad" | "muted";
interface FieldTraceRow { stage: string; present: boolean; detail?: string; tone: Tone; }

/** Trace one field name across every pipeline stage. Substring, case-insensitive. */
function traceField(q: string, t: PublishTraceResponse): FieldTraceRow[] {
  const lc = q.trim().toLowerCase();
  if (!lc) return [];
  const match = (k?: string) => !!k && (k.toLowerCase() === lc || k.toLowerCase().includes(lc));
  const keysOf = (o?: Record<string, unknown>) => (o ? Object.keys(o).filter(match) : []);
  const rows: FieldTraceRow[] = [];

  const inMerge = keysOf(t.afterMerge);
  rows.push({ stage: "afterMerge (input transform)", present: inMerge.length > 0, detail: inMerge.join(", ") || undefined, tone: inMerge.length ? "muted" : "warn" });

  const inJolt = keysOf(t.afterJolt);
  rows.push({ stage: "afterJolt (output JOLT)", present: inJolt.length > 0, detail: inJolt.join(", ") || "JOLT tidak menghasilkan field ini", tone: inJolt.length ? "ok" : "warn" });

  const addedBy = (t.postProcessing ?? []).filter((r) => (r.keysAdded ?? []).some(match));
  const removedBy = (t.postProcessing ?? []).filter((r) => (r.keysRemoved ?? []).some(match));
  if (addedBy.length) rows.push({ stage: "post-processing", present: true, detail: `dibangun oleh rule: ${addedBy.map((r) => r.rule).join(", ")}`, tone: "ok" });
  if (removedBy.length) rows.push({ stage: "post-processing", present: false, detail: `dihapus oleh rule: ${removedBy.map((r) => r.rule).join(", ")}`, tone: "bad" });

  const inPost = keysOf(t.afterPostProcessing);
  rows.push({ stage: "afterPostProcessing", present: inPost.length > 0, detail: inPost.join(", ") || undefined, tone: inPost.length ? "muted" : "warn" });

  const staged = (t.stagedKeys ?? []).filter(match);
  if (staged.length) rows.push({ stage: "stagedKeys (_reserved)", present: true, detail: staged.join(", "), tone: "muted" });
  const stripped = (t.stagingKeysStripped ?? []).filter(match);
  if (stripped.length) rows.push({ stage: "stagingKeysStripped", present: false, detail: `${stripped.join(", ")} — di-strip, tak masuk body`, tone: "muted" });

  const attrs = (t.channelAttributes ?? []).filter((a) => match(a.chnlAttrName) || match(a.attrId));
  if (attrs.length) {
    for (const a of attrs) {
      const excluded = !!a.isSupportField || (t.supportFieldsExcludedBySync ?? []).some((n) => n.toLowerCase() === (a.chnlAttrName ?? "").toLowerCase());
      rows.push({
        stage: `channelAttributes → ${a.chnlAttrName ?? a.attrId}`,
        present: !excluded,
        detail: excluded ? "isSupportField=true → DIKECUALIKAN dari body channel" : `type=${a.type ?? "?"} → dikirim ke channel`,
        tone: excluded ? "bad" : "ok",
      });
    }
  } else {
    rows.push({ stage: "channelAttributes (body final)", present: false, detail: "tidak ada di body channel final", tone: "warn" });
  }

  return rows;
}

/** One-line verdict headline for the searched field. */
function fieldVerdict(rows: FieldTraceRow[]): { text: string; tone: Tone } {
  const attrRow = rows.find((r) => r.stage.startsWith("channelAttributes →"));
  if (attrRow) {
    return attrRow.present
      ? { text: "Field ini terkirim ke body channel.", tone: "ok" }
      : { text: "Field ada di channelAttributes tapi DIKECUALIKAN dari body (support field).", tone: "bad" };
  }
  return { text: "Field ini TIDAK sampai ke body channel final.", tone: "warn" };
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  request: PublishTraceRequest;
  /** Human store label (e.g. "My Shopee Store") — passed through to the side-by-side page. */
  storeName?: string;
}

const TONE_TEXT: Record<Tone, string> = {
  ok:   "text-success-700 dark:text-success-400",
  warn: "text-warning-700 dark:text-warning-400",
  bad:  "text-error-700 dark:text-error-400",
  muted:"text-gray-600 dark:text-gray-400",
};

export default function PublishTraceInspector({ isOpen, onClose, request, storeName }: Props) {
  const router = useRouter();
  const [trace, setTrace] = useState<PublishTraceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Hand off to the full-page side-by-side view: stash the request + already-fetched trace
  // (sessionStorage survives same-tab navigation) so the page renders instantly and can re-run.
  const openSideBySide = useCallback(() => {
    try {
      sessionStorage.setItem(`publishTrace_${request.masterProductId}`, JSON.stringify({ request, trace, storeName }));
    } catch { /* quota — the page will re-run from a fresh trace if the stash is missing */ }
    router.push(`/products/${request.masterProductId}/publish/trace`);
  }, [router, request, trace, storeName]);

  const run = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await tracePublish(request, signal);
        if (signal?.aborted) return; // superseded by a newer request — drop stale result
        setTrace(res);
      } catch (err) {
        if (signal?.aborted || (err as Error)?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Trace gagal");
      } finally {
        // Don't flip loading off for an aborted run — the newer run owns the flag now.
        if (!signal?.aborted) setLoading(false);
      }
    },
    [request],
  );

  // Fetch when the modal opens (and re-fetch if the request identity changes).
  useEffect(() => {
    if (!isOpen) return;
    const ctrl = new AbortController();
    run(ctrl.signal);
    return () => ctrl.abort();
  }, [isOpen, run]);

  const fieldRows = useMemo(() => (trace ? traceField(query, trace) : []), [trace, query]);
  const verdict = fieldRows.length ? fieldVerdict(fieldRows) : null;

  const jolt = trace?.joltSpec;
  const isGenerated = jolt?.generatedBy === "ai-agent-v1";
  const excludedSet = useMemo(
    () => new Set((trace?.supportFieldsExcludedBySync ?? []).map((n) => n.toLowerCase())),
    [trace],
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl m-4">
      <div className="flex max-h-[88vh] flex-col">
        {/* Header */}
        <div className="border-b border-gray-100 px-6 py-4 pr-14 dark:border-gray-800">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
            <Code className="h-5 w-5 text-brand-500" />
            Publish-Trace Inspector
          </h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Dry-run pipeline publish — read-only, tidak mengirim ke channel.{" "}
            <span className="font-mono text-xs">{request.channelId ?? "?"}</span> ·{" "}
            <span className="font-mono text-xs">{request.storeId ?? "?"}</span>
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <RefreshCw className="mb-3 h-8 w-8 animate-spin text-brand-500" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Menjalankan trace pipeline…</p>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 dark:border-error-500/30 dark:bg-error-500/10">
              <p className="flex items-center gap-2 font-medium text-error-700 dark:text-error-400">
                <AlertTriangle className="h-4 w-4" /> Trace gagal dipanggil
              </p>
              <p className="mt-1 text-sm text-error-600 dark:text-error-300">{error}</p>
              <Button variant="outline" size="sm" onClick={() => run()} className="mt-3">
                <RefreshCw className="mr-2 h-4 w-4" /> Coba lagi
              </Button>
            </div>
          )}

          {!loading && !error && trace && (
            <>
              {/* Warnings */}
              {(trace.warnings?.length ?? 0) > 0 && (
                <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 dark:border-warning-500/30 dark:bg-warning-500/10">
                  <p className="flex items-center gap-2 text-sm font-medium text-warning-700 dark:text-warning-400">
                    <Info className="h-4 w-4" /> Catatan / warnings
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {trace.warnings!.map((w, i) => (
                      <li key={i} className="text-xs text-warning-700 dark:text-warning-300">• {w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 1. Summary — which JOLT spec won */}
              <Section
                title="Ringkasan resolusi JOLT"
                icon={<Zap className="h-4 w-4 text-brand-500" />}
                hint="Spec mana yang menang — akar-masalah paling sering."
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <SummaryTile label="Source" value={jolt?.source ?? "—"} />
                  <SummaryTile
                    label="Generated by"
                    value={jolt?.generatedBy ?? "—"}
                    tone={isGenerated ? "warn" : "ok"}
                  />
                  <SummaryTile label="Version" value={jolt?.version ?? "—"} />
                  <SummaryTile label="Operations" value={jolt?.operations != null ? String(jolt.operations) : "—"} />
                  <SummaryTile label="Resolved category" value={trace.resolvedCategory ?? "—"} />
                  <SummaryTile label="Channel category id" value={trace.channelCategoryId ?? "—"} />
                </div>
                {isGenerated && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-warning-50 px-3 py-2 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    Spec <code className="font-mono">ai-agent-v1</code> (generated) menang atas seed — field
                    yang tak dipetakan master→apiSchema bisa terjatuh di JOLT. Cek di bawah apakah field
                    dibangun ulang di post-processing.
                  </p>
                )}
                <button
                  onClick={openSideBySide}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Buka side-by-side JOLT | DSL — lihat field per-field
                </button>
              </Section>

              {/* 2. Field finder */}
              <Section
                title="Cari field"
                icon={<Search className="h-4 w-4 text-brand-500" />}
                hint="Ketik nama field (mis. category_id, image, attribute_list) — lihat di tahap mana ia muncul/hilang."
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="nama field…"
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                  />
                </div>
                {query.trim() && verdict && (
                  <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    verdict.tone === "ok"
                      ? "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400"
                      : verdict.tone === "bad"
                        ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400"
                        : "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-400"
                  }`}>
                    {verdict.text}
                  </div>
                )}
                {query.trim() && (
                  <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                    {fieldRows.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2">
                        {r.present ? (
                          <CheckCircle2 className={`mt-0.5 h-4 w-4 flex-shrink-0 ${r.tone === "ok" ? "text-success-500" : "text-gray-400"}`} />
                        ) : (
                          <AlertTriangle className={`mt-0.5 h-4 w-4 flex-shrink-0 ${r.tone === "bad" ? "text-error-500" : "text-warning-500"}`} />
                        )}
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-gray-700 dark:text-gray-300">{r.stage}</p>
                          {r.detail && <p className={`text-xs ${TONE_TEXT[r.tone]}`}>{r.detail}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* 3. Post-processing timeline */}
              <Section
                title={`Post-processing timeline (${trace.postProcessing?.length ?? 0} rule)`}
                icon={<ChevronRight className="h-4 w-4 text-brand-500" />}
                hint="Rule apa yang membangun / mengubah tiap field, urut prioritas."
              >
                {(trace.postProcessing?.length ?? 0) === 0 ? (
                  <p className="text-xs text-gray-400">Tidak ada rule post-processing.</p>
                ) : (
                  <ol className="space-y-2">
                    {trace.postProcessing!.map((r, i) => (
                      <li key={i} className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            #{r.priority ?? i}
                          </span>
                          <span className="font-mono text-xs font-medium text-gray-800 dark:text-gray-200">{r.rule}</span>
                          {r.source && <span className="text-[11px] text-gray-400">{r.source} →</span>}
                          {r.target && <KeyPill tone="muted">{r.target}</KeyPill>}
                        </div>
                        {((r.keysAdded?.length ?? 0) > 0 || (r.keysRemoved?.length ?? 0) > 0) && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {r.keysAdded?.map((k) => <KeyPill key={`a-${k}`} tone="ok">+ {k}</KeyPill>)}
                            {r.keysRemoved?.map((k) => <KeyPill key={`r-${k}`} tone="bad">− {k}</KeyPill>)}
                          </div>
                        )}
                        {r.targetValueAfter !== undefined && (
                          <p className="mt-1 truncate font-mono text-[11px] text-gray-500 dark:text-gray-400" title={JSON.stringify(r.targetValueAfter)}>
                            = {JSON.stringify(r.targetValueAfter)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </Section>

              {/* 4. Final channel attributes */}
              <Section
                title={`Body final — channelAttributes (${trace.channelAttributes?.length ?? 0})`}
                icon={<Database className="h-4 w-4 text-brand-500" />}
                hint="Atribut persis seperti dikirim. Yang ber-badge merah dikecualikan dari body channel."
              >
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
                          const excluded = !!a.isSupportField || excludedSet.has((a.chnlAttrName ?? "").toLowerCase());
                          const hit = query.trim() && (
                            (a.chnlAttrName ?? "").toLowerCase().includes(query.trim().toLowerCase()) ||
                            (a.attrId ?? "").toLowerCase().includes(query.trim().toLowerCase())
                          );
                          return (
                            <tr key={i} className={hit ? "bg-brand-50/60 dark:bg-brand-500/10" : undefined}>
                              <td className="px-3 py-2">
                                <span className="font-mono text-gray-800 dark:text-gray-200">{a.chnlAttrName}</span>
                                {a.attrId && a.attrId !== a.chnlAttrName && (
                                  <span className="ml-1 text-gray-400">({a.attrId})</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{a.type ?? "—"}</td>
                              <td className="max-w-[220px] px-3 py-2">
                                <span className="block truncate font-mono text-gray-600 dark:text-gray-300" title={a.value}>
                                  {a.value ?? "—"}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                {excluded ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-error-50 px-1.5 py-0.5 font-medium text-error-700 dark:bg-error-500/10 dark:text-error-400">
                                    excluded
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-success-50 px-1.5 py-0.5 font-medium text-success-700 dark:bg-success-500/10 dark:text-success-400">
                                    sent
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {(trace.supportFieldsExcludedBySync?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>Dikecualikan sync-service:</span>
                    {trace.supportFieldsExcludedBySync!.map((n) => (
                      <KeyPill key={n} tone="bad">{n}</KeyPill>
                    ))}
                  </div>
                )}
              </Section>

              {/* Raw stage snapshots */}
              <Section title="Snapshot mentah per-tahap" icon={<Code className="h-4 w-4 text-brand-500" />}>
                <div className="space-y-2">
                  <JsonBlock label="afterMerge" data={trace.afterMerge} />
                  <JsonBlock label="afterJolt" data={trace.afterJolt} />
                  <JsonBlock label="stagedKeys" data={trace.stagedKeys} />
                  <JsonBlock label="afterPostProcessing" data={trace.afterPostProcessing} />
                  <JsonBlock label="Full response" data={trace} />
                </div>
              </Section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3 dark:border-gray-800">
          <span className="text-xs text-gray-400">Read-only diagnostic · aman diulang</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => run()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Jalankan ulang
            </Button>
            <Button size="sm" onClick={onClose}>Tutup</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const valueCls =
    tone === "warn"
      ? "text-warning-700 dark:text-warning-400"
      : tone === "ok"
        ? "text-gray-800 dark:text-gray-200"
        : "text-gray-800 dark:text-gray-200";
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2 dark:border-gray-800 dark:bg-gray-800/30">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 truncate font-mono text-sm font-medium ${valueCls}`} title={value}>{value}</p>
    </div>
  );
}
