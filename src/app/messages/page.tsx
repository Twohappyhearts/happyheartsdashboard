import React, { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import MessagesClient from './components/MessagesClient';

export default function MessagesPage() {
  return (
    <AppLayout fullBleed>
      <Suspense fallback={null}>
        <MessagesClient />
      </Suspense>
    </AppLayout>
  );
}
