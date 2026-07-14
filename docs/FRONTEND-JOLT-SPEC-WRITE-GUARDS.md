# Frontend Notes — JOLT spec write guards (precedence, org-key, dry-run)

**Audience:** Frontend team
**Backend commits:** `f6c7b5e` (precedence + org-key), `c5f759c` (no writes on dry-run)
**FE status:** ✅ No mandatory change — one optional polish (a new status value)

**TL;DR:** Two backend hardening changes to how `channel_jolt_specs` is written. **Response schemas are
unchanged.** The only FE-visible effect is one new status *value* — `agentStatus`/`JoltGenerationResult.status`
can now be **`"SKIPPED_PROTECTED"`** — and both existing consumers already handle unknown statuses with a
fallback, so nothing breaks. Optional: give `SKIPPED_PROTECTED` a proper label instead of a raw gray badge.

---

## What changed (backend)

- **Precedence** — an automatic writer (APM `/analyze` persist, agent auto-apply) no longer overwrites a
  human-owned spec (manually configured, or `generatedBy: "ai-approved-by:*"`). When the agent auto-apply is
  blocked this way it returns **`status: "SKIPPED_PROTECTED"`**. A human *approve* may still overwrite.
- **Org key** — agent auto-apply and the recommendation *approve* now target the correct org's record (3-part
  lookup) instead of "the first match". `approve` still returns the same spec id — no FE-visible change.
- **No writes on dry-run** — the schema-level diagnostic (`/adaptive-pattern-matching/analyze`,
  `persistJolt=false`) no longer triggers the agent cascade, so its response no longer populates
  `escalatedToAgent` / `agentStatus` / `agentJoltSpecId`. (This was a side-effect write on a "read"; now gone.)

## Contract impact

| Aspect | Status |
|---|---|
| Request bodies | **unchanged** |
| Response shapes (`JoltGenerationResult`, `AdaptivePatternMatchingResponse`) | **unchanged** |
| `JoltGenerationResult.status` / `agentStatus` | **new value** `"SKIPPED_PROTECTED"` |
| Mode 2 (Paste JSON) `escalatedToAgent` / `agentStatus` / `agentJoltSpecId` | now **absent/null** (dry-run never escalates) |

---

## Why no FE change is required (already handled)

- **JOLT Generation Console** — `JoltGenerationConsole.tsx:270`
  `STATUS_META[result.status] ?? { tone: "gray", label: result.status, desc: "" }` → an unknown status renders
  a gray badge labelled `SKIPPED_PROTECTED`. Functional, just unpolished.
- **Publish Diagnostics** — `cascadeOutcome.ts:47` `switch (o.agentStatus)` has a `default` case → renders a
  generic *"Dieskalasi ke agent AI (status: SKIPPED_PROTECTED)."*.
- **Dry-run (Mode 2)** — `cascadeOutcome.ts:37`
  `if (o.escalatedToAgent === undefined && !o.agentStatus) return null;` → when the escalation fields are
  absent it renders nothing. So Mode 2 simply stops showing a cascade-outcome banner. No breakage; more correct.

---

## Optional polish (only if you want `SKIPPED_PROTECTED` to read nicely)

Add it as a first-class status in three places:

1. `ai-admin/types/session.ts` — add to the status union: `| "SKIPPED_PROTECTED"`.
2. `ai-admin/components/generate/JoltGenerationConsole.tsx` — add to `STATUS_META`:
   ```ts
   SKIPPED_PROTECTED: { tone: "gray", label: "Skipped — locked",
     desc: "Spec sudah di-approve/dikonfigurasi manusia; auto-apply dilewati." },
   ```
3. `ai-admin/components/shared/cascadeOutcome.ts` — add a `case "SKIPPED_PROTECTED"` in the `switch` with a
   matching label/title.

**#3 (dry-run): nothing to do** — the guard at `cascadeOutcome.ts:37` already covers the now-absent fields.

---

## Follow-up fixes — honest persist outcome + queryable audit

Two later backend fixes (commit `2d09e96`) made a blocked write **visible** instead of silent. Response
schemas are still unchanged.

### A. Honest Mode 1 message — **no FE change needed** ✅
Previously `/channels/publish/analyze` eagerly added a `"JOLT spec persisted …"` warning even when the write
was skipped (protected). It now appends the truthful string instead:
> `JOLT not persisted: existing spec is human-owned (approved/manual) — kept as-is.`

This is just a different value inside the existing `matchingMetadata.warnings[]` array, which the UI already
renders verbatim (`platform-admin/channel-jolt-specs/…/ChannelJoltSpecsPage.tsx:326`; the readiness parser at
`:142` only matches `[JOLT-READINESS]`, not the persist text). **Nothing to change** — the honest message
shows automatically.

### B. `AiAgentSession.applyOutcome` — **✅ implemented (v8)**
The agent session now carries a new **`applyOutcome`** field
(`AUTO_APPLIED | SKIPPED_PROTECTED | RECOMMENDATION_CREATED | MANUAL_REVIEW_REQUIRED`). The sessions endpoints
return the entity directly (`GET /api/v1/admin/ai/sessions[/{id}]`), so the field is **already in the
response** — existing code ignored it (no breakage). It is now surfaced in the **Agent Sessions** view:

1. ✅ `ai-admin/types/session.ts` — added exported `ApplyOutcome` type + `applyOutcome?: ApplyOutcome | null`
   on `AiAgentSession`.
2. ✅ `ai-admin/components/sessions/AgentSessionsPage.tsx` — new **"Apply"** column with an `ApplyOutcomeBadge`
   (shared `APPLY_OUTCOME_META` map), also shown in the session detail drawer header. `SKIPPED_PROTECTED`
   renders **amber "Skipped — locked"** with an explanatory tooltip; absent → `—`.
3. ⏸ *(deferred — needs backend first)* filter the list by `applyOutcome`. The field is `@Indexed`, but
   `GET /sessions` currently only accepts `channelId` / `triggerType`; a backend `applyOutcome` query param is
   required before wiring a FE filter. **Not implemented.**
