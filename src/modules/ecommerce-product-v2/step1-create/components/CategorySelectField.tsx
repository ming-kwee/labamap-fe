'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CategoryService } from '@/app/(admin)/omni-admin/product-categories/_services/category.service';
import type { CategorySlugItem } from '@/app/(admin)/omni-admin/product-categories/_types/category';
import { Search, ChevronDown, X } from '@/shared/ui/icons/Icons';

interface CategorySelectFieldProps {
  orgId: string;
  value: string;
  onChange: (slug: string) => void;
  onBlur: () => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// Module-level org-keyed cache — one entry per org, shared across all instances for the tab lifetime
const slugCacheByOrg = new Map<string, CategorySlugItem[]>();
const fetchPromiseByOrg = new Map<string, Promise<CategorySlugItem[]>>();

function fetchSlugs(orgId: string): Promise<CategorySlugItem[]> {
  if (slugCacheByOrg.has(orgId)) return Promise.resolve(slugCacheByOrg.get(orgId)!);
  if (fetchPromiseByOrg.has(orgId)) return fetchPromiseByOrg.get(orgId)!;

  const promise = CategoryService.getSlugs(orgId).then(items => {
    slugCacheByOrg.set(orgId, [...items].sort((a, b) => a.path.localeCompare(b.path)));
    fetchPromiseByOrg.delete(orgId);
    return slugCacheByOrg.get(orgId)!;
  });
  fetchPromiseByOrg.set(orgId, promise);
  return promise;
}

function invalidateOrgCache(orgId: string) {
  slugCacheByOrg.delete(orgId);
  fetchPromiseByOrg.delete(orgId);
}

export default function CategorySelectField({
  orgId,
  value,
  onChange,
  onBlur,
  required = false,
  placeholder = 'Select a category…',
  disabled = false,
  className = '',
}: CategorySelectFieldProps) {
  const [items, setItems] = useState<CategorySlugItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const mounted = useRef(true);

  // ── Fetch categories ────────────────────────────────────────────────────────
  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    setError(null);
    fetchSlugs(orgId)
      .then(data => {
        if (!mounted.current) return;
        setItems(data);
        setLoading(false);
      })
      .catch(err => {
        if (!mounted.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load categories');
        setLoading(false);
      });
    return () => { mounted.current = false; };
  }, [orgId]);

  // ── Cache invalidation via global event ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: CustomEvent<{ orgId: string }>) => {
      if (e.detail.orgId !== orgId) return;
      invalidateOrgCache(orgId);
      setLoading(true);
      setError(null);
      fetchSlugs(orgId)
        .then(data => { if (mounted.current) { setItems(data); setLoading(false); } })
        .catch(err => { if (mounted.current) { setError(err instanceof Error ? err.message : 'Failed to load categories'); setLoading(false); } });
    };
    window.addEventListener('categoryTreeChanged', handler as EventListener);
    return () => window.removeEventListener('categoryTreeChanged', handler as EventListener);
  }, [orgId]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const selectedItem = useMemo(
    () => items.find(i => i.slug === value) ?? null,
    [items, value]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(i =>
      i.name.toLowerCase().includes(q) || i.path.toLowerCase().includes(q)
    );
  }, [items, query]);

  // ── Open / close ────────────────────────────────────────────────────────────
  const openDropdown = useCallback(() => {
    if (disabled || loading) return;
    setOpen(true);
    setQuery('');
    setActiveIndex(-1);
    setTimeout(() => searchRef.current?.focus(), 0);
  }, [disabled, loading]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
    onBlur();
  }, [onBlur]);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeDropdown]);

  // ── Selection ───────────────────────────────────────────────────────────────
  const select = useCallback((slug: string) => {
    onChange(slug);
    closeDropdown();
  }, [onChange, closeDropdown]);

  const clear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    onBlur();
  }, [onChange, onBlur]);

  // ── Keyboard navigation ─────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && filtered[activeIndex]) {
          select(filtered[activeIndex].slug);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        break;
    }
  }, [open, filtered, activeIndex, openDropdown, select, closeDropdown]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // ── Ancestry breadcrumb (shown inside each option) ──────────────────────────
  const parentPath = (item: CategorySlugItem) => {
    if (item.level === 0) return null;
    const parts = item.path.split('/').slice(0, -1);
    return parts.join(' / ');
  };

  // ── Trigger button class ─────────────────────────────────────────────────────
  const triggerClass = [
    'relative w-full flex items-center gap-2 px-3 py-2 text-left',
    'border rounded-md shadow-sm transition-colors cursor-pointer',
    'dark:bg-gray-800 dark:text-white',
    open
      ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-0'
      : 'border-gray-300 dark:border-gray-600',
    disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'hover:border-gray-400 bg-white dark:bg-gray-800',
    className,
  ].join(' ');

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-required={required}
        disabled={disabled}
        onClick={openDropdown}
        className={triggerClass}
      >
        {loading ? (
          <>
            <div className="h-3 w-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
            <span className="text-sm text-gray-400 flex-1">Loading categories…</span>
          </>
        ) : error ? (
          <span className="text-sm text-red-500 flex-1">Failed to load categories</span>
        ) : selectedItem ? (
          <>
            {/* Breadcrumb path above selected name */}
            <span className="flex-1 min-w-0">
              {selectedItem.level > 0 && (
                <span className="block text-[10px] text-gray-400 dark:text-gray-500 leading-none mb-0.5 truncate">
                  {selectedItem.path.split('/').slice(0, -1).join(' / ')}
                </span>
              )}
              <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {selectedItem.name}
              </span>
            </span>
            {/* Clear button */}
            <span
              role="button"
              aria-label="Clear selection"
              onClick={clear}
              className="flex-shrink-0 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X size={12} />
            </span>
          </>
        ) : (
          <span className="flex-1 text-sm text-gray-400 dark:text-gray-500">{placeholder}</span>
        )}

        <ChevronDown
          size={14}
          className={`flex-shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown panel */}
      {open && !loading && !error && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
              <Search size={13} className="text-gray-400 flex-shrink-0" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setActiveIndex(-1); }}
                placeholder="Search categories…"
                className="flex-1 text-sm bg-transparent outline-none text-gray-800 dark:text-gray-100 placeholder-gray-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); setActiveIndex(-1); searchRef.current?.focus(); }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Option list */}
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-56 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">
                No categories match "{query}"
              </li>
            ) : (
              filtered.map((item, idx) => {
                const isActive = idx === activeIndex;
                const isSelected = item.slug === value;
                const ancestor = parentPath(item);

                return (
                  <li
                    key={item.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => select(item.slug)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={[
                      'flex items-start gap-2 px-3 py-1.5 cursor-pointer select-none',
                      isActive ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                      isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200',
                    ].join(' ')}
                    style={{ paddingLeft: `${0.75 + item.level * 1}rem` }}
                  >
                    {/* Tree connector dots for non-root items */}
                    {item.level > 0 && (
                      <span className="mt-1 flex-shrink-0 w-3 border-l-2 border-b-2 border-gray-200 dark:border-gray-600 h-2 rounded-bl-sm" />
                    )}

                    <span className="flex-1 min-w-0">
                      {/* Ancestor breadcrumb — only shown when searching (not browsing tree) */}
                      {query && ancestor && (
                        <span className="block text-[10px] text-gray-400 dark:text-gray-500 leading-none mb-0.5 truncate">
                          {ancestor}
                        </span>
                      )}
                      <span className={`block text-sm leading-snug truncate ${item.level === 0 ? 'font-medium' : ''}`}>
                        {item.name}
                      </span>
                    </span>

                    {/* Selected tick */}
                    {isSelected && (
                      <svg className="mt-0.5 flex-shrink-0 w-3.5 h-3.5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </li>
                );
              })
            )}
          </ul>

          {/* Footer count */}
          <div className="px-3 py-1.5 border-t border-gray-100 dark:border-gray-700 text-[10px] text-gray-400 dark:text-gray-500">
            {query
              ? `${filtered.length} of ${items.length} categories`
              : `${items.length} categories`}
          </div>
        </div>
      )}
    </div>
  );
}
