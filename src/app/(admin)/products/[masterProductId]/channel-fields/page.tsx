import ChannelFieldsWizard from "@/modules/channel-platform/components/wizard/ChannelFieldsWizard";

export const metadata = { title: "Step 2: Channel Fields | Product Wizard" };

interface Props {
  params: { masterProductId: string };
}

export default function ChannelFieldsPage({ params }: Props) {
  return <ChannelFieldsWizard masterProductId={params.masterProductId} />;
}
