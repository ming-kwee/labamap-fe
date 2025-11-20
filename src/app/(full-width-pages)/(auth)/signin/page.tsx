"use client";

import { useRouter } from "next/navigation";
import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

// Note: metadata needs to be handled differently for client components
// Consider moving to layout.tsx or making this a server component

export default function SignIn() {
  const router = useRouter();

  const handleLoginSuccess = () => {
    console.log('[SignIn Page] Login successful, redirecting to dashboard...');
    router.push('/'); // Redirect to main admin dashboard
  };

  return (
    <SignInForm 
      onSuccess={handleLoginSuccess}
      showBackLink={true}
    />
  );
}
