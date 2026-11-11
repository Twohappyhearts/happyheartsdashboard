import React from 'react';
import AppLayout from '@/components/AppLayout';
import NoticeAcceptance from './components/NoticeAcceptance';

export default function AiNoticePage() {
  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-[22px] font-700 text-foreground">AI Notice</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Who accepted the notice shown before the first AI chat in the app.</p>
        </div>
        <NoticeAcceptance />
      </div>
    </AppLayout>
  );
}
