import React from 'react';
import AppLayout from '@/components/AppLayout';
import TrustedWebsites from './components/TrustedWebsites';

/** One of the assistant's two sources (the other is the Knowledge Base). */
export default function TrustedWebsitesPage() {
  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">Trusted Websites</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">The websites the AI assistant may search, next to the Knowledge Base.</p>
        </div>
        <TrustedWebsites />
      </div>
    </AppLayout>
  );
}
