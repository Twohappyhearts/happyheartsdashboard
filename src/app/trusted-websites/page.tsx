import React from 'react';
import AppLayout from '@/components/AppLayout';
import TrustedWebsites from './components/TrustedWebsites';
import { getStaffText } from '@/lib/i18n/staff/server';

/** One of the assistant's two sources (the other is the Knowledge Base). */
export default async function TrustedWebsitesPage() {
  const T = (await getStaffText()).websites;
  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">{T.title}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{T.subtitle}</p>
        </div>
        <TrustedWebsites />
      </div>
    </AppLayout>
  );
}
