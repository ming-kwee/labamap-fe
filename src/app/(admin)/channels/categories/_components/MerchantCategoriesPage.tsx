"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { ProductCategory, ProductCategoryTree, flattenTree, countDescendants } from "@/app/(admin)/omni-admin/product-categories/_types/category";
import { CategoryService } from "@/app/(admin)/omni-admin/product-categories/_services/category.service";
import { AddEditCategoryModal } from "@/app/(admin)/omni-admin/product-categories/_components/AddEditCategoryModal";
import { useAuth } from "@/shared/contexts/AuthContext";

// ─── Icons ────────────────────────────────────────────────────────────────────

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
const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const LinkIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);
const FolderIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>
    <path d="M2 10h20"/>
  </svg>
);
const ExpandAllIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>
  </svg>
);

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  category,
  onConfirm,
  onCancel,
}: {
  category: ProductCategory;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim() === category.name.trim();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 bg-red-50 dark:bg-red-500/10 border-b border-red-100 dark:border-red-500/20">
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center flex-shrink-0 text-red-600 dark:text-red-400">
            <TrashIcon />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-red-700 dark:text-red-400">Delete Category</h2>
            <p className="text-xs text-red-500/80 dark:text-red-500 mt-0.5">This action cannot be undone</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Permanently delete{" "}
            <span className="font-semibold text-gray-900 dark:text-white">{category.name}</span>.
            Categories with active children cannot be deleted.
          </p>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{category.name}</p>
              <code className="text-[11px] text-gray-400">{category.path}</code>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Type <span className="font-bold text-gray-900 dark:text-white">{category.name}</span> to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={category.name}
              autoFocus
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              confirmed ? "bg-red-600 hover:bg-red-700 text-white shadow-sm" : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
            }`}
          >
            <TrashIcon /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tree node ────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: ProductCategoryTree;
  expandedIds: Set<string>;
  savingId: string | null;
  onToggleExpand: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onEdit: (cat: ProductCategory) => void;
  onToggleActive: (cat: ProductCategory) => void;
  onDelete: (cat: ProductCategory) => void;
}

function TreeNode({ node, expandedIds, savingId, onToggleExpand, onAddChild, onEdit, onToggleActive, onDelete }: TreeNodeProps) {
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const isSaving = savingId === node.id;
  const descendants = countDescendants(node);

  const mapped  = node.channelSyncSummary?.totalMapped  ?? 0;
  const drifted = node.channelSyncSummary?.totalDrifted ?? 0;

  const LEVEL_LABEL: Record<number, string> = { 0: "Root", 1: "L1", 2: "L2", 3: "L3" };
  const levelLabel = LEVEL_LABEL[node.level] ?? `L${node.level}`;

  return (
    <div>
      <div className={`group/node relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all duration-150 ${
        isSaving ? "opacity-60 pointer-events-none" : ""
      } ${
        node.active
          ? "bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/60 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm"
          : "bg-gray-50 dark:bg-gray-800/20 border-gray-200/70 dark:border-gray-700/40 opacity-70"
      }`}>

        {/* Expand chevron */}
        <button
          onClick={() => hasChildren && onToggleExpand(node.id)}
          className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors ml-1 ${
            hasChildren ? "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer" : "text-transparent cursor-default"
          }`}
        >
          <ChevronRightIcon className={`transition-transform duration-200 ${isExpanded && hasChildren ? "rotate-90" : ""}`} />
        </button>

        {/* Name + path */}
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

        {/* Badges */}
        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
            node.level === 0 ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" :
            node.level === 1 ? "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400" :
            "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
          }`}>{levelLabel}</span>
          {descendants > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
              {descendants} sub
            </span>
          )}
          {node.productTypeName && (
            <span title={`Product Type: ${node.productTypeName}`} className="text-[10px] px-1.5 py-0.5 rounded-md bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400 font-medium">
              {node.productTypeName}
            </span>
          )}
          {/* Channel sync badges */}
          {mapped > 0 && (
            <Link
              href="/omni-admin/channel-category-mapping"
              title={`${mapped} channel${mapped !== 1 ? "s" : ""} mapped — click to manage`}
              onClick={e => e.stopPropagation()}
              className="text-[10px] px-1.5 py-0.5 rounded-md bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors"
            >
              {mapped} ch
            </Link>
          )}
          {drifted > 0 && (
            <Link
              href="/omni-admin/channel-category-mapping"
              title={`${drifted} channel mapping${drifted !== 1 ? "s" : ""} drifted — click to resolve`}
              onClick={e => e.stopPropagation()}
              className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
            >
              {drifted} drift
            </Link>
          )}
        </div>

        {/* Active toggle */}
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

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-0.5">
          <button
            onClick={() => onAddChild(node.id)}
            title="Add sub-category"
            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors"
          >
            <PlusIcon />
          </button>
          <button
            onClick={() => onEdit(node)}
            title="Edit"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <EditIcon />
          </button>
          <button
            onClick={() => onDelete(node)}
            title={mapped > 0 ? `Cannot delete — still linked to ${mapped} channel${mapped !== 1 ? "s" : ""}` : "Delete"}
            className={`p-1.5 rounded-lg transition-colors ${
              mapped > 0
                ? "text-gray-200 dark:text-gray-700 cursor-not-allowed"
                : "text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
            }`}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Children */}
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MerchantCategoriesPage() {
  const { organization } = useAuth();
  const orgId = organization?.organizationId ?? "";

  const [tree, setTree] = useState<ProductCategoryTree[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  // ── Load ───────────────────────────────────────────────────────────────────

  const loadTree = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await CategoryService.getTree(orgId);
      setTree(data);
      setExpandedIds(new Set(data.map(n => n.id)));
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [orgId]);

  useEffect(() => { loadTree(); }, [loadTree]);

  // ── Toast ──────────────────────────────────────────────────────────────────

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Filter / search ────────────────────────────────────────────────────────

  const allNodes = useMemo(() => flattenTree(tree), [tree]);

  const stats = useMemo(() => ({
    total: allNodes.length,
    active: allNodes.filter(n => n.active).length,
    roots: tree.length,
  }), [allNodes, tree]);

  const isSearching = searchQuery.trim().length > 0 || activeFilter !== "all";

  const filteredFlat = useMemo<ProductCategoryTree[]>(() => {
    if (!isSearching) return [];
    const q = searchQuery.toLowerCase();
    return allNodes.filter(n => {
      const matchesSearch = !q || n.name.toLowerCase().includes(q) || n.slug.includes(q) || n.path.includes(q);
      const matchesActive = activeFilter === "all" || (activeFilter === "active" ? n.active : !n.active);
      return matchesSearch && matchesActive;
    }).map(n => ({ ...n, children: [] }));
  }, [allNodes, searchQuery, activeFilter, isSearching]);

  // ── Tree UI ────────────────────────────────────────────────────────────────

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const allExpanded = expandedIds.size >= allNodes.filter(n => n.children.length > 0).length
    && allNodes.filter(n => n.children.length > 0).length > 0;

  // ── CRUD handlers ──────────────────────────────────────────────────────────

  const handleOpenAdd = useCallback((parentId: string | null = null) => {
    setEditingCategory(null);
    setNewParentId(parentId);
    setShowModal(true);
  }, []);

  const handleOpenEdit = useCallback((cat: ProductCategory) => {
    setEditingCategory(cat);
    setNewParentId(null);
    setShowModal(true);
  }, []);

  const handleToggleActive = useCallback(async (cat: ProductCategory) => {
    setSavingId(cat.id);
    const updateActive = (nodes: ProductCategoryTree[]): ProductCategoryTree[] =>
      nodes.map(n => n.id === cat.id ? { ...n, active: !n.active } : { ...n, children: updateActive(n.children) });
    setTree(prev => updateActive(prev));
    try {
      await CategoryService.setActive(cat.id, !cat.active, orgId);
      showToast(`${cat.name} ${cat.active ? "deactivated" : "activated"}`);
    } catch (err) {
      setTree(prev => updateActive(prev)); // rollback
      showToast((err as Error).message, "err");
    } finally {
      setSavingId(null);
    }
  }, [orgId, showToast]);

  const handleModalSave = async (
    payload: Omit<ProductCategory, "id" | "path" | "level" | "createdAt" | "updatedAt">
  ) => {
    setShowModal(false);
    try {
      if (editingCategory) {
        await CategoryService.update(editingCategory.id, payload, orgId);
        showToast(`"${payload.name}" updated`);
      } else {
        await CategoryService.create(payload, orgId);
        showToast(`"${payload.name}" created`);
      }
      await loadTree();
    } catch (err) {
      showToast((err as Error).message, "err");
    }
  };

  const handleDelete = useCallback((cat: ProductCategory) => {
    const mapped = cat.channelSyncSummary?.totalMapped ?? 0;
    if (mapped > 0) {
      showToast(
        `Cannot delete — still linked to ${mapped} channel${mapped !== 1 ? "s" : ""}. Remove all channel links first.`,
        "err",
      );
      return;
    }
    setDeleteTarget(cat);
  }, [showToast]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setSavingId(target.id);
    try {
      await CategoryService.delete(target.id, orgId);
      showToast(`"${target.name}" deleted`);
      await loadTree();
    } catch (err) {
      showToast((err as Error).message, "err");
    } finally {
      setSavingId(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const nodeProps = {
    expandedIds,
    savingId,
    onToggleExpand: toggleExpand,
    onAddChild: (id: string) => handleOpenAdd(id),
    onEdit: handleOpenEdit,
    onToggleActive: handleToggleActive,
    onDelete: handleDelete,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">

      {/* Header */}
      <div className="bg-white dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60 px-6 py-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center flex-shrink-0 text-brand-600 dark:text-brand-400">
              <FolderIcon />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">My Categories</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {isLoading ? "Loading…" : `${stats.roots} root${stats.roots !== 1 ? "s" : ""} · ${stats.total} total · ${stats.active} active`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/omni-admin/channel-category-mapping"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <LinkIcon /> Map to channels
            </Link>
            <button
              onClick={() => handleOpenAdd(null)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-xl transition-colors shadow-sm shadow-brand-500/20"
            >
              <PlusIcon /> New Category
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-700/40 px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><SearchIcon /></span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search name, slug or path…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
          />
        </div>

        <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {(["all", "active", "inactive"] as const).map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                activeFilter === f ? "bg-brand-500 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {!isSearching && allNodes.some(n => n.children.length > 0) && (
          <button
            onClick={() => allExpanded ? setExpandedIds(new Set()) : setExpandedIds(new Set(allNodes.map(n => n.id)))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <ExpandAllIcon /> {allExpanded ? "Collapse all" : "Expand all"}
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400 tabular-nums">
          {isSearching ? `${filteredFlat.length} result${filteredFlat.length !== 1 ? "s" : ""}` : `${stats.total} categor${stats.total !== 1 ? "ies" : "y"}`}
        </span>
      </div>

      {/* Content */}
      <main className="px-6 py-6 max-w-5xl mx-auto">
        {loadError && (
          <div className="mb-5 flex items-start gap-3 px-4 py-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-sm text-red-700 dark:text-red-400">
            <AlertIcon />
            <div>
              <p className="font-medium">Failed to load categories</p>
              <p className="text-xs mt-0.5 text-red-500/80">{loadError}</p>
            </div>
            <button onClick={loadTree} className="ml-auto text-xs underline flex-shrink-0">Retry</button>
          </div>
        )}

        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-14 rounded-xl bg-gray-200 dark:bg-gray-700/50 animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
            ))}
          </div>
        )}

        {!isLoading && !loadError && tree.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4 text-3xl">📂</div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No categories yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm leading-relaxed mb-6">
              Your platform admin will provision a category tree for your organisation,
              or you can import categories from your channel store via{" "}
              <Link href="/omni-admin/channel-category-mapping" className="text-brand-600 dark:text-brand-400 hover:underline">
                Channel Category Mapping
              </Link>.
            </p>
            <button
              onClick={() => handleOpenAdd(null)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-xl transition-colors shadow-sm"
            >
              <PlusIcon /> Create manually
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
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No categories match your search</p>
            <button onClick={() => { setSearchQuery(""); setActiveFilter("all"); }} className="mt-3 text-xs text-brand-600 dark:text-brand-400 hover:underline">
              Clear filters
            </button>
          </div>
        )}

        {!isLoading && !isSearching && tree.length > 0 && (
          <div className="space-y-1.5">
            {tree.map(root => <TreeNode key={root.id} {...nodeProps} node={root} />)}
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${
          toast.type === "ok"
            ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200"
            : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400"
        }`}>
          {toast.type === "ok" ? "✓" : <AlertIcon />}
          {toast.msg}
        </div>
      )}

      {/* Add/Edit modal */}
      {showModal && (
        <AddEditCategoryModal
          category={editingCategory}
          parentId={newParentId}
          tree={tree}
          orgId={orgId}
          onSave={handleModalSave}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <DeleteConfirmModal
          category={deleteTarget}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
