import React from 'react';
import type { Metadata, Viewport } from 'next';
import MobileAssistant from './components/MobileAssistant';

/**
 * Patient AI assistant, shown inside the HappyHearts mobile app (WebView).
 * Not behind the staff layout: the page holds no data itself; every request
 * uses the patient's Bearer token, which the app passes in (src/lib/agent-bridge.ts).
 *
 * ?lang=en|es|vi|ko|zh-Hans|zh-Hant|fa|ar sets the language (the app passes its own);
 * without it, the phone's languages; else English. Farsi and Arabic are right to left.
 */
export const metadata: Metadata = { title: 'HappyHearts Assistant', robots: { index: false } };

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default async function MobileAssistantPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { lang } = await searchParams;
  return <MobileAssistant langParam={typeof lang === 'string' ? lang : null} />;
}
