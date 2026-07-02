"use client";

/**
 * P2-K · Value Mappings Manager.
 * Master value → channel value mappings (e.g. material "cotton" → channel code).
 * CRUD over /admin/channel-mappings. Seed via ChannelValueMappingDataLoader.
 * Spec: docs/ai/frontend/FRONTEND-ADMIN-RECOMMENDATIONS.md §P2-K
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChannelValueMapping,
  ChannelValueMappingRequest,
  FALLBACK_LABELS,
} from "../_types/channel-value-mapping";
import { ChannelValueMappingService } from "../_services/channel-value-mapping.service";
import AddEditValueMappingModal from "./AddEditValueMappingModal";

// ─── Icons ───────────────────────────────────────────────────────────────────
const PlusIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>);
const RefreshIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></svg>);
const EditIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>);
const TrashIcon = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6M9 6V4h6v2" /></svg>);
const ChevronDownIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>);
const ArrowRightIcon = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>);
const SearchIcon = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>);
const MapIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 11a2 2 0 1 0-4 0 2 2 0 0 0 4 0z" /><path d="M3 7h4l2-2h6l2 2h4v12H3z" /></svg>);

const CHANNEL_COLORS: Record<string, string> = {
  amazon: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  shopify: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  tiktok: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  tiktokshop: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  lazada: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  shopee: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  tokopedia: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

function ChannelBadge({ channelType }: { channelType: string }) {
  const color = CHANNEL_COLORS[channelType] ?? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${color}`}>{channelType}</span>;
}

function MappingRow({
  mapping,
  onEdit,
  onDelete,
}: {
  mapping: ChannelValueMapping;
  onEdit: (m: ChannelValueMapping) => void;
  onDelete: (m: ChannelValueMapping) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
        <td className="px-3 py-2.5"><ChannelBadge channelType={mapping.channelType} /></td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <code className="text-xs font-mono text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{mapping.masterFieldName}</code>
            <span className="text-gray-400"><ArrowRightIcon /></span>
            <code className="text-xs font-mono text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">{mapping.channelFieldName}</code>
          </div>
        </td>
        <td className="px-3 py-2.5 text-center">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
            {mapping.mappings.length} value{mapping.mappings.length !== 1 ? "s" : ""}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">{FALLBACK_LABELS[mapping.fallbackStrategy]}</span>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1">
            <button onClick={() => setExpanded((v) => !v)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors" title="View values">
              <div className={`transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}><ChevronDownIcon /></div>
            </button>
            <button onClick={() => onEdit(mapping)} className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 transition-colors" title="Edit"><EditIcon /></button>
            <button onClick={() => onDelete(mapping)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400 transition-colors" title="Delete"><TrashIcon /></button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/60 dark:bg-gray-900/40">
          <td colSpan={5} className="px-4 py-3">
            <div className="flex flex-wrap gap-1.5">
              {mapping.mappings.map((m, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1">
                  <code className="font-mono text-gray-700 dark:text-gray-300">{m.masterValue}</code>
                  <span className="text-gray-400">→</span>
                  <code className="font-mono text-blue-600 dark:text-blue-400">{m.channelValue}</code>
                  {m.channelLabel && <span className="text-gray-400">({m.channelLabel})</span>}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2 font-mono">id: {mapping.id}{mapping.updatedAt ? ` · updated ${new Date(mapping.updatedAt).toLocaleDateString()}` : ""}</p>
          </td>
        </tr>
      )}
    </>
  );
}

function DeleteConfirmModal({ mapping, onConfirm, onCancel }: { mapping: ChannelValueMapping; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Delete Value Mapping</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Menghapus permanen mapping <strong>{mapping.channelType} · {mapping.masterFieldName} → {mapping.channelFieldName}</strong> ({mapping.mappings.length} value). Tidak bisa dibatalkan.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">Delete Permanently</button>
        </div>
      </div>
    </div>
  );
}

export default function ChannelValueMappingsPage() {
  const [mappings, setMappings] = useState<ChannelValueMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ mode: "create" | "edit"; mapping?: ChannelValueMapping } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChannelValueMapping | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ChannelValueMappingService.list({ size: 200 });
      setMappings(res.content);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSave(data: ChannelValueMappingRequest) {
    if (modal?.mode === "create") {
      await ChannelValueMappingService.create(data);
      showToast("Value mapping created.", "success");
    } else if (modal?.mapping) {
      await ChannelValueMappingService.update(modal.mapping.id, data);
      showToast("Value mapping updated.", "success");
    }
    load();
  }

  async function handleDelete(m: ChannelValueMapping) {
    try {
      await ChannelValueMappingService.remove(m.id);
      setDeleteTarget(null);
      showToast("Value mapping deleted.", "success");
      load();
    } catch (e) {
      setDeleteTarget(null);
      showToast((e as Error).message, "error");
    }
  }

  const channels = useMemo(() => Array.from(new Set(mappings.map((m) => m.channelType))).sort(), [mappings]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return mappings
      .filter((m) => {
        if (channelFilter !== "all" && m.channelType !== channelFilter) return false;
        if (q && !m.masterFieldName.toLowerCase().includes(q) && !m.channelFieldName.toLowerCase().includes(q)
          && !m.mappings.some((v) => v.masterValue.toLowerCase().includes(q) || v.channelValue.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => a.channelType.localeCompare(b.channelType) || a.masterFieldName.localeCompare(b.masterFieldName));
  }, [mappings, channelFilter, search]);

  const totalValues = mappings.reduce((n, m) => n + m.mappings.length, 0);

  return (
    <div className="p-6 space-y-5">
      {toast && (
        <div className={`fixed top-4 right-4 z-[10000] max-w-sm px-4 py-3 rounded-lg shadow-lg text-sm text-white ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg text-violet-600 dark:text-violet-400"><MapIcon /></div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Value Mappings</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Master value → channel value (mis. material “cotton” → kode channel).</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors disabled:opacity-50"><RefreshIcon /></button>
          <button onClick={() => setModal({ mode: "create" })} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"><PlusIcon /> Add Mapping</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total mappings" value={mappings.length} />
        <StatCard label="Total values" value={totalValues} accent="violet" />
        <StatCard label="Channels covered" value={channels.length} accent="blue" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search field / value…"
            className="pl-8 pr-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 w-56 focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Channel:</span>
          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}
            className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            <option value="all">All</option>
            {channels.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <span className="ml-auto text-xs text-gray-400">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      {error ? (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">{error}</div>
      ) : loading ? (
        <div className="text-center py-12 text-sm text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3 text-gray-400"><MapIcon /></div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{search || channelFilter !== "all" ? "No mappings match your filters" : "No value mappings yet"}</p>
          {!(search || channelFilter !== "all") && (
            <button onClick={() => setModal({ mode: "create" })} className="mt-2 flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"><PlusIcon /> Add First Mapping</button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/50 text-left">
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Channel</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Field (master → channel)</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-center">Values</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Fallback</th>
                <th className="px-3 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <MappingRow key={m.id} mapping={m} onEdit={(x) => setModal({ mode: "edit", mapping: x })} onDelete={(x) => setDeleteTarget(x)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <AddEditValueMappingModal mode={modal.mode} mapping={modal.mapping} onSave={handleSave} onClose={() => setModal(null)} />}
      {deleteTarget && <DeleteConfirmModal mapping={deleteTarget} onConfirm={() => handleDelete(deleteTarget)} onCancel={() => setDeleteTarget(null)} />}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "violet" | "blue" }) {
  const color = accent === "violet" ? "text-violet-600 dark:text-violet-400" : accent === "blue" ? "text-blue-600 dark:text-blue-400" : "text-gray-800 dark:text-white";
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}
