import { Outfit } from 'next/font/google';
import './globals.css';

import { SidebarProvider } from '@/context/SidebarContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/shared/contexts/AuthContext';
import { OrganizationProvider } from '@/shared/contexts/OrganizationContext';
import { LocaleProvider } from '@/shared/contexts/LocaleContext';

const outfit = Outfit({
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} dark:bg-gray-900`}>
        <ThemeProvider>
          <AuthProvider>
            <LocaleProvider>
              <OrganizationProvider>
                <SidebarProvider>{children}</SidebarProvider>
              </OrganizationProvider>
            </LocaleProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
