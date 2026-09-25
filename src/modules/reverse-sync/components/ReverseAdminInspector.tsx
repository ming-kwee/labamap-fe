"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ReverseSyncService } from "../services/reverse.service";
import type { ReverseJoltSpec } from "../types/reverse";
import { ChannelConfigService } from "@/app/(admin)/platform-admin/channel-configurations/_services/channel-configuration.service";
import type { ChannelConfiguration } from "@/app/(admin)/platform-admin/channel-configurations/_types/channel-configuration";

/**
 * Reverse Readiness / Coverage Dashboard (Phase A — MVP) — docs/reversesync/13.
 *
 * Repurposes the old single-channel "Reverse Sync Inspector" into a CROSS-CHANNEL cockpit:
 * "which channels are reverse-ready, and where are the config gaps?". Breadth (fleet view) —
 * the Reverse Playground stays the depth (one payload, stage-by-stage) tool; deep-link bridges them.
 *
 * Phase A is FE-only (no new BFF): reuses ChannelConfigService.listConfigs() for readiness flags/ops
 * (read from reverseSyncConfig, data-driven) + ReverseSyncService.getJoltSpec(channelId) per channel for
 * the reversible-field / ambiguous counts. Phase B adds GET /reverse/coverage for accurate coverage metrics.
 *
 * Read-only. No writes to master/Step-2/channel.
 */

const PLAYGROUND_PATH = "/platform-admin/reverse-post-processing-playground";

/** Reverse op-codes live in reverseSyncConfig.operations[] ({op,...}); detect by scanning them (data-driven). */
function opsOf(rsc: Record<string, unknown> | undefined): Set<string> {
  const ops = Array.isArray(rsc?.operations) ? (rsc!.operations as unknown[]) : [];
  const set = new Set<string>();
  for (const o of ops) {
    const code = o && typeof o === "object" ? String((o as Record<string, unknown>).op ?? "") : "";
    if (code) set.add(code);
  }
  return set;
}

function aggregateCount(rsc: Record<string, unknown> | undefined): number {
  const ops = Array.isArray(rsc?.operations) ? (rsc!.operations as unknown[]) : [];
  return ops.filter((o) => o && typeof o === "object" && String((o as Record<string, unknown>).op ?? "") === "AGGREGATE").length;
}

interface Readiness {
  seeded: boolean;
  webhook: boolean;
  pull: boolean;
  rebase: boolean;
  variant: boolean;
  image: boolean;
  attrList: boolean;
  metafield: boolean;
  deriveScalar: boolean;
  enrichers: number;
  ops: string[];
}

function readinessOf(config: ChannelConfiguration): Readiness {
  const rsc = config.reverseSyncConfig;
  const set = opsOf(rsc);
  return {
    seeded: !!rsc && Object.keys(rsc).length > 0,
    webhook: Boolean(rsc?.webhookEnabled),
    pull: Array.isArray(rsc?.readEndpoints) && (rsc!.readEndpoints as unknown[]).length > 0,
    rebase: set.has("REBASE_ITEM"),
    variant: set.has("VARIANT_INVERSE"),
    image: set.has("IMAGE_INVERSE"),
    attrList: set.has("ATTRIBUTE_LIST"),
    metafield: set.has("METAFIELD_INVERSE"),
    deriveScalar: set.has("DERIVE_SCALAR"),
    enrichers: aggregateCount(rsc),
    ops: [...set],
  };
}

/** Per-channel reverse-JOLT counts (from getJoltSpec) — injective (reversible) + many-to-one excluded. */
interface SpecCounts {
  loading: boolean;
  error: boolean;
  reversible: number;   // Object.keys(spec.spec).length
  ambiguous: number;    // spec.ambiguousExcluded.length
  spec: ReverseJoltSpec | null;
}

export default function ReverseAdminInspector() {
  const [configs, setConfigs] = useState<ChannelConfiguration[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [counts, setCounts] = useState<Record<string, SpecCounts>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoadingConfigs(true);
    let list: ChannelConfiguration[] = [];
    try {
      list = await ChannelConfigService.listConfigs();
    } catch {
      /* leave empty — empty state renders */
    }
    setConfigs(list);
    setLoadingConfigs(false);

    // Load each channel's reverse-JOLT projection in parallel for the reversible/ambiguous counts.
    setCounts(Object.fromEntries(list.map((c) => [c.channelId, { loading: true, error: false, reversible: 0, ambiguous: 0, spec: null }])));
    await Promise.allSettled(
      list.map(async (c) => {
        try {
          const spec = await ReverseSyncService.getJoltSpec(c.channelId);
          setCounts((prev) => ({
            ...prev,
            [c.channelId]: {
              loading: false, error: false,
              reversible: Object.keys(spec.spec ?? {}).length,
              ambiguous: (spec.ambiguousExcluded ?? []).length,
              spec,
            },
          }));
        } catch {
          setCounts((prev) => ({ ...prev, [c.channelId]: { loading: false, error: true, reversible: 0, ambiguous: 0, spec: null } }));
        }
      }),
    );
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const seededCount = useMemo(() => configs.filter((c) => readinessOf(c).seeded).length, [configs]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reverse Readiness</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Cross-channel view of reverse-sync config health (channel → master). Read-only. For a single product
            stage-by-stage, use the <Link href={PLAYGROUND_PATH} className="font-medium text-brand-500 hover:text-brand-600">Reverse Playground</Link>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!loadingConfigs && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {configs.length} channel{configs.length !== 1 ? "s" : ""} · {seededCount} reverse-seeded
            </span>
          )}
          <button
            onClick={loadAll}
            disabled={loadingConfigs}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {loadingConfigs ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      ) : configs.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.02]">
          No channel configurations found.
        </div>
      ) : (
        <ReadinessMatrix configs={configs} counts={counts} expanded={expanded} onToggle={(id) => setExpanded((p) => (p === id ? null : id))} />
      )}
    </div>
  );
}

// ─── F1 readiness matrix ─────────────────────────────────────────────────────────

function ReadinessMatrix({
  configs, counts, expanded, onToggle,
}: {
  configs: ChannelConfiguration[];
  counts: Record<string, SpecCounts>;
  expanded: string | null;
  onToggle: (channelId: string) => void;
}) {
  const cols = ["Webhook", "Pull", "Variant", "Image", "Attr list", "Metafield"];
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400 dark:bg-gray-800/50 dark:text-gray-500">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Channel</th>
            {cols.map((c) => <th key={c} className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{c}</th>)}
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap" title="Reversible fields (injective correspondence)">↦ master</th>
            <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap" title="Many-to-one targets skipped (reverse can't guess)">ambiguous</th>
            <th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {configs.map((c) => {
            const r = readinessOf(c);
            const cnt = counts[c.channelId];
            const isOpen = expanded === c.channelId;
            return (
              <React.Fragment key={c.channelId}>
                <tr
                  className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 cursor-pointer"
                  onClick={() => onToggle(c.channelId)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`transition-transform text-gray-400 ${isOpen ? "rotate-90" : ""}`}>›</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">{c.channelName || c.channelId}</span>
                      {!r.seeded && (
                        <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">not seeded</span>
                      )}
                    </div>
                  </td>
                  <Dot on={r.webhook} />
                  <Dot on={r.pull} />
                  <Dot on={r.variant} />
                  <Dot on={r.image} />
                  <Dot on={r.attrList} />
                  <Dot on={r.metafield} />
                  <td className="px-3 py-2.5 text-center tabular-nums">
                    {cnt?.loading ? <span className="text-gray-300">…</span>
                      : cnt?.error ? <span className="text-gray-300" title="failed to load">—</span>
                      : <span className="font-medium text-brand-600 dark:text-brand-400">{cnt?.reversible ?? 0}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums">
                    {cnt?.loading ? <span className="text-gray-300">…</span>
                      : (cnt?.ambiguous ?? 0) > 0 ? <span className="font-medium text-amber-600 dark:text-amber-400">{cnt?.ambiguous}</span>
                      : <span className="text-gray-300 dark:text-gray-600">0</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <Link
                      href={PLAYGROUND_PATH}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] font-medium text-brand-500 hover:text-brand-600"
                    >
                      Trace →
                    </Link>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-t border-gray-100 bg-gray-50/40 dark:border-gray-800 dark:bg-gray-900/30">
                    <td colSpan={cols.length + 4} className="px-4 py-4">
                      <ChannelDetail config={c} readiness={r} counts={cnt} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A green/gray capability dot cell. */
function Dot({ on }: { on: boolean }) {
  return (
    <td className="px-2 py-2.5 text-center">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${on ? "bg-emerald-500" : "bg-gray-200 dark:bg-gray-700"}`}
        title={on ? "yes" : "no"}
      />
    </td>
  );
}

// ─── Row detail (F3 ops chips + F4 webhook + apiVersion + P6 reverse-JOLT table + F5 deep-link) ──────

function ChannelDetail({
  config, readiness, counts,
}: {
  config: ChannelConfiguration;
  readiness: Readiness;
  counts?: SpecCounts;
}) {
  const webhookUrl = `/api/v1/webhooks/${config.channelId}/products-update`;
  return (
    <div className="space-y-4">
      {/* F3 — reverse ops configured (chips from reverseSyncConfig, data-driven) */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Reverse ops configured</p>
        {readiness.ops.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">None — reverseSyncConfig has no operations (add config to enable; no code needed).</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {readiness.ops.map((op) => (
              <span key={op} className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[11px] text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">{op}</span>
            ))}
            {readiness.enrichers > 0 && (
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300">{readiness.enrichers} enricher{readiness.enrichers !== 1 ? "s" : ""}</span>
            )}
          </div>
        )}
      </div>

      {/* F4 — webhook + apiVersion */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-gray-800 dark:bg-white/[0.02]">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Webhook {readiness.webhook ? "(enabled)" : "(disabled)"}</span>
          <code className="mt-0.5 block break-all font-mono text-[11px] text-gray-700 dark:text-gray-300">{webhookUrl}</code>
        </div>
        <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-gray-800 dark:bg-white/[0.02]">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">API version (reverse pull fallback)</span>
          <code className="mt-0.5 block font-mono text-[11px] text-gray-700 dark:text-gray-300">{config.apiVersion || "—"}</code>
        </div>
      </div>

      {/* P6 — reverse-JOLT projection (detail-expand, reused) */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Reverse-JOLT projection (channel → master)
        </p>
        {counts?.loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : counts?.error ? (
          <p className="text-xs text-error-500">Failed to load reverse-JOLT projection.</p>
        ) : counts?.spec ? (
          <ReverseJoltTable spec={counts.spec} />
        ) : (
          <p className="text-xs text-gray-400">No projection.</p>
        )}
      </div>

      {/* F5 — deep-link to the Playground (breadth → depth) */}
      <div>
        <Link
          href={PLAYGROUND_PATH}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600"
        >
          Trace a product in the Playground →
        </Link>
      </div>
    </div>
  );
}

// ─── P6 table (reused verbatim) ──────────────────────────────────────────────────

function ReverseJoltTable({ spec }: { spec: ReverseJoltSpec }) {
  const rows = Object.entries(spec.spec ?? {});
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
          No injective field mappings — nothing can be read back deterministically for this channel.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400 dark:bg-gray-800/50 dark:text-gray-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Channel path</th>
                <th className="px-4 py-2 font-semibold" />
                <th className="px-4 py-2 font-semibold">Master field</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([channelPath, masterField]) => (
                <tr key={channelPath} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-2 font-mono text-xs text-gray-700 dark:text-gray-300">{channelPath}</td>
                  <td className="px-2 py-2 text-center text-gray-300 dark:text-gray-600">→</td>
                  <td className="px-4 py-2 font-mono text-xs font-medium text-brand-600 dark:text-brand-400">{masterField}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {spec.ambiguousExcluded.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Excluded — many-to-one ({spec.ambiguousExcluded.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {spec.ambiguousExcluded.map((p) => (
              <span
                key={p}
                className="rounded-md bg-amber-50 px-2 py-0.5 font-mono text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
                title="Skipped: many channel paths map to one master field — not invertible"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {spec.note && <p className="text-[11px] italic text-gray-400 dark:text-gray-500">{spec.note}</p>}
    </div>
  );
}
