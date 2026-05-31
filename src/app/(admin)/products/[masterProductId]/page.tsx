import ProductDetailPage from "../_components/ProductDetailPage";

interface Props {
  params: Promise<{ masterProductId: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { masterProductId } = await params;
  return { title: `Product — ${masterProductId}` };
}

export default async function Page({ params }: Props) {
  const { masterProductId } = await params;
  return <ProductDetailPage masterProductId={masterProductId} />;
}
