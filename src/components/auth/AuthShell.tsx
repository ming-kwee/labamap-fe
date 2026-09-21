import React from "react";

/**
 * Elegant, omnichannel-themed shell for the auth screens (sign in / sign up / reset).
 *
 * ONE shell used by BOTH entry points — the `/signin` route (`(auth)/layout.tsx`) and the app-root
 * `AuthLayout` component — so the login looks identical on first load AND on refresh. Previously the
 * root render dropped the brand panel and re-centred the form, so the two states didn't match.
 *
 * Rebranding is a one-place change: edit BRAND / CHANNELS / FEATURES below, or swap {@link LogoMark}
 * for your own SVG. Marketing copy is intentionally kept out of the i18n bundle (pre-auth surface).
 */

const BRAND = {
  name: "Omnichannel", // ← swap for your product name
  headline: "One product. Every marketplace.",
  subtext:
    "Manage a single master catalog, tailor per-channel fields and variants, then publish and keep every storefront in sync — from one dashboard.",
};

// Marketplaces the platform publishes to — rendered as chips on the brand panel.
const CHANNELS = [
  "Shopify", "TikTok Shop", "Shopee", "Lazada", "Tokopedia",
  "Amazon", "eBay", "Wix", "Walmart",
];

const FEATURES = [
  "One master product, every marketplace",
  "Per-channel fields & variants, automated",
  "Publish & keep listings in sync",
];

/** Stacked "layers" glyph — many channels from one source. Driven by currentColor. */
function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="26" height="26" rx="8" className="fill-current opacity-10" />
      <path d="M16 7.5l7.5 4.2-7.5 4.2-7.5-4.2L16 7.5z" className="fill-current" />
      <path d="M8.5 15.8l7.5 4.2 7.5-4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="opacity-70" />
      <path d="M8.5 19.8l7.5 4.2 7.5-4.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="opacity-40" />
    </svg>
  );
}

/** Mark + wordmark, shown atop the form column (also the brand cue on mobile, where the panel is hidden). */
export function AuthWordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-500 text-white shadow-sm shadow-brand-500/30">
        <LogoMark className="h-6 w-6" />
      </span>
      <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
        {BRAND.name}
      </span>
    </div>
  );
}

function CheckDot() {
  return (
    <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-white/15 text-white">
      <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 10 8.5 14.5 16 6" />
      </svg>
    </span>
  );
}

/** The right-hand marketing panel (desktop only). Colourful gradient + soft glows + subtle grid. */
function AuthBrandPanel({ className = "" }: { className?: string }) {
  return (
    <aside className={`relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 ${className}`}>
      {/* soft glows */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-brand-400/30 blur-3xl" />
      {/* faint grid, faded at the edges */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.18) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 42%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 42%, transparent 78%)",
        }}
      />

      <div className="relative z-10 flex w-full items-center justify-center p-10 xl:p-16">
        <div className="max-w-md text-white">
          <div className="mb-8 flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 text-white ring-1 ring-white/20">
              <LogoMark className="h-7 w-7" />
            </span>
            <span className="text-xl font-bold tracking-tight">{BRAND.name}</span>
          </div>

          <h2 className="text-2xl font-bold leading-tight xl:text-[1.75rem]">{BRAND.headline}</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/75 xl:text-base">{BRAND.subtext}</p>

          <ul className="mt-7 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-white/90">
                <CheckDot />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <div className="mt-9">
            <p className="text-xs font-medium uppercase tracking-wider text-white/50">Publish to</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CHANNELS.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * Two-column auth layout: the form (left / full-width on mobile) beside the brand panel (right, ≥lg).
 * Deterministic markup — no client-only branches — so first load and refresh render identically.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-white dark:bg-gray-900">
      {/* Form column */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-10 lg:w-1/2 xl:px-20">
        <div className="mx-auto w-full max-w-md">
          <AuthWordmark className="mb-8" />
          {children}
        </div>
      </div>
      {/* Brand column — desktop only */}
      <AuthBrandPanel className="hidden lg:flex lg:w-1/2" />
    </div>
  );
}
