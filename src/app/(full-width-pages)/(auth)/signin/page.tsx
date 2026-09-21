"use client";

import { useRouter } from "next/navigation";
import SignInForm from "@/components/auth/SignInForm";

export default function SignIn() {
  const router = useRouter();

  const handleLoginSuccess = () => {
    router.push("/"); // Redirect to main admin dashboard
  };

  // Layout (AuthShell) provides the two-column chrome + brand panel + wordmark.
  return <SignInForm onSuccess={handleLoginSuccess} showBackLink={false} />;
}
