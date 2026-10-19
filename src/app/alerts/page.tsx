import React from 'react';
import AppLayout from '@/components/AppLayout';
import AlertsClient from './components/AlertsClient';

export default function AlertsPage() {
  return (
    <AppLayout alertCount={3}>
      <AlertsClient />
    </AppLayout>
  );
}