import React from 'react';
import type { Metadata, Viewport } from 'next';
import MobileAssistant from './components/MobileAssistant';

/**
 * Patient AI assistant, shown inside the HappyHearts mobile app (WebView).
 * Not behind the staff layout: the page holds no data itself; every request
 * uses the patient's Bearer token, which the app passes in (src/lib/agent-bridge.ts).
 */
export const metadata: Metadata = { title: 'HappyHearts Assistant', robots: { index: false } };

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function MobileAssistantPage() {
  return <MobileAssistant />;
}
