"use client";
import { useMemo } from "react";
import type { ChannelFormField, ChannelFieldConditionalRule } from "../types/channelStore";

// ─── Pure rule evaluation ─────────────────────────────────────────────────────

/**
 * Returns true when a single conditional rule's trigger condition is met.
 * Comparison is loose: booleans are also matched by their string equivalent
 * ("true" / "false") since form values from checkboxes may be either type.
 */
export function ruleMatches(
  rule: ChannelFieldConditionalRule,
  currentValues: Record<string, unknown>,
): boolean {
  const actual = currentValues[rule.triggerField];
  return rule.triggerValues.some((tv) => {
    if (tv === null || tv === undefined) return actual == null;
    if (typeof tv === "boolean") return actual === tv || String(actual) === String(tv);
    return String(actual) === String(tv);
  });
}

/**
 * Pure function: is this field visible given current form values?
 *
 * Visibility semantics:
 *   - No SHOW/HIDE rules → always visible.
 *   - Any HIDE rule matches → hidden (HIDE wins over SHOW).
 *   - SHOW rules present but none match → hidden (opt-in visibility).
 *   - SHOW rule matches (and no HIDE matched) → visible.
 */
export function isFieldVisible(
  field: ChannelFormField,
  currentValues: Record<string, unknown>,
): boolean {
  if (!field.conditionalRules?.length) return true;
  const hideRules = field.conditionalRules.filter((r) => r.effect === "HIDE");
  const showRules = field.conditionalRules.filter((r) => r.effect === "SHOW");
  if (hideRules.some((r) => ruleMatches(r, currentValues))) return false;
  if (showRules.length > 0) return showRules.some((r) => ruleMatches(r, currentValues));
  return true;
}

/**
 * Pure function: is this field required given current form values?
 *
 * Required semantics:
 *   - REQUIRE rule matches → required (overrides field.required).
 *   - OPTIONAL rule matches → not required (overrides field.required).
 *   - REQUIRE takes precedence over OPTIONAL when both match.
 *   - Neither matches → falls back to field.required.
 */
export function isFieldRequired(
  field: ChannelFormField,
  currentValues: Record<string, unknown>,
): boolean {
  if (!field.conditionalRules?.length) return Boolean(field.required);
  const requireRules  = field.conditionalRules.filter((r) => r.effect === "REQUIRE");
  const optionalRules = field.conditionalRules.filter((r) => r.effect === "OPTIONAL");
  if (requireRules.some((r)  => ruleMatches(r, currentValues))) return true;
  if (optionalRules.some((r) => ruleMatches(r, currentValues))) return false;
  return Boolean(field.required);
}

/**
 * Pure function: returns the effective validation rules for a field.
 * SET_VALIDATION rule matches merge their validationOverride on top of base rules.
 */
export function getFieldValidation(
  field: ChannelFormField,
  currentValues: Record<string, unknown>,
): ChannelFormField["validationRules"] {
  const base = field.validationRules;
  if (!field.conditionalRules?.length) return base;
  const matched = field.conditionalRules.filter(
    (r) => r.effect === "SET_VALIDATION" && ruleMatches(r, currentValues),
  );
  if (matched.length === 0) return base;
  return matched.reduce<ChannelFormField["validationRules"]>(
    (acc, r) => ({ ...acc, ...r.validationOverride }),
    { ...base },
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface VisibilityHelpers {
  isVisible:     (fieldName: string) => boolean;
  isRequired:    (fieldName: string) => boolean;
  getValidation: (fieldName: string) => ChannelFormField["validationRules"];
}

/**
 * Evaluates Scenario E conditional rules for all fields in one store tab.
 *
 * Pass ALL fields from all sections (including category attribute fields) so
 * that a rule referencing any fieldName resolves correctly.
 * currentValues should be values.channelData for the active store.
 *
 * Returns stable helper functions that re-evaluate on every values change.
 */
export function useChannelFieldVisibility(
  fields: ChannelFormField[],
  currentValues: Record<string, unknown>,
): VisibilityHelpers {
  return useMemo(() => {
    const fieldMap = new Map(fields.map((f) => [f.fieldName, f]));

    return {
      isVisible(fieldName) {
        const field = fieldMap.get(fieldName);
        return field ? isFieldVisible(field, currentValues) : true;
      },
      isRequired(fieldName) {
        const field = fieldMap.get(fieldName);
        return field ? isFieldRequired(field, currentValues) : false;
      },
      getValidation(fieldName) {
        const field = fieldMap.get(fieldName);
        return field ? getFieldValidation(field, currentValues) : undefined;
      },
    };
    // currentValues object ref changes on every field edit — that's intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, currentValues]);
}
