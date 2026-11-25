import React, { Suspense } from 'react';
import AppLayout from '@/components/AppLayout';
import AnalyticsClient from './components/AnalyticsClient';

export default function AnalyticsPage() {
  return (
    <AppLayout>
      <Suspense fallback={null}>
        <AnalyticsClient />
      </Suspense>
    </AppLayout>
  );
}