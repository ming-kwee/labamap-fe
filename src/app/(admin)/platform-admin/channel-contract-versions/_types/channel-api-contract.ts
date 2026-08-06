// Channel API Contract types
// Corresponds to the `channel_api_contracts` collection (Phase 2 versioning, bff-v11).
// A contract is an IMMUTABLE, versioned snapshot of a channel's publish/analyse config
// (apiSchema, category extensions, post-processing rules, endpoints). The ACTIVE version
// stays in sync with the mutable config (model A), so today publish behaviour is unchanged.
// docs/FRONTEND-CHANNEL-CONTRACT-VERSIONS.md and docs/versioning/*.

export type ContractStatus = "DRAFT" | "ACTIVE" | "DEPRECATED" | "RETIRED";

/** One document in `channel_api_contracts`. Immutable per (channelId, apiVersion). */
export interface ChannelApiContract {
  id: string;
  channelId: string;
  /** e.g. "2024-01" — the channel's API version this contract targets. */
  apiVersion: string;
  status: ContractStatus;
  /** Base API schema (field templates). Read-only here — edited in config, snapshotted on migrate. */
  apiSchema: Record<string, unknown> | null;
  /** Fingerprint of apiSchema — the reference used by JOLT-spec staleness detection (Phase 0). */
  apiSchemaHash: string | null;
  /** categorySlug → schema-extension map (e.g. { clothing: { "product.material": "" } }). */
  categoryApiSchemaExtensions: Record<string, unknown> | null;
  postProcessingRules: unknown[];
  payloadRequirements: unknown[];
  attributeMappings: Record<string, unknown> | null;
  /** `{apiVersion}`-templated endpoint metadata (create/update/category endpoints, etc.). */
  channelMetadataList: unknown[];
  apiWrapperConfig: Record<string, unknown> | null;
  /** Provenance, e.g. "snapshot:system-default-config". */
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractListParams {
  channelId?: string;
  status?: ContractStatus;
}

// ─── Lifecycle transition graph ────────────────────────────────────────────────
// docs/FRONTEND-CHANNEL-CONTRACT-VERSIONS.md §1. Illegal transitions → backend 409.
//   DRAFT      → ACTIVE | RETIRED
//   ACTIVE     → DEPRECATED | RETIRED
//   DEPRECATED → ACTIVE (rollback) | RETIRED
//   RETIRED    → (terminal)

export const LEGAL_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  DRAFT:      ["ACTIVE", "RETIRED"],
  ACTIVE:     ["DEPRECATED", "RETIRED"],
  DEPRECATED: ["ACTIVE", "RETIRED"],
  RETIRED:    [],
};

export type LifecycleAction = "promote" | "deprecate" | "retire";

/** The status each lifecycle endpoint transitions the contract INTO. */
export const ACTION_TARGET: Record<LifecycleAction, ContractStatus> = {
  promote:   "ACTIVE",
  deprecate: "DEPRECATED",
  retire:    "RETIRED",
};

export const ACTION_LABEL: Record<LifecycleAction, string> = {
  promote:   "Promote",
  deprecate: "Deprecate",
  retire:    "Retire",
};

/** True when `action` is a legal transition from the contract's current status. */
export function canRunAction(status: ContractStatus, action: LifecycleAction): boolean {
  return LEGAL_TRANSITIONS[status].includes(ACTION_TARGET[action]);
}

// ─── Status badge styling (matches jolt-specs design language) ─────────────────

export const STATUS_STYLE: Record<ContractStatus, { cls: string; label: string; icon: string }> = {
  DRAFT:      { cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",              label: "Draft",      icon: "✎" },
  ACTIVE:     { cls: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400", label: "Active",     icon: "●" },
  DEPRECATED: { cls: "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-400", label: "Deprecated", icon: "▲" },
  RETIRED:    { cls: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400",         label: "Retired",    icon: "■" },
};

// ─── Small display helpers ─────────────────────────────────────────────────────

/** Count of categories that carry a schema extension for this contract. */
export function categoryExtensionCount(c: ChannelApiContract): number {
  return c.categoryApiSchemaExtensions ? Object.keys(c.categoryApiSchemaExtensions).length : 0;
}

/** "sha256:9f8e1234abcd…" → "sha256:9f8e12…" (keeps the algo prefix, trims the digest). */
export function shortHash(hash: string | null | undefined): string {
  if (!hash) return "—";
  const idx = hash.indexOf(":");
  const algo = idx >= 0 ? hash.slice(0, idx) : "";
  const digest = idx >= 0 ? hash.slice(idx + 1) : hash;
  const head = digest.slice(0, 8);
  return algo ? `${algo}:${head}…` : `${head}…`;
}

// ─── Mapper ────────────────────────────────────────────────────────────────────

export function mapRawContract(raw: unknown): ChannelApiContract {
  const r = raw as Record<string, unknown>;
  const status = String(r.status ?? "DRAFT").toUpperCase();
  return {
    id:                          (r.id ?? r._id ?? "") as string,
    channelId:                   (r.channelId ?? "") as string,
    apiVersion:                  (r.apiVersion ?? "") as string,
    status:                      (["DRAFT", "ACTIVE", "DEPRECATED", "RETIRED"].includes(status) ? status : "DRAFT") as ContractStatus,
    apiSchema:                   (r.apiSchema as Record<string, unknown> | null) ?? null,
    apiSchemaHash:               (r.apiSchemaHash as string | null | undefined) ?? null,
    categoryApiSchemaExtensions: (r.categoryApiSchemaExtensions as Record<string, unknown> | null) ?? null,
    postProcessingRules:         Array.isArray(r.postProcessingRules) ? r.postProcessingRules : [],
    payloadRequirements:         Array.isArray(r.payloadRequirements) ? r.payloadRequirements : [],
    attributeMappings:           (r.attributeMappings as Record<string, unknown> | null) ?? null,
    channelMetadataList:         Array.isArray(r.channelMetadataList) ? r.channelMetadataList : [],
    apiWrapperConfig:            (r.apiWrapperConfig as Record<string, unknown> | null) ?? null,
    source:                      (r.source as string | null | undefined) ?? null,
    createdAt:                   (r.createdAt ?? "") as string,
    updatedAt:                   (r.updatedAt ?? "") as string,
  };
}
