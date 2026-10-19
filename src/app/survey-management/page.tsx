import React from 'react';
import AppLayout from '@/components/AppLayout';
import SurveyManagementClient from './components/SurveyManagementClient';

export default function SurveyManagementPage() {
  return (
    <AppLayout alertCount={3}>
      <SurveyManagementClient />
    </AppLayout>
  );
}