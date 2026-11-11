import React from 'react';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import '../styles/tailwind.css';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { OpenAlertsProvider } from '@/contexts/OpenAlertsContext';
import { StaffLangProvider } from '@/lib/i18n/staff/context';
import { getStaffLang, getStaffText } from '@/lib/i18n/staff/server';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getStaffText();
  return {
    title: t.meta.title,
    description: t.meta.description,
    icons: {
      icon: [{ url: '/favicon.ico', type: 'image/x-icon' }],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Staff dashboard language (English / Spanish), from the hh_staff_lang cookie.
  // The patient chat (/m/assistant) sets its own lang and dir on its page.
  const lang = await getStaffLang();
  return (
    <html lang={lang} className={plusJakartaSans.variable}>
      <body className={plusJakartaSans.className}>
        <StaffLangProvider initialLang={lang}>
          <AuthProvider>
            <OpenAlertsProvider>{children}</OpenAlertsProvider>
          </AuthProvider>
        </StaffLangProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3000,
            style: {
              fontFamily: 'var(--font-plus-jakarta-sans)',
              fontSize: '14px',
            },
          }}
        />

        <script type="module" async src="https://static.rocket.new/rocket-web.js?_cfg=https%3A%2F%2Fhappyheart4875back.builtwithrocket.new&_be=https%3A%2F%2Fappanalytics.rocket.new&_v=0.1.21" />
        <script type="module" defer src="https://static.rocket.new/rocket-shot.js?v=0.0.3" /></body>
    </html>
  );
}