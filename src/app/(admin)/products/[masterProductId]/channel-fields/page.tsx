import { Suspense } from "react";
import ChannelFieldsWizard from "@/modules/ecommerce-product-v2/step2-channel-fields/components/wizard/ChannelFieldsWizard";

export const metadata = { title: "Step 2: Channel Fields | Product Wizard" };

interface Props {
  params: Promise<{ masterProductId: string }>;
}

export default async function ChannelFieldsPage({ params }: Props) {
  const { masterProductId } = await params;
  return (
    <Suspense>
      <ChannelFieldsWizard masterProductId={masterProductId} />
    </Suspense>
  );
}
