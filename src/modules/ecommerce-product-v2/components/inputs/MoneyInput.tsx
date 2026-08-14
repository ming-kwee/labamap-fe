'use client';

/**
 * MoneyInput — currency-masked amount field.
 * Left currency adornment + live thousand-grouping, right-aligned tabular figures.
 * Stores a clean numeric value in the parent; the display string is masked locally so
 * the caret never fights the formatting. No native number spinners / scroll-to-change.
 */

import React, { useEffect, useState } from 'react';
import {
  currencyConfig,
  formatMoney,
  maskMoney,
  toNumberLoose,
  inputWrapperClass,
} from './field-format';

interface MoneyInputProps {
  value: number | string | undefined;
  onChange: (value: number | undefined) => void;
  currency?: string;
  error?: boolean;
  compact?: boolean;
  disabled?: boolean;
  onBlur?: () => void;
  id?: string;
  name?: string;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

export default function MoneyInput({
  value,
  onChange,
  currency = 'IDR',
  error,
  compact,
  disabled,
  onBlur,
  id,
  name,
  placeholder,
  className = '',
  'aria-label': ariaLabel,
}: MoneyInputProps) {
  const c = currencyConfig(currency);
  const [display, setDisplay] = useState<string>(() => formatMoney(value, c));

  // Re-sync when the parent value changes from the outside (bulk-apply, reset, edit-load)
  // — but not on every keystroke, which would clobber the in-progress display string.
  useEffect(() => {
    const shown = toNumberLoose(maskMoney(display, c).value);
    if (shown !== toNumberLoose(value)) setDisplay(formatMoney(value, c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, currency]);

  const handle = (raw: string) => {
    const { display: d, value: v } = maskMoney(raw, c);
    setDisplay(d);
    onChange(v);
  };

  return (
    <div className={`${inputWrapperClass(error, compact)} ${className}`}>
      <span
        className={`select-none pl-3 pr-1.5 text-gray-500 dark:text-gray-400 ${
          compact ? 'text-xs' : 'text-sm'
        }`}
      >
        {c.symbol}
      </span>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        value={display}
        disabled={disabled}
        onChange={(e) => handle(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder ?? '0'}
        aria-label={ariaLabel}
        className={`min-w-0 flex-1 bg-transparent pr-3 text-right tabular-nums text-gray-900 outline-none placeholder-gray-400 disabled:cursor-not-allowed dark:text-gray-100 dark:placeholder-gray-500 ${
          compact ? 'text-sm' : ''
        }`}
      />
    </div>
  );
}
