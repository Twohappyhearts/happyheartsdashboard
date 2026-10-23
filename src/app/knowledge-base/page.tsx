import React from 'react';
import AppLayout from '@/components/AppLayout';
import KnowledgeBaseListClient from './components/KnowledgeBaseListClient';

export default function KnowledgeBasePage() {
  return (
    <AppLayout>
      <KnowledgeBaseListClient />
    </AppLayout>
  );
}
