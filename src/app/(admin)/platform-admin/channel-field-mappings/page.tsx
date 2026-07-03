import { Suspense } from "react";
import ChannelFieldMappingsPage from "./_components/ChannelFieldMappingsPage";

export const metadata = { title: "Channel Field Mappings | Platform Admin" };

export default function Page() {
  // ChannelFieldMappingsPage uses useSearchParams (?channelId=&origin=) → needs Suspense.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">Loading…</div>}>
      <ChannelFieldMappingsPage />
    </Suspense>
  );
}
