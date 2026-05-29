import ProductDetailPage from "../_components/ProductDetailPage";

interface Props {
  params: { masterProductId: string };
}

export async function generateMetadata({ params }: Props) {
  return { title: `Product — ${params.masterProductId}` };
}

export default function Page({ params }: Props) {
  return <ProductDetailPage masterProductId={params.masterProductId} />;
}
