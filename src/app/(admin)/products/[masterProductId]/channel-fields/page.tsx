import ChannelFieldsWizard from "@/modules/ecommerce-product-v2/step2-channel-fields/components/wizard/ChannelFieldsWizard";

export const metadata = { title: "Step 2: Channel Fields | Product Wizard" };

interface Props {
  params: { masterProductId: string };
}

export default function ChannelFieldsPage({ params }: Props) {
  return <ChannelFieldsWizard masterProductId={params.masterProductId} />;
}
