'use client';

/**
 * CategorySelectField — searchable ProductType picker.
 *
 * The backend field is still named "category" / fieldType "category-select", but the value
 * is a productTypeId. Backend accepts productTypeId directly since Sprint 1 (2026-06-17).
 *
 * Merchant types to filter the list → picks a ProductType → triggers loadSchema(ptId) →
 * backend injects type-specific attributes.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ProductTypeService } from '@/app/(admin)/omni-admin/product-types/_services/product-type.service';
import type { ProductType } from '@/app/(admin)/omni-admin/product-types/_types/product-type';

interface CategorySelectFieldProps {
  orgId: string;
  value: string;
  onChange: (productTypeId: string) => void;
  onBlur: () => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function CategorySelectField({
  value,
  onChange,
  onBlur,
  required,
  placeholder = 'Search product types…',
  disabled,
  className,
}: CategorySelectFieldProps) {
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  const [query, setQuery]       = useState('');
  const [open, setOpen]         = useState(false);
  const [focused, setFocused]   = useState(0);
  const containerRef            = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);
  const listRef                 = useRef<HTMLUListElement>(null);

  useEffect(() => {
    ProductTypeService.list({ active: true })
      .then(setProductTypes)
      .catch(() => setError('Failed to load product types'))
      .finally(() => setLoading(false));
  }, []);

  // Derived: selected ProductType object
  const selected = productTypes.find(pt => pt.id === value) ?? null;

  // Filtered list based on query
  const filtered = query.trim()
    ? productTypes.filter(pt =>
        pt.name.toLowerCase().includes(query.toLowerCase()) ||
        (pt.description ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : productTypes;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        onBlur();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onBlur]);

  // Scroll focused item into view
  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.children[focused] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [focused, open]);

  const select = useCallback((pt: ProductType) => {
    onChange(pt.id);
    setQuery('');
    setOpen(false);
    // Do NOT call onBlur() here: onChange + onBlur in the same tick made the blur validate the STALE value
    // (setFormData hasn't committed yet) → "category is required" flashed on every pick until the next blur.
    // onChange clears the error (parent) and commits the value; a real blur (outside click / Escape) still
    // validates the committed value.
  }, [onChange]);

  const clear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
    inputRef.current?.focus();
  }, [onChange]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      setFocused(0);
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocused(f => Math.min(f + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocused(f => Math.max(f - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[focused]) select(filtered[focused]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      onBlur();
    }
  }

  const borderClass = className ?? 'border-gray-300 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500';
  const inputDisplay = open ? query : (selected ? selected.name : '');

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400 px-1">{error}</p>;
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger / search input */}
      <div
        className={`flex items-center w-full px-3 py-2 border rounded-md shadow-sm bg-white dark:bg-gray-800 transition-colors cursor-text ${borderClass} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        onClick={() => { if (!disabled) { setOpen(true); setFocused(0); inputRef.current?.focus(); } }}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputDisplay}
          placeholder={loading ? 'Loading…' : (selected ? selected.name : placeholder)}
          required={required && !value}
          disabled={disabled || loading}
          onChange={e => { setQuery(e.target.value); setFocused(0); setOpen(true); }}
          onFocus={() => { setOpen(true); setFocused(0); }}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 disabled:cursor-not-allowed"
          autoComplete="off"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
        />

        {/* Clear button */}
        {value && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            onClick={clear}
            className="ml-1 flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Clear"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        )}

        {/* Chevron */}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`ml-1 flex-shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </div>

      {/* Dropdown */}
      {open && !disabled && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-56 overflow-y-auto py-1"
        >
          {loading && (
            <li className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">Loading…</li>
          )}

          {!loading && filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">
              {query ? `No product types match "${query}"` : 'No product types found'}
            </li>
          )}

          {!loading && filtered.map((pt, i) => {
            const isSelected = pt.id === value;
            const isFocused  = i === focused;
            return (
              <li
                key={pt.id}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setFocused(i)}
                onMouseDown={e => { e.preventDefault(); select(pt); }}
                className={`flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors ${
                  isFocused ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {/* Check mark for selected */}
                <span className={`mt-0.5 flex-shrink-0 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-transparent'}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                    {pt.name}
                  </p>
                  {pt.description && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{pt.description}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
