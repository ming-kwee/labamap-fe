"use client";

import React, { useState } from "react";
import type { MasterAttribute, ReverseWritePolicy } from "../_types/attribute";
import { REVERSE_WRITE_POLICIES } from "../_types/attribute";
import { AttributeService } from "../_services/attribute.service";

const POLICY_META: Record<ReverseWritePolicy, { label: string; hint: string; dot: string }> = {
  MASTER_AUTHORITATIVE: {
    label: "Master wins",
    hint: "Default. Reverse skips this field — the master value is authoritative.",
    dot: "bg-gray-400",
  },
  CHANNEL_AUTHORITATIVE: {
    label: "Channel wins",
    hint: "Reverse writes this per-store (e.g. live stock/price). Master global is untouched.",
    dot: "bg-emerald-500",
  },
  DRAFT_REVIEW: {
    label: "Draft review",
    hint: "Reverse creates a suggestion for human approval before master changes.",
    dot: "bg-blue-500",
  },
  IGNORE: {
    label: "Ignore",
    hint: "Reverse never touches this field.",
    dot: "bg-gray-300 dark:bg-gray-600",
  },
};

/**
 * P5 — inline editor for a master attribute's `reverseWritePolicy` (reverse direction-of-truth).
 * Self-contained: PATCHes on change and reflects success/error locally. Only meaningful for
 * fields that reverse sync can populate (channel-overridable), but shown for all so admins can
 * opt any attribute into draft-review.
 */
export function ReversePolicyEditor({ attribute }: { attribute: MasterAttribute }) {
  const [policy, setPolicy] = useState<ReverseWritePolicy>(
    attribute.reverseWritePolicy ?? "MASTER_AUTHORITATIVE",
  );
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: ReverseWritePolicy) {
    const prev = policy;
    setPolicy(next);
    setSaving(true);
    setError(null);
    try {
      await AttributeService.setReversePolicy(attribute.id, next);
      setFlash(true);
      setTimeout(() => setFlash(false), 1500);
    } catch (err) {
      setPolicy(prev); // revert on failure
      setError(err instanceof Error ? err.message : "Failed to update policy");
    } finally {
      setSaving(false);
    }
  }

  const meta = POLICY_META[policy];

  return (
    <div className="mt-2">
      <h5 className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
        Reverse Write Policy
      </h5>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${meta.dot}`} />
        <select
          value={policy}
          disabled={saving}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => handleChange(e.target.value as ReverseWritePolicy)}
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 focus:border-brand-400 focus:outline-none disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          {REVERSE_WRITE_POLICIES.map((p) => (
            <option key={p} value={p}>
              {POLICY_META[p].label} — {p}
            </option>
          ))}
        </select>
        {saving && <span className="text-[10px] text-gray-400">saving…</span>}
        {flash && !saving && <span className="text-[10px] font-medium text-success-600 dark:text-success-400">saved</span>}
      </div>
      <p className="mt-1 text-[10px] leading-snug text-gray-400 dark:text-gray-500">{meta.hint}</p>
      {error && <p className="mt-1 text-[10px] text-error-600 dark:text-error-400">{error}</p>}
    </div>
  );
}

export default ReversePolicyEditor;
