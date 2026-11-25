import React, { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import RatedAnswersClient from './components/RatedAnswersClient';

export default function RatedAnswersPage() {
  return (
    <AppLayout>
      <Suspense fallback={null}>
        <RatedAnswersClient />
      </Suspense>
    </AppLayout>
  );
}
