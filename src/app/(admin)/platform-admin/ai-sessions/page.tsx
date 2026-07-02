import { Suspense } from "react";
import AgentSessionsPage from "@/modules/ai-admin/components/sessions/AgentSessionsPage";

export const metadata = { title: "Agent Sessions | Platform Admin" };

export default function Page() {
  // AgentSessionsPage uses useSearchParams (?sessionId=) → needs a Suspense boundary.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">Loading…</div>}>
      <AgentSessionsPage />
    </Suspense>
  );
}
