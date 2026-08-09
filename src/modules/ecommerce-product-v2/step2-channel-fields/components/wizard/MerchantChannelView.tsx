"use client";
import React, { useState } from "react";
import type { ChannelType, ChannelFormField } from "../../types/channelStore";

/**
 * Merchant (end-user) layout for Step 2 — an alternative render of ChannelStoreTab's data.
 *
 * The developer view is organised by the backend's schema roles (required / recommended / optional /
 * master_overrides / merchant_data / category), which is precise but reads like a form dump. Merchants
 * on Ginee / BigSeller / ChannelAdvisor / Linnworks instead get a *guided, plain-language flow*:
 * category → product details → photos → what the channel requires → variations → optional extras, with
 * a completion hero and per-step status so they always know what's left to publish.
 *
 * This component owns NO business logic. Every field is rendered through the exact same callbacks the
 * developer view uses (`renderFields` = the shared FieldsGrid, `renderVariants` = the shared variant
 * table, etc.), so the two views can never diverge in behaviour — only in presentation.
 */

// ── Small inline line-icons ──────────────────────────────────────────────────
const ICONS: Record<string, React.ReactNode> = {
  category: (
    <><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><circle cx="7" cy="7" r="1.2" /></>
  ),
  details: (
    <><path d="M4 4h16v16H4z" opacity="0" /><line x1="5" y1="7" x2="19" y2="7" /><line x1="5" y1="12" x2="19" y2="12" /><line x1="5" y1="17" x2="13" y2="17" /></>
  ),
  photos: (
    <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>
  ),
  required: (
    <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>
  ),
  variations: (
    <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>
  ),
  optional: (
    <><path d="m12 3 1.9 5.8L20 10l-4.9 3.6L16.9 20 12 16.3 7.1 20 9 13.6 4 10l6.1-1.2Z" /></>
  ),
};

function CardIcon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {ICONS[name]}
    </svg>
  );
}

// ── Circular progress ring ────────────────────────────────────────────────────
function ProgressRing({ pct, size = 68, stroke = 6 }: { pct: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  const color = pct >= 100 ? "text-success-500" : pct > 0 ? "text-brand-500" : "text-gray-300 dark:text-gray-600";
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="text-gray-200 dark:text-gray-700" stroke="currentColor" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className={`${color} transition-all duration-500`} stroke="currentColor"
          strokeDasharray={c} strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-800 dark:text-gray-100 tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

type CardStatus =
  | { kind: "done" }
  | { kind: "count"; filled: number; total: number }
  | { kind: "required" }
  | { kind: "optional" };

function StatusChip({ status }: { status: CardStatus }) {
  if (status.kind === "done")
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-400">✓ Done</span>;
  if (status.kind === "required")
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-400">Required</span>;
  if (status.kind === "optional")
    return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">Optional</span>;
  const complete = status.filled >= status.total && status.total > 0;
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full tabular-nums ${
        complete
          ? "bg-success-50 dark:bg-success-500/15 text-success-700 dark:text-success-400"
          : "bg-warning-50 dark:bg-warning-500/15 text-warning-700 dark:text-warning-400"
      }`}
    >
      {complete ? "✓ " : ""}
      {status.filled}/{status.total}
    </span>
  );
}

// ── Guided card ───────────────────────────────────────────────────────────────
function GuideCard({
  id,
  index,
  icon,
  title,
  subtitle,
  status,
  defaultOpen,
  children,
}: {
  id: string;
  index: number;
  icon: string;
  title: string;
  subtitle?: string | null;
  status: CardStatus;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const done = status.kind === "done" || (status.kind === "count" && status.filled >= status.total && status.total > 0);
  return (
    <section id={id} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-white/[0.02] overflow-hidden scroll-mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors"
      >
        {/* Step number / done check */}
        <span
          className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold ${
            done
              ? "bg-success-500 text-white"
              : "bg-brand-50 dark:bg-brand-500/15 text-brand-600 dark:text-brand-400"
          }`}
        >
          {done ? "✓" : index}
        </span>
        <span className={`flex-shrink-0 h-9 w-9 rounded-xl flex items-center justify-center bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400`}>
          <CardIcon name={icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{title}</p>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{subtitle}</p>}
        </div>
        <StatusChip status={status} />
        <svg
          className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-800">{children}</div>}
    </section>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface MerchantChannelViewProps {
  storeName: string;
  channelType: ChannelType;
  isSaving: boolean;
  lastSaved?: Date;

  // completion (global — source of truth, matches the developer view)
  pct: number;
  requiredTotal: number;
  requiredFilled: number;
  hasNoRequired: boolean;

  // category
  categoryExists: boolean;
  categorySet: boolean;
  categoryBreadcrumb: string | null;

  // field groups (already deduped upstream)
  requiredFields: ChannelFormField[];
  categoryRequiredFields: ChannelFormField[];
  recommendedFields: ChannelFormField[];
  optionalFields: ChannelFormField[];
  categoryOptionalFields: ChannelFormField[];
  masterOverrideFields: ChannelFormField[];
  hasVariants: boolean;

  // completion helpers (per-card counts)
  isVisible: (name: string) => boolean;
  isRequired: (name: string) => boolean;
  isFilled: (name: string) => boolean;

  // render callbacks (reuse the developer view's exact rendering)
  renderFields: (fields: ChannelFormField[]) => React.ReactNode;
  renderMasterOverrides: (fields: ChannelFormField[]) => React.ReactNode;
  renderCategoryField: () => React.ReactNode;
  renderVariants: () => React.ReactNode;
  renderAxisSummary: () => React.ReactNode;
  renderImages: () => React.ReactNode;
}

const CHANNEL_LABEL: Partial<Record<string, string>> = {
  shopee: "Shopee", tokopedia: "Tokopedia", lazada: "Lazada", tiktok: "TikTok Shop",
  shopify: "Shopify", woocommerce: "WooCommerce", amazon: "Amazon", ebay: "eBay",
  wix: "Wix", walmart: "Walmart",
};

export default function MerchantChannelView(props: MerchantChannelViewProps) {
  const {
    storeName, channelType, isSaving, lastSaved,
    pct, requiredTotal, requiredFilled, hasNoRequired,
    categoryExists, categorySet, categoryBreadcrumb,
    requiredFields, categoryRequiredFields, recommendedFields, optionalFields, categoryOptionalFields,
    masterOverrideFields, hasVariants,
    isVisible, isRequired, isFilled,
    renderFields, renderMasterOverrides, renderCategoryField, renderVariants, renderAxisSummary, renderImages,
  } = props;

  const channelName = CHANNEL_LABEL[channelType] ?? storeName;

  // Per-card required counts. Category required fields are required by definition.
  const reqStat = (fields: ChannelFormField[], allRequired = false) => {
    let total = 0, filled = 0;
    for (const f of fields) {
      if (!isVisible(f.fieldName)) continue;
      if (!allRequired && !isRequired(f.fieldName)) continue;
      total++;
      if (isFilled(f.fieldName)) filled++;
    }
    return { total, filled };
  };
  const rChannel = reqStat(requiredFields);
  const rCategory = reqStat(categoryRequiredFields, true);
  const requiredCardTotal = rChannel.total + rCategory.total;
  const requiredCardFilled = rChannel.filled + rCategory.filled;

  const optionalCount = recommendedFields.length + optionalFields.length + categoryOptionalFields.length;
  const remaining = Math.max(0, requiredTotal - requiredFilled);

  // Build the card list so the "jump to" chips and the cards stay in sync.
  type Card = { id: string; icon: string; title: string; subtitle?: string | null; status: CardStatus; defaultOpen: boolean; body: React.ReactNode };
  const cards: Card[] = [];

  if (categoryExists) {
    cards.push({
      id: "mv-category",
      icon: "category",
      title: `${channelName} category`,
      subtitle: categorySet ? categoryBreadcrumb : "Choose where buyers find this product",
      status: categorySet ? { kind: "done" } : { kind: "required" },
      defaultOpen: !categorySet,
      body: <div className="pt-3">{renderCategoryField()}</div>,
    });
  }

  if (requiredCardTotal > 0) {
    cards.push({
      id: "mv-required",
      icon: "required",
      title: "Required to publish",
      subtitle: `${channelName} needs these before your listing goes live`,
      status: { kind: "count", filled: requiredCardFilled, total: requiredCardTotal },
      defaultOpen: requiredCardFilled < requiredCardTotal,
      body: (
        <div className="pt-3 space-y-4">
          {requiredFields.length > 0 && renderFields(requiredFields)}
          {categoryRequiredFields.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Category details {categoryBreadcrumb ? <span className="font-normal text-gray-400">· {categoryBreadcrumb}</span> : null}
              </p>
              {renderFields(categoryRequiredFields)}
            </div>
          )}
        </div>
      ),
    });
  }

  if (masterOverrideFields.length > 0) {
    cards.push({
      id: "mv-details",
      icon: "details",
      title: "Product details",
      subtitle: `Title & description — inherits your master product unless you customise it for ${channelName}`,
      status: { kind: "optional" },
      defaultOpen: false,
      body: <div className="pt-3">{renderMasterOverrides(masterOverrideFields)}</div>,
    });
  }

  cards.push({
    id: "mv-photos",
    icon: "photos",
    title: "Photos",
    subtitle: `Images buyers see on ${channelName} — inherits master photos unless customised`,
    status: { kind: "optional" },
    defaultOpen: true,
    body: <div className="pt-3">{renderImages()}</div>,
  });

  if (hasVariants) {
    cards.push({
      id: "mv-variants",
      icon: "variations",
      title: "Variations",
      subtitle: "Options like size & colour, plus per-variant details",
      status: { kind: "optional" },
      defaultOpen: true,
      body: (
        <div className="pt-3 space-y-3">
          {renderAxisSummary()}
          {renderVariants()}
        </div>
      ),
    });
  }

  if (optionalCount > 0) {
    cards.push({
      id: "mv-optional",
      icon: "optional",
      title: "Optional details",
      subtitle: "Improve listing quality & discoverability — not required to publish",
      status: { kind: "optional" },
      defaultOpen: false,
      body: (
        <div className="pt-3 space-y-4">
          {recommendedFields.length > 0 && renderFields(recommendedFields)}
          {categoryOptionalFields.length > 0 && renderFields(categoryOptionalFields)}
          {optionalFields.length > 0 && renderFields(optionalFields)}
        </div>
      ),
    });
  }

  const scrollTo = (id: string) => {
    if (typeof document !== "undefined") document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-4">
      {/* ── Completion hero ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-brand-50/70 to-white dark:from-brand-500/10 dark:to-transparent p-5">
        <div className="flex items-center gap-4">
          <ProgressRing pct={hasNoRequired ? 100 : pct} />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              {hasNoRequired
                ? `Ready to publish on ${channelName}`
                : remaining === 0
                ? `All set for ${channelName} 🎉`
                : `Finish your ${channelName} listing`}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {hasNoRequired ? (
                "No required fields for this store."
              ) : remaining === 0 ? (
                "Every required detail is filled in."
              ) : (
                <>
                  <span className="font-semibold text-gray-700 dark:text-gray-200 tabular-nums">{remaining}</span>{" "}
                  required {remaining === 1 ? "detail" : "details"} left · {requiredFilled}/{requiredTotal} done
                </>
              )}
            </p>
          </div>
          <div className="flex-shrink-0 self-start">
            {isSaving ? (
              <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse" /> Saving…
              </span>
            ) : lastSaved ? (
              <span className="text-xs text-success-600 dark:text-success-400">✓ Saved {lastSaved.toLocaleTimeString()}</span>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500">Autosaves as you type</span>
            )}
          </div>
        </div>

        {/* Jump-to chips */}
        {cards.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {cards.map((c, i) => {
              const done = c.status.kind === "done" || (c.status.kind === "count" && c.status.filled >= c.status.total);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => scrollTo(c.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/70 dark:bg-white/[0.04] border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-brand-300 dark:hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                >
                  <span className={`h-4 w-4 rounded-full flex items-center justify-center text-[10px] ${done ? "bg-success-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                    {done ? "✓" : i + 1}
                  </span>
                  {c.title}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Guided cards ──────────────────────────────────────────────────── */}
      {cards.map((c, i) => (
        <GuideCard
          key={c.id}
          id={c.id}
          index={i + 1}
          icon={c.icon}
          title={c.title}
          subtitle={c.subtitle}
          status={c.status}
          defaultOpen={c.defaultOpen}
        >
          {c.body}
        </GuideCard>
      ))}
    </div>
  );
}
