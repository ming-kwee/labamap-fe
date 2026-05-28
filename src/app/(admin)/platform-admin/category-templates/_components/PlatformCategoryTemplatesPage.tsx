"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  PlatformCategoryTemplate,
  PlatformCategoryTemplateTree,
  OrgProvisionStatus,
  flattenTemplateTree,
  countTemplateDescendants,
} from "../_types/platform-category-template";
import { PlatformCategoryTemplatesService } from "../_services/platform-category-templates.service";
import AddEditTemplateModal from "./AddEditTemplateModal";
import ProvisionPanel from "./ProvisionPanel";

// ─── Icons ─────────────────────────────────────────────────────────────────────

const ChevronRightIcon = ({ className = "" }: { className?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m9 18 6-6-6-6"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M12 5v14"/>
  </svg>
);
const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const TemplateIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
  </svg>
);
const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const ServerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
    <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
  </svg>
);
const ExpandAllIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>
  </svg>
);

// ─── Delete Confirm ────────────────────────────────────────────────────────────

function DeleteConfirmModal({
  node,
  onConfirm,
  onCancel,
}: {
  node: PlatformCategoryTemplate;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim() === node.name.trim();
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 bg-red-50 dark:bg-red-500/10 border-b border-red-100 dark:border-red-500/20">
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center flex-shrink-0 text-red-600 dark:text-red-400">
            <TrashIcon />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-red-700 dark:text-red-400">Delete Template Node</h2>
            <p className="text-xs text-red-500/80 dark:text-red-500 mt-0.5">This only removes from the template — existing org trees are unaffected</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            You are about to delete{" "}
            <span className="font-semibold text-gray-900 dark:text-white">{node.name}</span>{". "}
            Returns 409 if this node has children.
          </p>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{node.name}</p>
              <code className="text-[11px] text-gray-400">{node.path}</code>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Type <span className="font-bold text-gray-900 dark:text-white">{node.name}</span> to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={node.name}
              autoFocus
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={!confirmed}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${confirmed ? "bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-600/20" : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"}`}
          >
            <TrashIcon /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tree Node ─────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: PlatformCategoryTemplateTree;
  expandedIds: Set<string>;
  savingId: string | null;
  onToggleExpand: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (node: PlatformCategoryTemplate) => void;
  onToggleActive: (node: PlatformCategoryTemplate) => void;
  onDelete: (node: PlatformCategoryTemplate) => void;
}

function TreeNode({
  node, expandedIds, savingId,
  onToggleExpand, onAddChild, onEdit, onToggleActive, onDelete,
}: TreeNodeProps) {
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const isSaving = savingId === node.id;
  const descendants = countTemplateDescendants(node);
  const LEVEL_LABEL: Record<number, string> = { 0: "Root", 1: "L1", 2: "L2", 3: "L3" };
  const levelLabel = LEVEL_LABEL[node.level] ?? `L${node.level}`;

  return (
    <div>
      <div
        className={`group/node relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all duration-150 ${
          isSaving ? "opacity-60 pointer-events-none" : ""
        } ${
          node.active
            ? "bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm"
            : "bg-gray-50 dark:bg-gray-800/20 border-gray-200/70 dark:border-gray-700/40 opacity-70"
        }`}
      >
        <button
          onClick={() => hasChildren && onToggleExpand(node.id)}
          className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors ml-1 ${
            hasChildren ? "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer" : "text-transparent cursor-default"
          }`}
        >
          <ChevronRightIcon className={`transition-transform duration-200 ${isExpanded && hasChildren ? "rotate-90" : ""}`} />
        </button>

        <div className="flex-1 min-w-0" onClick={() => hasChildren && onToggleExpand(node.id)} style={{ cursor: hasChildren ? "pointer" : "default" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-semibold text-sm ${node.active ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400 line-through"}`}>
              {node.name}
            </span>
            <code className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">{node.slug}</code>
          </div>
          {node.level > 0 && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 font-mono truncate">{node.path}</p>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
            node.level === 0 ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" :
            node.level === 1 ? "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400" :
            "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
          }`}>
            {levelLabel}
          </span>
          {descendants > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
              {descendants} sub
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
            v{node.templateVersion}
          </span>
        </div>

        <button
          onClick={() => onToggleActive(node)}
          title={node.active ? "Click to deactivate" : "Click to activate"}
          className={`flex-shrink-0 flex items-center gap-2 px-2.5 py-1 rounded-full border transition-colors ${
            node.active
              ? "bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/30 hover:bg-green-100 dark:hover:bg-green-500/20"
              : "bg-gray-100 border-gray-200 dark:bg-gray-700/50 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${node.active ? "bg-green-500" : "bg-gray-400 dark:bg-gray-500"}`} />
          <span className={`text-[11px] font-semibold ${node.active ? "text-green-700 dark:text-green-400" : "text-gray-500 dark:text-gray-400"}`}>
            {node.active ? "Active" : "Inactive"}
          </span>
        </button>

        <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover/node:opacity-100 transition-opacity">
          <button onClick={() => onAddChild(node.id)} title="Add child node" className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors">
            <PlusIcon />
          </button>
          <button onClick={() => onEdit(node)} title="Edit" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <EditIcon />
          </button>
          <button onClick={() => onDelete(node)} title="Delete" className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
            <TrashIcon />
          </button>
        </div>
      </div>

      {isExpanded && hasChildren && (
        <div className="ml-5 mt-1.5 pl-4 border-l border-gray-200 dark:border-gray-700/50 space-y-1.5">
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              expandedIds={expandedIds}
              savingId={savingId}
              onToggleExpand={onToggleExpand}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type ActiveTab = "tree" | "provision";

export default function PlatformCategoryTemplatesPage() {
  const [tree, setTree] = useState<PlatformCategoryTemplateTree[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("tree");

  const [showModal, setShowModal] = useState(false);
  const [editingNode, setEditingNode] = useState<PlatformCategoryTemplate | null>(null);
  const [newParentId, setNewParentId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<PlatformCategoryTemplate | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  // Provision panel state
  const [orgStatuses, setOrgStatuses] = useState<OrgProvisionStatus[]>([]);
  const [orgStatusLoading, setOrgStatusLoading] = useState(false);

  const loadTree = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await PlatformCategoryTemplatesService.getTree();
      setTree(data);
      setExpandedIds(new Set(data.map(n => n.id)));
    } catch (err) {
      setLoadError(String((err as Error).message ?? err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadOrgStatuses = useCallback(async () => {
    setOrgStatusLoading(true);
    try {
      const data = await PlatformCategoryTemplatesService.listOrgProvisionStatus();
      setOrgStatuses(data);
    } catch {
      // Non-fatal — provision panel shows its own error
    } finally {
      setOrgStatusLoading(false);
    }
  }, []);

  useEffect(() => { loadTree(); }, [loadTree]);

  useEffect(() => {
    if (activeTab === "provision") loadOrgStatuses();
  }, [activeTab, loadOrgStatuses]);

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const allNodes = useMemo(() => flattenTemplateTree(tree), [tree]);

  const stats = useMemo(() => ({
    total: allNodes.length,
    active: allNodes.filter(n => n.active).length,
    roots: tree.length,
  }), [allNodes, tree]);

  const isSearching = searchQuery.trim().length > 0 || activeFilter !== "all";

  const filteredFlat = useMemo<PlatformCategoryTemplateTree[]>(() => {
    if (!isSearching) return [];
    const q = searchQuery.toLowerCase();
    return allNodes.filter(n => {
      const matchesSearch = !q || n.name.toLowerCase().includes(q) || n.slug.includes(q) || n.path.includes(q);
      const matchesActive = activeFilter === "all" || (activeFilter === "active" ? n.active : !n.active);
      return matchesSearch && matchesActive;
    }).map(n => ({ ...n, children: [] }));
  }, [allNodes, searchQuery, activeFilter, isSearching]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setExpandedIds(new Set(allNodes.map(n => n.id))), [allNodes]);
  const collapseAll = useCallback(() => setExpandedIds(new Set()), []);
  const allExpanded = expandedIds.size >= allNodes.filter(n => n.children && n.children.length > 0).length && allNodes.filter(n => n.children && n.children.length > 0).length > 0;

  const handleOpenAdd = useCallback((parentId: string | null = null) => {
    setEditingNode(null);
    setNewParentId(parentId);
    setShowModal(true);
  }, []);

  const handleOpenEdit = useCallback((node: PlatformCategoryTemplate) => {
    setEditingNode(node);
    setNewParentId(null);
    setShowModal(true);
  }, []);

  const handleToggleActive = useCallback(async (node: PlatformCategoryTemplate) => {
    setSavingId(node.id);
    const updateActive = (nodes: PlatformCategoryTemplateTree[]): PlatformCategoryTemplateTree[] =>
      nodes.map(n => n.id === node.id
        ? { ...n, active: !n.active }
        : { ...n, children: updateActive(n.children) }
      );
    setTree(prev => updateActive(prev));
    try {
      await PlatformCategoryTemplatesService.setActive(node.id, !node.active);
      showToast(`${node.name} ${node.active ? "deactivated" : "activated"}`);
    } catch (err) {
      setTree(prev => updateActive(prev));
      showToast((err as Error).message, "err");
    } finally {
      setSavingId(null);
    }
  }, [showToast]);

  const handleModalSave = async (
    payload: Pick<PlatformCategoryTemplate, 'name' | 'slug' | 'parentId' | 'description' | 'sortOrder'>
  ) => {
    setShowModal(false);
    try {
      if (editingNode) {
        await PlatformCategoryTemplatesService.update(editingNode.id, payload);
        showToast(`"${payload.name}" updated`);
      } else {
        await PlatformCategoryTemplatesService.create(payload);
        showToast(`"${payload.name}" created`);
      }
      await loadTree();
    } catch (err) {
      showToast((err as Error).message, "err");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setSavingId(target.id);
    try {
      await PlatformCategoryTemplatesService.delete(target.id);
      showToast(`"${target.name}" deleted`);
      await loadTree();
    } catch (err) {
      showToast((err as Error).message, "err");
    } finally {
      setSavingId(null);
    }
  };

  const nodeProps = {
    expandedIds, savingId,
    onToggleExpand: toggleExpand,
    onAddChild: (id: string) => handleOpenAdd(id),
    onEdit: handleOpenEdit,
    onToggleActive: handleToggleActive,
    onDelete: (node: PlatformCategoryTemplate) => setDeleteTarget(node),
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0 text-amber-600 dark:text-amber-400">
              <TemplateIcon />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Category Templates</h1>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 uppercase tracking-wide">Platform Admin</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {isLoading ? "Loading…" : `${stats.roots} root${stats.roots !== 1 ? "s" : ""} · ${stats.total} total · ${stats.active} active`}
              </p>
            </div>
          </div>
          {activeTab === "tree" && (
            <button
              onClick={() => handleOpenAdd(null)}
              className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white rounded-xl transition-colors shadow-sm shadow-amber-500/20"
            >
              <PlusIcon /> New Root Node
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {([["tree", "Template Tree"], ["provision", "Org Provisioning"]] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab
                  ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              {tab === "provision" && <ServerIcon />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "tree" && (
        <>
          {/* Toolbar */}
          <div className="bg-white dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700/40 px-6 py-3 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><SearchIcon /></span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search name, slug or path…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
              />
            </div>
            <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {(["all", "active", "inactive"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    activeFilter === f ? "bg-amber-500 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            {!isSearching && allNodes.some(n => n.children && n.children.length > 0) && (
              <button
                onClick={allExpanded ? collapseAll : expandAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <ExpandAllIcon /> {allExpanded ? "Collapse all" : "Expand all"}
              </button>
            )}
            <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 tabular-nums">
              {isSearching ? `${filteredFlat.length} result${filteredFlat.length !== 1 ? "s" : ""}` : `${stats.total} node${stats.total !== 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Content */}
          <main className="px-6 py-6 max-w-5xl mx-auto">
            {loadError && (
              <div className="mb-5 flex items-start gap-3 px-4 py-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400">
                <AlertIcon />
                <div>
                  <p className="font-medium">Failed to load template tree</p>
                  <p className="text-xs mt-0.5 text-red-500/80">{loadError}</p>
                </div>
                <button onClick={loadTree} className="ml-auto text-xs underline flex-shrink-0">Retry</button>
              </div>
            )}
            {isLoading && (
              <div className="space-y-2">
                {[1,2,3,4].map(i => (
                  <div key={i} className="h-14 rounded-xl bg-gray-200 dark:bg-gray-700/50 animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
                ))}
              </div>
            )}
            {!isLoading && !loadError && tree.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
                <div className="text-4xl mb-4">📋</div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No template nodes yet</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed mb-6">
                  Create root nodes to build the canonical taxonomy that will be provisioned to new organisations.
                </p>
                <button
                  onClick={() => handleOpenAdd(null)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors shadow-sm"
                >
                  <PlusIcon /> Create first node
                </button>
              </div>
            )}
            {!isLoading && isSearching && filteredFlat.length > 0 && (
              <div className="space-y-1.5">
                {filteredFlat.map(node => <TreeNode key={node.id} {...nodeProps} node={node} />)}
              </div>
            )}
            {!isLoading && isSearching && filteredFlat.length === 0 && !loadError && (
              <div className="text-center py-16">
                <p className="text-2xl mb-3">🔍</p>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No nodes match your search</p>
                <button onClick={() => { setSearchQuery(""); setActiveFilter("all"); }} className="mt-3 text-xs text-amber-600 dark:text-amber-400 hover:underline">Clear filters</button>
              </div>
            )}
            {!isLoading && !isSearching && tree.length > 0 && (
              <div className="space-y-1.5">
                {tree.map(root => <TreeNode key={root.id} {...nodeProps} node={root} />)}
              </div>
            )}
          </main>
        </>
      )}

      {activeTab === "provision" && (
        <ProvisionPanel
          orgStatuses={orgStatuses}
          loading={orgStatusLoading}
          onRefresh={loadOrgStatuses}
          onProvision={async (orgId) => {
            const result = await PlatformCategoryTemplatesService.provision(orgId);
            showToast(`Provisioned org ${orgId}: ${result.inserted} inserted, ${result.skipped} skipped`);
            await loadOrgStatuses();
          }}
          onForceProvision={async (orgId) => {
            const result = await PlatformCategoryTemplatesService.forceProvision(orgId);
            showToast(`Force-provisioned org ${orgId}: ${result.inserted} inserted, ${result.deletedCategories} deleted`);
            await loadOrgStatuses();
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all animate-in fade-in slide-in-from-bottom-2 ${
          toast.type === "ok"
            ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200"
            : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400"
        }`}>
          {toast.type === "ok" ? "✓" : <AlertIcon />}
          {toast.msg}
        </div>
      )}

      {showModal && (
        <AddEditTemplateModal
          node={editingNode}
          parentId={newParentId}
          tree={tree}
          onSave={handleModalSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          node={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
