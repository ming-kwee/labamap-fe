import { Suspense } from "react";
import PublishDashboard from "@/modules/ecommerce-product-v2/step3-publish/components/PublishDashboard";

export const metadata = { title: "Step 3: Preview & Publish | Product Wizard" };

interface Props {
  params: Promise<{ masterProductId: string }>;
}

export default async function PublishPage({ params }: Props) {
  const { masterProductId } = await params;
  return (
    <Suspense>
      <PublishDashboard masterProductId={masterProductId} />
    </Suspense>
  );
}
