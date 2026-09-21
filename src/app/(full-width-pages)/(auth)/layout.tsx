import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";
import AuthShell from "@/components/auth/AuthShell";
import { ThemeProvider } from "@/context/ThemeContext";
import React from "react";

export default function AuthPagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <AuthShell>{children}</AuthShell>
      <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
        <ThemeTogglerTwo />
      </div>
    </ThemeProvider>
  );
}
