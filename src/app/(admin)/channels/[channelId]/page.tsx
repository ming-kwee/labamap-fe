import { ChannelDetailView } from "@/modules/channel-platform/components/ChannelDetailView";
import type { ChannelId } from "@/modules/channel-platform/types";

export const metadata = { title: "Channel Platform | Channel Detail" };

interface Props {
  params: { channelId: string };
}

export default function ChannelDetailPage({ params }: Props) {
  return <ChannelDetailView channelId={params.channelId as ChannelId} />;
}
