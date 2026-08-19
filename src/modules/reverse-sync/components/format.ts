/** Format an arbitrary reverse value (string/number/object/array/null) for compact display. */
export function formatReverseValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value === "" ? '""' : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** True when a value is "empty" (master had no prior value). */
export function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}
