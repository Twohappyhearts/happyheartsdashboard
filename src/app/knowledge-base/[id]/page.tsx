import React from 'react';
import AppLayout from '@/components/AppLayout';
import KnowledgeBaseDocumentsClient from '../components/KnowledgeBaseDocumentsClient';

export default async function KnowledgeBaseDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppLayout>
      <KnowledgeBaseDocumentsClient knowledgeBaseId={id} />
    </AppLayout>
  );
}
