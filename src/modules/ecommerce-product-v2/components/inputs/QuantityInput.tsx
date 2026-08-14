'use client';

/**
 * QuantityInput — integer stepper.
 * −/+ buttons + a centered, thousand-grouped text field (inputMode numeric, so no native
 * spinners and no accidental scroll-to-change). Clamps to [min, max]; empty ⇒ undefined.
 */

import React, { useEffect, useState } from 'react';
import { formatInt, maskInt, toNumberLoose, inputWrapperClass } from './field-format';

interface QuantityInputProps {
  value: number | string | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  error?: boolean;
  compact?: boolean;
  disabled?: boolean;
  onBlur?: () => void;
  id?: string;
  name?: string;
  className?: string;
  'aria-label'?: string;
}

export default function QuantityInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  error,
  compact,
  disabled,
  onBlur,
  id,
  name,
  className = '',
  'aria-label': ariaLabel,
}: QuantityInputProps) {
  const [display, setDisplay] = useState<string>(() => formatInt(value));

  useEffect(() => {
    const shown = toNumberLoose(maskInt(display).value);
    if (shown !== toNumberLoose(value)) setDisplay(formatInt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const clamp = (n: number) => {
    let out = n;
    if (min !== undefined) out = Math.max(min, out);
    if (max !== undefined) out = Math.min(max, out);
    return out;
  };

  const handle = (raw: string) => {
    const { display: d, value: v } = maskInt(raw);
    setDisplay(d);
    onChange(v);
  };

  const bump = (delta: number) => {
    if (disabled) return;
    const next = clamp((toNumberLoose(value) ?? 0) + delta);
    setDisplay(formatInt(next));
    onChange(next);
  };

  const btn =
    'flex-shrink-0 select-none px-2.5 text-gray-500 hover:text-brand-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent dark:text-gray-400 dark:hover:text-brand-400 dark:hover:bg-gray-700/40 transition-colors';

  const atMin = toNumberLoose(value) !== undefined && (toNumberLoose(value) as number) <= min;

  return (
    <div className={`${inputWrapperClass(error, compact)} inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => bump(-step)}
        disabled={disabled || atMin}
        aria-label="Decrease"
        className={`${btn} rounded-l-md border-r border-gray-200 dark:border-gray-700`}
      >
        −
      </button>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        value={display}
        disabled={disabled}
        onChange={(e) => handle(e.target.value)}
        onBlur={onBlur}
        placeholder="0"
        aria-label={ariaLabel}
        className={`min-w-0 flex-1 bg-transparent text-center tabular-nums text-gray-900 outline-none placeholder-gray-400 disabled:cursor-not-allowed dark:text-gray-100 dark:placeholder-gray-500 ${
          compact ? 'text-sm' : ''
        }`}
      />
      <button
        type="button"
        onClick={() => bump(step)}
        disabled={disabled || (max !== undefined && (toNumberLoose(value) ?? 0) >= max)}
        aria-label="Increase"
        className={`${btn} rounded-r-md border-l border-gray-200 dark:border-gray-700`}
      >
        +
      </button>
    </div>
  );
}
