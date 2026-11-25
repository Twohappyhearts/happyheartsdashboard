import React, { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import AiReviewClient from './components/AiReviewClient';

export default function AiConversationsPage() {
  return (
    <AppLayout fullBleed>
      <Suspense fallback={null}>
        <AiReviewClient />
      </Suspense>
    </AppLayout>
  );
}
