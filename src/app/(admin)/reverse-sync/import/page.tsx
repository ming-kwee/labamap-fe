import { Suspense } from "react";
import ImportListingsPage from "@/modules/reverse-sync/components/ImportListingsPage";

export const metadata = { title: "Import Listings" };

export default function Page() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-gray-400">Loading…</div>}>
      <ImportListingsPage />
    </Suspense>
  );
}
