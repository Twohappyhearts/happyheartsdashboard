import React from 'react';
import AppLayout from '@/components/AppLayout';
import LegalDocumentsClient from './components/LegalDocumentsClient';
import { getStaffText } from '@/lib/i18n/staff/server';

/** Admins upload the Terms of Use and the Privacy Policy (PDF) here. */
export default async function LegalDocumentsPage() {
  const T = (await getStaffText()).legal;
  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">{T.pageTitle}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{T.pageSubtitle}</p>
        </div>
        <LegalDocumentsClient />
      </div>
    </AppLayout>
  );
}
