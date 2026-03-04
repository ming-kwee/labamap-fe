"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChannelOAuthService } from "@/modules/ecommerce-product-v2/step2-channel-fields/services/channelOAuth.service";
import type { ChannelStoreConnection, ChannelType } from "@/modules/ecommerce-product-v2/step2-channel-fields/types/channelStore";

type State =
  | { phase: "loading" }
  | { phase: "success"; store: ChannelStoreConnection }
  | { phase: "error"; message: string };

// Params consumed by this page — everything else is forwarded to the backend as extras.
const RESERVED_PARAMS = new Set(["code", "state", "channelType"]);

export default function ChannelOAuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const calledRef = useRef(false);
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    // Guard against React Strict Mode double-invoke
    if (calledRef.current) return;
    calledRef.current = true;

    const channelType = (searchParams.get("channelType") ?? "shopify") as ChannelType;
    const code = searchParams.get("code");
    const stateParam = searchParams.get("state");

    if (!code || !stateParam) {
      setState({ phase: "error", message: "Missing required OAuth parameters in callback URL." });
      return;
    }

    // Collect all non-reserved params as channel-specific extras (e.g. shop + hmac for Shopify)
    const extras: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (!RESERVED_PARAMS.has(key)) extras[key] = value;
    });

    ChannelOAuthService.completeOAuth(channelType, { code, state: stateParam, extras })
      .then((store) => {
        setState({ phase: "success", store });
        setTimeout(() => router.push("/channels/stores"), 2000);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Failed to complete channel connection.";
        setState({ phase: "error", message });
      });
  }, [searchParams, router]);

  if (state.phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
          <p className="text-base font-medium text-gray-700 dark:text-gray-300">
            Completing channel connection…
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Please wait while we exchange the authorization code.
          </p>
        </div>
      </div>
    );
  }

  if (state.phase === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center space-y-4 max-w-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-100 dark:bg-success-500/20">
            <svg
              className="h-8 w-8 text-success-600 dark:text-success-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              Store connected!
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {state.store.storeName} has been successfully linked to your account.
            </p>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Redirecting to stores…
          </p>
        </div>
      </div>
    );
  }

  // error state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <div className="max-w-sm w-full rounded-2xl border border-error-200 dark:border-error-500/30 bg-error-50 dark:bg-error-500/10 px-6 py-8 text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-error-100 dark:bg-error-500/20">
          <svg
            className="h-8 w-8 text-error-600 dark:text-error-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div>
          <p className="text-base font-semibold text-error-700 dark:text-error-300">
            Connection failed
          </p>
          <p className="mt-1 text-sm text-error-600 dark:text-error-400">
            {state.message}
          </p>
        </div>
        <a
          href="/channels/stores"
          className="inline-block rounded-xl border border-error-300 dark:border-error-500/40 px-5 py-2.5 text-sm font-medium text-error-700 dark:text-error-300 hover:bg-error-100 dark:hover:bg-error-500/20 transition-colors"
        >
          Return to stores
        </a>
      </div>
    </div>
  );
}
