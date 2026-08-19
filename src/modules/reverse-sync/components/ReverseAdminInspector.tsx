"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ReverseSyncService, ReverseApiError } from "../services/reverse.service";
import type { ReverseJoltSpec } from "../types/reverse";
import { ChannelConfigService } from "@/app/(admin)/platform-admin/channel-configurations/_services/channel-configuration.service";
import type { ChannelConfiguration } from "@/app/(admin)/platform-admin/channel-configurations/_types/channel-configuration";

/**
 * Reverse Sync — admin inspector (P6 + P7), read-only.
 *
 *  • P6: reverse-JOLT projection (`GET /jolt-spec/{channelId}`) — the derived
 *    channelPath → masterField shift + many-to-one exclusions. A PROJECTION, not an editor.
 *  • P7: reverse config summary — `reverseSyncConfig` from the channel configuration
 *    (webhook, pull support, variant/attribute inverse descriptors, enrichers).
 */
export default function ReverseAdminInspector() {
  const [configs, setConfigs] = useState<ChannelConfiguration[]>([]);
  const [channelId, setChannelId] = useState<string>("");
  const [spec, setSpec] = useState<ReverseJoltSpec | null>(null);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [loadingSpec, setLoadingSpec] = useState(false);
  const [specError, setSpecError] = useState<string | null>(null);

  // Load channel configs once → drives the selector + P7 summary.
  useEffect(() => {
    let cancelled = false;
    setLoadingConfigs(true);
    ChannelConfigService.listConfigs()
      .then((list) => {
        if (cancelled) return;
        setConfigs(list);
        if (list.length > 0) setChannelId((prev) => prev || list[0].channelId);
      })
      .catch(() => { /* leave empty — the page still renders the empty state */ })
      .finally(() => { if (!cancelled) setLoadingConfigs(false); });
    return () => { cancelled = true; };
  }, []);

  const loadSpec = useCallback(async (id: string) => {
    if (!id) return;
    setLoadingSpec(true);
    setSpecError(null);
    setSpec(null);
    try {
      setSpec(await ReverseSyncService.getJoltSpec(id));
    } catch (err) {
      setSpecError(err instanceof ReverseApiError ? err.message : "Failed to load reverse-JOLT projection");
    } finally {
      setLoadingSpec(false);
    }
  }, []);

  useEffect(() => { if (channelId) loadSpec(channelId); }, [channelId, loadSpec]);

  const selectedConfig = useMemo(
    () => configs.find((c) => c.channelId === channelId) ?? null,
    [configs, channelId],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header + selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reverse Sync Inspector</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Read-only view of how a channel is read <span className="font-medium">backwards</span> (channel → master).
          </p>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Channel
          </label>
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            disabled={loadingConfigs || configs.length === 0}
            className="min-w-[200px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 focus:border-brand-400 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            {loadingConfigs && <option>Loading…</option>}
            {!loadingConfigs && configs.length === 0 && <option value="">No channels</option>}
            {configs.map((c) => (
              <option key={c.channelId} value={c.channelId}>
                {c.channelName || c.channelId}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* P7 — reverse config summary */}
      <ReverseConfigSummary config={selectedConfig} />

      {/* P6 — reverse-JOLT projection */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.02]">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Reverse-JOLT projection <span className="font-normal text-gray-400">(channel → master)</span>
          </h2>
          {spec && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {spec.operation} · read-only
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          Derived on-demand from <code className="font-mono">channel_field_mappings</code> read backwards —
          a projection, not a stored spec and not the executor.
        </p>

        {loadingSpec ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          </div>
        ) : specError ? (
          <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/25 dark:bg-error-500/10 dark:text-error-400">
            {specError}
          </div>
        ) : spec ? (
          <ReverseJoltTable spec={spec} />
        ) : (
          <p className="py-6 text-center text-sm text-gray-400">Select a channel to inspect.</p>
        )}
      </section>
    </div>
  );
}

// ─── P6 table ──────────────────────────────────────────────────────────────────

function ReverseJoltTable({ spec }: { spec: ReverseJoltSpec }) {
  const rows = Object.entries(spec.spec);
  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
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

      <p className="text-[11px] italic text-gray-400 dark:text-gray-500">{spec.note}</p>
    </div>
  );
}

// ─── P7 summary ──────────────────────────────────────────────────────────────────

function ReverseConfigSummary({ config }: { config: ChannelConfiguration | null }) {
  const rsc = (config?.reverseSyncConfig ?? {}) as Record<string, unknown>;
  const has = (k: string) => rsc[k] !== undefined && rsc[k] !== null && rsc[k] !== "";
  const webhookEnabled = Boolean(rsc.webhookEnabled);
  const pullSupported = has("itemUrlTemplate");
  const webhookUrl = config
    ? `/api/v1/webhooks/${config.channelId}/products-update`
    : "";

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.02]">
      <h2 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
        Reverse config <span className="font-normal text-gray-400">(reverseSyncConfig)</span>
      </h2>

      {!config ? (
        <p className="text-sm text-gray-400">No channel selected.</p>
      ) : Object.keys(rsc).length === 0 ? (
        <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
          This channel has no <code className="font-mono">reverseSyncConfig</code> — reverse pull/webhook is not
          seeded. Add config to enable (no code needed).
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Flag label="Webhook" on={webhookEnabled} />
          <Flag label="Pull (GET item)" on={pullSupported} offHint="needs signing" />
          <Flag label="Item nested" on={has("itemPath")} />
          <Flag label="Variant inverse" on={has("variantInverse")} />
          <Flag label="Attribute list" on={has("attributeListInverse")} />
          <Flag label="Enrichers" on={Array.isArray(rsc.enrichers) && (rsc.enrichers as unknown[]).length > 0} />
        </div>
      )}

      {config && webhookEnabled && (
        <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-800/40">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Webhook URL to register</span>
          <code className="mt-0.5 block break-all font-mono text-xs text-gray-700 dark:text-gray-300">{webhookUrl}</code>
        </div>
      )}

      {config?.apiVersion && (
        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
          API version (reverse pull fallback): <span className="font-mono text-gray-600 dark:text-gray-300">{config.apiVersion}</span>
        </p>
      )}
    </section>
  );
}

function Flag({ label, on, offHint }: { label: string; on: boolean; offHint?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-800">
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${on ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`} />
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
        {on ? "yes" : offHint ?? "no"}
      </span>
    </div>
  );
}
