import React, { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import AiChatClient from './components/AiChatClient';

export default function AiChatPage() {
  return (
    <AppLayout fullBleed>
      <Suspense fallback={null}>
        <AiChatClient />
      </Suspense>
    </AppLayout>
  );
}
