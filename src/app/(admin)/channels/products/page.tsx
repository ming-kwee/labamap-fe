import { Suspense } from "react";
import ChannelSyncDashboard from "./_components/ChannelSyncDashboard";

export const metadata = { title: "Channel Sync" };

export default function ChannelProductsPage() {
  return (
    <Suspense>
      <ChannelSyncDashboard />
    </Suspense>
  );
}
