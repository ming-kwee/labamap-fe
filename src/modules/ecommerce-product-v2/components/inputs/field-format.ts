/**
 * field-format — shared numeric/money formatting + input styling helpers.
 *
 * Single source of truth so product-level fields (FieldRenderer) and variant-level
 * cells (VariantConfigurator) render identically: same base classes, same currency
 * masking, same dark-mode + focus-ring tokens. Keeps the two levels visually aligned.
 */

// ─── Currency masking ─────────────────────────────────────────────────────────

export interface CurrencyConfig {
  symbol: string;
  thousandSep: string;
  decimalSep: string;
  decimals: number;
}

/**
 * Per-currency display rules. Symbol renders as a left adornment (not inside the
 * editable text), so the caret never fights the prefix. Indonesian/Vietnamese group
 * with "." and have no minor unit; most others use en-style "," grouping + 2 decimals.
 */
const CURRENCIES: Record<string, CurrencyConfig> = {
  IDR: { symbol: 'Rp', thousandSep: '.', decimalSep: ',', decimals: 0 },
  VND: { symbol: '₫', thousandSep: '.', decimalSep: ',', decimals: 0 },
  USD: { symbol: '$', thousandSep: ',', decimalSep: '.', decimals: 2 },
  EUR: { symbol: '€', thousandSep: '.', decimalSep: ',', decimals: 2 },
  GBP: { symbol: '£', thousandSep: ',', decimalSep: '.', decimals: 2 },
  SGD: { symbol: 'S$', thousandSep: ',', decimalSep: '.', decimals: 2 },
  MYR: { symbol: 'RM', thousandSep: ',', decimalSep: '.', decimals: 2 },
  PHP: { symbol: '₱', thousandSep: ',', decimalSep: '.', decimals: 2 },
  THB: { symbol: '฿', thousandSep: ',', decimalSep: '.', decimals: 2 },
};

/** Resolve a currency code to its display config; unknown codes fall back to en-style. */
export function currencyConfig(code?: string): CurrencyConfig {
  const key = (code || 'IDR').toUpperCase();
  return (
    CURRENCIES[key] ?? {
      symbol: key,
      thousandSep: ',',
      decimalSep: '.',
      decimals: 2,
    }
  );
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function groupInt(intDigits: string, sep: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** Coerce anything (number, "1500", "", null) to a finite number or undefined. */
export function toNumberLoose(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Render a numeric value as a grouped, currency-formatted string (no symbol). */
export function formatMoney(v: number | string | undefined, c: CurrencyConfig): string {
  const n = toNumberLoose(v);
  if (n === undefined) return '';
  const fixed = c.decimals > 0 ? n.toFixed(c.decimals) : String(Math.round(n));
  const [intPart, decPart] = fixed.split('.');
  const grouped = groupInt(intPart, c.thousandSep);
  return decPart ? `${grouped}${c.decimalSep}${decPart}` : grouped;
}

/**
 * Mask a raw keystroke string into a grouped display string + parsed numeric value.
 * Tolerates intermediate states (trailing decimal separator while typing) so the
 * caret stays put and the value updates live.
 */
export function maskMoney(
  raw: string,
  c: CurrencyConfig
): { display: string; value: number | undefined } {
  if (raw == null) return { display: '', value: undefined };

  const stripRe =
    c.decimals > 0 ? new RegExp(`[^\\d${escapeRe(c.decimalSep)}]`, 'g') : /[^\d]/g;
  let cleaned = raw.replace(stripRe, '');

  // Collapse to a single decimal separator.
  if (c.decimals > 0) {
    const i = cleaned.indexOf(c.decimalSep);
    if (i !== -1) {
      cleaned =
        cleaned.slice(0, i + 1) +
        cleaned.slice(i + 1).replace(new RegExp(escapeRe(c.decimalSep), 'g'), '');
    }
  }

  if (cleaned === '' || cleaned === c.decimalSep) return { display: '', value: undefined };

  const hadSep = cleaned.includes(c.decimalSep);
  let [intPart = '', decPart = ''] = cleaned.split(c.decimalSep);
  intPart = intPart.replace(/^0+(?=\d)/, '');
  if (intPart === '') intPart = '0';
  if (c.decimals > 0 && decPart.length > c.decimals) decPart = decPart.slice(0, c.decimals);

  const grouped = groupInt(intPart, c.thousandSep);
  const display = hadSep ? `${grouped}${c.decimalSep}${decPart}` : grouped;
  const numeric = Number(`${intPart}.${decPart || 0}`);
  return { display, value: Number.isFinite(numeric) ? numeric : undefined };
}

// ─── Quantity (integer) masking ────────────────────────────────────────────────

/** Grouped integer display (e.g. 12000 → "12,000"). */
export function formatInt(v: number | string | undefined): string {
  const n = toNumberLoose(v);
  if (n === undefined) return '';
  return Math.round(n).toLocaleString('en-US');
}

/** Strip a keystroke string to a grouped integer display + numeric value. */
export function maskInt(raw: string): { display: string; value: number | undefined } {
  const digits = (raw ?? '').replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
  if (digits === '') return { display: '', value: undefined };
  const n = Number(digits);
  return { display: n.toLocaleString('en-US'), value: n };
}

// ─── Field classification ──────────────────────────────────────────────────────

/**
 * Decide which specialised input a numeric field deserves, from its name.
 * Money → currency-masked; quantity → integer stepper; everything else (weight,
 * dimensions) → a plain decimal input.
 */
export function classifyNumericField(name: string): 'money' | 'quantity' | 'number' {
  const n = (name || '').toLowerCase();
  if (/(price|cost|msrp|rrp|mrp|amount|\bfee\b)/.test(n)) return 'money';
  if (/(inventory|quantity|qty|stock)/.test(n)) return 'quantity';
  return 'number';
}

// ─── Shared input styling ──────────────────────────────────────────────────────

const SIZE = {
  base: 'px-3 py-2 text-sm',
  compact: 'px-2 py-1.5 text-sm',
} as const;

/**
 * Base classes for a bare <input>/<textarea>/<select>. `error` swaps the border/ring
 * to red; `compact` tightens padding for dense table cells. Brand focus ring + full
 * dark-mode so variant cells match product-level fields exactly.
 */
export function inputBaseClass(error?: boolean, compact?: boolean): string {
  const state = error
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
    : 'border-gray-300 dark:border-gray-700 focus:border-brand-500 focus:ring-brand-500 dark:focus:border-brand-400 dark:focus:ring-brand-400';
  return [
    'block w-full rounded-md border bg-white shadow-sm transition-colors',
    'text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1',
    'dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500',
    compact ? SIZE.compact : SIZE.base,
    state,
  ].join(' ');
}

/**
 * Wrapper classes for composite inputs (money prefix, quantity stepper) whose focus
 * ring lives on the container via `focus-within`. Mirrors {@link inputBaseClass}.
 */
export function inputWrapperClass(error?: boolean, compact?: boolean): string {
  const state = error
    ? 'border-red-500 focus-within:border-red-500 focus-within:ring-red-500'
    : 'border-gray-300 dark:border-gray-700 focus-within:border-brand-500 focus-within:ring-brand-500 dark:focus-within:border-brand-400 dark:focus-within:ring-brand-400';
  return [
    'flex items-center rounded-md border bg-white shadow-sm transition-colors',
    'focus-within:outline-none focus-within:ring-1 dark:bg-gray-800',
    compact ? 'h-[34px]' : 'h-[42px]',
    state,
  ].join(' ');
}

// ─── Color swatch ──────────────────────────────────────────────────────────────

const CSS_COLOR_NAMES = new Set([
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink',
  'brown', 'gray', 'grey', 'silver', 'gold', 'navy', 'teal', 'maroon', 'olive',
  'lime', 'aqua', 'cyan', 'magenta', 'violet', 'indigo', 'beige', 'ivory', 'khaki',
  'coral', 'salmon', 'turquoise', 'tan', 'crimson', 'lavender', 'plum',
]);

/**
 * Best-effort CSS color for a variant option value, or null when it can't be rendered.
 * Handles #hex and single-word CSS names; multi-word labels ("Navy Blue") collapse to
 * their last word so a swatch still shows. Never throws → safe in render.
 */
export function cssColorOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return v;
  if (CSS_COLOR_NAMES.has(v)) return v;
  const collapsed = v.replace(/\s+/g, '');
  if (CSS_COLOR_NAMES.has(collapsed)) return collapsed;
  const lastWord = v.split(/\s+/).pop() ?? '';
  if (CSS_COLOR_NAMES.has(lastWord)) return lastWord;
  return null;
}
