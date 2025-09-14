import { Metadata } from "next";
import ProductCreateForm from "@/components/products/ProductCreateForm";

export const metadata: Metadata = {
  title: "Create Product | Omnichannel Master Product",
  description: "Create and manage products across multiple channels and stores",
};

export default function CreateProduct() {
  return <ProductCreateForm />;
}