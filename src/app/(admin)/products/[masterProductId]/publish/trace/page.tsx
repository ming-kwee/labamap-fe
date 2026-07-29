import PublishTraceDiff from "@/modules/ecommerce-product-v2/step3-publish/components/PublishTraceDiff";

export const metadata = { title: "Publish Trace — JOLT | DSL" };

interface Props {
  params: Promise<{ masterProductId: string }>;
}

export default async function PublishTracePage({ params }: Props) {
  const { masterProductId } = await params;
  return <PublishTraceDiff masterProductId={masterProductId} />;
}
