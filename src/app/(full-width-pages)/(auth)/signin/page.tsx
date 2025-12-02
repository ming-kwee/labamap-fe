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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-lg">
        <SignInForm
          onSuccess={handleLoginSuccess}
          showBackLink={true}
        />
      </div>
    </div>
  );
}
