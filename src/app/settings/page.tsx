import React from 'react';
import AppLayout from '@/components/AppLayout';
import SettingsClient from './components/SettingsClient';
import { getStaffText } from '@/lib/i18n/staff/server';

/** Study-wide settings staff can change (public.app_settings). */
export default async function SettingsPage() {
  const T = (await getStaffText()).settings;
  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">{T.pageTitle}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{T.pageSubtitle}</p>
        </div>
        <SettingsClient />
      </div>
    </AppLayout>
  );
}
