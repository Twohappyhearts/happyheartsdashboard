import React from 'react';
import AppLayout from '@/components/AppLayout';
import NoticeAcceptance from './components/NoticeAcceptance';
import { getStaffText } from '@/lib/i18n/staff/server';

export default async function AiNoticePage() {
  const T = (await getStaffText()).aiNotice;
  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">{T.title}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">{T.subtitle}</p>
        </div>
        <NoticeAcceptance />
      </div>
    </AppLayout>
  );
}
