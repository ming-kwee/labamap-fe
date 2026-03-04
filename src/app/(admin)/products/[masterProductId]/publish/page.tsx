import PublishDashboard from "@/modules/ecommerce-product-v2/step3-publish/components/PublishDashboard";

export const metadata = { title: "Step 3: Preview & Publish | Product Wizard" };

interface Props {
  params: { masterProductId: string };
}

export default function PublishPage({ params }: Props) {
  return <PublishDashboard masterProductId={params.masterProductId} />;
}
