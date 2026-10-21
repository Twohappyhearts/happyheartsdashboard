import React from 'react';
import AppLayout from '@/components/AppLayout';
import ContentManagementClient from '@/app/content-management/components/ContentManagementClient';

export default function ContentManagementPage() {
  return (
    <AppLayout>
      <ContentManagementClient />
    </AppLayout>
  );
}