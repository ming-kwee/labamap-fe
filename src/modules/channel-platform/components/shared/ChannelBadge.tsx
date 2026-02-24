import React from "react";
import type { ChannelId } from "../../types";
import { mockChannels } from "../../data/mockData";

interface Props {
  channelId: ChannelId;
  showName?: boolean;
  size?: "xs" | "sm" | "md";
}

export const ChannelBadge: React.FC<Props> = ({ channelId, showName = false, size = "sm" }) => {
  const channel = mockChannels.find((c) => c.id === channelId);
  if (!channel) return null;

  const sizeClass = size === "xs" ? "h-5 w-5 text-[10px]" : size === "sm" ? "h-6 w-6 text-xs" : "h-7 w-7 text-sm";

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center justify-center rounded font-bold flex-shrink-0 ${sizeClass} ${channel.colorClass} ${channel.textColorClass}`}
        title={channel.name}
      >
        {channel.code}
      </span>
      {showName && (
        <span className="text-sm text-gray-700 dark:text-gray-300">{channel.name}</span>
      )}
    </span>
  );
};
