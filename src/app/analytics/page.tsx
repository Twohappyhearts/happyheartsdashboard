import React from 'react';
import AppLayout from '@/components/AppLayout';
import AnalyticsClient from './components/AnalyticsClient';

export default function AnalyticsPage() {
  return (
    <AppLayout alertCount={3}>
      <AnalyticsClient />
    </AppLayout>
  );
}