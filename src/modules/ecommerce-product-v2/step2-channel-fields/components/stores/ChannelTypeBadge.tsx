"use client";
import React from "react";
import type { ChannelType } from "../../types/channelStore";

const CHANNEL_META: Record<ChannelType, { label: string; bg: string; text: string; code: string }> = {
  shopify:   { label: "Shopify",    bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", code: "SH" },
  wix:       { label: "WIX",        bg: "bg-blue-100 dark:bg-blue-900/30",       text: "text-blue-700 dark:text-blue-400",       code: "WX" },
  amazon:    { label: "Amazon",     bg: "bg-orange-100 dark:bg-orange-900/30",   text: "text-orange-700 dark:text-orange-400",   code: "AM" },
  ebay:      { label: "eBay",       bg: "bg-red-100 dark:bg-red-900/30",         text: "text-red-700 dark:text-red-400",         code: "EB" },
  tiktok:    { label: "TikTok",     bg: "bg-pink-100 dark:bg-pink-900/30",       text: "text-pink-700 dark:text-pink-400",       code: "TT" },
  lazada:    { label: "Lazada",     bg: "bg-violet-100 dark:bg-violet-900/30",   text: "text-violet-700 dark:text-violet-400",   code: "LA" },
  tokopedia: { label: "Tokopedia",  bg: "bg-green-100 dark:bg-green-900/30",     text: "text-green-700 dark:text-green-400",     code: "TO" },
  facebook:  { label: "Facebook",   bg: "bg-indigo-100 dark:bg-indigo-900/30",   text: "text-indigo-700 dark:text-indigo-400",   code: "FB" },
  shopee:    { label: "Shopee",     bg: "bg-orange-100 dark:bg-orange-900/30",   text: "text-orange-600 dark:text-orange-400",   code: "SP" },
  walmart:   { label: "Walmart",    bg: "bg-blue-100 dark:bg-blue-900/30",       text: "text-blue-700 dark:text-blue-400",       code: "WM" },
};

export function getChannelMeta(type: ChannelType) {
  return CHANNEL_META[type] ?? { label: type, bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300", code: type.slice(0, 2).toUpperCase() };
}

interface Props {
  channelType: ChannelType;
  size?: "sm" | "md";
}

export default function ChannelTypeBadge({ channelType, size = "md" }: Props) {
  const meta = getChannelMeta(channelType);
  const sizeClass = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClass} ${meta.bg} ${meta.text}`}>
      <span className="font-bold">{meta.code}</span>
      <span>{meta.label}</span>
    </span>
  );
}
