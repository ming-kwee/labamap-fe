"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ChannelConfiguration,
  FieldBoost,
  PostProcessingRule,
} from "../_types/channel-configuration";
import { ChannelConfigService } from "../_services/channel-configuration.service";
import { CHANNEL_TYPE_LABELS } from "../../channel-category-schemas/_types/channel-category-schema";
import AddBoostModal from "./AddBoostModal";
import EditRuleModal from "./EditRuleModal";

// ─── Icons ─────────────────────────────────────────────────────────────────────

const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const ChevronDownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6"/>
  </svg>
);
const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
  </svg>
);
const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

// ─── Channel badge ─────────────────────────────────────────────────────────────

const CHANNEL_COLORS: Record<string, string> = {
  amazon:    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  ebay:      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  walmart:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  shopify:   "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  wix:       "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  tiktok:    "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  tiktokshop:"bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  lazada:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  tokopedia: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  facebook:  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  shopee:    "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

function ChannelBadge({ channelId }: { channelId: string }) {
  const color = CHANNEL_COLORS[channelId] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-semibold ${color}`}>
      {CHANNEL_TYPE_LABELS[channelId] ?? channelId}
    </span>
  );
}

// ─── Key-value read-only display ──────────────────────────────────────────────

function FieldTable({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return <p className="text-xs text-gray-400 italic py-2">No fields configured.</p>;
  return (
    <table className="w-full text-xs">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="border-b border-gray-50 dark:border-gray-800/50">
            <td className="py-1.5 pr-4 text-gray-500 dark:text-gray-400 font-medium align-top w-56 shrink-0">
              <code className="font-mono">{k}</code>
            </td>
            <td className="py-1.5 text-gray-800 dark:text-gray-200 align-top break-all">
              {typeof v === "string" ? (
                <span className={v.length > 80 ? "text-xs" : ""}>{v}</span>
              ) : (
                <code className="font-mono text-gray-600 dark:text-gray-400 text-xs">{JSON.stringify(v)}</code>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Channel config card ───────────────────────────────────────────────────────

type BoostModal = { type: "add" } | { type: "edit"; boost: FieldBoost; index: number };
type RuleModal  = { type: "add" } | { type: "edit"; rule: PostProcessingRule };

function ChannelConfigCard({
  config,
  onUpdated,
  onToast,
}: {
  config: ChannelConfiguration;
  onUpdated: (channelId: string, updated: Partial<ChannelConfiguration>) => void;
  onToast: (msg: string, type: "success" | "error") => void;
}) {
  const [expanded, setExpanded]           = useState(false);
  const [activeTab, setActiveTab]         = useState<"boosts" | "rules" | "details">("boosts");
  const [boostModal, setBoostModal]       = useState<BoostModal | null>(null);
  const [ruleModal, setRuleModal]         = useState<RuleModal | null>(null);
  const [confirmBoostIdx, setConfirmBoostIdx] = useState<number | null>(null);
  const [confirmRuleName, setConfirmRuleName] = useState<string | null>(null);

  function formatDate(s?: string) {
    if (!s) return "—";
    try { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return s; }
  }

  // ── Field Boosts ─────────────────────────────────────────────────────────────

  async function handleAddBoost(boost: FieldBoost) {
    const updated = await ChannelConfigService.updateFieldBoosts(config.channelId, {
      action: "add", boost,
    });
    onUpdated(config.channelId, { fieldBoosts: updated });
    onToast(`Boost added for ${config.channelName}. JOLT specs invalidated.`, "success");
  }

  async function handleEditBoost(boost: FieldBoost, index: number) {
    // Strategy: replace the entire list with the updated entry
    const updated = config.fieldBoosts.map((b, i) => (i === index ? boost : b));
    const result = await ChannelConfigService.updateFieldBoosts(config.channelId, {
      action: "replace", boosts: updated,
    });
    onUpdated(config.channelId, { fieldBoosts: result });
    onToast(`Boost updated for ${config.channelName}. JOLT specs invalidated.`, "success");
  }

  async function handleRemoveBoost(boost: FieldBoost) {
    const result = await ChannelConfigService.updateFieldBoosts(config.channelId, {
      action: "remove",
      sourcePattern: boost.sourcePattern,
      targetPattern: boost.targetPattern,
    });
    onUpdated(config.channelId, { fieldBoosts: result });
    setConfirmBoostIdx(null);
    onToast(`Boost removed from ${config.channelName}.`, "success");
  }

  // ── Post-Processing Rules ────────────────────────────────────────────────────

  async function handleUpsertRule(rule: PostProcessingRule) {
    const result = await ChannelConfigService.updatePostProcessingRules(config.channelId, {
      action: "upsert", rule,
    });
    onUpdated(config.channelId, { postProcessingRules: result });
    onToast(`Rule "${rule.name}" saved for ${config.channelName}.`, "success");
  }

  async function handleToggleRule(name: string, enable: boolean) {
    const result = await ChannelConfigService.updatePostProcessingRules(config.channelId, {
      action: enable ? "enable" : "disable", name,
    });
    onUpdated(config.channelId, { postProcessingRules: result });
    onToast(`Rule "${name}" ${enable ? "enabled" : "disabled"}.`, "success");
  }

  async function handleRemoveRule(name: string) {
    const result = await ChannelConfigService.updatePostProcessingRules(config.channelId, {
      action: "remove", name,
    });
    onUpdated(config.channelId, { postProcessingRules: result });
    setConfirmRuleName(null);
    onToast(`Rule "${name}" removed from ${config.channelName}.`, "success");
  }

  // ── Wrappers with error handling ─────────────────────────────────────────────

  function withError<T extends unknown[]>(fn: (...args: T) => Promise<void>) {
    return async (...args: T) => {
      try { await fn(...args); }
      catch (err) { onToast((err as Error).message, "error"); }
    };
  }

  return (
    <div className={`bg-white dark:bg-gray-900 border rounded-xl overflow-hidden transition-shadow ${
      expanded ? "border-slate-300 dark:border-slate-600 shadow-sm" : "border-gray-200 dark:border-gray-700"
    }`}>
      {/* Card header */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChannelBadge channelId={config.channelId} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {config.channelName || config.channelId}
            </span>
            {config.version && (
              <span className="text-xs text-gray-400">v{config.version}</span>
            )}
            {!config.isActive && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-500">inactive</span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            <span>{config.fieldBoosts.length} field boost{config.fieldBoosts.length !== 1 ? "s" : ""}</span>
            <span>{config.postProcessingRules.length} post-processing rule{config.postProcessingRules.length !== 1 ? "s" : ""}</span>
            {config.updatedAt && <span>Updated {formatDate(config.updatedAt)}</span>}
          </div>
        </div>
        <div className={`text-gray-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
          <ChevronDownIcon />
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          {/* Tabs */}
          <div className="flex border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
            {([
              { key: "boosts",  label: `Field Boosts (${config.fieldBoosts.length})` },
              { key: "rules",   label: `Post-Processing Rules (${config.postProcessingRules.length})` },
              { key: "details", label: "Integration & Metadata" },
            ] as const).map(({ key, label }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`px-5 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === key
                    ? "text-slate-700 dark:text-slate-300 border-b-2 border-slate-600 -mb-px"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Field Boosts tab */}
          {activeTab === "boosts" && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  APM confidence adjustments — boost score when source and target patterns both match.
                </p>
                <button onClick={() => setBoostModal({ type: "add" })}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-700 hover:bg-slate-800 rounded-lg transition-colors">
                  <PlusIcon />Add Boost
                </button>
              </div>

              {config.fieldBoosts.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-3 text-center">No field boosts configured.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400">
                      <th className="pb-2 text-left font-medium pr-3">Source</th>
                      <th className="pb-2 text-left font-medium pr-3">Target</th>
                      <th className="pb-2 text-center font-medium pr-3">Boost</th>
                      <th className="pb-2 text-left font-medium pr-3">Condition</th>
                      <th className="pb-2 text-left font-medium pr-3">Reason</th>
                      <th className="pb-2 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.fieldBoosts.map((boost, idx) => (
                      <tr key={idx} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/20">
                        <td className="py-2 pr-3">
                          <code className="font-mono text-gray-800 dark:text-gray-200">{boost.sourcePattern}</code>
                        </td>
                        <td className="py-2 pr-3">
                          <code className="font-mono text-slate-700 dark:text-slate-300">{boost.targetPattern}</code>
                        </td>
                        <td className="py-2 pr-3 text-center">
                          <span className={`font-medium ${boost.confidenceBoost > 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                            {boost.confidenceBoost > 0 ? "+" : ""}{boost.confidenceBoost}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">
                          {boost.condition || <span className="italic text-gray-400">all</span>}
                        </td>
                        <td className="py-2 pr-3 text-gray-500 dark:text-gray-400 max-w-[180px] truncate" title={boost.reason}>
                          {boost.reason || "—"}
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setBoostModal({ type: "edit", boost, index: idx })}
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors">
                              <EditIcon />
                            </button>
                            {confirmBoostIdx === idx ? (
                              <span className="flex items-center gap-1">
                                <button onClick={() => withError(handleRemoveBoost)(boost)}
                                  className="px-1.5 py-0.5 rounded bg-red-100 hover:bg-red-200 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium transition-colors">
                                  Confirm
                                </button>
                                <button onClick={() => setConfirmBoostIdx(null)}
                                  className="px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button onClick={() => setConfirmBoostIdx(idx)}
                                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 transition-colors">
                                <TrashIcon />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Post-Processing Rules tab */}
          {activeTab === "rules" && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Rules that enrich or transform the JOLT output before sending to the channel.
                </p>
                <button onClick={() => setRuleModal({ type: "add" })}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-700 hover:bg-slate-800 rounded-lg transition-colors">
                  <PlusIcon />Add Rule
                </button>
              </div>

              {config.postProcessingRules.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-3 text-center">No post-processing rules configured.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400">
                      <th className="pb-2 text-left font-medium pr-3">Name</th>
                      <th className="pb-2 text-left font-medium pr-3">Operations</th>
                      <th className="pb-2 text-left font-medium pr-3">Status</th>
                      <th className="pb-2 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.postProcessingRules.map((rule) => (
                      <tr key={rule.name} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/20">
                        <td className="py-2 pr-3">
                          <code className="font-mono text-gray-800 dark:text-gray-200">{rule.name}</code>
                        </td>
                        <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">
                          {rule.operations.length > 0 ? (
                            <span className="flex flex-wrap gap-1">
                              {rule.operations.map((op, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400 font-mono">
                                  {String(op.op ?? "?")}
                                </span>
                              ))}
                            </span>
                          ) : <span className="italic text-gray-400">empty</span>}
                        </td>
                        <td className="py-2 pr-3">
                          <button onClick={() => withError(handleToggleRule)(rule.name, !rule.enabled)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                              rule.enabled
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200"
                                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200"
                            }`}>
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${rule.enabled ? "bg-green-500" : "bg-gray-400"}`} />
                            {rule.enabled ? "Enabled" : "Disabled"}
                          </button>
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setRuleModal({ type: "edit", rule })}
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors">
                              <EditIcon />
                            </button>
                            {confirmRuleName === rule.name ? (
                              <span className="flex items-center gap-1">
                                <button onClick={() => withError(handleRemoveRule)(rule.name)}
                                  className="px-1.5 py-0.5 rounded bg-red-100 hover:bg-red-200 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium transition-colors">
                                  Confirm
                                </button>
                                <button onClick={() => setConfirmRuleName(null)}
                                  className="px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button onClick={() => setConfirmRuleName(rule.name)}
                                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 transition-colors">
                                <TrashIcon />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {/* Integration & Metadata tab */}
          {activeTab === "details" && (
            <div className="p-4 space-y-5">
              <div className="flex items-start gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div className="text-slate-500 shrink-0 mt-0.5"><InfoIcon /></div>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  <strong>Read-only — code-managed.</strong>{" "}
                  <code className="font-mono">integrationConfig</code> and <code className="font-mono">metadata</code>{" "}
                  are set by <code className="font-mono">ChannelConfigurationDataLoader</code> at startup and require a code change + redeploy to update.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  integrationConfig
                  {config.integrationConfig?.publishApiPath && (
                    <span className="px-1.5 py-0.5 text-xs bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 rounded font-normal">
                      HMAC publish signing active
                    </span>
                  )}
                </h4>
                {config.integrationConfig && Object.keys(config.integrationConfig).length > 0 ? (
                  <FieldTable data={config.integrationConfig as unknown as Record<string, unknown>} />
                ) : (
                  <p className="text-xs text-gray-400 italic">Not configured or not returned by API.</p>
                )}
              </div>

              <div>
                <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">metadata</h4>
                {config.metadata && Object.keys(config.metadata).length > 0 ? (
                  <FieldTable data={config.metadata} />
                ) : (
                  <p className="text-xs text-gray-400 italic">No metadata keys returned by API.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {boostModal && (
        <AddBoostModal
          channelName={config.channelName || config.channelId}
          existing={boostModal.type === "edit" ? boostModal.boost : undefined}
          onSave={boostModal.type === "add"
            ? withError(handleAddBoost)
            : withError((b: FieldBoost) => handleEditBoost(b, (boostModal as { type: "edit"; boost: FieldBoost; index: number }).index))
          }
          onClose={() => setBoostModal(null)}
        />
      )}
      {ruleModal && (
        <EditRuleModal
          channelName={config.channelName || config.channelId}
          existing={ruleModal.type === "edit" ? ruleModal.rule : undefined}
          onSave={withError(handleUpsertRule)}
          onClose={() => setRuleModal(null)}
        />
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function ChannelConfigurationsPage() {
  const [configs, setConfigs]   = useState<ChannelConfiguration[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);
  const [toast,   setToast]     = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ChannelConfigService.listConfigs();
      setConfigs(data.sort((a, b) => a.channelId.localeCompare(b.channelId)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  function handleUpdated(channelId: string, updated: Partial<ChannelConfiguration>) {
    setConfigs((prev) =>
      prev.map((c) => (c.channelId === channelId ? { ...c, ...updated } : c))
    );
  }

  const activeCount = configs.filter((c) => c.isActive).length;
  const totalBoosts = configs.reduce((s, c) => s + c.fieldBoosts.length, 0);
  const totalRules  = configs.reduce((s, c) => s + c.postProcessingRules.length, 0);

  return (
    <div className="p-6 space-y-5">
      {toast && (
        <div className={`fixed top-4 right-4 z-[10000] max-w-sm px-4 py-3 rounded-lg shadow-lg text-sm text-white ${
          toast.type === "success" ? "bg-green-600" : "bg-red-600"
        }`}>{toast.message}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
            <SettingsIcon />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Channel Configurations</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Field boosts and post-processing rules — targeted updates only, no full config replace
            </p>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50">
          <RefreshIcon />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Channels" value={configs.length} />
        <StatCard label="Active" value={activeCount} accent="green" />
        <StatCard label="Total Field Boosts" value={totalBoosts} accent="slate" />
        <StatCard label="Total PP Rules" value={totalRules} accent="slate" />
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
        <div className="text-slate-500 shrink-0 mt-0.5"><InfoIcon /></div>
        <div className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5">
          <p>
            <strong>Read + targeted sub-field updates only.</strong> Full document replace is not
            exposed to prevent accidental changes to <code className="font-mono">apiSchema</code>,
            <code className="font-mono mx-1">apiWrapperConfig</code>, and OAuth config.
          </p>
          <p>
            <strong>Field Boosts</strong> adjust APM confidence scores.
            <strong> Post-Processing Rules</strong> enrich or transform JOLT output before it reaches the channel API.
            Adding a field boost invalidates that channel&apos;s JOLT specs.
          </p>
        </div>
      </div>

      {/* Non-editable fields note */}
      <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
        <strong>Read-only (code-managed):</strong>{" "}
        <code className="font-mono">apiSchema</code>, <code className="font-mono">apiWrapperConfig</code>,
        <code className="font-mono mx-1">integrationConfig</code>, <code className="font-mono">oauthConfig</code>,
        <code className="font-mono mx-1">isActive</code>, <code className="font-mono">isSystemDefault</code>
      </div>

      {/* Content */}
      {error ? (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
          {(error.includes("404") || error.includes("not found")) && (
            <p className="mt-1 text-xs opacity-80">The backend endpoint is not yet implemented. The UI is ready for when it ships.</p>
          )}
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : configs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3 text-gray-400">
            <SettingsIcon />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No channel configurations found</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
            Configurations are seeded by the backend at startup. They will appear here once the admin endpoint is implemented.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map((config) => (
            <ChannelConfigCard
              key={config.channelId}
              config={config}
              onUpdated={handleUpdated}
              onToast={showToast}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "green" | "slate" }) {
  const color =
    accent === "green" ? "text-green-600 dark:text-green-400" :
    accent === "slate" ? "text-slate-600 dark:text-slate-400" :
    "text-gray-800 dark:text-white";
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}
