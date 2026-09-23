import { ChannelDetailView } from "@/modules/channel-platform/components/ChannelDetailView";
import type { ChannelId } from "@/modules/channel-platform/types";

export const metadata = { title: "Channel Platform | Channel Detail" };

interface Props {
  params: Promise<{ channelId: string }>;
}

export default async function ChannelDetailPage({ params }: Props) {
  const { channelId } = await params;
  return <ChannelDetailView channelId={channelId as ChannelId} />;
}
